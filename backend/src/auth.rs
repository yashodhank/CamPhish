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

/// Generate a human-readable access code like X7K3-M9P2-R5B1-W8D4
///
/// Uses a UUID v4 and takes the first 16 hex digits in 4 groups.
pub fn generate_access_code() -> String {
    let uuid = uuid::Uuid::new_v4().to_string().to_uppercase();
    let clean: String = uuid.chars().filter(|c| c.is_ascii_hexdigit()).take(16).collect();
    let groups: Vec<&str> = clean.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect();
    groups.join("-")
}
