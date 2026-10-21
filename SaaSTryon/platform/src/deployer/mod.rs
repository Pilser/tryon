/* mod.rs - the deploy orchestration domain (PLATFORM.md §7.3 steps 1-8
minus the Phase D leftovers) plus the request/result types and gates.

Flow (each step fails the whole deploy as a typed `DeployError` the
future route maps to its HTTP status, e.g. `AllowanceRequired` -> 402):
  validate subdomain (cfg rules) -> allowance gate (deploy_store) ->
  per-shop D1 + shop schema (provision.rs) -> mint PLATFORM_TOKEN ->
  bundle from R2 (bundle/) -> 3-step assets + script-PUT (cf_api.rs)
  -> shops row (status live) + audit + allowance decrement.

Steps 6-7 (custom-domain attach `hostnames.rs` + ROUTE_KV bookkeeping)
belong to Phase D and are NOT wired here - no HTTP routes either; the
Phase F route layer calls `deploy_shop`.

Accepted gap for Phase C: a D1 created before a later step fails leaves
an orphan database; the Phase D/H runbook deletes by script name.
Redeploy bookkeeping (UPSERT instead of INSERT) arrives with the Phase F
route; today a second deploy of an existing subdomain fails in the
store, which is the safe direction (nothing half-updated). */
pub mod bundle;
pub mod cf_api;
pub mod cf_config;
mod deploy_store;
pub mod domain;
mod provision;
pub mod subdomain;

use serde::{Deserialize, Serialize};
use serde_json::json;
use worker::Env;

use crate::{auth, cfg, store};
use bundle::{BundleSource, MultipartBuilder, R2BundleSource};
use cf_api::{call_with_retry, FetchTransport, Transport};

pub use bundle::{
    asset_hash, assets_manifest, parse_manifest, stage_asset_set, BundleData, BundleManifest,
    ScriptPut,
};
pub use cf_api::{CfBody, CfConfig, CfError, CfRequest, CfResponse};
pub use deploy_store::{D1Store, DeployStore};
pub use provision::{bindings_for, d1_name, public_base, script_name, split_stmts};

// --------------------------------------------------------------- types

#[derive(Debug, Serialize)]
pub struct DeployResult {
    pub shop_id: String,
    /// Script name `shop-<id8>`, stored as `shops.cluster_id`.
    pub cluster_id: String,
    pub subdomain: String,
    /// `shops` row status (live from the first upload - B2 is sync).
    pub status: &'static str,
    /// URL note when the account workers.dev subdomain is configured
    /// (B3); the custom domain is the production URL (§6.4).
    pub workers_dev_url: Option<String>,
    /// The shop's production URL: `https://{sub}.{zone}` (Phase D).
    pub custom_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DeployInputs {
    pub owner_id: String,
    pub subdomain: String,
    pub shop_name: String,
    pub tier: String,
    /// R2 `bundles/<id>` released by the packaging pipeline.
    pub bundle_id: String,
    /// Clock injected so tests never touch `worker::Date`.
    pub now_ms: i64,
    /// The studio token the owner chose themselves. `None` = mint a
    /// fresh one. The value is bound as the script's OWNER_TOKEN secret
    /// and stored on the shop row.
    pub owner_token: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum DeployError {
    /// `deploy_used >= deploy_allowance` (§7.3 step 2); the future route
    /// maps this to 402.
    AllowanceRequired,
    /// No users row for owner_id -> 400.
    OwnerMissing,
    /// Owner not `approved`; carries the status -> 403.
    NotActive(String),
    /// cfg rules (dns-safe, reserved list, length) -> 400.
    SubdomainInvalid,
    /// Another user/shop claims it -> 409.
    SubdomainTaken,
    /// Bundle load / verify problem -> 500.
    Bundle(String),
    /// CF API failure -> 502.
    Cf(CfError),
    /// Platform store failure -> 500.
    Store(String),
}

impl std::fmt::Display for DeployError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DeployError::AllowanceRequired => write!(f, "no deploy allowance left"),
            DeployError::OwnerMissing => write!(f, "unknown owner"),
            DeployError::NotActive(s) => write!(f, "account not approved ({s})"),
            DeployError::SubdomainInvalid => write!(f, "subdomain invalid or reserved"),
            DeployError::SubdomainTaken => write!(f, "subdomain already taken"),
            DeployError::Bundle(m) => write!(f, "bundle: {m}"),
            DeployError::Cf(e) => write!(f, "cloudflare: {e}"),
            DeployError::Store(m) => write!(f, "store: {m}"),
        }
    }
}

