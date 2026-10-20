/* lib.rs - the SaaSTryon control-plane worker.
Entry point + module declarations only; every domain lives in its own
file (`http.rs` router, `auth.rs` token/sessions, `admin.rs` approval,
`store.rs` D1, `cfg.rs` validation, `shops.rs` shops/tokens/credits,
`hostnames.rs` domain state, `deploy.rs` + `deployer/` per-shop deploy
flow, `outbound.rs` the metered Genlook proxy, `credits.rs` the manual
billing gate). */
pub mod admin;
pub mod auth;
pub mod cfg;
pub mod credits;
pub mod deploy;
pub mod deployer;
pub mod domain;
pub mod hostnames;
pub mod http;
pub mod landing;
pub mod outbound;
pub mod shops;
pub mod store;

pub use admin::{transition, AdminAction, UserStatus};
pub use auth::{hash_token, new_token, Session};
pub use deployer::{new_deploy_token, DeployError, DeployInputs, DeployResult};
pub use store::{ensure_schema, UserRow, UserView};

use std::sync::atomic::{AtomicBool, Ordering};

use worker::{event, Context, Env, Request, Response, Result};

/// The schema is applied once per isolate: the platform must never
/// answer a request against an empty database (a fresh D1 gets the
/// migrations before the first signup).
static SCHEMA_READY: AtomicBool = AtomicBool::new(false);

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    if !SCHEMA_READY.load(Ordering::Relaxed) {
        store::ensure_schema(&env).await?;
        SCHEMA_READY.store(true, Ordering::Relaxed);
    }
    http::route(req, env).await
}
