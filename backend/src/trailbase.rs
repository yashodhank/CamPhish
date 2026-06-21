use std::time::Duration;

#[derive(Clone)]
pub struct TrailBaseClient {
    pub base_url: String,
    pub api_key: Option<String>,
    pub http: reqwest::Client,
}

impl TrailBaseClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");
        Self { base_url, api_key, http }
    }

    pub async fn health(&self) -> bool {
        let url = format!("{}/_/admin/", self.base_url.trim_end_matches('/'));
        self.http.get(&url).send().await
            .map(|r| r.status().is_success() || r.status().as_u16() == 401)
            .unwrap_or(false)
    }
}
