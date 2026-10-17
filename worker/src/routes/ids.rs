/* routes/ids.rs - short ids for owner-created rows (products, categories).
`<prefix><millis-hex><random-hex>`: sortable-ish, collision-safe enough for
a single-owner shop, and testable without a clock. */
pub fn id_from(prefix: char, ms: u64, rnd: u64) -> String {
    format!("{prefix}{ms:x}{rnd:x}")
}

/// Fresh id using the Worker clock + `Math.random`.
pub fn new_id(prefix: char) -> String {
    let ms = js_sys::Date::now() as u64;
    let rnd = (js_sys::Math::random() * 16777215.0) as u64;
    id_from(prefix, ms, rnd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_prefixed_hex_id() {
        assert_eq!(id_from('p', 0x1a2b, 0x3c), "p1a2b3c");
        assert_eq!(id_from('c', 0, 0), "c00");
        assert!(id_from('p', 5, 5) != id_from('c', 5, 5));
    }
}
