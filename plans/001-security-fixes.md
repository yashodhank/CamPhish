# Plan 001: Critical Security Fixes — Path Traversal, Rate Limiting, CORS

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 68a5f01..HEAD -- backend/src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

Three security issues that can lead to system compromise or DoS:
1. **Path traversal** in `capture.rs:97` — `session_id` from client request is interpolated into the capture filename without sanitization, allowing arbitrary file writes via `../../`.
2. **No rate/body limits** — capture endpoints accept unlimited POSTs of any size, enabling disk-fill or DB-fill DoS attacks.
3. **Overly permissive CORS** — `allow_origin(Any)` combined with no CSRF on DELETE routes exposes data to cross-origin attacks (mitigated by Plan 002, but still a defense-in-depth concern).

## Current state

### Path traversal (capture.rs:89-98)
```rust
// backend/src/capture.rs
let session_id = get_session(&payload.session);  // line 89 — no sanitization
// ...
let filename = format!("{}_{}.png", session_id, chrono::Utc::now().format("%Y%m%d%H%M%S%f"));
// session_id = "../../etc/evil" → filename = "../../etc/evil_20260621...png"
let file_path = format!("{}/captures/{}", state.data_dir, filename);
// file_path = "data/captures/../../etc/evil_20260621...png" = "/etc/evil_20260621...png"
std::fs::write(&file_path, &raw) // arbitrary file write
```

### No body size limits (main.rs:149-181)
```rust
// backend/src/main.rs — no RequestBodyLimitLayer applied to capture routes
// All POST endpoints accept unlimited payload sizes
```

### Overly permissive CORS (main.rs:142)
```rust
let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check Rust | `cargo check` | exit 0 |
| Clippy | `cargo clippy` | exit 0 or warnings-only |
| Test | `cargo test` | all pass |

## Scope

**In scope**:
- `backend/src/capture.rs` — sanitize `session_id` in `receive_image`
- `backend/src/main.rs` — add `RequestBodyLimitLayer`, restrict CORS
- `backend/Cargo.toml` — no new deps needed (tower-http already in deps)

**Out of scope**:
- Auth/CSRF (Plan 002)
- Any frontend changes
- Database schema changes

## Git workflow

- Branch: `plan/001-security-fixes`
- Commit per step with message style: `fix(security): <description>`
- Do NOT push or open a PR unless instructed

## Steps

### Step 1: Sanitize session_id in capture.rs

Add a `sanitize_session` helper function and use it before constructing filenames:

```rust
// In capture.rs, add this helper:
fn sanitize_session(session: &str) -> String {
    session.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect()
}
```

Then modify `receive_image` at line 89:
```rust
// Change:
let session_id = get_session(&payload.session);
// To:
let session_id = sanitize_session(&get_session(&payload.session));
```

Also apply to `receive_location` (line 119), `receive_ip` (line 151), `receive_fingerprint` (line 185), `receive_event` (line 225), `receive_storage` (line 241), `receive_credentials` (line 259) — all use `get_session()` and could pass the sanitized session to file operations in the future.

**Verify**: `grep -n "sanitize_session" backend/src/capture.rs` → 2 matches (definition + usage)

### Step 2: Add request body size limits

In `backend/src/main.rs`, import and apply `RequestBodyLimitLayer`:

```rust
// Add to imports (line ~3 area):
use tower_http::limit::RequestBodyLimitLayer;
```

Find the router construction around line 149. Wrap the capture endpoints with a size limit. The cleanest approach: apply it to the capture route group only. Create a sub-router for capture endpoints:

```rust
let capture_routes = Router::new()
    .route("/image", post(capture::receive_image))
    .route("/location", post(capture::receive_location))
    .route("/ip", post(capture::receive_ip))
    .route("/fingerprint", post(capture::receive_fingerprint))
    .route("/event", post(capture::receive_event))
    .route("/storage", post(capture::receive_storage))
    .route("/credentials", post(capture::receive_credentials))
    .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024)); // 10MB max

