//! In-browser (WASM) photo pipeline. Validates against the same rules as
//! the Worker (`shared::photo`), then downscales hi-res photos and
//! re-encodes to JPEG so uploads are small without losing visible quality.
//! HEIC/iPhone originals can't be decoded in WASM: they pass through
//! untouched (Genlook accepts HEIC natively).

use image::{codecs::jpeg::JpegEncoder, ImageReader};
use std::io::Cursor;
use tryon_shared::photo;

pub struct Prepared {
    /// Bytes ready to upload.
    pub bytes: Vec<u8>,
    /// Mime to send alongside.
    pub mime: String,
    pub width: u32,
    pub height: u32,
    /// True when the image was downscaled/re-encoded locally.
    pub processed: bool,
}

fn is_heic(mime: &str) -> bool {
    let m = mime.to_lowercase();
    m == "image/heic" || m == "image/heif"
}

/// Full gate: size + type, then optional downscale + JPEG re-encode.
pub fn prepare(mut bytes: Vec<u8>, mime: &str) -> Result<Prepared, &'static str> {
    photo::validate_bytes(bytes.len(), mime)?;
    if is_heic(mime) {
        // Can't decode HEIC in WASM; Genlook takes it as-is.
        return Ok(Prepared { bytes, mime: mime.to_string(), width: 0, height: 0, processed: false });
    }
    let img = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| "unreadable image")?
        .decode()
        .map_err(|_| "unreadable image")?;
    let (w, h) = (img.width(), img.height());
    photo::validate_dimensions(w, h)?;
    if !photo::needs_downscale(w, h) && mime == "image/jpeg" {
        return Ok(Prepared { bytes, mime: mime.to_string(), width: w, height: h, processed: false });
    }
    let (tw, th) = photo::target_dimensions(w, h);
    let small = img.thumbnail(tw, th);
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 85)
        .encode_image(&small)
        .map_err(|_| "encode failed")?;
    // Safety: never send back something bigger than we got.
    if out.len() >= bytes.len() {
        return Ok(Prepared { bytes, mime: mime.to_string(), width: w, height: h, processed: false });
    }
    bytes = out;
    Ok(Prepared { bytes, mime: "image/jpeg".to_string(), width: tw, height: th, processed: true })
}

/// Object URL for `<img>` preview. Caller must revoke when done.
pub fn preview_url(bytes: &[u8], mime: &str) -> Result<String, &'static str> {
    let arr = js_sys::Uint8Array::from(bytes);
    let parts = js_sys::Array::of1(&arr.into());
    let mut bag = web_sys::BlobPropertyBag::new();
    bag.type_(mime);
    let blob = web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &bag)
        .map_err(|_| "blob failed")?;
    web_sys::Url::create_object_url_with_blob(&blob).map_err(|_| "preview failed")
}

pub fn revoke_url(url: &str) {
    let _ = web_sys::Url::revoke_object_url(url);
}
