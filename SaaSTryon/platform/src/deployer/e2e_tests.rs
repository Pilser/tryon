/* e2e_tests.rs - the deployer's mock-transport end-to-end tests: gates
are covered in mod.rs/provision.rs; here the WHOLE deploy flow runs
against fakes (D1 via the DeployStore trait, CF API via Transport) and
asserts exact call sequences, the assets flow and §7.3 bookkeeping. */
use super::*;
use crate::deployer::bundle::{AssetRef, BundleData, BundleSource};
use crate::deployer::cf_api;
use cf_api::{CfBody, CfConfig, CfError, CfRequest, CfResponse, Transport};
use serde_json::Value as V;
use std::cell::RefCell;
use std::rc::Rc;
use std::task::{Context, Poll, Waker};

/// Minimal executor: every mocked future resolves without external
/// wakers, so polling until Ready is enough on the test host.
pub(crate) fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    let waker = Waker::noop().clone();
    let mut cx = Context::from_waker(&waker);
    let mut fut = Box::pin(fut);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

// ------------------------------------------------------------- mocks

pub(crate) struct MockCf {
    pub(crate) steps: RefCell<Vec<MockStep>>,
    pub(crate) calls: RefCell<Vec<CfRequest>>,
}

pub(crate) enum MockStep {
    /// 200 with this JSON body.
    Ok(V),
    /// Non-2xx answering a CF error body.
    Fail(u16, String),
    /// N x 429 (optional retry-after), then continue with the next step.
    RateLimit(u32, Option<u64>),
}

fn ok_step() -> V {
    serde_json::json!({ "success": true })
}

impl Transport for MockCf {
    async fn call(&self, req: CfRequest) -> Result<CfResponse, CfError> {
        self.calls.borrow_mut().push(req);
        let step = self.steps.borrow_mut().remove(0);
        match step {
            MockStep::Ok(v) => Ok(CfResponse {
                status: 200,
                body: v.to_string(),
                retry_after: None,
                ratelimit_remaining: None,
            }),
            MockStep::Fail(status, body) => Ok(CfResponse {
                status,
                body,
                retry_after: None,
                ratelimit_remaining: None,
            }),
            MockStep::RateLimit(left, retry_after) => {
                if left > 1 {
                    self.steps
                        .borrow_mut()
                        .insert(0, MockStep::RateLimit(left - 1, retry_after));
                }
                Ok(CfResponse {
                    status: 429,
                    body: r#"{"success":false,"errors":[{"code":11000,"message":"rate limit exceeded"}]}"#.into(),
                    retry_after,
                    ratelimit_remaining: Some(0),
                })
            }
        }
    }
}

pub(crate) struct MockStore {
    pub(crate) shops: RefCell<Vec<ShopRow>>,
    pub(crate) audits: RefCell<Vec<String>>,
    pub(crate) used: RefCell<Vec<String>>,
}

impl DeployStore for MockStore {
    async fn owner(&self, _id: &str) -> Result<Option<OwnerGate>, String> {
        Ok(Some(gate_owner("approved", 1, 3)))
    }
    async fn taken_claims(&self, _owner: &str, _sub: &str) -> Result<Vec<SubdomainClaim>, String> {
        Ok(vec![])
    }
    async fn record_shop(&self, row: &ShopRow) -> Result<(), String> {
        self.shops.borrow_mut().push(ShopRow {
            id: row.id.clone(),
            owner_id: row.owner_id.clone(),
            name: row.name.clone(),
            subdomain: row.subdomain.clone(),
            cluster_id: row.cluster_id.clone(),
            tier: row.tier.clone(),
            depot_version: row.depot_version.clone(),
            platform_token: row.platform_token.clone(),
            created_ms: row.created_ms,
        });
        Ok(())
    }
    async fn consume_allowance(&self, owner_id: &str) -> Result<(), String> {
        self.used.borrow_mut().push(owner_id.to_string());
        Ok(())
    }
    async fn audit(
        &self,
        action: &str,
        subject: &str,
        _meta: &str,
        _now: i64,
    ) -> Result<(), String> {
        self.audits.borrow_mut().push(format!("{action}:{subject}"));
        Ok(())
    }
}

