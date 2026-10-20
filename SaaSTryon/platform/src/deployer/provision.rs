/* provision.rs - per-shop D1 creation + the shop script's binding set
(PLATFORM.md §7.3 steps 3+5b, D-P1 script mode).

The API facts (verified 2026-10-19 against the live docs):
- create: POST /accounts/{account}/d1/database  {name} -> uuid
  (/api/resources/d1/subresources/database/methods/create)
- apply schema: POST /accounts/{account}/d1/database/{uuid}/query
  {sql} - "supports multiple statements, joined by semicolons, executed
  as a batch", so the whole shop schema ships in ONE call.

Every shop worker gets EXACTLY five bindings, in this order (the list is
asserted exact in tests):
  DB             d1            -> the per-shop database (uuid)
  PRODUCTS       r2_bucket     -> shared `tenant-images` bucket
  SHOP_ID        plain_text    -> `<id8>` (R2 key prefix + logs)
  PLATFORM_TOKEN secret_text   -> the per-shop deploy_ secret, minted
                                  per deploy and passed straight through
                                  The Genlook proxy is NOT a binding: the
                                  shop calls the platform's
                                  shop/genlook route with its
                                  PLATFORM_TOKEN, so the Genlook API key
                                  is never in a shop script (§7.4). */
use serde_json::{json, Value};

use super::DeployError;
use crate::deployer::cf_api::{call_with_retry, CfBody, CfConfig, CfError, CfRequest, Transport};

pub const R2_IMAGES_BUCKET: &str = "tenant-images";

/// Script name / cluster id for a shop (B3 name limits; 8 hex caps it).
pub fn script_name(id8: &str) -> String {
    format!("shop-{id8}")
}

/// The d1 database shares the script name's slot in the account.
pub fn d1_name(id8: &str) -> String {
    script_name(id8)
}

pub fn d1_create_path(account: &str) -> String {
    format!("/accounts/{account}/d1/database")
}

pub fn d1_query_path(account: &str, uuid: &str) -> String {
    format!("/accounts/{account}/d1/database/{uuid}/query")
}

/// The binding set, pure and exact-ordered (tests rely on order).
pub fn bindings_for(
    id8: &str,
    d1_uuid: &str,
    platform_token: &str,
    owner_token: &str,
    r2_public_base: &str,
    platform_url: &str,
) -> Vec<Value> {
    vec![
        json!({ "type": "d1", "name": "DB", "database_id": d1_uuid }),
        json!({ "type": "r2_bucket", "name": "PRODUCTS", "bucket_name": R2_IMAGES_BUCKET }),
        json!({ "type": "plain_text", "name": "SHOP_ID", "text": id8 }),
        json!({
            "type": "secret_text",
            "name": "PLATFORM_TOKEN",
            "text": platform_token,
        }),
        // The shop's studio is owner-gated. Without this binding the
        // shop worker treats "no expected token" as "no auth", which
        // would leave /api/studio/* open to the world.
        json!({
            "type": "secret_text",
            "name": "OWNER_TOKEN",
            "text": owner_token,
        }),
        // Where the platform lives - the shop calls it for the token
        // redeem and the metered Genlook proxy.
        json!({
            "type": "plain_text",
            "name": "PLATFORM_URL",
            "text": platform_url,
        }),
        // Where the studio writes image URLs. The shop serves the
        // objects itself (/media/<key>), so a private bucket is enough.
        json!({
            "type": "plain_text",
            "name": "R2_PUBLIC_BASE",
            "text": r2_public_base,
        }),
        // The shop serves its own frontend from the uploaded assets.
        json!({
            "type": "assets",
            "name": "ASSETS",
        }),
    ]
}

/// The public base a shop writes image URLs with: its own hostname plus
/// the media route (pure, tested).
pub fn public_base(hostname: &str) -> String {
    format!("https://{}/media", hostname.trim_end_matches('/'))
}

/// Split the bundled shop schema into statements on ";\n" (store.rs
/// convention; run through the batched query endpoint as one call).
pub fn split_stmts(schema_sql: &str) -> Vec<String> {
    // Comment lines are dropped first: a `--` line may mention the
    // `";\n"` marker itself, and splitting on that would leave a
    // comment as a statement.
    let body: String = schema_sql
        .lines()
        .filter(|l| !l.trim_start().starts_with("--"))
        .collect::<Vec<_>>()
        .join("\n");
    body.split(";\n")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| format!("{};", s.trim().trim_end_matches(';').trim()))
        .collect()
}

