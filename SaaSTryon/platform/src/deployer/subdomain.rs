/* subdomain.rs - the account's workers.dev subdomain (B3). Every script
in the account inherits it, so shop subdomains are automatic: the
deployer reads it from the API instead of asking an operator to
configure it by hand. Small on purpose - one lookup, one pure parser. */
use serde_json::Value;
use worker::Method;

use super::cf_api::{call_with_retry, CfBody, CfError, CfRequest, Transport};

/// Pure: pull the subdomain out of a Cloudflare API answer (tested).
pub fn parse_subdomain(body: &Value) -> Option<String> {
    body.get("subdomain")
        .and_then(|s| s.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Read the account's workers.dev subdomain from the API.
pub async fn fetch_dev_subdomain(cf: &impl Transport, account: &str) -> Result<String, CfError> {
    let req = CfRequest {
        method: Method::Get,
        path: format!("/accounts/{account}/workers/subdomain"),
        body: CfBody::Empty,
        jwt: None,
    };
    let v = call_with_retry(cf, req).await?;
    parse_subdomain(&v)
        .ok_or_else(|| CfError::transport(502, "workers.dev subdomain missing in API answer"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;

    #[test]
    fn parses_the_subdomain_out_of_the_answer() {
        assert_eq!(
            parse_subdomain(&json!({"subdomain": "jerboa-ui"})).as_deref(),
            Some("jerboa-ui")
        );
        // Empty, missing and nested shapes are all "no subdomain".
        assert!(parse_subdomain(&json!({"subdomain": ""})).is_none());
        assert!(parse_subdomain(&json!({"subdomain": "   "})).is_none());
        assert!(parse_subdomain(&json!({"result": {"subdomain": "x"}})).is_none());
        assert!(parse_subdomain(&json!({})).is_none());
    }

    /// The lookup asks the account-scoped endpoint and returns the value.
    struct MockCf {
        body: String,
        seen: RefCell<Vec<String>>,
    }

    impl Transport for MockCf {
        async fn call(&self, req: CfRequest) -> Result<super::super::cf_api::CfResponse, CfError> {
            self.seen.borrow_mut().push(req.path.clone());
            Ok(super::super::cf_api::CfResponse {
                status: 200,
                body: self.body.clone(),
                retry_after: None,
                ratelimit_remaining: None,
            })
        }
    }

    #[test]
    fn reads_the_subdomain_from_the_account_endpoint() {
        let cf = MockCf {
            body: json!({"subdomain": "jerboa-ui", "success": true}).to_string(),
            seen: RefCell::new(vec![]),
        };
        let out = block_on(fetch_dev_subdomain(&cf, "acc123"));
        assert_eq!(out.as_deref().ok(), Some("jerboa-ui"));
        let path = cf.seen.borrow()[0].clone();
        assert!(path.ends_with("/workers/subdomain"), "path was {path}");
    }

    /// Minimal executor: every mocked future resolves without external
    /// wakers, so polling until Ready is enough on the test host.
    fn block_on<F: std::future::Future>(fut: F) -> F::Output {
        let waker = std::task::Waker::noop().clone();
        let mut cx = std::task::Context::from_waker(&waker);
        let mut fut = Box::pin(fut);
        loop {
            match fut.as_mut().poll(&mut cx) {
                std::task::Poll::Ready(v) => return v,
                std::task::Poll::Pending => std::thread::yield_now(),
            }
        }
    }
}
