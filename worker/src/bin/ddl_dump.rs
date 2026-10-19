/* ddl_dump.rs - print the shop's D1 schema as one SQL file.
The CI packaging step runs this to produce `shop-schema.sql` for the
R2 bundle, so a deployed shop starts with the same tables the shop
worker would create itself (all statements are idempotent). The list
below is the single place the bundle schema is assembled from. */
use tryon_worker::routes::{device, photos, shop, studio};

fn main() {
    let mut parts: Vec<String> = Vec::new();
    for s in device::USAGE_DDL.iter() {
        parts.push((*s).to_string());
    }
    for s in device::USAGE_MIGRATIONS.iter() {
        parts.push((*s).to_string());
    }
    parts.push(shop::SHOP_DDL.to_string());
    for s in shop::SHOP_MIGRATIONS.iter() {
        parts.push((*s).to_string());
    }
    for s in photos::PHOTO_DDL.iter() {
        parts.push((*s).to_string());
    }
    parts.push(studio::PRODUCTS_DDL.to_string());
    parts.push(studio::CATEGORIES_DDL.to_string());

    // The deployer splits on ";\n" (provision::split_stmts), so every
    // statement must end that way.
    let mut out = String::new();
    for p in parts {
        let p = p.trim();
        if p.is_empty() {
            continue;
        }
        out.push_str(p);
        if !p.ends_with(';') {
            out.push(';');
        }
        out.push('\n');
    }
    print!("{out}");
}
