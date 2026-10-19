/* e2e_idempotency_tests.rs - the "deploy twice, same script" case:
the second deploy must send the same metadata, so a redeploy never
drops bindings. Split out of e2e_tests.rs to keep every file under the
line cap. */
use super::e2e_tests::*;
use super::*;
use serde_json::Value as V;
use std::cell::RefCell;
#[test]
fn idempotent_metadata_across_two_deploys() {
    let build = |cf: &MockCf, bundle: &BundleData| {
        let store = empty_store();
        let bundles = MockBundles {
            data: clone_bundle(bundle),
            loaded: RefCell::new(vec![]),
        };
        block_on(deploy_shop_with(&store, &bundles, cf, &cfg(), &inputs())).expect("deploys");
        let calls = cf.calls.borrow();
        // buckets empty -> session jwt IS the completion token (§3.3),
        // so the asset upload step is SKIPPED: exactly 4 calls.
        assert_eq!(calls.len(), 4, "upload skipped with empty buckets");
        let session = match &calls[2].body {
            CfBody::Json(v) => v.clone(),
            _ => panic!("session call is json"),
        };
        let put = match &calls[3].body {
            CfBody::Raw(raw) => raw,
            _ => panic!("script put is multipart"),
        };
        let meta: V = serde_json::from_str(&multipart_part(&put.bytes, "metadata")).unwrap();
        (meta, put.bytes.len(), session)
    };
    let (m1, len1, sess1) = build(&deploy_cf("u1", serde_json::json!([])), &test_bundle());
    let (m2, len2, sess2) = build(&deploy_cf("u1", serde_json::json!([])), &test_bundle());
    assert_eq!(
        m1.as_object().unwrap().len(),
        4,
        "module/compat/bindings/assets"
    );
    assert_eq!(
        m1["main_module"], m2["main_module"],
        "same bundle -> same entry"
    );
    assert_eq!(m1["compatibility_date"], m2["compatibility_date"]);
    assert_eq!(
        m1["assets"]["jwt"], "session-jwt",
        "session jwt rides in metadata"
    );
    let b1 = m1["bindings"].as_array().unwrap();
    let b2 = m2["bindings"].as_array().unwrap();
    assert_eq!(b1.len(), 5);
    assert_eq!(b1[1], b2[1], "PRODUCTS bucket is deploy-independent");
    assert_eq!(b1[4], b2[4], "GENLOOK_PROXY service is deploy-independent");
    assert_ne!(b1[2], b2[2], "SHOP_ID regenerates per deploy");
    assert_ne!(b1[3], b2[3], "PLATFORM_TOKEN regenerates per deploy");
    assert_eq!(len1, len2, "identical byte length modulo per-deploy values");
    assert_eq!(sess1, sess2, "same bundle -> same assets session request");
    // A changed bundle (extra asset) must produce a DIFFERENT session
    // manifest, and a different d1 uuid lands in DB.
    let (m3, _, sess3) = build(&deploy_cf("u9", serde_json::json!([])), &alt_bundle());
    let b3 = m3["bindings"].as_array().unwrap();
    assert_ne!(
        b1[0]["database_id"], b3[0]["database_id"],
        "d1 uuid rides in"
    );
    assert_ne!(sess1, sess3, "changed bundle -> different asset list");
}
