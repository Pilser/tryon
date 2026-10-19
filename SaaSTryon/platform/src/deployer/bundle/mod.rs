/* mod.rs - the R2 `BUNDLES` manifest -> loaded + verified BundleData
(PLATFORM.md §3.4, manifest written by the CI packaging script).

    bundles/<bundle_id>/manifest.json
      {
        "schema": "st-bundle/1",
        "wasm":       { "key": "shop.wasm",  "sha256": "<64hex>" },
        "glue":       { "key": "worker.js" },
        "schema_sql": { "key": "shop-schema.sql" },
        "assets": [ { "key": "assets/index.html", "path": "/index.html",
                      "sha256": "<64hex>" }, ... ],
        "entry": "worker.js",
        "compat_date": "2026-10-19"
      }

    bundles/<bundle_id>/shop.wasm          # pre-wrapped Rust wasm
    bundles/<bundle_id>/worker.js          # JS glue: fetch -> wasm (ASSETS)
    bundles/<bundle_id>/shop-schema.sql    # applied to the per-shop D1
    bundles/<bundle_id>/assets/...           # frontend/dist contents

Wasm note (Q1 - live probe pending): the wasm module ships as an extra
multipart part in `application/wasm`; the glue JS must import it by its
part name (`./<basename(wasm.key)>`). Whether plain ES imports or
`web_assembly` bindings win inside a plain script-PUT is exactly the Q1
throwaway-deploy question; this code assumes nothing beyond the docs. */
pub mod assets;
pub mod multipart;

pub use assets::{
    asset_session_path, base64_encode, buckets_of, parse_session_jwt, stage_assets, StageOutcome,
    ASSET_UPLOAD_PATH,
};
pub use multipart::{mime_for_path, script_put_path, MultipartBuilder, ScriptPut};

use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use worker::Bucket;

pub const MANIFEST_SCHEMA: &str = "st-bundle/1";

// ----------------------------------------------------------- manifest

#[derive(Debug, Clone, Deserialize)]
pub struct PartRef {
    pub key: String,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetRef {
    pub key: String,
    pub path: String,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BundleManifest {
    pub schema: String,
    pub wasm: PartRef,
    pub glue: PartRef,
    pub schema_sql: PartRef,
    #[serde(default)]
    pub assets: Vec<AssetRef>,
    pub entry: String,
    pub compat_date: String,
}

impl BundleManifest {
    /// The wasm multipart part name (the glue imports it by this name).
    pub fn wasm_name(&self) -> String {
        basename(&self.wasm.key)
    }
}

pub fn parse_manifest(text: &str) -> Result<BundleManifest, String> {
    let m: BundleManifest =
        serde_json::from_str(text).map_err(|e| format!("manifest.json unparseable: {e}"))?;
    if m.schema != MANIFEST_SCHEMA {
        return Err(format!(
            "unsupported bundle schema {:?} (expected {MANIFEST_SCHEMA})",
            m.schema
        ));
    }
    if m.entry.is_empty() {
        return Err("manifest missing entry".into());
    }
    if basename(&m.glue.key) != m.entry {
        return Err(format!(
            "glue key {:?} does not match entry {:?}",
            m.glue.key, m.entry
        ));
    }
    if m.wasm.key.is_empty() || m.schema_sql.key.is_empty() {
        return Err("manifest missing wasm/schema_sql key".into());
    }
    Ok(m)
}

fn basename(key: &str) -> String {
    key.rsplit('/').next().unwrap_or(key).to_string()
}

/// sha256, first 32 hex chars - the assets-session hash (§3.3).
pub fn asset_hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))[..32].to_string()
}

pub fn full_sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn normalize_asset_path(path: &str) -> String {
    let p = path.trim().to_string();
    if p.starts_with('/') {
        p
    } else {
        format!("/{p}")
    }
}

/// Loaded + verified bundle contents (tests build these by hand; the
/// deployed path comes from [`R2BundleSource`]).
#[derive(Clone)]
pub struct BundleData {
    pub manifest: BundleManifest,
    pub wasm: Vec<u8>,
    pub glue: String,
    pub schema_sql: String,
    /// (path, bytes) in manifest order.
    pub assets: Vec<(String, Vec<u8>)>,
}

impl BundleData {
    /// Re-verify every sha256 the manifest promises (catch a mismatched
    /// packaging run before it ships half a shop).
    pub fn verify(&self) -> Result<(), String> {
        if !self.manifest.wasm.sha256.is_empty()
            && full_sha256(&self.wasm) != self.manifest.wasm.sha256
        {
            return Err(format!("wasm sha mismatch ({})", self.manifest.wasm.key));
        }
        for a in &self.manifest.assets {
            if a.sha256.is_empty() {
                continue;
            }
            let Some((_, bytes)) = self.assets.iter().find(|(p, _)| *p == a.path) else {
                return Err(format!("manifest asset {} not loaded", a.path));
            };
            if full_sha256(bytes) != a.sha256 {
                return Err(format!("asset sha mismatch {}", a.path));
            }
        }
        Ok(())
    }

    /// `{"/path": {"hash": .., "size": ..}}` for the session call.
    pub fn assets_manifest(&self) -> Value {
        let mut manifest = serde_json::Map::new();
        for (path, bytes) in &self.assets {
            manifest.insert(
                normalize_asset_path(path),
                json!({ "hash": asset_hash(bytes), "size": bytes.len() }),
            );
        }
        Value::Object(manifest)
    }
}

