/* multipart.rs - the script-PUT request builder: the hand-assembled
`PUT /accounts/{a}/workers/scripts/{name}` multipart/form-data body
(D-P1/B2 plain script mode - no dispatch namespace).

Bodies are pure byte layout, which makes them byte-comparable: with a
fixed boundary, two builds of one manifest are identical for the Q5
idempotency guarantee (same re-PUT, full binding set resent). */
use serde_json::Value;

use crate::deployer::cf_api::{CfBody, CfRequest, RawBody};

pub const JS_MODULE_CT: &str = "application/javascript+module";
pub const WASM_CT: &str = "application/wasm";
pub const META_CT: &str = "application/json";

/// Builds the script-PUT multipart body by hand (REST fetch carries raw
/// bytes fine; the runtime does not reformat them).
pub struct MultipartBuilder {
    pub boundary: String,
}

impl MultipartBuilder {
    /// Production boundary (random). Tests pass a fixed one via struct
    /// literal to keep bodies byte-identical.
    pub fn new() -> Self {
        MultipartBuilder {
            boundary: format!("st-up-{}", crate::auth::random_hex(12)),
        }
    }

    /// The metadata part (shape per the scripts update API page):
    /// main_module, compatibility_date, bindings and the assets
    /// completion token. Never carries any secret other than the
    /// per-shop PLATFORM_TOKEN binding.
    pub fn metadata_json(
        main_module: &str,
        compat_date: &str,
        bindings: &[Value],
        assets_jwt: Option<&str>,
    ) -> String {
        let mut meta = serde_json::json!({
            "main_module": main_module,
            "compatibility_date": compat_date,
            "bindings": bindings,
        });
        if let Some(jwt) = assets_jwt {
            meta["assets"] = serde_json::json!({ "jwt": jwt });
        }
        meta.to_string()
    }

    /// Part assembly order - metadata first, then the entry JS, then the
    /// wasm module. Tests assert this stays stable.
    pub fn parts_order() -> [&'static str; 3] {
        ["metadata", "main_module", "wasm"]
    }

    /// Full script-PUT body bytes for (glue entry part, wasm part).
    pub fn script_put_body(
        &self,
        metadata: &Value,
        main_module: &str,
        glue: &str,
        wasm_name: &str,
        wasm: &[u8],
    ) -> RawBody {
        let mut out = Vec::new();
        let sep = format!("--{}\r\n", self.boundary);
        // part 1: metadata
        out.extend_from_slice(sep.as_bytes());
        write_part(
            &mut out,
            "metadata",
            Some("metadata.json"),
            META_CT,
            metadata.to_string().as_bytes(),
        );
        // part 2: main module (glue JS)
        out.extend_from_slice(sep.as_bytes());
        write_part(
            &mut out,
            main_module,
            Some(main_module),
            JS_MODULE_CT,
            glue.as_bytes(),
        );
        // part 3: wasm module
        out.extend_from_slice(sep.as_bytes());
        write_part(&mut out, wasm_name, Some(wasm_name), WASM_CT, wasm);
        out.extend_from_slice(format!("--{}--\r\n", self.boundary).as_bytes());
        RawBody {
            content_type: format!("multipart/form-data; boundary={}", self.boundary),
            bytes: out,
        }
    }

