# Plan 004: Dead Code & Architecture Cleanup

> **Executor instructions**: Follow step by step. Run every verification
> command before moving to the next step.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- backend/src/ backend/migrations/ app/ docker/ *.php`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

Four sources of codebase bloat:
1. **TrailBase client (144 lines)** — `TrailBaseClient` has `list`, `create`, `get`, `delete`, `count`, `upload_file` methods but none are ever called. Only `health()` is used. This misleads contributors into thinking data replicates to TrailBase.
2. **audit_log table** — created in schema but never written to by any code.
3. **28 legacy PHP v3 files** — `app/`, `docker/`, and root `.php` files from the old Apache+PHP architecture. Vestigial.
4. **Custom `TitleCase` trait** — reinvents `heck::to_title_case()`.

## Current state

```rust
// backend/src/trailbase.rs — full file (144 lines)
pub struct TrailBaseClient { ... }
impl TrailBaseClient {
    pub fn new(...) -> Self { ... }
    fn url(&self, path: &str) -> String { ... }
    fn file_url(&self, ...) -> String { ... }
    fn add_auth(&self, req) -> RequestBuilder { ... }
    pub async fn list<T>(&self, ...) -> Result<RecordList<T>> { ... }
    pub async fn create<T>(&self, ...) -> Result<T> { ... }
    pub async fn get<T>(&self, ...) -> Result<T> { ... }
    pub async fn delete(&self, ...) -> Result<()> { ... }
    pub async fn count(&self, ...) -> Result<i64> { ... }
    pub async fn health(&self) -> bool { ... }   // <-- ONLY method ever called
    pub async fn upload_file(&self, ...) -> Result<()> { ... }
}
```

Only `health()` is called (main.rs line 113-118, 208-216). The rest is unreachable dead code.

```sql
-- backend/migrations/001_init.sql:99-111 — audit_log table
CREATE TABLE IF NOT EXISTS audit_log (...);
-- No INSERT INTO audit_log anywhere in src/
```

```rust
// backend/src/templates.rs:103-119 — custom TitleCase
impl TitleCase for String { ... }
// Replace with: use heck::ToTitleCase;
```

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Check Rust | `cargo check` | exit 0 |
| Clippy | `cargo clippy` | exit 0 |
| Build frontend | `npm run build` | exit 0 |

## Scope

**In scope**:
- `backend/src/trailbase.rs` — strip to minimum (keep only `health()`)
- `backend/src/main.rs` — simplify `AppState.trailbase` field, remove unreachable TrailBase configs
- `backend/migrations/001_init.sql` — keep `audit_log` table but add comment noting it's reserved for future use
- `backend/src/templates.rs` — replace custom `TitleCase` with `heck` crate
- `backend/Cargo.toml` — add `heck` crate
- Root `.php` files: `template.php`, `location.php`, `ip.php`, `debug_log.php`, `post.php`
- `app/` directory (entire)
- `docker/` directory (entire)
- `docker-compose.yml` — remove trailbase service or add deprecation note
- `.env.example` — remove TRAILBASE_* vars or add deprecation note

**Out of scope**:
- Removing TrailBase entirely (keep the service in docker-compose for users who want it)
- `frontend/` changes
- Other template files

## Git workflow

- Branch: `plan/004-dead-code-cleanup`
- Commits: `chore: remove legacy PHP v3 files`, `chore: simplify TrailBase client to health-only`, `chore: replace custom TitleCase with heck crate`, `chore: add deprecation notes for TrailBase`

## Steps

### Step 1: Remove legacy PHP files

Move the following to `archive/` directory (do not delete — they may be referenced):
```bash
mkdir -p archive
mv template.php location.php ip.php debug_log.php post.php archive/ 2>/dev/null
mv app/ archive/ 2>/dev/null
mv docker/ archive/ 2>/dev/null
```

Add a README to `archive/`:
```
# CamPhish v3 Legacy Files

These files are from the PHP-based v3 architecture (Apache + PHP + Heroku).
The current v2.1+ codebase is Rust (axum) + React (Vite/TS/Tailwind) + Docker.

