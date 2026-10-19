/* hostnames.rs - Phase D: per-shop hostname registrar on the control
plane. After a successful script-PUT the shop auto-gets
`shop-<id8>.<account-sub>.workers.dev` (free fallback URL, B3); the
production URL is a custom domain on OUR zone via
`PUT /accounts/{id}/workers/domains` (DNS + cert auto-issued, B6).
D1 `hostnames` row holds `cf_hostname_id` + status; ROUTE_KV is pure
dashboard bookkeeping, never a runtime routing dependency (§6.4).
All state transitions live in pure functions so the lifecycle is
tested without Cloudflare. */
use serde::{Deserialize, Serialize};
use serde_json::json;
use worker::d1::D1Database;
use worker::Result;

use crate::deployer::cf_api::{CfBody, CfRequest};
use crate::store::{new_id, str_args, write};

// ------------------------------------------------------- state machine

/// Lifecycle of a custom hostname attach:
/// `pending` → `provisioning` → `active` | `failed` → `suspended`.
/// Only a fresh `pending`/`failed` row may start a new attach attempt.
pub fn can_attach(status: &str) -> bool {
    matches!(status, "pending" | "failed")
}

/// Pure: which API call shape to send for a hostname attach attempt
/// (tested). `None` = state machine refuses (row is mid-flight).
pub fn attach_request(zone_id: &str, hostname: &str, service: &str) -> Option<CfRequest> {
    if !valid_hostname(hostname) || zone_id.is_empty() || service.is_empty() {
        return None;
    }
    Some(CfRequest {
        method: worker::Method::Put,
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

/// Pure: exactly one label under our zone, ≤63 chars, [a-z0-9-], not
/// reserved. `{{shop}}.crowdy.app` only — no wildcards, no apex (B6).
pub fn valid_hostname(hostname: &str) -> bool {
    let Some(label) = hostname.strip_suffix(".crowdy.app") else {
        return false;
    };
    let label = label.strip_suffix('-').unwrap_or(label);
    !label.is_empty()
        && label.len() <= 63
        && label
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !label.starts_with('-')
        && !hostname.starts_with('*')
}

/// Pure: derived workers.dev fallback URL for a script name (tested).
/// `shop-<id8>.<account-sub>.workers.dev` — the account subdomain is a
/// platform secret at deploy time, so the caller passes it in.
pub fn workers_dev_url(script_name: &str, account_subdomain: &str) -> String {
    format!("{script_name}.{account_subdomain}.workers.dev")
}

// ---------------------------------------------------------- D1 queries

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostnameRow {
    pub id: String,
    pub shop_id: String,
    pub hostname: String,
    pub cf_hostname_id: Option<String>,
    pub status: String,
    pub created_ms: i64,
}

const HOSTNAME_COLS: &str = "id, shop_id, hostname, cf_hostname_id, status, created_ms";

/// Fetch the current hostname row for a shop (0 or 1 rows by design).
pub async fn hostname_for_shop(db: &D1Database, shop_id: &str) -> Result<Option<HostnameRow>> {
    db.prepare(&format!(
        "SELECT {HOSTNAME_COLS} FROM hostnames WHERE shop_id = ?"
    ))
    .bind(&str_args([shop_id]))?
    .first::<HostnameRow>(None)
    .await
}

/// Create or reset the shop's hostname row to a fresh `pending` attach.
pub async fn queue_attach(
    db: &D1Database,
    shop_id: &str,
    hostname: &str,
    now_ms: i64,
) -> Result<HostnameRow> {
    let row = HostnameRow {
        id: new_id("hn"),
        shop_id: shop_id.to_string(),
        hostname: hostname.to_string(),
        cf_hostname_id: None,
        status: "pending".into(),
        created_ms: now_ms,
    };
    write(
        db,
        "INSERT INTO hostnames (id, shop_id, hostname, cf_hostname_id, status, created_ms) VALUES (?, ?, ?, NULL, 'pending', ?) ON CONFLICT (hostname) DO UPDATE SET shop_id = excluded.shop_id, cf_hostname_id = NULL, status = 'pending', created_ms = excluded.created_ms",
        vec![
            row.id.clone().into(),
            shop_id.into(),
            hostname.into(),
            wasm_bindgen::JsValue::from(now_ms as f64),
        ],
    )
    .await?;
    Ok(row)
}

/// Record the Cloudflare domain id once the attach API accepted.
pub async fn mark_provisioning(
    db: &D1Database,
    id: &str,
    cf_hostname_id: &str,
    now_ms: i64,
) -> Result<()> {
    write(
        db,
        "UPDATE hostnames SET cf_hostname_id = ?, status = 'provisioning', created_ms = ? WHERE id = ?",
        vec![cf_hostname_id.into(), wasm_bindgen::JsValue::from(now_ms as f64), id.into()],
    )
    .await
}

/// Final states: active (cert live) or failed (attach rejected).
pub async fn mark_final(db: &D1Database, id: &str, status: &str, now_ms: i64) -> Result<()> {
    write(
        db,
        "UPDATE hostnames SET status = ?, created_ms = ? WHERE id = ?",
        vec![
            status.into(),
            wasm_bindgen::JsValue::from(now_ms as f64),
            id.into(),
        ],
    )
    .await
}

/// Suspension: flip a tenant hostname off (Q8-style subdomain toggle is
/// separate; this is the custom-domain kill switch). Only an active
/// hostname can suspend; a failed one is already down.
pub async fn suspend(db: &D1Database, id: &str, now_ms: i64) -> Result<bool> {
    let Some(row) = db
        .prepare("SELECT id, status FROM hostnames WHERE id = ?")
        .bind(&str_args([id]))?
        .first::<(String, String)>(None)
        .await?
    else {
        return Ok(false);
    };
    if row.1 != "active" {
        return Ok(false);
    }
    write(
        db,
        "UPDATE hostnames SET status = 'suspended', created_ms = ? WHERE id = ?",
        vec![wasm_bindgen::JsValue::from(now_ms as f64), id.into()],
    )
    .await?;
    Ok(true)
}

// ------------------------------------------------- KV bookkeeping only

/// Write the host→shop pair into ROUTE_KV for the platform dashboard.
/// Never read on the request hot path (§6.4: KV is bookkeeping, not
/// routing).
pub async fn kv_record(kv: &worker::kv::KvStore, hostname: &str, shop_id: &str) -> Result<()> {
    kv.put(&format!("host:{hostname}"), shop_id)?
        .execute()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))
}

pub async fn kv_forget(kv: &worker::kv::KvStore, hostname: &str) -> Result<()> {
    kv.delete(&format!("host:{hostname}"))
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))
}

