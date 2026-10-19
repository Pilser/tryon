/* cf_config.rs - the Cloudflare account configuration the deployer runs
with. Token + account id come from the worker env; the zone (id + name)
decides the shop hostnames: the control plane owns the apex
(latiforge.com), every shop gets `{sub}.latiforge.com` attached through
`PUT /accounts/{id}/workers/domains` (B6, PLATFORM.md §6.4). The
workers.dev subdomain is the fallback URL and is read from the API when
it is not configured (B3). */
use worker::Env;

/// The zone shops get their hostname under. The apex stays with the
/// control plane.
pub const DEFAULT_ZONE_NAME: &str = "latiforge.com";

/// Token pulled from the worker env (CLOUDFLARE_API_TOKEN; the account
/// id is baked into every CfRequest path).
#[derive(Debug, Clone)]
pub struct CfConfig {
    pub token: String,
    pub account: String,
    /// Optional `{{script}}.<sub>.workers.dev` prefix for the URL note
    /// (B3; when unset the deployer reads it from the API).
    pub dev_subdomain: Option<String>,
    /// Zone id for the custom-domain attach. `None` = workers.dev only.
    pub zone_id: Option<String>,
    /// Zone name for the shop hostnames (`{sub}.{zone_name}`).
    pub zone_name: String,
}

impl CfConfig {
    pub fn from_env(env: &Env) -> Result<CfConfig, String> {
        let token = read_secret(env, "CLOUDFLARE_API_TOKEN")
            .ok_or("missing CLOUDFLARE_API_TOKEN secret")?;
        let account = read_secret(env, "CF_ACCOUNT_ID").ok_or("missing CF_ACCOUNT_ID var")?;
        let dev_subdomain = read_secret(env, "CF_WORKERS_DEV_SUBDOMAIN");
        let zone_id = read_secret(env, "CF_ZONE_ID");
        let zone_name =
            read_secret(env, "CF_ZONE_NAME").unwrap_or_else(|| DEFAULT_ZONE_NAME.to_string());
        Ok(CfConfig {
            token,
            account,
            dev_subdomain,
            zone_id,
            zone_name,
        })
    }

    /// The shop hostname for a subdomain (pure, tested).
    pub fn shop_hostname(&self, subdomain: &str) -> String {
        format!("{}.{}", subdomain, self.zone_name)
    }
}

/// Reads a secret first, then a plain var (deploy-time vars are often
/// plain env vars, not Worker secrets).
pub fn read_secret(env: &Env, name: &str) -> Option<String> {
    let v = env
        .secret(name)
        .map(|s| s.to_string())
        .ok()
        .filter(|s| !s.is_empty());
    v.or_else(|| {
        env.var(name)
            .ok()
            .map(|v| v.to_string())
            .filter(|v| !v.is_empty())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shop_hostnames_sit_under_the_zone() {
        let cfg = CfConfig {
            token: "t".into(),
            account: "a".into(),
            dev_subdomain: None,
            zone_id: Some("z".into()),
            zone_name: DEFAULT_ZONE_NAME.into(),
        };
        assert_eq!(
            cfg.shop_hostname("amina-studio"),
            "amina-studio.latiforge.com"
        );
    }
}
