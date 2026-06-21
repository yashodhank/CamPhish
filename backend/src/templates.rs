use crate::AppState;
use axum::extract::{Path, State};
use axum::http::header;
use axum::http::StatusCode;
use axum::response::Response;
use heck::ToTitleCase;
use std::sync::Arc;

pub async fn scan_and_register(state: &Arc<AppState>) -> anyhow::Result<()> {
    let entries = std::fs::read_dir(&state.templates_dir)?;
    let now = chrono::Utc::now().timestamp();

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("html") {
            continue;
        }

        let id = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let file_path = path.to_string_lossy().to_string();
        let name = id.replace('-', " ").to_title_case();
        let description = get_template_description(&path);

        sqlx::query(
            "INSERT INTO templates (id, name, description, file_path, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, file_path=excluded.file_path"
        )
        .bind(&id).bind(&name).bind(&description).bind(&file_path).bind(now)
        .execute(&state.pool).await?;
    }

    tracing::info!("Templates scanned and registered");
    Ok(())
}

pub async fn serve_template(
    State(state): State<Arc<AppState>>,
    Path(template_id): Path<String>,
) -> Result<Response, StatusCode> {
    // Increment served counter
    let _ = sqlx::query("UPDATE templates SET total_served = total_served + 1 WHERE id = ?")
        .bind(&template_id).execute(&state.pool).await;

    // Check cache first
    if let Some(cached) = state.get_cached_template(&template_id).await {
        let mut resp = Response::new(cached.into());
        resp.headers_mut().insert(header::CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());
        resp.headers_mut().insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
        return Ok(resp);
    }

    let row: Option<(String,)> = sqlx::query_as("SELECT file_path FROM templates WHERE id = ?")
        .bind(&template_id)
        .fetch_optional(&state.pool).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let file_path = match row {
        Some((path,)) => path,
        None => {
            let path = format!("{}/{}.html", state.templates_dir, template_id);
            if std::path::Path::new(&path).exists() {
                path
            } else {
                return Err(StatusCode::NOT_FOUND);
            }
        }
    };

    let html = std::fs::read_to_string(&file_path).map_err(|_| StatusCode::NOT_FOUND)?;

    let tunnel_link = std::env::var("TUNNEL_LINK").unwrap_or_default();

    let api_base = if tunnel_link.is_empty() {
        "/api".to_string()
    } else {
        format!("{}/api", tunnel_link)
    };

    let processed = html
        .replace("API_BASE_URL", &api_base)
        .replace("forwarding_link", &tunnel_link);

    // Cache for future requests
    state.cache_template(&template_id, processed.clone()).await;

    let mut resp = Response::new(processed.into());
    resp.headers_mut().insert(header::CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());
    resp.headers_mut().insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
    Ok(resp)
}

fn get_template_description(path: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let comment = content.lines()
        .find(|l| l.contains("<!-- DESC:"))
        .and_then(|l| {
            let start = l.find("<!-- DESC:")? + 10;
            let end = l.find("-->")?;
            Some(l[start..end].trim().to_string())
        });
    comment
}