impl DeployError {
    /// Status the Phase F route layer maps each variant to.
    pub fn http_status(&self) -> u16 {
        match self {
            DeployError::AllowanceRequired => 402,
            DeployError::OwnerMissing | DeployError::SubdomainInvalid => 400,
            DeployError::NotActive(_) => 403,
            DeployError::SubdomainTaken => 409,
            DeployError::Cf(_) => 502,
            DeployError::Bundle(_) | DeployError::Store(_) => 500,
        }
    }

    pub fn bundle(m: impl std::string::ToString) -> Self {
        DeployError::Bundle(m.to_string())
    }

    pub fn store(m: impl std::string::ToString) -> Self {
        DeployError::Store(m.to_string())
    }
}

impl From<CfError> for DeployError {
    fn from(e: CfError) -> Self {
        DeployError::Cf(e)
    }
}

// -------------------------------------------------------------- gates

#[derive(Debug, Clone)]
pub struct OwnerGate {
    pub id: String,
    pub status: String,
    pub deploy_used: i64,
    pub deploy_allowance: i64,
}

/// Store-free claim shape tests build by hand. `name` is the claim
/// itself (a shops.subdomain, or the normalised signup shop_name of
/// OTHER users - §7.3 step 1 wants both checked).
#[derive(Debug, Clone)]
pub struct SubdomainClaim {
    pub status: String,
    pub name: String,
}

/// cfg rules (reserved list, dns-safe, length) as one typed failure.
pub fn validate_subdomain(sub: &str) -> Result<(), DeployError> {
    if cfg::valid_subdomain(sub) {
        Ok(())
    } else {
        Err(DeployError::SubdomainInvalid)
    }
}

/// §7.3 step 2: approved + non-exhausted allowance or bust.
pub fn gate(owner: &Option<OwnerGate>) -> Result<(), DeployError> {
    let Some(u) = owner else {
        return Err(DeployError::OwnerMissing);
    };
    if u.status != "approved" {
        return Err(DeployError::NotActive(u.status.clone()));
    }
    if !cfg::deploy_allowed(u.deploy_used, u.deploy_allowance) {
        return Err(DeployError::AllowanceRequired);
    }
    Ok(())
}

pub fn subdomain_free(claims: &[SubdomainClaim], sub: &str) -> bool {
    claims.iter().all(|c| c.name != sub)
}

