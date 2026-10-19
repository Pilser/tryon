/* deploy.rs - Phase F: the owner-facing deploy route.
`POST /api/v1/deploy {subdomain, shop_name?, tier?}` turns a signed-in
owner's form into one `deployer::deploy_shop` call. Approval/allowance
gating, subdomain rules and the CF sequence all live in the deployer;
this module only authenticates the session, resolves the released
bundle and maps `DeployError` to HTTP + a JSON verdict. */
use serde::{Deserialize, Serialize};
use worker::{Env, Request, Response, Result};

use crate::{auth, deployer, http, store};

/// The released shop bundle the form ships (the packaging pipeline sets
/// it); a missing var is a clear 500, never a half deploy.
pub const BUNDLE_VAR: &str = "BUNDLE_ID";
pub const DEFAULT_TIER: &str = "starter";

#[derive(Deserialize)]
pub struct DeployIn {
    pub subdomain: String,
    #[serde(default)]
    pub shop_name: String,
    #[serde(default)]
    pub tier: String,
}

#[derive(Serialize)]
pub struct DeployOut {
    pub ok: bool,
    pub shop_id: String,
    pub subdomain: String,
    /// Where the shop is reachable right now (workers.dev fallback, B3;
    /// the custom domain is attached separately by the Phase D registrar).
    pub url: Option<String>,
}

/// Pure: body tier or the starter default (tested).
pub fn tier_or_default(tier: &str) -> String {
    let t = tier.trim();
    if t.is_empty() {
        DEFAULT_TIER.to_string()
    } else {
        t.to_string()
    }
}

/// Pure: stable machine code for each deploy failure (tested).
pub fn error_code(e: &deployer::DeployError) -> &'static str {
    use deployer::DeployError as E;
    match e {
        E::AllowanceRequired => "NO_ALLOWANCE",
        E::OwnerMissing => "OWNER_MISSING",
        E::NotActive(_) => "NOT_APPROVED",
        E::SubdomainInvalid => "BAD_SUBDOMAIN",
        E::SubdomainTaken => "SUBDOMAIN_TAKEN",
        E::Bundle(_) => "BUNDLE_FAILED",
        E::Cf(_) => "CF_FAILED",
        E::Store(_) => "STORE_FAILED",
    }
}

/// `POST /api/v1/deploy` — session-authenticated owner.
pub async fn handle_deploy(env: Env, req: &mut Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let Some(user) = store::user_by_id(&db, &session.user_id).await? else {
        return http::unauthorized();
    };
    let Some(body) = http::json_body::<DeployIn>(req).await else {
        return http::bad_request("BAD_JSON", "expected {subdomain}");
    };
    let subdomain = body.subdomain.trim().to_ascii_lowercase();
    if subdomain.is_empty() {
        return http::bad_request("BAD_SUBDOMAIN", "subdomain required");
    }
    let bundle = env
        .var(BUNDLE_VAR)
        .map(|v| v.to_string())
        .unwrap_or_default();
    let bundle = bundle.trim().to_string();
    if bundle.is_empty() {
        return http::json_error(500, "NO_BUNDLE", "no released shop bundle configured");
    }
    let shop_name = if body.shop_name.trim().is_empty() {
        user.shop_name.clone()
    } else {
        body.shop_name.trim().to_string()
    };
    let input = deployer::DeployInputs {
        owner_id: user.id.clone(),
        subdomain,
        shop_name,
        tier: tier_or_default(&body.tier),
        bundle_id: bundle,
        now_ms: auth::now_ms(),
    };
    match deployer::deploy_shop(env, input).await {
        Ok(r) => Response::from_json(&DeployOut {
            ok: true,
            shop_id: r.shop_id,
            subdomain: r.subdomain,
            url: r.workers_dev_url,
        }),
        Err(e) => http::json_error(e.http_status(), error_code(&e), &e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use deployer::DeployError as E;

    #[test]
    fn tier_falls_back_to_starter() {
        assert_eq!(tier_or_default(""), "starter");
        assert_eq!(tier_or_default("   "), "starter");
        assert_eq!(tier_or_default("growth"), "growth");
    }

    #[test]
    fn every_failure_has_a_stable_machine_code() {
        assert_eq!(error_code(&E::AllowanceRequired), "NO_ALLOWANCE");
        assert_eq!(error_code(&E::NotActive("pending".into())), "NOT_APPROVED");
        assert_eq!(error_code(&E::SubdomainTaken), "SUBDOMAIN_TAKEN");
        assert_eq!(error_code(&E::SubdomainInvalid), "BAD_SUBDOMAIN");
        assert_eq!(error_code(&E::OwnerMissing), "OWNER_MISSING");
        assert_eq!(error_code(&E::Bundle("x".into())), "BUNDLE_FAILED");
        assert_eq!(error_code(&E::Store("x".into())), "STORE_FAILED");
    }
}
