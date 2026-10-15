/* components/photo.js — client photo gate: validate, downscale,
   thumbnail. Pure-ish helpers around canvas; no DOM writes except preview
   URLs the caller owns (caller must revoke). */
import { mb } from "../core/format.js";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600, MIN_DIM = 256;

export function prepFile(file) {
  return new Promise((resolve, reject) => {
    if (file.type && !ACCEPTED.includes(file.type)) return reject(new Error("Use JPEG, PNG, WebP or HEIC."));
    if (file.size > MAX_BYTES) return reject(new Error("Photo over 10 MB."));
    if (file.type === "image/heic" || file.type === "image/heif") {
      return resolve({ blob: file, mime: file.type, note: `HEIC original sent as-is (${mb(file.size)})`, heic: true });
    }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w < MIN_DIM || h < MIN_DIM) return reject(new Error("Photo too small — use at least 256x256."));
      let tw = w, th = h;
      const m = Math.max(w, h);
      if (m > MAX_EDGE) { const s = MAX_EDGE / m; tw = Math.round(w * s); th = Math.round(h * s); }
      if (tw === w && file.type === "image/jpeg") {
        return resolve({ blob: file, mime: file.type, note: `${w}x${h} · ${mb(file.size)}` });
      }
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      c.getContext("2d").drawImage(img, 0, 0, tw, th);
      c.toBlob((b) => resolve({ blob: b, mime: "image/jpeg", note: `resized in browser to ${tw}x${th}` }), "image/jpeg", 0.85);
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}

export function thumbOf(img, cb) {
  const s = 128 / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  cb(c.toDataURL("image/jpeg", 0.7));
}

export function previewURL(blob) {
  return URL.createObjectURL(blob);
}
