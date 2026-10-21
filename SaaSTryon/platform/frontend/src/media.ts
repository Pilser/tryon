/* media.ts - the baked media of the landing page.

   Everything here is COMMITTED: the photos and the video live in
   `src/assets/tryon/` and are copied into `dist/assets/tryon/` by the
   build, so the page shows them with no live fetch and no third-party
   call. The manifest is the contract between the photo pipeline and
   this page: it names the pairs (before/after), the gallery shots and
   the hero video.

   A path in the manifest is the path the browser asks for on the site
   root ("assets/tryon/x/y.webp"); `mediaUrl` makes it absolute. */
import manifest from "./assets/tryon/manifest.json";

export type Pair = {
  id: string;
  garment: string;
  before: string;
  after: string;
  note?: string;
  /* true when both frames are the SAME photo and only the garment
     changes - those are the pairs a wipe reads correctly. */
  aligned?: boolean;
  license?: string;
};

export type Shot = {
  id: string;
  file: string;
  garment: string;
  role: string;
  w?: number;
  h?: number;
  bytes?: number;
  source?: string;
  license?: string;
  pair?: string;
};

export type Video = {
  file: string;
  poster: string;
  bytes?: number;
  source?: string;
  license?: string;
};

/** The hero shot: the picture the page leads with. */
export type HeroShot = {
  id?: string;
  file: string;
  alt?: string;
  garment?: string;
  role?: string;
  w?: number;
  h?: number;
  bytes?: number;
  source?: string;
  license?: string;
};

export type MediaManifest = {
  generated_at?: string;
  pairs: Pair[];
  gallery: Shot[];
  video: Video | null;
  hero: HeroShot | null;
};

export const MEDIA = manifest as unknown as MediaManifest;

/** A manifest path -> the absolute URL of the baked file. */
export function mediaUrl(path: string): string {
  return "/" + path.replace(/^\/+/, "");
}

/** The video, if the pipeline shipped one. */
export const HERO_VIDEO: Video | null = MEDIA.video ?? null;

/** The pairs that have both sides (a slider needs both). */
export const PAIRS: Pair[] = (MEDIA.pairs ?? []).filter(
  (p) => p && p.before && p.after,
);

/**
 * The pairs the slider shows: the ALIGNED ones first (both frames are
 * the same photo, only the garment changes - the wipe reads exactly
 * like the product trying itself on), then the rest.
 */
export const FLIP_PAIRS: Pair[] = [
  ...PAIRS.filter((p) => p.aligned),
  ...PAIRS.filter((p) => !p.aligned),
];

/**
 * The gallery shots: the baked photos spread across the page. The
 * "before" frames live in the slider, and the tiny crops (the garment
 * cut-outs of the template sheets) would only look blurry - both are
 * left out.
 */
export const GALLERY: Shot[] = (MEDIA.gallery ?? []).filter(
  (s) => s && s.file && s.role !== "before" && (s.w ?? 0) >= 300,
);

/** The label we show for a shot's role. */
export function roleLabel(role: string): string {
  switch (role) {
    case "model":
      return "on the model";
    case "before":
      return "the product";
    case "garment":
      return "the garment";
    default:
      return "";
  }
}