pub(crate) struct MockBundles {
    pub(crate) data: BundleData,
    pub(crate) loaded: RefCell<Vec<String>>,
}

impl BundleSource for MockBundles {
    async fn load_bundle(&self, id: &str) -> Result<BundleData, String> {
        self.loaded.borrow_mut().push(id.to_string());
        Ok(clone_bundle(&self.data))
    }
}

// ---------------------------------------------------------- fixtures

fn gate_owner(status: &str, used: i64, allowance: i64) -> OwnerGate {
    OwnerGate {
        id: "usr_1".into(),
        status: status.into(),
        deploy_used: used,
        deploy_allowance: allowance,
    }
}

pub(crate) fn asset_bytes() -> Vec<u8> {
    b"<html>\xF0\x9F\x8C\x9F</html>\n".to_vec()
}

pub(crate) fn test_bundle() -> BundleData {
    let manifest = crate::deployer::parse_manifest(
        r#"{
          "schema": "st-bundle/1",
          "wasm": {"key": "shop.wasm", "sha256": ""},
          "glue": {"key": "worker.js"},
          "schema_sql": {"key": "schema.sql"},
          "assets": [{"key": "assets/index.html", "path": "index.html"}],
          "entry": "worker.js",
          "compat_date": "2026-10-19"
        }"#,
    )
    .unwrap();
    BundleData {
        manifest,
        wasm: b"\x00asm".to_vec(),
        glue: "export default {}".into(),
        schema_sql: "CREATE TABLE items(x);\nCREATE TABLE products(y);\n".into(),
        assets: vec![("index.html".into(), asset_bytes())],
    }
}

/// Same shape, one extra asset - the "changed bundle" input for the
/// idempotency diff.
pub(crate) fn alt_bundle() -> BundleData {
    let mut d = test_bundle();
    d.manifest.assets.push(AssetRef {
        key: "assets/bonus.html".into(),
        path: "bonus.html".into(),
        sha256: String::new(),
    });
    d.assets
        .push(("bonus.html".into(), b"<b>bonus</b>".to_vec()));
    d
}

pub(crate) fn clone_bundle(d: &BundleData) -> BundleData {
    BundleData {
        manifest: d.manifest.clone(),
        wasm: d.wasm.clone(),
        glue: d.glue.clone(),
        schema_sql: d.schema_sql.clone(),
        assets: d.assets.clone(),
    }
}

pub(crate) fn inputs() -> DeployInputs {
    DeployInputs {
        owner_id: "usr_1".into(),
        subdomain: "amina".into(),
        shop_name: "Amina".into(),
        tier: "starter".into(),
        bundle_id: "v2026-10-19".into(),
        now_ms: 1_760_000_000_000,
    }
}

pub(crate) fn cfg() -> CfConfig {
    CfConfig {
        token: "tok".into(),
        account: "acc123".into(),
        dev_subdomain: Some("acc1".into()),
        // No zone: these tests keep the workers.dev URL only, so the
        // custom-domain attach stays out of the mocked call sequence.
        zone_id: None,
        zone_name: "latiforge.com".into(),
    }
}

pub(crate) fn multipart_part(body: &[u8], name: &str) -> String {
    let text = String::from_utf8_lossy(body);
    let marker = format!("name=\"{name}\"; filename=");
    let start = text.find(&marker).expect("part present") + marker.len();
    let rest = &text[start..];
    let after_headers = rest.find("\r\n\r\n").expect("part headers end") + 4;
    let end = rest[after_headers..].find("\r\n").expect("part data end") + after_headers;
    rest[after_headers..end].trim().to_string()
}

fn script_name_of(path: &str) -> String {
    path.rsplit('/').next().unwrap_or_default().to_string()
}

