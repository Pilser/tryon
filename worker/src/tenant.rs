/* tenant.rs - Phase F tenant identity. A platform-deployed shop carries
the `SHOP_ID` + `PLATFORM_TOKEN` bindings (the deployer stamps them via
script-PUT metadata); a plain shop has neither and behaves exactly as
before. In tenant mode every R2 key is namespaced under `shops/<id>/…`
so all shops can share the `tenant-images` bucket without collisions.
The prefix rules are pure functions so they are unit-tested. */
use worker::Env;

/// The bound shop id, empty for a plain (non-tenant) shop.
pub fn shop_id(env: &Env) -> String {
    env.var("SHOP_ID")
        .map(|v| v.to_string())
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// Tenant mode = a SHOP_ID binding exists.
pub fn tenant_mode(env: &Env) -> bool {
    !shop_id(env).is_empty()
}

/// R2 key prefix for this deployment: `shops/<id>/` in tenant mode,
/// empty otherwise (plain shops keep their historical flat keys).
pub fn r2_prefix(env: &Env) -> String {
    let id = shop_id(env);
    if id.is_empty() {
        String::new()
    } else {
        format!("shops/{id}/")
    }
}

/// Pure: apply a prefix to a key (tested).
pub fn apply_prefix(prefix: &str, key: &str) -> String {
    format!("{prefix}{key}")
}

/// Pure: strip a known prefix when present, else return the key (tested).
pub fn strip_prefix<'a>(prefix: &str, key: &'a str) -> &'a str {
    key.strip_prefix(prefix).unwrap_or(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_shops_get_no_prefix() {
        assert_eq!(apply_prefix("", "people/dev/1-2.jpg"), "people/dev/1-2.jpg");
        assert_eq!(strip_prefix("", "people/dev/1-2.jpg"), "people/dev/1-2.jpg");
    }

    #[test]
    fn tenant_prefix_namespaces_the_key() {
        let prefix = "shops/ab12cd34/";
        let key = apply_prefix(prefix, "people/dev/1-2.jpg");
        assert_eq!(key, "shops/ab12cd34/people/dev/1-2.jpg");
        assert_eq!(strip_prefix(prefix, &key), "people/dev/1-2.jpg");
        // A key that does not carry the prefix is left untouched.
        assert_eq!(
            strip_prefix(prefix, "people/dev/1-2.jpg"),
            "people/dev/1-2.jpg"
        );
    }

    #[test]
    fn prefixes_never_end_up_double_slashed() {
        let key = apply_prefix("shops/x/", "products/a.jpg");
        assert!(!key.contains("//"));
    }
}
