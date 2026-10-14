use tryon_shared::models::TryOnRequest;

/// Validate try-on payload before spending Genlook credits. Pure + tested.
pub fn validate(req: &TryOnRequest) -> Result<(), &'static str> {
    if req.product_id.trim().is_empty() {
        return Err("product_id required");
    }
    if req.person_image_id.trim().is_empty() {
        return Err("person_image_id required");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_ids() {
        assert!(validate(&TryOnRequest { product_id: "".into(), person_image_id: "x".into() }).is_err());
    }
}
