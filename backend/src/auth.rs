use axum::body::Body;
use axum::extract::State;
use axum::http::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

#[derive(Serialize)]
pub struct AuthRequired {
    pub message: &'static str,
}

impl IntoResponse for AuthRequired {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, axum::Json(self)).into_response()
    }
}

/* ─────────────── OAuth2 / API-Key token endpoint ─────────────── */

#[derive(Deserialize)]
pub struct TokenRequest {
    grant_type: String,
    client_id: String,
    client_secret: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    scope: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    exp: chrono::DateTime<chrono::Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    iat: chrono::DateTime<chrono::Utc>,
}

pub async fn token_endpoint(
    State(state): State<Arc<AppState>>,
    axum::Form(req): axum::Form<TokenRequest>,
) -> Result<axum::Json<TokenResponse>, StatusCode> {
    if req.grant_type != "client_credentials" {
        tracing::warn!("OAuth token request rejected: unsupported grant_type '{}'", req.grant_type);
        return Err(StatusCode::BAD_REQUEST);
    }

    let expected = state
        .oauth_clients
        .get(&req.client_id)
        .ok_or_else(|| {
            tracing::warn!("OAuth token request rejected: unknown client_id '{}'", req.client_id);
            StatusCode::UNAUTHORIZED
        })?;

    if expected != &req.client_secret {
        tracing::warn!("OAuth token request rejected: invalid client_secret for client_id '{}'", req.client_id);
        return Err(StatusCode::UNAUTHORIZED);
    }

    let now = chrono::Utc::now();
    let claims = Claims {
        sub: req.client_id,
        scope: "api:read api:write".to_string(),
        iat: now,
        exp: now + chrono::Duration::seconds(3600),
    };

    let token = jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|e| {
        tracing::error!("JWT encode failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(axum::Json(TokenResponse {
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
    }))
}

/* ─────────────── Auth middleware (multi-method) ─────────────── */

pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, AuthRequired> {
    // 1. Browser dashboard users: access-code cookie or query
    if has_valid_cookie(&req) || has_valid_query_code(&req) {
        return Ok(next.run(req).await);
    }

    // 2. DASHBOARD_TOKEN Bearer auth (existing static token)
    let dashboard_token = std::env::var("DASHBOARD_TOKEN").unwrap_or_default();
    if !dashboard_token.is_empty() {
        if let Some(provided) = extract_bearer(&req) {
            if provided == dashboard_token {
                return Ok(next.run(req).await);
            }
        }
    }

    // 3. API key auth (X-API-Key header)
    if !state.api_keys.is_empty() {
        if let Some(key) = req.headers().get("X-API-Key").and_then(|v| v.to_str().ok()) {
            if state.api_keys.contains(key) {
                return Ok(next.run(req).await);
            }
        }
    }

    // 4. OAuth2 JWT Bearer auth
    if !state.oauth_clients.is_empty() {
        if let Some(token) = extract_bearer(&req) {
            match validate_jwt(&token, &state.jwt_secret) {
                Ok(_claims) => return Ok(next.run(req).await),
                Err(e) => tracing::debug!("JWT validation failed: {}", e),
            }
        }
    }

    // Backward compatibility: if absolutely no auth is configured, allow all
    let any_auth_configured =
        !dashboard_token.is_empty() || !state.api_keys.is_empty() || !state.oauth_clients.is_empty();
    if !any_auth_configured {
        return Ok(next.run(req).await);
    }

    Err(AuthRequired {
        message: "Unauthorized — provide a valid access code, DASHBOARD_TOKEN Bearer, API key, or OAuth2 token",
    })
}

fn extract_bearer(req: &Request<Body>) -> Option<String> {
    req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

fn validate_jwt(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.validate_exp = true;
    validation.required_spec_claims.insert("exp".to_string());
    let token_data = jsonwebtoken::decode::<Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(token_data.claims)
}

/* ─────────────── CSRF middleware ─────────────── */

pub async fn csrf_middleware(
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    if matches!(req.method(), &axum::http::Method::POST | &axum::http::Method::PUT | &axum::http::Method::PATCH | &axum::http::Method::DELETE) {
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

/* ─────────────── Access code helpers ─────────────── */

/// Check if the request has a valid access cookie.
fn has_valid_cookie(req: &Request<Body>) -> bool {
    let expected = std::env::var("CAMPHISH_ACCESS_CODE").unwrap_or_default();
    if expected.is_empty() { return true; }
    req.headers()
        .get("Cookie")
        .and_then(|v| v.to_str().ok())
        .map(|c| c.contains(&format!("camphish_access={}", expected)))
        .unwrap_or(false)
}

/// Check if the request has a valid access code in the query string.
fn has_valid_query_code(req: &Request<Body>) -> bool {
    let expected = std::env::var("CAMPHISH_ACCESS_CODE").unwrap_or_default();
    if expected.is_empty() { return true; }
    req.uri().query().map_or(false, |q| {
        q.split('&').any(|pair| {
            let mut parts = pair.splitn(2, '=');
            parts.next() == Some("code") && parts.next() == Some(&expected)
        })
    })
}

/// Generate a human-readable access code like X7K3-M9P2-R5B1-W8D4
///
/// Priority order:
///   1. SERVICE_PASSWORD_CAMPHISH_ACCESS — Coolify magic password (auto-injected by panel)
///   2. SERVICE_SECRET_CAMPHISH — Coolify magic secret (fallback if no password)
///   3. CAMPHISH_ACCESS_SEED — deterministic UUID v5 seed
///   4. Persisted .access_code file (survives restarts)
///   5. Random UUID v4
pub fn generate_access_code(data_dir: &str) -> String {
    // 1. Coolify magic password — auto-injected by panel, highest priority
    for var in ["SERVICE_PASSWORD_CAMPHISH_ACCESS", "SERVICE_SECRET_CAMPHISH"] {
        if let Some(code) = std::env::var(var).ok().filter(|s| s.len() >= 8) {
            let code = code.trim().replace(['\n', '\r', ' '], "");
            if !code.is_empty() {
                let _ = std::fs::write(format!("{}/.access_code", data_dir), &code);
                std::env::set_var("CAMPHISH_ACCESS_SEED", &code);
                return code;
            }
        }
    }

    // 2. Check env override — deterministic code from seed
    if let Some(seed) = std::env::var("CAMPHISH_ACCESS_SEED").ok().filter(|s| !s.is_empty()) {
        let ns = uuid::Uuid::NAMESPACE_URL;
        let uuid = uuid::Uuid::new_v5(&ns, seed.as_bytes());
        let hex = uuid.to_string().to_uppercase();
        let clean: String = hex.chars().filter(|c| c.is_ascii_hexdigit()).take(16).collect();
        let groups: Vec<&str> = clean.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect();
        return groups.join("-");
    }

    // 3. Check persisted file
    let code_file = format!("{}/.access_code", data_dir);
    if let Ok(code) = std::fs::read_to_string(&code_file) {
        let code = code.trim().to_string();
        if !code.is_empty() && code.len() == 19 {
            return code;
        }
    }

    // 4. Generate new random code and persist
    let uuid = uuid::Uuid::new_v4().to_string().to_uppercase();
    let clean: String = uuid.chars().filter(|c| c.is_ascii_hexdigit()).take(16).collect();
    let groups: Vec<&str> = clean.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect();
    let code = groups.join("-");
    let _ = std::fs::write(&code_file, &code);
    code
}
