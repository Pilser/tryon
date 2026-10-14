use tryon_shared::photo::{is_accepted_mime, MAX_BYTES};

/// Pre-checks for `POST /api/person-upload` before reading the body.
/// Genlook keeps person photos 7 days by default (`keepForDays` 1/3/7
/// can shorten it via the forwarded multipart fields). Pure + tested.
pub fn precheck(content_length: Option<usize>, content_type: Option<&str>) -> Result<(), &'static str> {
    match content_type {
        Some(ct) if ct.starts_with("multipart/form-data") => {}
        _ => return Err("expected multipart/form-data"),
    }
    if let Some(len) = content_length {
        if len == 0 {
            return Err("empty upload");
        }
        if len > MAX_BYTES + 1024 {
            return Err("upload over 10 MB");
        }
    }
    Ok(())
}

/// The forwarded multipart `file` part must itself be an accepted image.
pub fn check_file_part(mime: &str, len: usize) -> Result<(), &'static str> {
    if !is_accepted_mime(mime) {
        return Err("unsupported type: use JPEG, PNG, WebP or HEIC");
    }
    tryon_shared::photo::validate_bytes(len, mime)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn precheck_guards_type_and_size() {
        assert!(precheck(Some(100), Some("multipart/form-data; boundary=xyz")).is_ok());
        assert!(precheck(Some(100), Some("application/json")).is_err());
        assert!(precheck(Some(20 * 1024 * 1024), Some("multipart/form-data; boundary=x")).is_err());
        assert!(check_file_part("image/gif", 100).is_err());
        assert!(check_file_part("image/heic", 100).is_ok());
    }
}