// ------------------------------------------------- async R2 loading

#[allow(async_fn_in_trait)]
pub trait BundleSource {
    async fn load_bundle(&self, bundle_id: &str) -> Result<BundleData, String>;
}

pub struct R2BundleSource {
    pub bucket: Bucket,
}

impl BundleSource for R2BundleSource {
    async fn load_bundle(&self, bundle_id: &str) -> Result<BundleData, String> {
        let manifest_raw = bytes_or(&self.bucket, bundle_id, "manifest.json").await?;
        let manifest = parse_manifest(
            std::str::from_utf8(&manifest_raw)
                .map_err(|_| "manifest.json is not utf-8".to_string())?,
        )?;
        let wasm = bytes_or(&self.bucket, bundle_id, &manifest.wasm.key).await?;
        let glue = String::from_utf8(bytes_or(&self.bucket, bundle_id, &manifest.glue.key).await?)
            .map_err(|_| "glue is not utf-8".to_string())?;
        let schema_sql =
            String::from_utf8(bytes_or(&self.bucket, bundle_id, &manifest.schema_sql.key).await?)
                .map_err(|_| "schema_sql is not utf-8".to_string())?;
        let mut assets = Vec::with_capacity(manifest.assets.len());
        for a in &manifest.assets {
            assets.push((
                a.path.clone(),
                bytes_or(&self.bucket, bundle_id, &a.key).await?,
            ));
        }
        Ok(BundleData {
            manifest,
            wasm,
            glue,
            schema_sql,
            assets,
        })
    }
}

async fn bytes_or(bucket: &Bucket, bundle_id: &str, rel: &str) -> Result<Vec<u8>, String> {
    let key = format!("bundles/{bundle_id}/{rel}");
    match bucket.get(&key).execute().await {
        Err(e) => Err(format!("{key}: {e}")),
        Ok(None) => Err(format!("{key} missing")),
        Ok(Some(obj)) => {
            let Some(body) = obj.body() else {
                return Err(format!("{key} has no body"));
            };
            body.bytes().await.map_err(|e| format!("{key}: {e}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_json() -> String {
        r#"{
            "schema": "st-bundle/1",
            "wasm": {"key": "shop.wasm", "sha256": "aa"},
            "glue": {"key": "worker.js"},
            "schema_sql": {"key": "shop-schema.sql"},
            "assets": [{"key": "assets/index.html", "path": "index.html", "sha256": "bb"}],
            "entry": "worker.js",
            "compat_date": "2026-10-19"
        }"#
        .to_string()
    }

    #[test]
    fn manifest_good() {
        let m = parse_manifest(&manifest_json()).expect("good manifest must parse");
        assert_eq!(m.entry, "worker.js");
        assert_eq!(m.wasm_name(), "shop.wasm");
        assert_eq!(m.assets[0].path, "index.html");
        assert_eq!(m.compat_date, "2026-10-19");
    }

    #[test]
    fn manifest_bad_shapes() {
        assert!(parse_manifest("not json").is_err());
        let wrong_schema = manifest_json().replace("st-bundle/1", "st-bundle/2");
        assert!(parse_manifest(&wrong_schema).is_err());
        let missing_wasm = manifest_json().replace(
            "\"wasm\": {\"key\": \"shop.wasm\", \"sha256\": \"aa\"},",
            "",
        );
        assert!(parse_manifest(&missing_wasm).is_err());
        let entry_mismatch =
            manifest_json().replace("\"entry\": \"worker.js\"", "\"entry\": \"other.js\"");
        assert!(parse_manifest(&entry_mismatch).is_err());
    }

    #[test]
    fn asset_hash_is_32_hex() {
        let h = asset_hash(b"hello");
        assert_eq!(h.len(), 32);
        assert_eq!(h, asset_hash(b"hello"));
        assert_ne!(h, asset_hash(b"hellO"));
    }

    /// verify(): promised shas are re-checked; empty sha string = skip
    /// (the manifest sha is optional so hand-built test bundles work).
    #[test]
    fn verify_checks_promised_shas() {
        let wasm_bytes: &[u8] = b"wasm-bytes";
        let asset_bytes: &[u8] = b"<html>x</html>";
        let manifest = parse_manifest(&format!(
            r#"{{ "schema": "st-bundle/1", "wasm": {{"key": "shop.wasm", "sha256": "{w}"}},
                "glue": {{"key": "worker.js"}}, "schema_sql": {{"key": "schema.sql"}},
                "assets": [{{"key": "assets/index.html", "path": "index.html", "sha256": "{a}"}}],
                "entry": "worker.js", "compat_date": "2026-10-19" }}"#,
            w = full_sha256(wasm_bytes),
            a = full_sha256(asset_bytes),
        ))
        .unwrap();
        let data = BundleData {
            manifest,
            wasm: wasm_bytes.to_vec(),
            glue: "export {}".into(),
            schema_sql: "CREATE TABLE x;".into(),
            assets: vec![("index.html".into(), asset_bytes.to_vec())],
        };
        assert!(data.verify().is_ok());
        // flip one asset byte -> mismatch
        let mut bad = data.clone();
        bad.assets[0].1.insert(0, b'X');
        assert!(bad.verify().is_err());
        // bad wasm hash
        let mut bad2 = data.clone();
        bad2.wasm.push(0);
        assert!(bad2.verify().is_err());
    }
}
