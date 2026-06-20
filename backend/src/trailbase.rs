use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Clone)]
pub struct TrailBaseClient {
    pub base_url: String,
    pub api_key: Option<String>,
    pub http: reqwest::Client,
}

#[derive(Serialize)]
pub struct RecordInput {
    #[serde(flatten)]
    fields: serde_json::Value,
}

#[derive(Deserialize, Debug)]
pub struct RecordList<T> {
    pub data: Vec<T>,
    pub total: Option<i64>,
}

impl TrailBaseClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");

        Self { base_url, api_key, http }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/records/{}", self.base_url.trim_end_matches('/'), path)
    }

    fn file_url(&self, collection: &str, id: &str, column: &str) -> String {
        format!("{}/api/files/{}/{}/{}", self.base_url.trim_end_matches('/'), collection, id, column)
    }

    fn add_auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(ref key) = self.api_key {
            req.header("Authorization", format!("Bearer {}", key))
        } else {
            req
        }
    }

    pub async fn list<T: for<'de> Deserialize<'de>>(
        &self,
        collection: &str,
        page: u32,
        per_page: u32,
    ) -> anyhow::Result<RecordList<T>> {
        let url = format!("{}?page={}&per_page={}", self.url(collection), page, per_page);
        let req = self.add_auth(self.http.get(&url));
        let resp = req.send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("TrailBase list {}: {}", collection, resp.status());
        }
        Ok(resp.json().await?)
    }

    pub async fn create<T: for<'de> Deserialize<'de>>(
        &self,
        collection: &str,
        fields: serde_json::Value,
    ) -> anyhow::Result<T> {
        let req = self.add_auth(
            self.http
                .post(self.url(collection))
                .header("Content-Type", "application/json")
                .json(&fields),
        );
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("TrailBase create {}: {} — {}", collection, "error", body);
        }
        Ok(resp.json().await?)
    }

    pub async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        collection: &str,
        id: &str,
    ) -> anyhow::Result<T> {
        let req = self.add_auth(self.http.get(format!("{}/{}", self.url(collection), id)));
        let resp = req.send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("TrailBase get {}/{}: {}", collection, id, resp.status());
        }
        Ok(resp.json().await?)
    }

    pub async fn delete(&self, collection: &str, id: &str) -> anyhow::Result<()> {
        let req = self.add_auth(self.http.delete(format!("{}/{}", self.url(collection), id)));
        let resp = req.send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("TrailBase delete {}/{}: {}", collection, id, resp.status());
        }
        Ok(())
    }

    pub async fn count(&self, collection: &str) -> anyhow::Result<i64> {
        let url = format!("{}?page=1&per_page=1", self.url(collection));
        let req = self.add_auth(self.http.get(&url));
        let resp = req.send().await?;
        if !resp.status().is_success() {
            return Ok(0);
        }
        let body: serde_json::Value = resp.json().await?;
        Ok(body.get("total").and_then(|v| v.as_i64()).unwrap_or(0))
    }

    pub async fn health(&self) -> bool {
        let url = format!("{}/api/health", self.base_url.trim_end_matches('/'));
        self.http.get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false)
    }

    pub async fn upload_file(
        &self,
        collection: &str,
        id: &str,
        column: &str,
        filename: &str,
        data: Vec<u8>,
        content_type: &str,
    ) -> anyhow::Result<()> {
        let part = reqwest::multipart::Part::bytes(data)
            .file_name(filename.to_string())
            .mime_str(content_type)?;

        let form = reqwest::multipart::Form::new().part(column.to_string(), part);

        let url = format!("{}/api/files/{}/{}/{}", self.base_url.trim_end_matches('/'), collection, id, column);
        let req = self.add_auth(self.http.post(&url).multipart(form));
        let resp = req.send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("File upload failed: {}", resp.status());
        }
        Ok(())
    }
}
