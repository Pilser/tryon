/* lib.rs - the SaaSTryon control-plane worker.
Entry point + module declarations only; every domain lives in its own
file (`http.rs` router, `auth.rs` token/sessions, `admin.rs` approval,
`store.rs` D1, `cfg.rs` validation, `deployer/` per-shop deploy flow). */
pub mod admin;
pub mod auth;
pub mod cfg;
pub mod deploy;
pub mod deployer;
pub mod hostnames;
pub mod http;
pub mod outbound;
pub mod shops;
pub mod store;

pub use admin::{transition, AdminAction, UserStatus};
pub use auth::{hash_token, new_token, Session};
pub use deployer::{new_deploy_token, DeployError, DeployInputs, DeployResult};
pub use store::{ensure_schema, UserRow, UserView};

use worker::{event, Context, Env, Request, Response, Result};

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    http::route(req, env).await
}
