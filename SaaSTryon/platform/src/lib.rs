/* lib.rs - the SaaSTryon control-plane worker (Phase B).
Entry point + module declarations only; every domain lives in its own
file (`http.rs` router, `auth.rs` token/sessions, `admin.rs` approval,
`store.rs` D1, `cfg.rs` validation). Shops/deployer arrive in Phase C+. */
pub mod admin;
pub mod auth;
pub mod cfg;
pub mod http;
pub mod store;

pub use admin::{transition, AdminAction, UserStatus};
pub use auth::{hash_token, new_token, Session};
pub use store::{ensure_schema, UserRow, UserView};

use worker::{event, Context, Env, Request, Response, Result};

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    http::route(req, env).await
}
