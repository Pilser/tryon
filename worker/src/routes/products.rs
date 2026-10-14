use tryon_shared::models::ProductFilter;

/// Parse `/api/products?q=&category=&size=&max_price=` query string. Pure + tested.
pub fn parse_filter(query: &str) -> ProductFilter {
    let mut f = ProductFilter::default();
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        let (k, v) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
        match k {
            "q" => f.query = v.to_string(),
            "category" => f.category = v.to_string(),
            "size" => f.size = v.to_string(),
            "max_price" => f.max_price_cents = v.parse().ok(),
            _ => {}
        }
    }
    f
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_query() {
        let f = parse_filter("q=dress&category=Dresses&max_price=5000");
        assert_eq!(f.query, "dress");
        assert_eq!(f.max_price_cents, Some(5000));
    }
}
