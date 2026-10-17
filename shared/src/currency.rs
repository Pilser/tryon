//! Currency catalogue shared by the Worker and the frontend.
//!
//! Prices are stored as `price_cents` (1/100 of the major unit) for every
//! currency, so only currencies with 0 or 2 ISO minor-unit digits are
//! listed. `UGX` is the shop default and is listed first.

/// Shop default when nothing else is configured.
pub const DEFAULT: &str = "UGX";

/// Code + display decimals. Order matters: the owner dropdown follows it.
pub const SUPPORTED: &[(&str, u8)] = &[
    ("UGX", 0), // Uganda - default
    ("USD", 2),
    ("EUR", 2),
    ("GBP", 2),
    // East Africa / EAC
    ("KES", 2),
    ("TZS", 2),
    ("RWF", 0),
    ("BIF", 0),
    ("ETB", 2),
    ("SOS", 2),
    ("ERN", 2),
    ("DJF", 0),
    ("SDG", 2),
    ("SSP", 2),
    ("CDF", 2),
    // Gulf
    ("AED", 2),
    ("SAR", 2),
    ("QAR", 2),
    // Rupees / Iran
    ("INR", 2),
    ("PKR", 2),
    ("LKR", 2),
    ("IRR", 2),
    // Other common
    ("ZAR", 2),
    ("NGN", 2),
    ("GHS", 2),
    ("JPY", 0),
    ("CNY", 2),
    ("CAD", 2),
    ("AUD", 2),
    ("CHF", 2),
];

/// Uppercased code without surrounding space.
pub fn clean(code: &str) -> String {
    code.trim().to_ascii_uppercase()
}

/// Is this a code we can price in?
pub fn is_supported(code: &str) -> bool {
    let c = clean(code);
    SUPPORTED.iter().any(|(k, _)| *k == c)
}

/// Display decimals for a code (2 when unknown, never panics).
pub fn decimals(code: &str) -> u8 {
    let c = clean(code);
    SUPPORTED
        .iter()
        .find(|(k, _)| *k == c)
        .map(|(_, d)| *d)
        .unwrap_or(2)
}

/// Valid code, or `fallback` when it is unknown/empty.
pub fn normalize(code: &str, fallback: &str) -> String {
    if is_supported(code) {
        clean(code)
    } else if is_supported(fallback) {
        clean(fallback)
    } else {
        DEFAULT.to_string()
    }
}

/// `12,345` / `19.99`, grouped, no symbol.
pub fn format_amount(price_cents: u32, code: &str) -> String {
    let d = decimals(code) as usize;
    let major = price_cents / 100;
    let minor = price_cents % 100;
    let mut out = group_u64(major as u64);
    if d > 0 {
        let frac = if d == 1 { minor / 10 } else { minor };
        out.push('.');
        out.push_str(&format!("{:0width$}", frac, width = d));
    }
    out
}

/// `12,345 UGX`.
pub fn price_display(price_cents: u32, code: &str) -> String {
    format!("{} {}", format_amount(price_cents, code), clean(code))
}

fn group_u64(mut n: u64) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut parts = Vec::new();
    while n > 0 {
        parts.push(n % 1000);
        n /= 1000;
    }
    let mut out = String::new();
    for (i, p) in parts.iter().rev().enumerate() {
        if i == 0 {
            out.push_str(&p.to_string());
        } else {
            out.push_str(&format!(",{:03}", p));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ugx_is_the_default_and_first() {
        assert_eq!(DEFAULT, "UGX");
        assert_eq!(SUPPORTED[0].0, "UGX");
        assert_eq!(decimals("UGX"), 0);
    }

    #[test]
    fn normalize_uppercases_and_falls_back() {
        assert_eq!(normalize(" ugx ", "USD"), "UGX");
        assert_eq!(normalize("aed", "UGX"), "AED");
        assert_eq!(normalize("nope", "USD"), "USD");
        assert_eq!(normalize("", "nope"), "UGX");
    }

    #[test]
    fn formats_with_grouping_and_currency_decimals() {
        assert_eq!(price_display(1_200_000, "UGX"), "12,000 UGX");
        assert_eq!(price_display(1999, "USD"), "19.99 USD");
        assert_eq!(price_display(50, "USD"), "0.50 USD");
        assert_eq!(price_display(0, "UGX"), "0 UGX");
        assert_eq!(price_display(123_456_789, "KES"), "1,234,567.89 KES");
    }

    #[test]
    fn every_supported_code_has_two_or_zero_decimals() {
        for (code, d) in SUPPORTED {
            assert!(*d == 0 || *d == 2, "{code} has unsupported decimals {d}");
            assert_eq!(code.len(), 3);
            assert_eq!(code.to_uppercase(), *code);
        }
    }
}
