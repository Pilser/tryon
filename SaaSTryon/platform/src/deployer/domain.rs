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
pub fn attach_request(zone_id: &str, hostname: &str, service: &str) -> Option<CfRequest> {
    if zone_id.is_empty() || hostname.is_empty() || service.is_empty() {
        return None;
    }
    Some(CfRequest {
        method: Method::Put,
        path: "/workers/domains".to_string(),
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
/// URL. `Ok(None)` when no zone is configured (workers.dev only).
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
    let Some(req) = attach_request(&zone_id, &hostname, service) else {
        return Ok(None);
    };
    call_with_retry(cf, req).await?;
    Ok(Some(format!("https://{hostname}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deployer::cf_api::CfBody;

    #[test]
    fn attach_request_carries_zone_hostname_and_service() {
        let req =
            attach_request("zone1", "amina.latiforge.com", "shop-1a2b3c4d").expect("valid attach");
        assert!(req.path.contains("/workers/domains"));
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
        assert!(attach_request("", "a.latiforge.com", "shop-1").is_none());
        assert!(attach_request("zone1", "", "shop-1").is_none());
        assert!(attach_request("zone1", "a.latiforge.com", "").is_none());
    }
}