/// The 5 steps of a successful deploy: create, query, session, upload, PUT.
pub(crate) fn deploy_cf(uuid: &str, buckets: V) -> MockCf {
    MockCf {
        steps: RefCell::new(vec![
            MockStep::Ok(serde_json::json!({
                "result": {"uuid": uuid, "name": "shop-x"}, "success": true
            })),
            MockStep::Ok(ok_step()),
            MockStep::Ok(serde_json::json!({
                "result": {"jwt": "session-jwt", "buckets": buckets},
                "success": true
            })),
            MockStep::Ok(serde_json::json!({ "jwt": "completion-jwt" })),
            MockStep::Ok(ok_step()),
        ]),
        calls: RefCell::new(vec![]),
    }
}

#[test]
fn happy_path_end_to_end_sequence() {
    let cf = deploy_cf(
        "d1-uuid-9",
        serde_json::json!([[asset_hash("/index.html", &asset_bytes())]]),
    );
    let store = empty_store();
    let bundles = MockBundles {
        data: test_bundle(),
        loaded: RefCell::new(vec![]),
    };

    let res = block_on(deploy_shop_with(&store, &bundles, &cf, &cfg(), &inputs()))
        .expect("happy path deploys");

    let calls = cf.calls.borrow();
    assert_eq!(calls.len(), 5, "create, query, session, upload, script put");
    assert_eq!(calls[0].path, "/accounts/acc123/d1/database");
    assert!(calls[1]
        .path
        .starts_with("/accounts/acc123/d1/database/d1-uuid-9/query"));
    let session_path = calls[2].path.clone();
    let session_parts: Vec<&str> = session_path.split('/').collect();
    assert_eq!(session_parts.last().copied(), Some("assets-upload-session"));
    let session_script = session_parts[session_parts.len() - 2].to_string();
    assert!(session_script.starts_with("shop-"));
    assert!(calls[3].path.contains("/workers/assets/upload?base64=true"));
    assert_eq!(
        calls[3].jwt.as_deref(),
        Some("session-jwt"),
        "assets upload carries the SESSION jwt, not the platform token"
    );
    assert_eq!(
        calls[4].path,
        format!("/accounts/acc123/workers/scripts/{session_script}"),
        "script-PUT on the same shop-<id8>, plain script mode"
    );
    let raw = match &calls[4].body {
        CfBody::Raw(raw) => raw,
        _ => panic!("script put must be multipart raw"),
    };
    assert!(raw
        .content_type
        .starts_with("multipart/form-data; boundary="));
    let meta: V = serde_json::from_str(&multipart_part(&raw.bytes, "metadata")).unwrap();
    let bindings = meta["bindings"].as_array().unwrap();
    assert_eq!(bindings.len(), 5, "exactly the provision set");
    assert_eq!(
        bindings[0]["database_id"], "d1-uuid-9",
        "D1 from provision step"
    );
    // recorded bookkeeping
    let shops = store.shops.borrow();
    assert_eq!(shops.len(), 1, "one shops row");
    let row = &shops[0];
    assert_eq!(row.cluster_id, script_name_of(&calls[4].path));
    assert_eq!(row.subdomain, "amina");
    assert_eq!(row.depot_version, "v2026-10-19");
    assert_eq!(
        shops[0].id,
        format!("shop_{}", &row.cluster_id["shop-".len()..])
    );
    drop(shops);
    assert_eq!(store.used.borrow().len(), 1, "allowance spent");
    assert_eq!(store.used.borrow()[0], "usr_1");
    assert_eq!(store.audits.borrow().len(), 1, "audit appended");
    // result
    assert_eq!(res.status, "live");
    let url = res.workers_dev_url.as_deref().unwrap();
    assert!(url.starts_with("https://shop-") && url.ends_with(".acc1.workers.dev"));
    assert_eq!(
        bundles.loaded.borrow().first().map(|s| s.as_str()),
        Some("v2026-10-19")
    );
}

pub(crate) fn empty_store() -> MockStore {
    MockStore {
        shops: RefCell::new(vec![]),
        audits: RefCell::new(vec![]),
        used: RefCell::new(vec![]),
    }
}

