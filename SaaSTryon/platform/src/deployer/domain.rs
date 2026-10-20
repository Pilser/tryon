/* domain.rs - Phase D: attach a shop's custom domain to its freshly
created script through the Cloudflare API
(`PUT /accounts/{id}/workers/domains`). The zone is ours (latiforge.com),
so the hostname is ours too: every shop gets `{sub}.latiforge.com` with
DNS + certificate auto-issued (B6, PLATFORM.md §6.4). Fully automatic -
nothing between the script PUT and the live URL needs an operator. The
apex stays with the control plane, so shop labels may not be empty. */
use serde_json::json;
use worker::Method;

use super::cf_api::{call_with_retry, CfBody, CfConfig, CfError, CfRequest, Transport};

/// Pure: the attach request for one shop hostname (tested).
pub fn attach_request(
    account: &str,
    zone_id: &str,
    hostname: &str,
    service: &str,
) -> Option<CfRequest> {
    if account.is_empty() || zone_id.is_empty() || hostname.is_empty() || service.is_empty() {
        return None;
    }
    Some(CfRequest {
        method: Method::Put,
        // The account id belongs in the path (every CF call is
        // account-scoped; a bare /workers/domains has no route).
        path: format!("/accounts/{account}/workers/domains"),
        body: CfBody::Json(json!({
            "zone_id": zone_id,
            "hostname": hostname,
            "service": service,
            "environment": "production",
        })),
        jwt: None,
    })
}

/// Attaches `{sub}.{zone}` to the shop script and returns its public
/// URL. A hostname that is still attached to one of our old shop
/// scripts is freed first (a redeploy puts the name on a new script),
/// and the orphan script is deleted.
pub async fn attach_shop_domain(
    cf: &impl Transport,
    cfg: &CfConfig,
    subdomain: &str,
    service: &str,
) -> Result<Option<String>, CfError> {
    let Some(zone_id) = cfg.zone_id.clone() else {
        return Ok(None);
    };
    let hostname = cfg.shop_hostname(subdomain);

    // Free the name if an older shop script still holds it.
    if let Some(old) = free_hostname(cf, &cfg.account, &hostname).await? {
        if old != service && old.starts_with("shop-") {
            // The old script is ours and is now unreachable.
            let _ = call_with_retry(
                cf,
                CfRequest {
                    method: Method::Delete,
                    path: format!("/accounts/{}/workers/scripts/{}", cfg.account, old),
                    body: CfBody::Empty,
                    jwt: None,
                },
            )
            .await;
        }
    }

    let Some(req) = attach_request(&cfg.account, &zone_id, &hostname, service) else {
        return Ok(None);
    };
    call_with_retry(cf, req).await?;
    Ok(Some(format!("https://{hostname}")))
}

/// Frees a hostname that is still attached to one of our shop scripts.
/// Returns the script that held it.
async fn free_hostname(
    cf: &impl Transport,
    account: &str,
    hostname: &str,
) -> Result<Option<String>, CfError> {
    let domains = call_with_retry(
        cf,
        CfRequest {
            method: Method::Get,
            path: format!("/accounts/{account}/workers/domains"),
            body: CfBody::Empty,
            jwt: None,
        },
    )
    .await?;
    let domains = super::cf_api::result_of(&domains);
    for d in domains.as_array().cloned().unwrap_or_default() {
        if d.get("hostname").and_then(|h| h.as_str()) != Some(hostname) {
            continue;
        }
        let Some(id) = d.get("id").and_then(|i| i.as_str()) else {
            continue;
        };
        let service = d
            .get("service")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        call_with_retry(
            cf,
            CfRequest {
                method: Method::Delete,
                path: format!("/accounts/{account}/workers/domains/{id}"),
                body: CfBody::Empty,
                jwt: None,
            },
        )
        .await?;
        return Ok(Some(service));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deployer::cf_api::CfBody;

    #[test]
    fn attach_request_carries_zone_hostname_and_service() {
        let req = attach_request("acc1", "zone1", "amina.latiforge.com", "shop-1a2b3c4d")
            .expect("valid attach");
        assert_eq!(req.path, "/accounts/acc1/workers/domains");
        let CfBody::Json(v) = req.body else {
            panic!("expected a json body");
        };
        assert_eq!(v["zone_id"], "zone1");
        assert_eq!(v["hostname"], "amina.latiforge.com");
        assert_eq!(v["service"], "shop-1a2b3c4d");
        assert_eq!(v["environment"], "production");
    }

    #[test]
    fn empty_pieces_refuse_the_attach() {
        assert!(attach_request("", "zone1", "a.latiforge.com", "shop-1").is_none());
        assert!(attach_request("acc1", "", "a.latiforge.com", "shop-1").is_none());
        assert!(attach_request("acc1", "zone1", "", "shop-1").is_none());
        assert!(attach_request("acc1", "zone1", "a.latiforge.com", "").is_none());
    }
}