/// A signup `shop_name` folds into a candidate claim (lowercase,
/// non-[a-z0-9] -> '-', dashes trimmed): "Amina Studio" blocks
/// `amina-studio` for everyone else.
pub fn subdomain_from_shop_name(shop_name: &str) -> String {
    shop_name
        .trim()
        .to_lowercase()
        .bytes()
        .map(|b| {
            if matches!(b, b'a'..=b'z' | b'0'..=b'9') {
                b as char
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Per-shop PLATFORM_TOKEN (`deploy_`-prefixed, distinct from the
/// `plat_`-signin tokens - §7.5 auth boundary).
pub fn new_deploy_token() -> String {
    format!("deploy_{}", auth::random_hex(8))
}

/// The shop's studio token (its OWNER_TOKEN). This one is typed by
/// humans - the owner signs into /app with it - so it is SHORT and
/// unambiguous: `studio-` plus eight characters from an alphabet
/// without 0/O/1/I (no "is that a zero or an O?").
pub fn new_studio_token() -> String {
    format!("studio-{}", auth::random_typable(8))
}

/// A studio token the owner typed themselves: 8..=64 characters of
/// letters, digits, dash and underscore. Anything else is refused (the
/// token travels in a header and is shown on screen).
pub fn valid_studio_token(token: &str) -> bool {
    let len = token.chars().count();
    (8..=64).contains(&len)
        && token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod studio_token_tests {
    use super::*;

    #[test]
    fn a_readable_token_is_accepted() {
        assert!(valid_studio_token("jam-fit-2026"));
        assert!(valid_studio_token("JamFit_2026"));
        assert!(valid_studio_token("abcdefgh"));
    }

    #[test]
    fn too_short_or_too_long_is_refused() {
        assert!(!valid_studio_token("short12"));
        assert!(!valid_studio_token(""));
        assert!(!valid_studio_token(&"a".repeat(65)));
        assert!(valid_studio_token(&"a".repeat(64)));
    }

    #[test]
    fn spaces_and_punctuation_are_refused() {
        assert!(!valid_studio_token("jam fit 2026"));
        assert!(!valid_studio_token("jam.fit-2026"));
        assert!(!valid_studio_token("jam/fit/2026"));
        assert!(!valid_studio_token("jam\0fit"));
    }

    #[test]
    fn a_minted_token_is_itself_valid() {
        let t = new_studio_token();
        assert!(t.starts_with("studio-"));
        assert!(valid_studio_token(&t));
        // Nothing that looks like a zero or an O: the owner types it.
        assert!(!t.contains('0'));
        assert!(!t.contains('O'));
        assert!(!t.contains('1'));
        assert!(!t.contains('I'));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopRow {
    pub id: String,
    pub owner_id: String,
    pub name: String,
    pub subdomain: String,
    pub cluster_id: String,
    pub tier: String,
    /// The deployed bundle id (rollback re-PUTs, §7.3).
    pub depot_version: String,
    pub created_ms: i64,
    /// The Bearer the shop uses for the platform API. The script name is
    /// public (it is the DNS label), so the token is its own secret and
    /// lives in the shops row. `None` for a shop deployed before the
    /// column existed.
    pub platform_token: Option<String>,
    /// The shop's OWNER_TOKEN (its studio access), shown to the owner.
    pub owner_token: Option<String>,
}

/// The deploy path for the control plane: the platform's own D1 store,
/// the bundle source and the CF transport. Used by the deploy route and
/// by the redeploys (admin + owner).
pub async fn deploy_shop_with_source(
    env: &Env,
    bundles: impl BundleSource,
    cf_cfg: &CfConfig,
    input: DeployInputs,
) -> Result<DeployResult, DeployError> {
    let db = store::db(env).map_err(DeployError::store)?;
    let transport = FetchTransport::new(cf_cfg.clone());
    deploy_shop_with(&D1Store::new(&db), &bundles, &transport, cf_cfg, &input).await
}

// ------------------------------------------------------ orchestration

/// The uuid of a per-shop D1, found by its name. A redeploy reuses the
/// database, so the shop keeps its products and settings.
pub async fn find_d1(
    cf: &impl Transport,
    account: &str,
    name: &str,
) -> Result<Option<String>, DeployError> {
    let v = call_with_retry(
        cf,
        CfRequest {
            method: worker::Method::Get,
            path: format!("/accounts/{account}/d1/database?per_page=100"),
            body: CfBody::Empty,
            jwt: None,
        },
    )
    .await
    .map_err(DeployError::from)?;
    let list = cf_api::result_of(&v);
    for db in list.as_array().cloned().unwrap_or_default() {
        if db.get("name").and_then(|n| n.as_str()) == Some(name) {
            if let Some(uuid) = db.get("uuid").and_then(|u| u.as_str()) {
                return Ok(Some(uuid.to_string()));
            }
        }
    }
    Ok(None)
}

pub async fn deploy_shop_with<S: DeployStore, B: BundleSource, T: Transport>(
    store: &S,
    bundles: &B,
    cf: &T,
    cf_cfg: &CfConfig,
    input: &DeployInputs,
) -> Result<DeployResult, DeployError> {
    validate_subdomain(&input.subdomain)?;
    gate(
        &store
            .owner(&input.owner_id)
            .await
            .map_err(DeployError::store)?,
    )?;
    let claims = store
        .taken_claims(&input.owner_id, &input.subdomain)
        .await
        .map_err(DeployError::store)?;
    if !subdomain_free(&claims, &input.subdomain) {
        return Err(DeployError::SubdomainTaken);
    }

    // A redeploy of the owner's own subdomain reuses the shop's script
    // and its database - a new script would orphan the data and fight
    // over the hostname.
    let existing = store
        .shop_of(&input.owner_id, &input.subdomain)
        .await
        .map_err(DeployError::store)?;
    let (id8, shop_id, script, d1_uuid) = match &existing {
        Some(row) => {
            let id8 = row
                .cluster_id
                .strip_prefix("shop-")
                .unwrap_or(&row.cluster_id)
                .to_string();
            let d1 = find_d1(cf, &cf_cfg.account, &provision::d1_name(&id8))
                .await?
                .ok_or_else(|| {
                    DeployError::store(
                        "the shop's database is gone - delete the shop and deploy again",
                    )
                })?;
            (id8, row.id.clone(), row.cluster_id.clone(), d1)
        }
        None => {
            let id8 = auth::random_hex(4);
            let shop_id = format!("shop_{id8}");
            let script = provision::script_name(&id8);
            (id8, shop_id, script, String::new())
        }
    };
    let token = new_deploy_token();
    // The shop's own owner token (its studio access). The platform keeps
    // it so the owner can sign into their shop dashboard. When the owner
    // (or the admin) typed a token themselves, that exact value is
    // used - it has to match the secret bound on the script. A redeploy
    // that does not name a token KEEPS the shop's current one: the
    // owner must not lose their studio login because the admin moved
    // the shop to a new bundle.
    let owner_token = match input.owner_token.as_deref() {
        Some(t) if valid_studio_token(t) => t.to_string(),
        _ => existing
            .as_ref()
            .and_then(|row| row.owner_token.clone())
            .filter(|t| valid_studio_token(t))
            .unwrap_or_else(new_studio_token),
    };

    // Steps 3+5b: per-shop D1, then the bundled shop schema into it.
    let data = bundles
        .load_bundle(&input.bundle_id)
        .await
        .map_err(DeployError::bundle)?;
    data.verify().map_err(DeployError::bundle)?;
    let mp = MultipartBuilder::new();
    let d1_uuid = if existing.is_some() {
        d1_uuid
    } else {
        provision::provision(cf_cfg, cf, &id8, &data.schema_sql).await?
    };
    let bindings = provision::bindings_for(
        &id8,
        &d1_uuid,
        &token,
        &owner_token,
        &provision::public_base(&format!("{}.{}", input.subdomain, cf_cfg.zone_name)),
        // The platform itself is the apex of our zone.
        &format!("https://{}", cf_cfg.zone_name),
    );

    // 3-step assets, then the script-PUT carrying the completion jwt.
    let staged = bundle::stage_assets(cf, &cf_cfg.account, &script, &data, &mp).await?;
    let put = bundle::ScriptPut {
        account: &cf_cfg.account,
        script_name: &script,
        main_module: &data.manifest.entry,
        compat_date: &data.manifest.compat_date,
        bindings: &bindings,
        assets_jwt: Some(&staged.completion_jwt),
        wasm_name: &data.manifest.wasm_name(),
        wasm: &data.wasm,
        glue: &data.glue,
    };
    call_with_retry(cf, put.request(&mp))
        .await
        .map_err(DeployError::from)?;

    // Phase D: attach {sub}.latiforge.com to the new script so the shop
    // is reachable on its own hostname (DNS + cert auto-issued, B6).
    let custom_url = domain::attach_shop_domain(cf, cf_cfg, &input.subdomain, &script)
        .await
        .map_err(DeployError::from)?;

    // Steps 7-8: bookkeeping (§7.3; status live - first PUT is sync, B2).
    let row = ShopRow {
        id: shop_id.clone(),
        owner_id: input.owner_id.clone(),
        name: input.shop_name.clone(),
        subdomain: input.subdomain.clone(),
        cluster_id: script.clone(),
        tier: input.tier.clone(),
        depot_version: input.bundle_id.clone(),
        created_ms: input.now_ms,
        platform_token: Some(token.clone()),
        owner_token: Some(owner_token.clone()),
    };
    store.record_shop(&row).await.map_err(DeployError::store)?;
    store
        .audit(
            "deploy_shop",
            &shop_id,
            &json!({
                "subdomain": input.subdomain,
                "tier": input.tier,
                "bundle": input.bundle_id,
                "cluster_id": script,
            })
            .to_string(),
            input.now_ms,
        )
        .await
        .map_err(DeployError::store)?;
    store
        .consume_allowance(&input.owner_id)
        .await
        .map_err(DeployError::store)?;

    Ok(DeployResult {
        shop_id,
        cluster_id: script.clone(),
        subdomain: input.subdomain.clone(),
        status: "live",
        workers_dev_url: cf_cfg
            .dev_subdomain
            .as_ref()
            .map(|sub| format!("https://{script}.{sub}.workers.dev")),
        custom_url,
    })
}

/// Thin `Env`-taking wrapper (wire-up only, Phase F routes; tests drive
/// [`deploy_shop_with`] with mocks).
pub async fn deploy_shop(env: Env, input: DeployInputs) -> Result<DeployResult, DeployError> {
    let cfg = CfConfig::from_env(&env).map_err(DeployError::store)?;
    // The workers.dev subdomain comes from the config when it is set,
    // otherwise straight from the Cloudflare API (B3) - shop subdomains
    // are automatic, nobody has to configure them by hand.
    let cfg = if cfg.dev_subdomain.is_some() {
        cfg
    } else {
        let probe = FetchTransport::new(cfg.clone());
        match subdomain::fetch_dev_subdomain(&probe, &cfg.account).await {
            Ok(sub) => CfConfig {
                dev_subdomain: Some(sub),
                ..cfg
            },
            // A missing subdomain must not fail the deploy: the shop is
            // live either way, only the printed URL is unknown.
            Err(_) => cfg,
        }
    };
    let db = store::db(&env).map_err(DeployError::store)?;
    let bucket = env
        .bucket("BUNDLES")
        .map_err(|_| DeployError::bundle("R2 BUNDLES binding not configured"))?;
    let transport = FetchTransport::new(cfg.clone());
    deploy_shop_with(
        &D1Store::new(&db),
        &R2BundleSource { bucket },
        &transport,
        &cfg,
        &input,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gate_owner(status: &str, used: i64, allowance: i64) -> OwnerGate {
        OwnerGate {
            id: "usr_1".into(),
            status: status.into(),
            deploy_used: used,
            deploy_allowance: allowance,
        }
    }

    #[test]
    fn gate_covers_owner_status_and_allowance() {
        assert_eq!(gate(&None).unwrap_err(), DeployError::OwnerMissing);
        assert_eq!(gate(&None).unwrap_err().http_status(), 400);
        for blocked in ["pending", "suspended", "rejected"] {
            let e = gate(&Some(gate_owner(blocked, 0, 1))).unwrap_err();
            assert_eq!(e.http_status(), 403, "{blocked} stays 403");
        }
        let e = gate(&Some(gate_owner("approved", 3, 3))).unwrap_err();
        assert_eq!(e, DeployError::AllowanceRequired);
        assert_eq!(e.http_status(), 402, "the 402 the route layer maps");
        let e = gate(&Some(gate_owner("approved", 0, 0))).unwrap_err();
        assert_eq!(e, DeployError::AllowanceRequired);
        assert!(gate(&Some(gate_owner("approved", 1, 3))).is_ok());
    }

    #[test]
    fn subdomain_validation_and_claims() {
        assert!(validate_subdomain("amina").is_ok());
        assert_eq!(
            validate_subdomain("www").unwrap_err(),
            DeployError::SubdomainInvalid
        );
        assert_eq!(
            validate_subdomain("Amina Store!").unwrap_err(),
            DeployError::SubdomainInvalid
        );
        let claims = vec![
            SubdomainClaim {
                status: "live".into(),
                name: "amina".into(),
            },
            SubdomainClaim {
                status: "pending".into(),
                name: subdomain_from_shop_name("Amina Studio"),
            },
        ];
        assert!(!subdomain_free(&claims, "amina"), "shop row blocks");
        assert!(
            !subdomain_free(&claims, "amina-studio"),
            "user claim blocks"
        );
        assert!(subdomain_free(&claims, "other-shop"));
        assert_eq!(subdomain_from_shop_name(" !tryon! "), "tryon");
    }

    #[test]
    fn deploy_token_shape_distinct_from_signin() {
        let t = new_deploy_token();
        assert!(t.starts_with("deploy_"));
        assert_eq!(t.len(), "deploy_".len() + 16);
        assert_ne!(t, crate::auth::new_token());
    }
}

#[cfg(test)]
mod e2e_idempotency_tests; // the redeploy-metadata case
mod e2e_tests; // deployer/e2e_tests.rs - mocks + end-to-end flows