#[test]
fn subdomain_taken_fails_before_any_cf_call() {
    struct ClaimedStore {
        inner: MockStore,
    }
    impl DeployStore for ClaimedStore {
        async fn owner(&self, id: &str) -> Result<Option<OwnerGate>, String> {
            self.inner.owner(id).await
        }
        async fn taken_claims(
            &self,
            owner: &str,
            sub: &str,
        ) -> Result<Vec<SubdomainClaim>, String> {
            let own = self.inner.taken_claims(owner, sub).await?;
            Ok(match own.is_empty() {
                true => vec![SubdomainClaim {
                    status: "live".into(),
                    name: "amina".into(),
                }],
                _ => own,
            })
        }
        async fn record_shop(&self, row: &ShopRow) -> Result<(), String> {
            self.inner.record_shop(row).await
        }
        async fn consume_allowance(&self, o: &str) -> Result<(), String> {
            self.inner.consume_allowance(o).await
        }
        async fn audit(&self, a: &str, s: &str, m: &str, n: i64) -> Result<(), String> {
            self.inner.audit(a, s, m, n).await
        }
    }
    let cf = deploy_cf("u", serde_json::json!([]));
    let store = ClaimedStore {
        inner: empty_store(),
    };
    let bundles = MockBundles {
        data: test_bundle(),
        loaded: RefCell::new(vec![]),
    };
    let e = block_on(deploy_shop_with(&store, &bundles, &cf, &cfg(), &inputs()))
        .expect_err("taken subdomain fails");
    assert_eq!(e, DeployError::SubdomainTaken);
    assert_eq!(e.http_status(), 409);
    assert!(cf.calls.borrow().is_empty(), "no CF call before the claim");
    assert!(bundles.loaded.borrow().is_empty(), "no bundle load either");
    assert!(store.inner.used.borrow().is_empty(), "no allowance spent");
}

#[test]
fn cf_failure_leaves_store_untouched() {
    let cf = deploy_cf("u", serde_json::json!([]));
    // Empty buckets: the PUT consumes step index 3; plant a
    // deterministic 400 there so it fails without retries.
    let mut steps = cf.steps.borrow_mut();
    steps.truncate(4);
    steps[3] = MockStep::Fail(
        400,
        r#"{"success":false,"errors":[{"code":10021,"message":"bad metadata"}]}"#.into(),
    );
    drop(steps);
    let store = empty_store();
    let bundles = MockBundles {
        data: test_bundle(),
        loaded: RefCell::new(vec![]),
    };
    let e = block_on(deploy_shop_with(&store, &bundles, &cf, &cfg(), &inputs()))
        .expect_err("400 fails the deploy");
    assert!(
        matches!(e, DeployError::Cf(_)),
        "typed CF failure, got {e:?}"
    );
    assert_eq!(e.http_status(), 502);
    assert_eq!(cf.calls.borrow().len(), 4, "no retry after 4xx");
    assert!(store.shops.borrow().is_empty(), "no shops row");
    assert!(store.used.borrow().is_empty(), "no allowance spent");
    assert!(store.audits.borrow().is_empty(), "no audit");
}

/// Q5: redeploying the same bundle re-sends the FULL binding set. Two
/// deploys are structurally equal except the per-deploy identity values
/// (SHOP_ID + PLATFORM_TOKEN random; DB uuid identical here).

#[test]
fn rate_limited_put_retries_with_schedule() {
    // 3 x 429 without retry-after, then success: max 3 retries (B7),
    // delays 2s/4s/8s, and the call still succeeds.
    let sleeps: Rc<RefCell<Vec<u64>>> = Rc::new(RefCell::new(vec![]));
    let cf = MockCf {
        steps: RefCell::new(vec![MockStep::RateLimit(3, None), MockStep::Ok(ok_step())]),
        calls: RefCell::new(vec![]),
    };
    let req = CfRequest {
        method: worker::Method::Get,
        path: "/ping".into(),
        body: CfBody::Empty,
        jwt: None,
    };
    let sl = sleeps.clone();
    let out = block_on(cf_api::call_with_sleeper(&cf, req, move |ms| {
        sl.borrow_mut().push(ms);
        std::future::ready(())
    }))
    .expect("final attempt succeeds after retries");
    assert_eq!(out["success"], true);
    assert_eq!(*sleeps.borrow(), vec![2_000, 4_000, 8_000]);
    assert_eq!(cf.calls.borrow().len(), 4, "1 original + 3 retries");
}
