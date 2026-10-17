/* routes/usage.rs - owner dashboard read model: who used the shop, how many
times, and the state of the unlock codes. One request feeds the whole
dashboard so the tabs switch without extra round trips. */
use serde::{Deserialize, Serialize};
use worker::{Env, Request, Response};

use crate::routes::device;
use crate::routes::errors;

#[derive(Deserialize, Serialize, Default)]
pub struct DeviceStat {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub whatsapp: String,
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub used: i64,
    #[serde(default)]
    pub bonus: i64,
    #[serde(default)]
    pub bonus_until_ms: i64,
    #[serde(default)]
    pub first_seen_ms: i64,
    #[serde(default)]
    pub last_seen_ms: i64,
}

#[derive(Deserialize, Serialize, Default, Clone)]
pub struct TokenStat {
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub value: i64,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub created_ms: i64,
    #[serde(default)]
    pub redeemed_by: String,
    #[serde(default)]
    pub redeemed_ms: i64,
}

#[derive(Serialize)]
pub struct UsageOut {
    pub free_tries: i64,
    pub devices_total: i64,
    pub tryons_total: i64,
    pub tokens_total: i64,
    pub tokens_redeemed: i64,
    pub devices: Vec<DeviceStat>,
    pub tokens: Vec<TokenStat>,
    pub owner_whatsapp: String,
}

/// `GET /api/studio/usage` - dashboard overview: devices, tries, tokens.
pub async fn handle_usage(req: Request, env: Env) -> worker::Result<Response> {
    if !crate::routes::owner::authorized(&req, &env) {
        return errors::unauthorized();
    }
    device::ensure_ddl(&env).await?;
    let db = device::db(&env)?;
    let devices: Vec<DeviceStat> = db
        .prepare(
            "SELECT id,name,whatsapp,fingerprint,bonus,bonus_until_ms,first_seen_ms,last_seen_ms,\
             (SELECT COUNT(*) FROM tryons t WHERE t.device_id=d.id) AS used \
             FROM devices d ORDER BY last_seen_ms DESC LIMIT 200",
        )
        .all()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .results()
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let tokens: Vec<TokenStat> = db
        .prepare(
            "SELECT code,kind,value,note,created_ms,redeemed_by,redeemed_ms \
             FROM tokens ORDER BY created_ms DESC LIMIT 500",
        )
        .all()
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?
        .results()
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    #[derive(Deserialize, Default)]
    struct Count {
        #[serde(default)]
        n: i64,
    }
    let counted: Option<Count> = db
        .prepare("SELECT COUNT(*) AS n FROM tryons")
        .first(None)
        .await
        .map_err(|e| worker::Error::RustError(e.to_string()))?;
    let shop = crate::routes::shop::merged(&env).await;
    Response::from_json(&UsageOut {
        free_tries: crate::routes::quota::free_tries(&env).await,
        devices_total: devices.len() as i64,
        tryons_total: counted.map(|r| r.n).unwrap_or(0),
        tokens_total: tokens.len() as i64,
        tokens_redeemed: tokens.iter().filter(|t| !t.redeemed_by.is_empty()).count() as i64,
        devices,
        tokens,
        owner_whatsapp: shop.owner_whatsapp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(id: &str, used: i64) -> DeviceStat {
        DeviceStat {
            id: id.into(),
            used,
            ..Default::default()
        }
    }

    #[test]
    fn usage_payload_carries_devices_and_token_counts() {
        let out = UsageOut {
            free_tries: 3,
            devices_total: 2,
            tryons_total: 5,
            tokens_total: 3,
            tokens_redeemed: 1,
            devices: vec![device("a1b2c3d4", 4), device("e5f6a7b8", 1)],
            tokens: vec![TokenStat {
                code: "AB2C".into(),
                kind: "count".into(),
                value: 3,
                redeemed_by: "a1b2c3d4".into(),
                ..Default::default()
            }],
            owner_whatsapp: "256772000000".into(),
        };
        let v = serde_json::to_value(&out).unwrap();
        assert_eq!(v["devices"].as_array().unwrap().len(), 2);
        assert_eq!(v["devices"][0]["used"], 4);
        assert_eq!(v["tokens"][0]["code"], "AB2C");
        assert_eq!(v["tokens_redeemed"], 1);
        // The dashboard sums per-device tries into the headline number.
        let sum: i64 = out.devices.iter().map(|d| d.used).sum();
        assert_eq!(sum, out.tryons_total);
    }
}