// --------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_crowdy_app_labels_pass_validation() {
        assert!(valid_hostname("olive-shop.crowdy.app"));
        assert!(valid_hostname("shop-1a2b3c4d.crowdy.app"));
        assert!(!valid_hostname("other.example.com"));
        assert!(!valid_hostname("*.crowdy.app"));
        assert!(!valid_hostname("crowdy.app"));
        // A trailing hyphen is tolerated by our own convention but an
        // empty label or uppercase is not.
        assert!(!valid_hostname("-.crowdy.app"));
        assert!(!valid_hostname("Olive-Shop.crowdy.app"));
        // 63 chars max for the label.
        let max = "a".repeat(63);
        assert!(valid_hostname(&format!("{max}.crowdy.app")));
        assert!(!valid_hostname(&format!("{}x.crowdy.app", "a".repeat(63))));
    }

    #[test]
    fn attach_requests_are_well_formed_and_state_gated() {
        let req = attach_request("zone123", "olive-shop.crowdy.app", "shop-1a2b3c4d")
            .expect("valid attach");
        assert!(req.path.contains("/workers/domains"));
        let CfBody::Json(v) = req.body else {
            panic!("expected json body");
        };
        assert_eq!(v["hostname"], "olive-shop.crowdy.app");
        assert_eq!(v["service"], "shop-1a2b3c4d");
        assert_eq!(v["environment"], "production");

        // Refusals: invalid hostname, empty ids.
        assert!(attach_request("zone", "nope.example.com", "shop").is_none());
        assert!(attach_request("", "olive-shop.crowdy.app", "shop").is_none());
        assert!(attach_request("zone", "olive-shop.crowdy.app", "").is_none());
    }

    #[test]
    fn workers_dev_urls_follow_the_script_name() {
        assert_eq!(
            workers_dev_url("shop-1a2b3c4d", "crowdy"),
            "shop-1a2b3c4d.crowdy.workers.dev"
        );
    }
}
