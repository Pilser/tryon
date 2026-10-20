/* dashboard.rs - the views the platform UI needs (Phase G UX): the
owner's shops, the admin's shop list (with owners, URLs, credits and
token usage) and the activity feed. Every answer is one query set, so
the pages render the whole story of a shop at a glance: where it lives,
what it may spend, and what happened to it. */
use serde::Serialize;
use worker::{Env, Request, Response, Result};

use crate::{auth, http, shops, store};

/// One shop as the dashboard shows it.
#[derive(Debug, Clone, Serialize)]
pub struct ShopView {
    pub id: String,
    pub name: String,
    pub subdomain: String,
    /// The shop's own URL on our zone.
    pub url: String,
    /// The customer domain attached to it (if any).
    pub domain: Option<String>,
    /// The hostname rows (subdomain + customer domain).
    pub hostnames: Vec<String>,
    pub status: String,
    pub tier: String,
    pub bundle: String,
    pub created_ms: i64,
    pub credits_granted: i64,
    pub credits_used: i64,
    pub credits_left: i64,
    pub tokens_redeemed: i64,
    /// The files of the customer's landing page (the shop root).
    pub landing_files: Vec<String>,
    /// How many activity rows this shop has.
    pub activity_count: i64,
    /// The shop's OWNER_TOKEN - only for the owner (the studio login).
    pub owner_token: Option<String>,
    /// The workers.dev fallback (the custom domain is the real URL).
    pub workers_dev_url: Option<String>,
    /// The owner (admin view only).
    pub owner_email: Option<String>,
    pub owner_name: Option<String>,
}

fn zone_name(env: &Env) -> String {
    env.var("CF_ZONE_NAME")
        .map(|v| v.to_string())
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// The workers.dev fallback of a shop script (the custom domain is the
/// real URL; this is the safety net).
fn workers_dev_url(env: &Env, shop: &shops::Shop) -> Option<String> {
    let sub = env
        .var("CF_WORKERS_DEV_SUBDOMAIN")
        .map(|v| v.to_string())
        .unwrap_or_default()
        .trim()
        .to_string();
    if sub.is_empty() {
        return None;
    }
    Some(format!("https://{}.{}.workers.dev", shop.cluster_id, sub))
}

async fn shop_view(
    env: &Env,
    db: &worker::d1::D1Database,
    shop: &shops::Shop,
    with_owner: bool,
) -> Result<ShopView> {
    let zone = zone_name(env);
    let hostname = if zone.is_empty() {
        format!("{}.workers.dev", shop.subdomain)
    } else {
        format!("{}.{}", shop.subdomain, zone)
    };
    let hostnames = shops::hostnames_of(&db, &shop.id).await?;
    let customer = hostnames
        .iter()
        .find(|h| h.hostname != hostname && h.status == "active")
        .map(|h| h.hostname.clone());
    let (granted, used, left) = shops::credit_usage(&db, &shop.id).await?;
    let tokens = shops::tokens_redeemed(&db, &shop.id).await?;
    let landing = crate::landing::landing_paths(env, &shop.id).await?;
    let activity_count = shops::activity(&db, Some(&shop.id), 500).await?.len() as i64;
    let (owner_email, owner_name) = if with_owner {
        match store::user_by_id(&db, &shop.owner_id).await? {
            Some(u) => (Some(u.email), Some(u.shop_name)),
            None => (None, None),
        }
    } else {
        (None, None)
    };
    Ok(ShopView {
        id: shop.id.clone(),
        name: shop.name.clone(),
        subdomain: shop.subdomain.clone(),
        url: format!("https://{hostname}"),
        domain: customer,
        hostnames: hostnames.iter().map(|h| h.hostname.clone()).collect(),
        status: shop.status.clone(),
        tier: shop.tier.clone(),
        bundle: shop.depot_version.clone(),
        created_ms: shop.created_ms,
        credits_granted: granted,
        credits_used: used,
        credits_left: left,
        tokens_redeemed: tokens,
        landing_files: landing,
        activity_count,
        owner_token: if with_owner {
            // The admin manages the shop, so the admin sees the studio
            // token (and can rotate it).
            shop.owner_token.clone()
        } else {
            shop.owner_token.clone()
        },
        workers_dev_url: workers_dev_url(env, shop),
        owner_email,
        owner_name,
    })
}

/// `GET /api/v1/shops` - the owner's shops.
pub async fn handle_owner_shops(env: Env, req: &Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let mut out = Vec::new();
    for shop in shops::shops_of_owner(&db, &session.user_id).await? {
        match shop_view(&env, &db, &shop, false).await {
            Ok(v) => out.push(v),
            // The reason belongs to the caller: a broken list must say
            // why, not answer 500 with nothing.
            Err(e) => return http::json_error(500, "SHOP_VIEW", &e.to_string()),
        }
    }
    Response::from_json(&serde_json::json!({ "shops": out }))
}

/// `GET /api/v1/admin/shops` - every shop, with its owner.
pub async fn handle_admin_shops(env: Env, req: &Request) -> Result<Response> {
    if !crate::admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let mut out = Vec::new();
    for shop in shops::all_shops(&db).await? {
        match shop_view(&env, &db, &shop, true).await {
            Ok(v) => out.push(v),
            Err(e) => return http::json_error(500, "SHOP_VIEW", &e.to_string()),
        }
    }
    Response::from_json(&serde_json::json!({ "shops": out }))
}

/// `GET /api/v1/admin/activity` - the platform activity feed.
pub async fn handle_admin_activity(env: Env, req: &Request) -> Result<Response> {
    if !crate::admin::is_admin(req.headers(), &env) {
        return http::unauthorized();
    }
    let db = store::db(&env)?;
    let rows = shops::activity(&db, None, 200).await?;
    Response::from_json(&serde_json::json!({ "activity": rows }))
}

/// `GET /api/v1/shops/activity` - the owner's shops' activity.
pub async fn handle_owner_activity(env: Env, req: &Request) -> Result<Response> {
    let db = store::db(&env)?;
    let Some(session) = auth::verify_session(&db, req.headers()).await? else {
        return http::unauthorized();
    };
    let mut rows = Vec::new();
    for shop in shops::shops_of_owner(&db, &session.user_id).await? {
        rows.extend(shops::activity(&db, Some(&shop.id), 100).await?);
    }
    rows.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
    Response::from_json(&serde_json::json!({ "activity": rows }))
}
