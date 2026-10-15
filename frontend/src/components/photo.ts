/* components/photo.ts — client photo gate. WASM (imgpipe crate, Rust)
   is the sanctioned processor; canvas is the fallback until the CI-built
   imgpipe glue is present at /app/imgpipe/. No other code processes pixels. */
import { mb } from "../core/format";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600, MIN_DIM = 256;

export interface Prepared {
  blob: Blob;
  mime: string;
  note: string;
  heic: boolean;
  width: number;
  height: number;
}

interface Imgpipe {
  prepare_image(data: Uint8Array, mime: string): {
    bytes: Uint8Array; mime: string; width: number; height: number; processed: boolean;
  };
}

let wasm: Imgpipe | null | undefined = undefined;

async function loadWasm(): Promise<Imgpipe | null> {
  if (wasm !== undefined) return wasm;
  try {
    // @ts-expect-error dynamic runtime URL outside module graph
    const mod = (await import("/app/imgpipe/imgpipe.js")) as {
      default: (url?: string) => Promise<unknown>;
    } & Imgpipe;
    await mod.default("/app/imgpipe/imgpipe_bg.wasm");
    wasm = mod as Imgpipe;
  } catch {
    wasm = null;
  }
  return wasm;
}

function validate(file: File): void {
  if (file.type && !ACCEPTED.includes(file.type)) throw new Error("Use JPEG, PNG, WebP or HEIC.");
  if (file.size > MAX_BYTES) throw new Error("Photo over 10 MB.");
}

function canvasPrep(file: File): Promise<Prepared> {
  return new Promise((resolve, reject) => {
    if (file.type === "image/heic" || file.type === "image/heif") {
      return resolve({ blob: file, mime: file.type, note: `HEIC original sent as-is (${mb(file.size)})`, heic: true, width: 0, height: 0 });
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
        return resolve({ blob: file, mime: file.type, note: `${w}x${h} · ${mb(file.size)}`, heic: false, width: w, height: h });
      }
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      c.getContext("2d")!.drawImage(img, 0, 0, tw, th);
      c.toBlob((b) => resolve({
        blob: b!, mime: "image/jpeg",
        note: `resized in browser to ${tw}x${th}`, heic: false, width: tw, height: th,
      }), "image/jpeg", 0.85);
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}

export async function prepFile(file: File): Promise<Prepared> {
  validate(file);
  const pipe = await loadWasm();
  if (pipe) {
    const buf = new Uint8Array(await file.arrayBuffer());
    try {
      const p = pipe.prepare_image(buf, file.type || "image/jpeg");
      const note = p.processed
        ? `resized in WASM to ${p.width}x${p.height}`
        : `${p.width || "?"}x${p.height || "?"} · ${mb(p.bytes.length)}`;
      return {
        blob: new Blob([p.bytes as BlobPart], { type: p.mime }),
        mime: p.mime, note, heic: false, width: p.width, height: p.height,
      };
    } catch {
      /* fall through to canvas */
    }
  }
  return canvasPrep(file);
}

export function thumbOf(img: HTMLImageElement, cb: (url: string) => void): void {
  const s = 128 / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  cb(c.toDataURL("image/jpeg", 0.7));
}

export function previewURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}
