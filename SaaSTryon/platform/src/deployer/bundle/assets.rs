/* assets.rs - the 3-step static-assets flow, steps 1+2 belonging to one
deploy, step 3 (the completion jwt into the script metadata) lands in
the ScriptPut built by multipart.rs. /workers/static-assets/direct-
upload, updated 2026-08-10:

  1. POST .../workers/scripts/{script}/assets-upload-session
     {manifest: {"/path": {hash, size}}}      -> {jwt, buckets}
     hash = first 32 hex chars of sha256(bytes) (PLATFORM.md §3.3).
  2. POST /workers/assets/upload?base64=true (Authorization: the SESSION
     jwt, NOT the platform token; field name = hash, value = base64
     content, part Content-Type = per-file mime) -> {jwt}: the
     completion token (1 h). Empty `buckets` -> skip; the session jwt IS
     the completion token (§3.3 first-upload-sync simplification).
  3. PUT script with metadata.assets.jwt = completion token.

The platform token NEVER touches the upload call: it is signed for the
account API, while the session jwt is scoped to this one upload. */
use super::multipart::{mime_for_path, MultipartBuilder};
use super::{asset_hash, normalize_asset_path, BundleData, BundleManifest};
use serde_json::{json, Value};

use crate::deployer::cf_api::{call_with_retry, CfBody, CfError, CfRequest, RawBody, Transport};
/// Engine trait must be in scope for `STANDARD.encode` (asset bodies).
use base64::Engine as _;

pub const ASSET_UPLOAD_PATH: &str = "/accounts/{account}/workers/assets/upload?base64=true";

pub fn asset_session_path(account: &str, script_name: &str) -> String {
    format!("/accounts/{account}/workers/scripts/{script_name}/assets-upload-session")
}

/// Result of steps 1+2 for one deploy.
pub struct StageOutcome {
    pub completion_jwt: String,
    /// How many upload calls happened (0 = buckets were empty).
    pub uploaded_parts: usize,
}

pub fn parse_session_jwt(v: &Value) -> Option<String> {
    v.get("jwt")
        .or_else(|| v.get("result").and_then(|r| r.get("jwt")))
        .and_then(|j| j.as_str())
        .map(|s| s.to_string())
}

pub fn buckets_of(v: &Value) -> Vec<String> {
    let base = v
        .get("buckets")
        .or_else(|| v.get("result").and_then(|r| r.get("buckets")));
    let mut out = Vec::new();
    if let Some(arr) = base.and_then(|b| b.as_array()) {
        for bucket in arr {
            if let Some(list) = bucket.as_array() {
                for h in list {
                    if let Some(s) = h.as_str() {
                        out.push(s.to_string());
                    }
                }
            }
        }
    }
    out
}

