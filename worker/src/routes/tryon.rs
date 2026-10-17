/* routes/tryon.rs - try-on: payload build + Genlook forwarding + polling. */
use serde::Deserialize;
use serde_json::{json, Value};
use tryon_shared::models::TryOnRequest;
use worker::{Env, Method, Request, Response};

use crate::routes::genlook_api as gl;

/// Validate try-on payload before spending Genlook credits. Pure + tested.
pub fn validate(req: &TryOnRequest) -> Result<(), &'static str> {
    if req.product_id.trim().is_empty() {
        return Err("product_id required");
    }
    if req.person_image_id.trim().is_empty() {
        return Err("person_image_id required");
    }
    Ok(())
}

/// Build the Genlook `POST /try-on/sync` body (same shape as async
/// `POST /try-on`). Product sent inline on first use so Genlook analyzes
/// it; later calls can send only `{ externalId }` for a faster result.
pub fn build_sync_body(
    external_id: &str,
    title: &str,
    description: &str,
    product_image_url: &str,
    person_image_id: &str,
) -> Value {
    json!({
        "products": [{
            "externalId": external_id,
            "title": title,
            "description": description,
            "images": [{ "source": { "url": product_image_url } }],
        }],
        "person": { "image": { "source": { "id": person_image_id } } },
    })
}

/// Outcome of a `/try-on/sync` call: 200 = result ready (download
/// `resultImageUrl` immediately, it is a temporary signed URL), 202 =
/// still running, poll `GET /generations/:id`.
pub enum SyncOutcome {
    Completed {
        generation_id: String,
        result_image_url: String,
    },
    Pending {
        generation_id: String,
    },
}

pub fn parse_sync_response(status: u16, body: &Value) -> Result<SyncOutcome, String> {
    let gid = body
        .get("generationId")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    match status {
        200 => {
            let url = body
                .get("resultImageUrl")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "missing resultImageUrl".to_string())?;
            Ok(SyncOutcome::Completed {
                generation_id: gid,
                result_image_url: url.to_string(),
            })
        }
        202 => Ok(SyncOutcome::Pending { generation_id: gid }),
        _ => {
            let code = body
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or("GENLOOK_ERROR");
            let msg = body
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("try-on failed");
            Err(format!("{code}: {msg}"))
        }
    }
}

/// Client sends the product snapshot (already validated against D1 in
/// phase7) + the person `imageId` from `/api/person-upload`, plus the
/// device id the shopper's browser keeps (quota + usage tracking).
#[derive(Deserialize)]
pub struct SyncIn {
    pub product_id: String,
    pub title: String,
    pub description: String,
    pub image_url: String,
    pub person_image_id: String,
    #[serde(default)]
    pub device_id: String,
}

/// Everything the client must supply before a credit is spent. Genlook
/// would answer an opaque error (or 500) for these, so refuse them here.
fn bad_request_for(input: &SyncIn) -> Option<&'static str> {
    if input.image_url.trim().is_empty() {
        return Some("image_url required");
    }
    None
}

/// `POST /api/try-on` and `POST /api/try-on/sync` — same work: check the
/// device allowance, validate, then wait upstream. `/try-on/sync` holds the
/// connection up to 90 s and answers 200 (COMPLETED + temporary
/// `resultImageUrl`) or 202 (PENDING, poll `/api/generations/:id`). A spent
/// allowance answers 402 `QUOTA_EXCEEDED` before Genlook is called, so no
/// credit is ever wasted on a blocked device.
pub async fn handle_sync(mut req: Request, env: Env) -> worker::Result<Response> {
    let key = gl::api_key(&env)?;
    let input: SyncIn = req
        .json()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    if let Err(e) = validate(&TryOnRequest {
        product_id: input.product_id.clone(),
        person_image_id: input.person_image_id.clone(),
    }) {
        return crate::routes::errors::bad_request("INVALID_REQUEST", e);
    }
    if let Some(e) = bad_request_for(&input) {
        return crate::routes::errors::bad_request("INVALID_REQUEST", e);
    }
    if let Some(blocked) = crate::routes::quota::gate(&env, &input.device_id).await? {
        return Ok(blocked);
    }
    let body = build_sync_body(
        &input.product_id,
        &input.title,
        &input.description,
        &input.image_url,
        &input.person_image_id,
    );
    let bytes = serde_json::to_vec(&body).map_err(|e| worker::Error::RustError(e.to_string()))?;
    let resp = gl::forward(
        &key,
        Method::Post,
        &format!("{}/try-on/sync", gl::base(&env)),
        Some("application/json"),
        Some(bytes),
    )
    .await?;
    // Only a generation that Genlook accepted may consume an allowance.
    // (The body is passed through untouched, so the gid is not logged here.)
    let status = resp.status_code();
    if status == 200 || status == 202 {
        crate::routes::quota::record(&env, &input.device_id, &input.product_id, "").await;
    }
    Ok(resp)
}

/// `GET /api/generations/:id` — poll a PENDING try-on.
pub async fn handle_generation(env: Env, id: &str) -> worker::Result<Response> {
    let key = gl::api_key(&env)?;
    gl::forward(
        &key,
        Method::Get,
        &format!("{}/generations/{id}", gl::base(&env)),
        None,
        None,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_ids() {
        assert!(validate(&TryOnRequest {
            product_id: "".into(),
            person_image_id: "x".into()
        })
        .is_err());
    }

    #[test]
    fn sync_body_matches_genlook_shape() {
        let b = build_sync_body("shirt-42", "Tee", "Cotton tee", "https://cdn/x.jpg", "img1");
        assert_eq!(b["products"][0]["externalId"], json!("shirt-42"));
        assert_eq!(b["person"]["image"]["source"]["id"], json!("img1"));
    }

    #[test]
    fn refuses_an_empty_product_image() {
        let full = SyncIn {
            product_id: "p".into(),
            title: "t".into(),
            description: "d".into(),
            image_url: "https://cdn/x.jpg".into(),
            person_image_id: "img1".into(),
            device_id: "d1".into(),
        };
        assert!(bad_request_for(&full).is_none());
        assert_eq!(
            bad_request_for(&SyncIn {
                image_url: "  ".into(),
                ..full
            })
            .unwrap(),
            "image_url required"
        );
    }

    #[test]
    fn parses_200_and_202() {
        let done = parse_sync_response(
            200,
            &json!({"generationId": "g", "resultImageUrl": "https://x/y.jpg"}),
        );
        assert!(matches!(done, Ok(SyncOutcome::Completed { .. })));
        let pend = parse_sync_response(202, &json!({"generationId": "g", "status": "PROCESSING"}));
        assert!(matches!(pend, Ok(SyncOutcome::Pending { .. })));
        assert!(parse_sync_response(
            402,
            &json!({"code": "INSUFFICIENT_CREDITS", "message": "empty"})
        )
        .is_err());
    }
}
