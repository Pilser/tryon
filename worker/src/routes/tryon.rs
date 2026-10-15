use serde_json::{json, Value};
use tryon_shared::models::TryOnRequest;

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