pub fn base64_encode(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Steps 1+2 of the asset flow for one deploy: session first, then the
/// missing-hash buckets. Returns the completion jwt for step 3.
pub async fn stage_assets(
    cf: &impl Transport,
    account: &str,
    script_name: &str,
    data: &BundleData,
    b: &MultipartBuilder,
) -> Result<StageOutcome, CfError> {
    let session = call_with_retry(
        cf,
        CfRequest {
            method: worker::Method::Post,
            path: asset_session_path(account, script_name),
            body: CfBody::Json(json!({ "manifest": data.assets_manifest() })),
            jwt: None,
        },
    )
    .await?;
    let session_jwt = parse_session_jwt(&session)
        .ok_or_else(|| CfError::transport(0, "assets session returned no jwt"))?;
    let missing = buckets_of(&session);
    if missing.is_empty() {
        return Ok(StageOutcome {
            completion_jwt: session_jwt,
            uploaded_parts: 0,
        });
    }
    let mut uploaded_parts = 0;
    let mut completion = session_jwt.clone();
    for group in group_missing(&missing) {
        // The session returns grouped buckets of hashes; one request per
        // bucket is a valid batching (the endpoint keys upload parts on
        // the hash field name only).
        uploaded_parts += 1;
        let up = call_with_retry(
            cf,
            CfRequest {
                method: worker::Method::Post,
                path: ASSET_UPLOAD_PATH.replace("{account}", account),
                body: CfBody::Raw(upload_body_for(b, &group, data)),
                jwt: Some(session_jwt.clone()),
            },
        )
        .await?;
        if let Some(j) = parse_session_jwt(&up) {
            completion = j;
        }
    }
    Ok(StageOutcome {
        completion_jwt: completion,
        uploaded_parts,
    })
}

fn group_missing(flat: &[String]) -> Vec<Vec<String>> {
    // One flat deduped bucket: the upload endpoint has no group routing,
    // dedupe protects against double-uploading a shared hash.
    let mut one = Vec::new();
    for h in flat {
        if !one.contains(h) {
            one.push(h.clone());
        }
    }
    vec![one]
}

fn resolve_hash(hash: &str, data: &BundleData) -> Result<(String, Vec<u8>), CfError> {
    for (path, bytes) in &data.assets {
        if asset_hash(bytes) == hash {
            return Ok((normalize_asset_path(path), bytes.clone()));
        }
    }
    Err(CfError::transport(
        0,
        format!("session requested unknown asset hash {hash}"),
    ))
}

fn upload_body_for(b: &MultipartBuilder, hashes: &[String], data: &BundleData) -> RawBody {
    let mut files = Vec::new();
    for h in hashes {
        if let Ok((path, bytes)) = resolve_hash(h, data) {
            files.push((h.clone(), base64_encode(&bytes), mime_for_path(&path)));
        }
    }
    b.asset_upload_body(&files)
}

// keep the module growth honest: staging is steps 1+2 only.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deployer::cf_api::CfResponse;
    use std::cell::RefCell;

    /// Two-call mock transport: session answer, then captures the
    /// upload request and answers the completion jwt.
    struct SessionCf {
        session_body: String,
        seen: RefCell<Vec<String>>,
    }

    impl Transport for SessionCf {
        async fn call(&self, req: CfRequest) -> Result<CfResponse, CfError> {
            self.seen
                .borrow_mut()
                .push(format!("{}|{:?}", req.path, req.jwt));
            if req.path.ends_with("/assets-upload-session") {
                return Ok(CfResponse {
                    status: 200,
                    body: self.session_body.clone(),
                    retry_after: None,
                    ratelimit_remaining: None,
                });
            }
            Ok(CfResponse {
                status: 201,
                body: r#"{"jwt":"completion-tok"}"#.into(),
                retry_after: None,
                ratelimit_remaining: None,
            })
        }
    }

    fn bundle_with_asset() -> BundleData {
        let bytes = b"<html>x</html>".to_vec();
        let h = asset_hash(&bytes);
        let manifest: BundleManifest = serde_json::from_str(&format!(
            r#"{{ "schema": "st-bundle/1", "wasm": {{"key": "shop.wasm"}},
                 "glue": {{"key": "worker.js"}}, "schema_sql": {{"key": "schema.sql"}},
                 "assets": [{{"key": "assets/index.html", "path": "index.html", "sha256": "{h}"}}],
                 "entry": "worker.js", "compat_date": "2026-10-19" }}"#
        ))
        .unwrap();
        BundleData {
            manifest,
            wasm: Vec::new(),
            glue: String::new(),
            schema_sql: String::new(),
            assets: vec![("index.html".into(), bytes)],
        }
    }

    async fn run_stage(session_body: &str) -> (StageOutcome, Vec<String>) {
        let cf = SessionCf {
            session_body: session_body.to_string(),
            seen: RefCell::new(vec![]),
        };
        let b = MultipartBuilder::new();
        let data = bundle_with_asset();
        let account = "acc1";
        let out = stage_assets(&cf, account, "shop-a1b2c3d4", &data, &b).await;
        (out.expect("stage ok"), cf.seen.into_inner())
    }

    /// Empty buckets -> session jwt IS the completion token, zero uploads.
    #[test]
    fn empty_buckets_shortcuts_to_session_jwt() {
        let (out, seen) = block_on(run_stage(r#"{"result":{"jwt":"settled","buckets":[]}}"#));
        assert_eq!(out.completion_jwt, "settled");
        assert_eq!(out.uploaded_parts, 0);
        assert_eq!(seen.len(), 1, "no upload when buckets empty");
    }

    /// Non-empty buckets -> one upload carrying the SESSION jwt (not the
    /// platform token), answered by the completion jwt (step 3's value).
    #[test]
    fn upload_carries_session_jwt_not_platform_token() {
        let h0 = asset_hash(b"<html>x</html>");
        let (out, seen) = block_on(run_stage(&format!(
            r#"{{"result":{{"jwt":"sess-1","buckets":[["{h0}"]]}}}}"#
        )));
        assert_eq!(out.completion_jwt, "completion-tok");
        assert_eq!(out.uploaded_parts, 1);
        assert_eq!(seen.len(), 2);
        assert!(
            seen[1]
                .starts_with("/accounts/acc1/workers/assets/upload?base64=true|Some(\"sess-1\")"),
            "session jwt on the upload, got {:?}",
            seen[1]
        );
    }

    /// The session request manifest lists every asset by /path with a
    /// 32-hex hash and a byte size.
    #[test]
    fn session_manifest_lists_paths_and_hashes() {
        let manifest = bundle_with_asset().assets_manifest();
        let entry = &manifest["/index.html"];
        assert_eq!(entry["hash"].as_str().unwrap().len(), 32);
        assert_eq!(entry["size"].as_u64(), Some(14));
    }

    #[test]
    fn session_parsing_helpers() {
        let v: Value = serde_json::from_str(
            r#"{"result":{"jwt":"tj", "buckets":[["h1","h2"],["h3"]]},"success":true}"#,
        )
        .unwrap();
        assert_eq!(parse_session_jwt(&v).as_deref(), Some("tj"));
        assert_eq!(buckets_of(&v), vec!["h1", "h2", "h3"]);
        assert_eq!(parse_session_jwt(&json!({"success": true})), None);
        assert!(buckets_of(&json!({})).is_empty());
    }

    // Tiny no-op executor - the staged futures resolve immediately.
    fn block_on<F: std::future::Future>(fut: F) -> F::Output {
        let waker = std::task::Waker::noop().clone();
        let mut cx = std::task::Context::from_waker(&waker);
        let mut fut = Box::pin(fut);
        loop {
            if let std::task::Poll::Ready(v) = fut.as_mut().poll(&mut cx) {
                return v;
            }
            std::thread::yield_now();
        }
    }
}
