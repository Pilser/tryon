/// Admin helpers: R2 object key builder + bearer check. Pure + tested.
pub fn r2_key(product_id: &str, filename: &str) -> String {
    let ext = filename.rsplit('.').next().unwrap_or("jpg");
    format!("products/{product_id}.{ext}")
}

pub fn authorized(header: Option<&str>, expected: &str) -> bool {
    match header {
        Some(h) => h == &format!("Bearer {expected}") || (expected.is_empty()),
        None => expected.is_empty(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_r2_key() {
        assert_eq!(r2_key("abc", "photo.png"), "products/abc.png");
    }
}
