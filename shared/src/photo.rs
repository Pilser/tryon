//! Photo rules shared by browser (pre-upload check + WASM downscale) and
//! Worker (pre-forward check). Mirrors Genlook API limits:
//! JPEG/PNG/WebP/HEIC, 10 MB max.

/// Max bytes Genlook accepts per image.
pub const MAX_BYTES: usize = 10 * 1024 * 1024;
/// Mimes Genlook accepts.
pub const ACCEPTED_MIMES: [&str; 5] = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
];
/// Longest edge we downscale to in-browser before upload (saves bandwidth,
/// Genlook crops to 4:5 by default anyway).
pub const MAX_EDGE: u32 = 1600;
/// Below this on either side the photo is too small for a good result.
pub const MIN_DIM: u32 = 256;

pub fn is_accepted_mime(mime: &str) -> bool {
    ACCEPTED_MIMES.contains(&mime.to_lowercase().as_str())
}

/// Size + type gate. Runs in browser before submit AND in Worker before
/// spending a Genlook call.
pub fn validate_bytes(len: usize, mime: &str) -> Result<(), &'static str> {
    if len == 0 {
        return Err("empty file");
    }
    if len > MAX_BYTES {
        return Err("file over 10 MB");
    }
    if !is_accepted_mime(mime) {
        return Err("unsupported type: use JPEG, PNG, WebP or HEIC");
    }
    Ok(())
}

pub fn validate_dimensions(w: u32, h: u32) -> Result<(), &'static str> {
    if w < MIN_DIM || h < MIN_DIM {
        return Err("photo too small: use at least 256x256");
    }
    Ok(())
}

pub fn needs_downscale(w: u32, h: u32) -> bool {
    w.max(h) > MAX_EDGE
}

/// Fit inside MAX_EDGE preserving aspect ratio. Pure.
pub fn target_dimensions(w: u32, h: u32) -> (u32, u32) {
    let m = w.max(h);
    if m <= MAX_EDGE || m == 0 {
        return (w, h);
    }
    let scale = MAX_EDGE as f64 / m as f64;
    (
        ((w as f64 * scale).round() as u32).max(1),
        ((h as f64 * scale).round() as u32).max(1),
    )
}

/// Canonical share URL for a product. Served by Worker SSR so link
/// previews and WhatsApp bots get full OG tags without JS.
pub fn share_url(origin: &str, product_id: &str) -> String {
    format!("{}/product/{}", origin.trim_end_matches('/'), product_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_oversize_and_bad_mime() {
        assert!(validate_bytes(MAX_BYTES + 1, "image/jpeg").is_err());
        assert!(validate_bytes(100, "image/gif").is_err());
        assert!(validate_bytes(100, "image/png").is_ok());
    }

    #[test]
    fn downscale_keeps_aspect() {
        assert!(!needs_downscale(800, 600));
        assert!(needs_downscale(4000, 3000));
        assert_eq!(target_dimensions(4000, 3000), (1600, 1200));
        assert_eq!(target_dimensions(800, 600), (800, 600));
    }

    #[test]
    fn share_url_trims_slash() {
        assert_eq!(
            share_url("https://shop.com/", "p1"),
            "https://shop.com/product/p1"
        );
    }
}
