//! WASM image pipe: the ONLY place photos are processed.
//! Browser sends raw bytes + mime; gets back validated, downscaled JPEG.
//! HEIC passes through untouched (Genlook accepts HEIC natively; WASM has
//! no HEIC decoder). Limits mirror `shared::photo`.

use image::{codecs::jpeg::JpegEncoder, ImageReader};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

pub const MAX_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_EDGE: u32 = 1600;
pub const MIN_DIM: u32 = 256;

#[derive(Debug)]
pub struct Prepared {
    pub bytes: Vec<u8>,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub processed: bool,
}

fn is_heic(mime: &str) -> bool {
    matches!(mime.to_lowercase().as_str(), "image/heic" | "image/heif")
}

/// Pure pipeline: also unit-testable on native targets.
pub fn prepare(mut bytes: Vec<u8>, mime: &str) -> Result<Prepared, &'static str> {
    if bytes.is_empty() {
        return Err("empty file");
    }
    if bytes.len() > MAX_BYTES {
        return Err("file over 10 MB");
    }
    if is_heic(mime) {
        return Ok(Prepared { bytes, mime: mime.to_string(), width: 0, height: 0, processed: false });
    }
    let img = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| "unreadable image")?
        .decode()
        .map_err(|_| "unreadable image")?;
    let (w, h) = (img.width(), img.height());
    if w < MIN_DIM || h < MIN_DIM {
        return Err("photo too small: use at least 256x256");
    }
    if w.max(h) <= MAX_EDGE && mime.eq_ignore_ascii_case("image/jpeg") {
        return Ok(Prepared { bytes, mime: mime.to_string(), width: w, height: h, processed: false });
    }
    let scale = MAX_EDGE as f64 / w.max(h) as f64;
    let (tw, th) = (
        ((w as f64 * scale).round() as u32).max(1),
        ((h as f64 * scale).round() as u32).max(1),
    );
    let small = img.thumbnail(tw, th);
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 85)
        .encode_image(&small)
        .map_err(|_| "encode failed")?;
    if out.len() >= bytes.len() {
        return Ok(Prepared { bytes, mime: mime.to_string(), width: w, height: h, processed: false });
    }
    bytes = out;
    Ok(Prepared { bytes, mime: "image/jpeg".to_string(), width: tw, height: th, processed: true })
}

/// WASM export: `{ bytes: Uint8Array, mime, width, height, processed }`.
#[wasm_bindgen]
pub fn prepare_image(data: &[u8], mime: &str) -> Result<JsValue, JsValue> {
    let p = prepare(data.to_vec(), mime).map_err(|e| JsValue::from_str(e))?;
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &"bytes".into(), &js_sys::Uint8Array::from(p.bytes.as_slice()).into())?;
    js_sys::Reflect::set(&obj, &"mime".into(), &p.mime.into())?;
    js_sys::Reflect::set(&obj, &"width".into(), &(p.width as f64).into())?;
    js_sys::Reflect::set(&obj, &"height".into(), &(p.height as f64).into())?;
    js_sys::Reflect::set(&obj, &"processed".into(), &p.processed.into())?;
    Ok(obj.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    fn jpeg(w: u32, h: u32) -> Vec<u8> {
        let img = RgbImage::from_pixel(w, h, Rgb([200u8, 100, 50]));
        let mut buf = Vec::new();
        JpegEncoder::new_with_quality(&mut buf, 90).encode_image(&img).unwrap();
        buf
    }

    #[test]
    fn rejects_empty_oversize_small() {
        assert!(prepare(vec![], "image/jpeg").is_err());
        assert!(prepare(vec![0u8; MAX_BYTES + 1], "image/jpeg").is_err());
        assert!(prepare(jpeg(100, 100), "image/jpeg").is_err());
    }

    #[test]
    fn downscales_hires() {
        let p = prepare(jpeg(4000, 3000), "image/jpeg").unwrap();
        assert!(p.processed);
        assert_eq!((p.width, p.height), (1600, 1200));
        assert_eq!(p.mime, "image/jpeg");
    }

    #[test]
    fn heic_passthrough() {
        let p = prepare(vec![1u8; 100], "image/heic").unwrap();
        assert!(!p.processed);
    }
}