    /// Multipart for one `?base64=true` assets-upload bucket: field name
    /// = hash, value = base64 content, per-file mime.
    pub fn asset_upload_body(&self, files: &[(String, String, &'static str)]) -> RawBody {
        let mut out = Vec::new();
        for (hash, b64, mime) in files {
            out.extend_from_slice(format!("--{}\r\n", self.boundary).as_bytes());
            write_part(&mut out, hash, Some(hash), mime, b64.as_bytes());
        }
        out.extend_from_slice(format!("--{}--\r\n", self.boundary).as_bytes());
        RawBody {
            content_type: format!("multipart/form-data; boundary={}", self.boundary),
            bytes: out,
        }
    }
}

fn write_part(out: &mut Vec<u8>, name: &str, filename: Option<&str>, ct: &str, data: &[u8]) {
    let disp = match filename {
        Some(f) => format!("Content-Disposition: form-data; name=\"{name}\"; filename=\"{f}\""),
        None => format!("Content-Disposition: form-data; name=\"{name}\""),
    };
    // TODO(Q1): live probe whether the metadata part needs `filename=`
    // and whether the wasm part must be named exactly as the glue's
    // import path.
    out.extend_from_slice(disp.as_bytes());
    out.extend_from_slice(b"\r\nContent-Type: ");
    out.extend_from_slice(ct.as_bytes());
    out.extend_from_slice(b"\r\n\r\n");
    out.extend_from_slice(data);
    out.extend_from_slice(b"\r\n");
}

pub fn script_put_path(account: &str, script_name: &str) -> String {
    format!("/accounts/{account}/workers/scripts/{script_name}")
}

/// Tiny by-extension mime used for asset parts (docs: the part
/// Content-Type is attached when the file is later served).
pub fn mime_for_path(path: &str) -> &'static str {
    let p = path.to_ascii_lowercase();
    let ext = p.rsplit('.').next().unwrap_or("");
    match ext {
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" => "application/javascript",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

/// Everything the script-PUT needs, expressed once. The orchestrator
/// fills bindings from provision.rs; idempotency = same inputs, same
/// request (fixed boundary), full binding set resent every time (Q5).
pub struct ScriptPut<'a> {
    pub account: &'a str,
    pub script_name: &'a str,
    pub main_module: &'a str,
    pub compat_date: &'a str,
    pub bindings: &'a [Value],
    pub assets_jwt: Option<&'a str>,
    pub wasm_name: &'a str,
    pub wasm: &'a [u8],
    pub glue: &'a str,
}

impl ScriptPut<'_> {
    pub fn request(&self, b: &MultipartBuilder) -> CfRequest {
        let metadata = MultipartBuilder::metadata_json(
            self.main_module,
            self.compat_date,
            self.bindings,
            self.assets_jwt,
        );
        CfRequest {
            method: worker::Method::Put,
            path: script_put_path(self.account, self.script_name),
            body: CfBody::Raw(b.script_put_body(
                &serde_json::from_str(&metadata).expect("metadata_json always parses as json"),
                self.main_module,
                self.glue,
                self.wasm_name,
                self.wasm,
            )),
            jwt: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_shape_has_no_genlook_secret() {
        let bindings =
            crate::deployer::provision::bindings_for("a1b2c3d4", "uuid-1", "deploy_test");
        let meta: Value = serde_json::from_str(&MultipartBuilder::metadata_json(
            "worker.js",
            "2026-10-19",
            &bindings,
            Some("jwt-token"),
        ))
        .unwrap();
        assert_eq!(meta["main_module"], "worker.js");
        assert_eq!(meta["compatibility_date"], "2026-10-19");
        assert_eq!(meta["assets"]["jwt"], "jwt-token");
        assert!(
            meta.get("assets").is_some(),
            "assets present when jwt given"
        );
        // No jwt -> no assets object in the metadata (the ASSETS binding
        // in the binding list is a different thing).
        let no_assets: Value = serde_json::from_str(&MultipartBuilder::metadata_json(
            "worker.js",
            "2026-10-19",
            &bindings,
            None,
        ))
        .unwrap();
        assert!(no_assets.get("assets").is_none(), "no jwt -> no assets key");
        let b = meta["bindings"].as_array().unwrap();
        assert_eq!(b.len(), 5, "exact 5 bindings (no service binding)");
        let blob = meta.to_string();
        assert!(
            !blob.contains("GENLOOK_API_KEY"),
            "the Genlook key must never appear"
        );
        assert!(
            !blob.contains("GENLOOK"),
            "no Genlook anything in a shop script"
        );
        assert_eq!(b.iter().filter(|x| x["name"] == "DB").count(), 1);
    }

    #[test]
    fn parts_order_is_stable() {
        let order = MultipartBuilder::parts_order();
        assert_eq!(order, ["metadata", "main_module", "wasm"]);
    }

    #[test]
    fn identical_inputs_build_byte_identical_body() {
        let b = MultipartBuilder {
            boundary: "fixed-boundary".into(),
        };
        let bindings =
            crate::deployer::provision::bindings_for("a1b2c3d4", "uuid-1", "deploy_test");
        let put = ScriptPut {
            account: "acc",
            script_name: "shop-a1b2c3d4",
            main_module: "worker.js",
            compat_date: "2026-10-19",
            bindings: &bindings,
            assets_jwt: Some("jwt"),
            wasm_name: "shop.wasm",
            wasm: b"\x00asm",
            glue: "export default {}",
        };
        let one = put.request(&b);
        let two = put.request(&b);
        assert_eq!(
            one.body, two.body,
            "same manifest + fixed boundary = same body"
        );
        assert_eq!(one.path, two.path);
        // And a changed binding set must differ (d1 uuid change shown).
        let bytes_of = |r: &CfRequest| match &r.body {
            CfBody::Raw(raw) => raw.bytes.clone(),
            _ => panic!("script put is raw multipart"),
        };
        let changed = crate::deployer::provision::bindings_for("a1b2c3d4", "uuid-9", "deploy_test");
        let put_changed = ScriptPut {
            bindings: &changed,
            ..put
        };
        let p2 = put_changed.request(&b);
        assert_ne!(
            bytes_of(&one),
            bytes_of(&p2),
            "changed d1 uuid changes metadata"
        );
    }

    #[test]
    fn multipart_layout_metadata_first() {
        let b = MultipartBuilder {
            boundary: "fixed-boundary".into(),
        };
        let meta = serde_json::json!({ "main_module": "worker.js" });
        let raw = b.script_put_body(&meta, "worker.js", "// glue", "shop.wasm", b"\x00asm");
        let text = String::from_utf8_lossy(&raw.bytes);
        assert!(raw
            .content_type
            .starts_with("multipart/form-data; boundary=fixed-boundary"));
        let meta_pos = text.find("name=\"metadata\"").expect("metadata part");
        let glue_pos = text.find("name=\"worker.js\"").expect("glue part");
        let wasm_pos = text.find("name=\"shop.wasm\"").expect("wasm part");
        assert!(meta_pos < glue_pos && glue_pos < wasm_pos, "parts in order");
        assert!(text.contains("Content-Type: application/wasm"));
        assert!(text.contains("application/javascript+module"));
        assert!(text.contains("// glue"));
        assert!(text.ends_with("--fixed-boundary--\r\n"));
    }

    #[test]
    fn asset_upload_body_shape_hash_valued() {
        let b = MultipartBuilder {
            boundary: "upb".into(),
        };
        let raw = b.asset_upload_body(&[("hash0123".into(), "PGh0bWw+".into(), "text/html")]);
        let text = String::from_utf8_lossy(&raw.bytes);
        assert!(text.contains("name=\"hash0123\"; filename=\"hash0123\""));
        assert!(text.contains("text/html"));
        assert!(text.contains("PGh0bWw+"));
        assert!(text.ends_with("--upb--\r\n"));
    }

    #[test]
    fn mime_covers_common_asset_types() {
        assert_eq!(mime_for_path("a/index.HTML"), "text/html");
        assert_eq!(mime_for_path("s.css"), "text/css");
        assert_eq!(mime_for_path("a.Mjs"), "application/javascript");
        assert_eq!(mime_for_path("l.svg"), "image/svg+xml");
        assert_eq!(mime_for_path("f.woff2"), "font/woff2");
        assert_eq!(mime_for_path("d.wasm"), "application/wasm");
        assert_eq!(mime_for_path("u.bin"), "application/octet-stream");
    }
}
