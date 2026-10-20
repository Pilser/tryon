/* deploy_store.rs - the storage boundary of the deployer: the gate
reads (owner + subdomain claims) and the §7.3 steps 7-8 bookkeeping
(shops row, audit, allowance decrement), behind a trait so the whole
orchestration is testable without a D1 instance.

The D1 implementation is deliberately plain SQL over the platform db -
the deployer never wraps platform-level writes in the shop's per-shop
database (PLATFORM.md §7.3: control plane = THE platform D1). */
use wasm_bindgen::JsValue;
use worker::d1::D1Database;

use super::{subdomain_from_shop_name, OwnerGate, ShopRow, SubdomainClaim};
use crate::store;

#[allow(async_fn_in_trait)]
pub trait DeployStore {
    async fn owner(&self, owner_id: &str) -> Result<Option<OwnerGate>, String>;
    /// Claims on `sub` (db truth); own deployments excluded so the same
    /// owner can redeploy without colliding with itself.
    async fn taken_claims(&self, owner_id: &str, sub: &str) -> Result<Vec<SubdomainClaim>, String>;
    async fn record_shop(&self, row: &ShopRow) -> Result<(), String>;
    async fn consume_allowance(&self, owner_id: &str) -> Result<(), String>;
    async fn audit(
        &self,
        action: &str,
        subject: &str,
        meta: &str,
        now_ms: i64,
    ) -> Result<(), String>;
}

pub struct D1Store<'a> {
    db: &'a D1Database,
}

impl<'a> D1Store<'a> {
    pub fn new(db: &'a D1Database) -> Self {
        D1Store { db }
    }

    async fn write(&self, sql: &str, binds: Vec<JsValue>) -> Result<(), String> {
        let _ = self
            .db
            .prepare(sql)
            .bind(&binds)
            .map_err(str_of)?
            .run()
            .await
            .map_err(str_of)?;
        Ok(())
    }
}

fn str_of(e: worker::Error) -> String {
    e.to_string()
}

#[derive(serde::Deserialize)]
struct ShopClaimRow {
    subdomain: String,
    owner_id: String,
    status: String,
}

impl DeployStore for D1Store<'_> {
    async fn owner(&self, owner_id: &str) -> Result<Option<OwnerGate>, String> {
        let u = store::user_by_id(self.db, owner_id).await.map_err(str_of)?;
        Ok(u.map(|u| OwnerGate {
            id: u.id,
            status: u.status,
            deploy_used: u.deploy_used,
            deploy_allowance: u.deploy_allowance,
        }))
    }

    async fn taken_claims(&self, owner_id: &str, sub: &str) -> Result<Vec<SubdomainClaim>, String> {
        let mut out = Vec::new();
        // Shops rows are the hard claims (any status keeps them).
        let shops = self
            .db
            .prepare("SELECT subdomain,owner_id,status FROM shops WHERE subdomain = ?")
            .bind(&[sub.to_string().into()])
            .map_err(str_of)?
            .all()
            .await
            .map_err(str_of)?
            .results::<ShopClaimRow>()
            .map_err(str_of)?;
        for r in shops {
            if r.owner_id == owner_id {
                continue; // own shop: redeploy is for that same owner
            }
            out.push(SubdomainClaim {
                status: r.status,
                name: r.subdomain,
            });
        }
        // The users-claimed list: OTHER users' signup shop_names.
        let users = self
            .db
            .prepare(
                "SELECT id,shop_name,status FROM users WHERE shop_name <> '' AND id <> ? LIMIT 500",
            )
            .bind(&[owner_id.to_string().into()])
            .map_err(str_of)?
            .all()
            .await
            .map_err(str_of)?
            .results::<store::UserRow>()
            .map_err(str_of)?;
        for u in users {
            out.push(SubdomainClaim {
                status: u.status,
                name: subdomain_from_shop_name(&u.shop_name),
            });
        }
        Ok(out)
    }

    async fn record_shop(&self, row: &ShopRow) -> Result<(), String> {
        self.write(
            "INSERT INTO shops (id,owner_id,name,subdomain,cluster_id,status,tier,depot_version,created_ms,platform_token) VALUES (?,?,?,?,?,'live',?,?,?,?)",
            vec![
                row.id.clone().into(),
                row.owner_id.clone().into(),
                row.name.clone().into(),
                row.subdomain.clone().into(),
                row.cluster_id.clone().into(),
                row.tier.clone().into(),
                row.depot_version.clone().into(),
                (row.created_ms as f64).into(),
                row.platform_token.clone().into(),
            ],
        )
        .await
    }

    async fn consume_allowance(&self, owner_id: &str) -> Result<(), String> {
        self.write(
            "UPDATE users SET deploy_used = deploy_used + 1 WHERE id = ?",
            vec![owner_id.to_string().into()],
        )
        .await
    }

    async fn audit(
        &self,
        action: &str,
        subject: &str,
        meta: &str,
        now_ms: i64,
    ) -> Result<(), String> {
        self.write(
            "INSERT INTO audit (id,actor,action,subject,meta,created_ms) VALUES (?,?,?,?,?,?)",
            vec![
                store::new_id("aud").into(),
                "deployer".into(),
                action.into(),
                subject.into(),
                meta.into(),
                (now_ms as f64).into(),
            ],
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::UserRow;

    /// The user-query folding: a signup shop_name becomes a candidate
    /// claim for OTHER users (pure projector of the D1Store query).
    #[test]
    fn user_rows_fold_into_claims() {
        let u = UserRow {
            id: "usr_2".into(),
            email: "b@x.io".into(),
            contact: String::new(),
            shop_name: "B-Tricky NAME".into(),
            status: "pending".into(),
            deploy_allowance: 0,
            deploy_used: 0,
            auth_hash: None,
            created_ms: 0,
            approved_by: None,
            note: None,
        };
        let claim = SubdomainClaim {
            status: u.status.clone(),
            name: subdomain_from_shop_name(&u.shop_name),
        };
        assert_eq!(claim.name, "b-tricky-name");
        assert_eq!(claim.status, "pending");
    }

    /// Only strings flow across the trait: D1Store never leaks a
    /// worker::Error, so orchestrator mapping stays store-typed.
    #[test]
    fn str_of_flattens_worker_error() {
        let s = str_of(worker::Error::RustError("boom".into()));
        assert_eq!(s, "boom");
    }
}
