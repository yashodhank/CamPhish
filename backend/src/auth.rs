use axum::body::Body;
use axum::http::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde::Serialize;


#[derive(Serialize)]
pub struct AuthRequired {
    pub message: &'static str,
}

impl IntoResponse for AuthRequired {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, axum::Json(self)).into_response()
    }
}

pub async fn auth_middleware(
    req: Request<Body>,
    next: Next,
) -> Result<Response, AuthRequired> {
    let token = std::env::var("DASHBOARD_TOKEN").unwrap_or_default();
    if token.is_empty() {
        return Ok(next.run(req).await);
    }

    let provided = req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    match provided {
        Some(p) if p == token => Ok(next.run(req).await),
        _ => Err(AuthRequired { message: "Unauthorized — provide DASHBOARD_TOKEN via Authorization: Bearer <token>" }),
    }
}

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