pub fn parse_d1_uuid(create_response: &Value) -> Option<String> {
    create_response
        .get("result")
        .and_then(|r| r.get("uuid"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
}

/// Steps 3+5b: create the per-shop D1 and apply the bundled shop schema
/// to it. Returns the uuid to bind as `DB`.
pub async fn provision(
    cfg: &CfConfig,
    cf: &impl Transport,
    id8: &str,
    schema_sql: &str,
) -> Result<String, DeployError> {
    let created = call_with_retry(
        cf,
        CfRequest {
            method: worker::Method::Post,
            path: d1_create_path(&cfg.account),
            body: CfBody::Json(json!({
                "name": d1_name(id8),
            })),
            jwt: None,
        },
    )
    .await?;
    let uuid = parse_d1_uuid(&created).ok_or_else(|| {
        DeployError::Cf(CfError::transport(
            200,
            format!("d1 create answered no uuid: {created}"),
        ))
    })?;
    // One batched call - the query endpoint accepts multi-statement sql.
    if !split_stmts(schema_sql).is_empty() {
        call_with_retry(
            cf,
            CfRequest {
                method: worker::Method::Post,
                path: d1_query_path(&cfg.account, &uuid),
                body: CfBody::Json(json!({ "sql": schema_sql })),
                jwt: None,
            },
        )
        .await?;
    }
    Ok(uuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binding_set_is_exact() {
        let b = bindings_for(
            "a1b2c3d4",
            "db-uuid",
            "deploy_6183ab26911057e6",
            "deploy_owner_6183ab26911057e6",
            "https://shop.latiforge.com/media",
            "https://latiforge.com",
        );
        assert_eq!(
            b.len(),
            8,
            "exactly DB/PRODUCTS/SHOP_ID/PLATFORM_TOKEN/OWNER_TOKEN/PLATFORM_URL/R2_PUBLIC_BASE/ASSETS"
        );
        assert_eq!(b[0]["type"], "d1");
        assert_eq!(b[0]["name"], "DB");
        assert_eq!(b[0]["database_id"], "db-uuid");
        assert_eq!(b[1]["type"], "r2_bucket");
        assert_eq!(b[1]["name"], "PRODUCTS");
        assert_eq!(b[1]["bucket_name"], R2_IMAGES_BUCKET);
        assert_eq!(b[2]["type"], "plain_text");
        assert_eq!(b[2]["name"], "SHOP_ID");
        assert_eq!(b[2]["text"], "a1b2c3d4");
        assert_eq!(b[3]["type"], "secret_text");
        assert_eq!(b[3]["name"], "PLATFORM_TOKEN");
        // The shop's studio is gated by its own token, and it knows
        // where the platform is.
        assert_eq!(b[4]["type"], "secret_text");
        assert_eq!(b[4]["name"], "OWNER_TOKEN");
        assert_eq!(b[5]["type"], "plain_text");
        assert_eq!(b[5]["name"], "PLATFORM_URL");
        assert_eq!(b[5]["text"], "https://latiforge.com");
        assert_eq!(b[6]["type"], "plain_text");
        assert_eq!(b[6]["name"], "R2_PUBLIC_BASE");
        assert_eq!(b[6]["text"], "https://shop.latiforge.com/media");
        assert_eq!(b[7]["type"], "assets");
        assert_eq!(b[7]["name"], "ASSETS");
        // The Genlook key never reaches a shop script, and neither does
        // a service binding: the platform proxies over HTTP.
        let blob = serde_json::to_string(&b).unwrap();
        assert!(!blob.contains("GENLOOK"));
        assert!(!blob.contains("\"type\":\"service\""));
    }

    #[test]
    fn public_base_points_at_the_shop_media_route() {
        assert_eq!(
            public_base("shop.latiforge.com"),
            "https://shop.latiforge.com/media"
        );
        assert_eq!(
            public_base("shop.latiforge.com/"),
            "https://shop.latiforge.com/media"
        );
    }

    #[test]
    fn secret_binding_is_passthrough_no_genlook_key() {
        // The token is a pass-through: the function never mints or
        // rewrites it, so the real secret only lives where the caller
        // minted it. And no Genlook key sneaks into the set.
        let fake = "not-the-real-secret-text";
        let b = bindings_for(
            "a1b2c3d4",
            "u",
            fake,
            "deploy_owner_6183ab26911057e6",
            "https://shop.latiforge.com/media",
            "https://latiforge.com",
        );
        let token = b
            .iter()
            .find(|x| x["name"] == "PLATFORM_TOKEN")
            .expect("PLATFORM_TOKEN present");
        assert_eq!(token["text"], fake, "exact pass-through");
        let blob = serde_json::to_string(&b).unwrap();
        assert!(!blob.contains("GENLOOK_API_KEY"));
        assert!(!blob.contains("api_token"));
    }

    #[test]
    fn schema_split_like_store() {
        let sql = "CREATE TABLE a(x);\nCREATE TABLE b(y);\n";
        assert_eq!(
            split_stmts(sql),
            vec![
                "CREATE TABLE a(x);".to_string(),
                "CREATE TABLE b(y);".to_string()
            ]
        );
        assert!(split_stmts("   ").is_empty());
        assert!(split_stmts("").is_empty());
    }

    #[test]
    fn names_and_paths() {
        assert_eq!(script_name("a1b2c3d4"), "shop-a1b2c3d4");
        assert_eq!(d1_name("a1b2c3d4"), "shop-a1b2c3d4");
        assert_eq!(d1_create_path("acc"), "/accounts/acc/d1/database");
        assert_eq!(
            d1_query_path("acc", "uu"),
            "/accounts/acc/d1/database/uu/query"
        );
    }

    #[test]
    fn d1_uuid_parsed_from_create() {
        let v: Value = serde_json::from_str(
            r#"{"result":{"uuid":"cece-uuid","name":"shop-a1b2c3d4"},"success":true}"#,
        )
        .unwrap();
        assert_eq!(parse_d1_uuid(&v).as_deref(), Some("cece-uuid"));
        assert_eq!(parse_d1_uuid(&json!({"result":{}})), None);
    }
}
