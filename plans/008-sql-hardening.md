# Plan 008: SQL & TrailBase Hardening

> **Executor instructions**: Follow step by step. Run every verification
> command before moving to the next step.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- backend/src/ docker-compose.yml trailbase/schema/`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (changes to docker-compose and schema files)
- **Depends on**: 001 (security fixes — this builds on the CORS hardening)
- **Category**: security
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

Five issues:
1. **SQL injection risk**: Several queries in `backend/src/api/mod.rs` build SQL with string interpolation (e.g., `format!("LIMIT {}", limit)` around line 235). SQLx uses prepared statements by default, but the format-based approach bypasses parameterization.
2. **No SQLite write-ahead log checkpointing**: The `sessions` table and `captures` table can accumulate WAL files. After large ops, WAL can grow unbounded.
3. **TrailBase replication writes the raw JSON without sanitization**: Captured credentials are forwarded to TrailBase with `serde_json::to_string` (in `backend/src/trailbase.rs:53`) — if a field contains control characters, TrailBase may reject the write silently.
4. **docker-compose.yml uses `trailbase/trailbase:latest`** — not pinned to a version. Breaks on a new major release.
5. **No rate limiting on capture endpoints** — an attacker who discovers `/api/capture/*` can flood the database.

## Current state

```rust
// backend/src/api/mod.rs:235 — string interpolation in SQL
let limit = limit_query.unwrap_or(50);
let sql = format!("SELECT * FROM captures WHERE 1=1 ORDER BY created_at DESC LIMIT {}", limit);
// No parameterization — injectable if limit came from user (it does via query param)
```

```yaml
# docker-compose.yml:7
image: trailbase/trailbase:latest
# Should pin to: trailbase/trailbase:0.3.0
```

```rust
// backend/src/trailbase.rs:53 — raw JSON without control character sanitization
let body = serde_json::to_string(&event.payload).unwrap_or_default();
```

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Check Rust | `cargo check` | exit 0 |
| Check SQLite | `sqlite3 /tmp/test.db "PRAGMA journal_mode=WAL;"` (in container) | N/A (host check) |

## Scope

**In scope**:
- `backend/src/api/mod.rs` — parameterize remaining raw SQL queries
- `backend/src/db.rs` — add WAL checkpoint function, call periodically
- `backend/src/trailbase.rs` — sanitize JSON before forwarding
- `docker-compose.yml` — pin trailbase image to `0.3.0`
- `backend/src/api/mod.rs` — add rate limiting middleware to capture endpoints

**Out of scope**:
- TrailBase V8 migration (separate project)
- Frontend rate limiting (browser-side)
- TLS termination (already handled by tunnel)

## Git workflow

- Branch: `plan/008-sql-hardening`
- Commits: `fix(sql): parameterize remaining format!-based queries`, `fix(db): add WAL checkpoint on startup and periodic`, `fix(trailbase): sanitize JSON before forwarding`, `fix(docker): pin trailbase image to 0.3.0`, `feat(api): add rate limiting to capture endpoints`

## Steps

### Step 1: Parameterize raw SQL queries

Search for all `format!("SELECT` / `format!("UPDATE` / `format!("DELETE` patterns in `backend/src/api/mod.rs`:

```bash
grep -n 'format!("[A-Z]' backend/src/api/mod.rs
```

For each match identified:
1. Remove `format!` wrapper
2. Use sqlx's `sqlx::query_as::<_, T>(sql).bind(val)` pattern
3. Replace format variable with `?` in SQL and use `.bind()`

Example fix for the captures list:
```rust
// Before:
let sql = format!("SELECT * FROM captures WHERE 1=1 ORDER BY created_at DESC LIMIT {}", limit);

// After:
let captures: Vec<CaptureRow> = sqlx::query_as::<_, CaptureRow>(
    "SELECT * FROM captures WHERE 1=1 ORDER BY created_at DESC LIMIT ?"
)
.bind(limit)
.fetch_all(&state.pool)
.await
.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
```

**Verify**: `cargo check` → exit 0. `grep -n 'format!("' backend/src/api/mod.rs` → no more format! SQL patterns (legitimate non-SQL format! may remain).

### Step 2: Add WAL checkpoint

In `backend/src/db.rs`, add a function:

```rust
pub async fn checkpoint_wal(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await?;
    Ok(())
}
```

Call it in `main.rs` after pool creation (line 34):
```rust
// After pool creation
let _ = db::checkpoint_wal(&state.pool).await;
```

Also run it on a timer:
```rust
// In main.rs, after server starts
let pool = state.pool.clone();
tokio::spawn(async move {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
    loop {
        interval.tick().await;
        let _ = db::checkpoint_wal(&pool).await;
    }
});
```

**Verify**: `cargo check` → exit 0

### Step 3: Sanitize JSON for TrailBase

In `backend/src/trailbase.rs`, add a sanitization function:

```rust
fn sanitize_json_for_trailbase(raw: &str) -> String {
    // Replace control characters except \t, \n, \r
    raw.chars()
        .map(|c| {
            if c.is_control() && c != '\t' && c != '\n' && c != '\r' {
                ' ' // Replace with space
            } else {
                c
            }
        })
        .collect()
}
```

Apply it before sending (line 53):
```rust
let raw = serde_json::to_string(&event.payload).unwrap_or_default();
let body = sanitize_json_for_trailbase(&raw);
```

**Verify**: `cargo check` → exit 0

### Step 4: Pin trailbase image

In `docker-compose.yml`, change:
```yaml
image: trailbase/trailbase:latest
```
to:
```yaml
image: trailbase/trailbase:0.3.0
```

**Verify**: `grep "image: trailbase" docker-compose.yml` → shows `0.3.0`

### Step 5: Add rate limiting middleware

In `backend/src/main.rs`, add a simple in-memory rate limiter using DashMap:

```toml
# Cargo.toml — add dependency
dashmap = "6"
```

```rust
// In main.rs
use std::sync::Arc;
use dashmap::DashMap;
use std::time::{Duration, Instant};
use tower_http::limit::RateLimitLayer; // Already available?

// Or simpler: custom middleware layer on capture routes
struct RateLimiter {
    requests: DashMap<String, Vec<Instant>>,
    max_requests: usize,
    window: Duration,
}
```

Add the rate limiter to app state and attach to capture endpoints:
```rust
.layer(RateLimitLayer::new(10, Duration::from_secs(1))) // 10 req/sec per IP
```

Apply to the capture route group:
```rust
// In main.rs router
.route("/api/capture/*", post(capture_router))
.layer(RateLimitLayer::new(10, std::time::Duration::from_secs(1)))
```

**Verify**: `cargo check` → exit 0

## Test plan

- Manual: Hit `/api/capture/ip` 12 times in 1 second → 11th request returns 429
- Manual: `sqlite3 data.db "PRAGMA wal_checkpoint(TRUNCATE);"` → returns `0,OK` or `1,CHECKPOINT`
- Manual: Inject control character in a credential field → verify TrailBase receives sanitized version
- Manual: `grep trailbase/trailbase docker-compose.yml` → pinned to version

## Done criteria

- [ ] `cargo check` exits 0
- [ ] `grep -n 'format!("SELECT' backend/src/api/mod.rs` returns no matches
- [ ] WAL checkpoint runs on startup and every 3600 seconds
- [ ] TrailBase JSON forwarding sanitizes control characters
- [ ] `docker-compose.yml` pins trailbase/trailbase to a specific version (not `latest`)
- [ ] Capture endpoints reject requests exceeding 10 req/s/IP with 429
- [ ] `plans/README.md` status row updated

## STOP conditions

- `tower_http::limit::RateLimitLayer` requires the `rate-limit` feature — add `features = ["rate-limit"]` to tower-http in Cargo.toml
- The DashMap-based rate limiter uses in-memory state and resets on restart — this is intentional (not a bug)
- WAL checkpoint runs synchronously — on large databases (>1GB) it may take seconds. The tokio::spawn handles this.

## Maintenance notes

- Rate limiting is per-process — if running behind a load balancer, each instance has its own counter. For a red-team tool on a single tunnel, this is fine.
- The WAL checkpoint interval (3600s) is a sensible default — adjust based on capture volume. High-volume campaigns may need 1800s.
- If TrailBase versions diverge significantly, the pinned version may miss security updates. Check TrailBase releases quarterly.