Kept for reference only. Not used in builds or deployments.
```

**Verify**: `ls app/ docker/ *_php 2>/dev/null; echo "exit: $?"` → exit 1 (no such files). `ls archive/` → lists moved files.

### Step 2: Replace custom TitleCase with heck crate

In `backend/Cargo.toml`, add:
```toml
heck = "0.5"
```

In `backend/src/templates.rs`:
1. Remove the custom `TitleCase` trait and its implementation (lines 103-119)
2. Replace `use` with `use heck::ToTitleCase;`
3. At line 25, change `.to_title_case()` to `.to_title_case()` (same API — `heck` exports the same method name)

```rust
// Line 25 change from:
let name = id.replace('-', " ").to_title_case();
// No change needed — heck::ToTitleCase provides the same `.to_title_case()` method
```

But the trait is different. In `heck`, you call `.to_title_case()` on `&str`, so:
```rust
use heck::ToTitleCase;

// Line 25:
let name = id.replace('-', " ").to_title_case();
```

Actually, `heck`'s `ToTitleCase` works on `&str` directly, so you need:
```rust
// Old: id.replace('-', " ") → String → our custom .to_title_case()
// New: use heck::ToTitleCase trait, then call .to_title_case() on &str
use heck::ToTitleCase;
let name = id.replace('-', " ").to_title_case(); // same call because heck trait is in scope
```

**Verify**: `cargo check` → exit 0

### Step 3: Simplify TrailBase client

In `backend/src/trailbase.rs`, strip everything except the client struct, `new()`, and `health()`:

```rust
use std::time::Duration;

#[derive(Clone)]
pub struct TrailBaseClient {
    pub base_url: String,
    pub api_key: Option<String>,
    pub http: reqwest::Client,
}

impl TrailBaseClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");
        Self { base_url, api_key, http }
    }

    pub async fn health(&self) -> bool {
        let url = format!("{}/_/admin/", self.base_url.trim_end_matches('/'));
        self.http.get(&url).send().await
            .map(|r| r.status().is_success() || r.status().as_u16() == 401)
            .unwrap_or(false)
    }
}
```

Remove the now-unused `serde::{Deserialize, Serialize}` import.

Remove `RecordInput` and `RecordList` structs.

In `backend/src/main.rs`, remove the commented "TrailBase data layer" message or simplify it.

**Verify**: `cargo check` → exit 0

### Step 4: Add deprecation notice to TrailBase service in docker-compose

In `docker-compose.yml`, add a comment:
```yaml
  # =========================================================================
  # TrailBase — Data layer (DEPRECATED: schema exists for future use,
  # but data operations go through SQLite. The Rust app does not write to
  # TrailBase. Keep for admin UI access if desired.)
  # =========================================================================
```

Leave the service running — it doesn't hurt and provides the admin UI.

Update `.env.example`:
```
# --- TrailBase (DEPRECATED — schema only. Data goes through SQLite.) ---
# TRAILBASE_URL=http://trailbase:4000
# TRAILBASE_API_KEY=
# TRAILBASE_ADMIN_EMAIL=admin@camphish.local
# TRAILBASE_ADMIN_PASSWORD=changeme
```

**Verify**: `cargo check` → exit 0

## Test plan

- No Rust tests exist. Verify with `cargo build` and `cargo test` that nothing breaks.
- Manually test: start app, hit `/api/health` — should return `trailbase_connected: false` (gracefully degraded).
- Verify no PHP files are imported anywhere: `grep -r "include\|require" app/ 2>/dev/null; echo "exit: $?"` → exit 1.

## Done criteria

- [ ] `cargo check` exits 0
- [ ] `cargo test` exits 0
- [ ] `npm run build` exits 0 (if frontend unchanged)
- [ ] `ls app/ docker/ *.php 2>/dev/null; echo $?` → exit 1 (files moved to archive/)
- [ ] `grep -r "RecordInput\|RecordList" backend/src/` → no matches
- [ ] `grep -r "fn url\|fn file_url\|fn add_auth\|fn list\|fn create\|fn get\|fn delete\|fn count\|fn upload_file" backend/src/trailbase.rs` → no matches (only `new` and `health` remain)
- [ ] `grep "TitleCase" backend/src/templates.rs` → uses `heck::ToTitleCase` (not custom impl)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any capture endpoint crashes because TrailBase was expected to be available (check for `.await` calls on trailbase methods)
- `docker-compose up` breaks because trailbase service config was modified incorrectly
- The `heck` crate version is incompatible with the existing dependency tree

## Maintenance notes

- If TrailBase is ever re-integrated for real data replication, the methods removed in this plan will need to be re-implemented. Keep this plan's diff as a reference.
- The `archive/` directory can be deleted after one release cycle if no one references it.
- When adding new dependencies, prefer well-known crates (`heck` has 50M+ downloads) over custom implementations.