// Then nest it in api_routes:
// .nest("/capture", capture_routes)
// Replace the individual .route("/capture/*", ...) lines with this.
```

**Important**: Maintain the existing route paths. Currently routes are at `/api/capture/image`, `/api/capture/location`, etc. Using `.nest("/capture", capture_routes)` will produce `/api/capture/capture/image` unless you strip the prefix. Instead, keep the routes flat but apply the layer differently.

**Simpler alternative**: Apply `RequestBodyLimitLayer` only to the full API routes:
```rust
let api_routes = Router::new()
    // ... all routes
    .layer(RequestBodyLimitLayer::new(50 * 1024 * 1024)); // 50MB ceiling for whole API
```

This is less precise but simpler. For the plan, use this approach.

**Verify**: `cargo check` → exit 0

### Step 3: Restrict CORS

Change the CORS layer to restrict methods and allow specific origins:

```rust
let allowed_origins = std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "*".into());
let cors = if allowed_origins == "*" {
    CorsLayer::new().allow_origin(Any).allow_methods([http::Method::GET, http::Method::POST, http::Method::DELETE]).allow_headers(Any)
} else {
    CorsLayer::new()
        .allow_origin(allowed_origins.parse::<HeaderValue>().unwrap())
        .allow_methods([http::Method::GET, http::Method::POST, http::Method::DELETE])
        .allow_headers(Any)
};
```

This allows operators to set `CORS_ORIGIN=https://dashboard.example.com` for stricter control while keeping `*` default for backward compatibility.

**Verify**: `cargo check` → exit 0

### Step 4: Add per-IP rate limiting

Add a simple in-memory rate limiter using a `HashMap` behind `Arc<Mutex<>>`. In `backend/src/main.rs`:

```rust
use std::collections::HashMap;
use std::sync::Mutex;

// Add to AppState:
pub rate_limiter: Arc<Mutex<HashMap<String, (u32, std::time::Instant)>>>,

// Initialize:
rate_limiter: Arc::new(Mutex::new(HashMap::new())),
```

Add a `check_rate_limit` function in `capture.rs`:
```rust
pub fn check_rate_limit(
    state: &AppState,
    ip: &str,
    max_requests: u32,
    window_secs: u64,
) -> bool {
    let mut limiter = state.rate_limiter.lock().unwrap();
    let now = std::time::Instant::now();
    let entry = limiter.entry(ip.to_string()).or_insert((0, now));
    if entry.1.elapsed().as_secs() > window_secs {
        *entry = (1, now);
        true
    } else {
        entry.0 += 1;
        if entry.0 > max_requests {
            false
        } else {
            true
        }
    }
}
```

Then call it at the start of each `receive_*` handler:
```rust
let ip = extract_ip(&headers);
if !check_rate_limit(&state, &ip, 60, 60) {
    return Err(StatusCode::TOO_MANY_REQUESTS);
}
```

**Verify**: `cargo check` → exit 0

## Test plan

No existing tests exist. Add integration tests for:
1. Path traversal: POST a capture with `session_id=../../etc/passwd` → file is written to captures dir, NOT to `/etc/`
2. Body limit: POST 15MB payload → 413 response
3. Rate limit: POST 100 times in 1 second → 429 after threshold

Model tests after the existing `#[cfg(test)] mod tests { ... }` blocks — search for `#[cfg(test)]` in the codebase.

## Done criteria

- [ ] `cargo check` exits 0
- [ ] `cargo clippy` exits 0 or warnings-only
- [ ] `cargo test` exits 0
- [ ] Session IDs with `../../` are safely sanitized in filenames
- [ ] POST with >10MB payload returns 413
- [ ] 60+ requests in 60s returns 429
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:
- The code at the locations above doesn't match the excerpts (codebase has drifted)
- `cargo check` fails in a way not fixable within the Scope
- Adding `Mutex<HashMap<...>>` causes any concurrency issues spotted during review
- The `RequestBodyLimitLayer` conflicts with large image uploads needed for legitimate operation

## Maintenance notes

- The in-memory rate limiter resets on server restart. For production, consider a persistent store.
- If the app ever adds file upload endpoints, their size limit should be higher than the 10MB capture limit.
- CORS hardening in this plan is a stopgap — proper auth (Plan 002) is the real fix.
