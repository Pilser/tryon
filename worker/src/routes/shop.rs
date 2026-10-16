/// Shop settings route helper (pure part).
pub fn cache_header() -> &'static str {
    "public, max-age=60"
}

/// Owner-edited shop name + logo. Single row (id = 1); env vars stay the
/// fallback for fresh deploys.
pub const SHOP_DDL: &str = "CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    shop_name TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT ''
)";
