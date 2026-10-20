/* domain.rs - Phase G: the customer's own domain, on the free plan
(no Cloudflare for SaaS).

   The free path: the customer owns the domain on Cloudflare (any plan)
   and adds THIS account as a collaborator on their zone. The zone is then
   in our account, and the platform attaches the hostname with the same
   `PUT /accounts/{id}/workers/domains` call it uses for
   `{sub}.latiforge.com` - Cloudflare creates the DNS record in THEIR
   zone and issues the certificate. The shop keeps its own domain and
   its own DNS; we only need the attach.

   A domain that is not in a zone of this account (a different
   registrar, or a zone we are not a member of) is refused with the
   exact instruction, because the attach API only accepts hostnames of
   our own zones. */
use serde::Deserialize;
use serde_json::json;
use worker::{Env, Method, Request, Response, Result};

use crate::deployer::cf_api::{call_with_retry, CfBody, CfConfig, CfError, CfRequest, Transport};
use crate::{auth, http, shops, store};

#[derive(Deserialize)]
pub struct DomainIn {
    pub domain: String,
}

/// Pure: a plausible customer hostname (tested): a real domain, no
/// scheme, no path, no port, no wildcard.
pub fn valid_domain(domain: &str) -> bool {
    let d = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    if d.is_empty() || d.len() > 253 || d.contains('/') || d.contains("://") {
        return false;
    }
    if d.starts_with('*') || d.contains('*') || d.contains(':') || d.contains(' ') {
        return false;
    }
    let labels: Vec<&str> = d.split('.').collect();
    if labels.len() < 2 {
        return false;
    }
    labels.iter().all(|l| {
        !l.is_empty()
            && l.len() <= 63
            && l.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    })
}

/// Pure: the zone-lookup path for a domain (tested).
pub fn zone_lookup_path(domain: &str) -> String {
    format!("/zones?name={}", domain.trim().to_ascii_lowercase())
}

/// The zone of `domain` that lives in OUR account, if any.
async fn our_zone(
    cf: &impl Transport,
    account: &str,
    domain: &str,
) -> Result<Option<(String, String)>, CfError> {
    let zones = call_with_retry(
        cf,
        CfRequest {
            method: Method::Get,
            path: zone_lookup_path(domain),
            body: CfBody::Empty,
            jwt: None,
        },
    )
    .await?;
    for z in zones.as_array().cloned().unwrap_or_default() {
        let Some(zone_account) = z
            .get("account")
            .and_then(|a| a.get("id"))
            .and_then(|i| i.as_str())
        else {
            continue;
        };
        if zone_account != account {
            continue;
        }
        let Some(id) = z.get("id").and_then(|i| i.as_str()) else {
            continue;
        };
        let Some(name) = z.get("name").and_then(|i| i.as_str()) else {
            continue;
        };
        return Ok(Some((id.to_string(), name.to_string())));
    }
    Ok(None)
}

/// `POST /api/v1/shop/domain {domain}` - the owner's own domain.
pub async fn handle_domain(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(shop) = shops::shop_by_owner(&db, &session.user_id).await? else {
        return http::json_error(404, "NO_SHOP", "deploy a shop first");
    };
    let Some(body) = http::json_body::<DomainIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {domain}");
    };
    let domain = body
        .domain
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if !valid_domain(&domain) {
        return http::bad_request("BAD_DOMAIN", "that is not a domain name");
    }
    if domain == "latiforge.com" || domain.ends_with(".latiforge.com") {
        return http::json_error(
            409,
            "OUR_DOMAIN",
            "that is our own zone - pick a domain you own",
        );
    }

    let cfg = match CfConfig::from_env(&env) {
        Ok(c) => c,
        Err(e) => return http::json_error(500, "NO_CF", &e),
    };
    let transport = crate::deployer::cf_api::FetchTransport::new(cfg.clone());
    let Some((zone_id, zone_name)) = our_zone(&transport, &cfg.account, &domain).await? else {
        return http::json_error(
            409,
            "ZONE_NOT_OURS",
            "add this Cloudflare account as a collaborator on that domain's zone, then try again (a domain on another registrar has to be moved to Cloudflare first)",
        );
    };

    // The attach: DNS + certificate are created by Cloudflare.
    let attach = CfRequest {
        method: Method::Put,
        path: format!("/accounts/{}/workers/domains", cfg.account),
        body: CfBody::Json(json!({
            "zone_id": zone_id,
            "hostname": domain,
            "service": shop.cluster_id,
            "environment": "production",
        })),
        jwt: None,
    };
    let result = call_with_retry(&transport, attach).await?;
    let cf_id = result
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    store::write(
        &db,
        "INSERT INTO hostnames (id,shop_id,hostname,cf_hostname_id,status,created_ms) VALUES (?,?,?,?,'active',?) ON CONFLICT (hostname) DO UPDATE SET shop_id = excluded.shop_id, cf_hostname_id = excluded.cf_hostname_id, status = 'active'",
        vec![
            wasm_bindgen::JsValue::from(store::new_id("hn")),
            wasm_bindgen::JsValue::from(shop.id.clone()),
            wasm_bindgen::JsValue::from(domain.clone()),
            wasm_bindgen::JsValue::from(cf_id.clone()),
            wasm_bindgen::JsValue::from(auth::now_ms() as f64),
        ],
    )
    .await?;
    store::append_audit(
        &db,
        &shop.id,
        "domain.attach",
        &domain,
        &zone_name,
        auth::now_ms(),
    )
    .await?;
    Response::from_json(&serde_json::json!({
        "ok": true,
        "hostname": domain,
        "url": format!("https://{domain}"),
        "zone": zone_name,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domains_must_look_like_domains() {
        assert!(valid_domain("myshop.com"));
        assert!(valid_domain("shop.co.uk"));
        assert!(valid_domain("My-Shop.io"));
        assert!(!valid_domain("myshop"));
        assert!(!valid_domain("https://myshop.com"));
        assert!(!valid_domain("*.myshop.com"));
        assert!(!valid_domain("myshop.com/path"));
        assert!(!valid_domain(""));
        assert!(!valid_domain("myshop.com:8080"));
    }

    #[test]
    fn zone_lookup_path_is_normalised() {
        assert_eq!(zone_lookup_path(" MyShop.com "), "/zones?name=myshop.com");
    }
}
