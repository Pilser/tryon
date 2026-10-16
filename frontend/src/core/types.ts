/* Mirrors tryon-shared models (worker/src is source of truth). */
export interface Product {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  image_url: string;
  model_image_url: string;
  styled_image_url: string;
  r2_key: string;
  category: string;
  sizes: string[];
  created_at: string;
}

export interface ShopSettings {
  shop_name: string;
  owner_whatsapp: string;
  currency: string;
  logo_url: string;
}

export interface TimelineEntry {
  kind: "person" | "result";
  thumb: string;
  imageId: string;
  url: string;
  ts: number;
  /* Local-only IndexedDB key for the picked file (never sent to the API).
     Lets ribbon photos survive reloads without uploading on pick. */
  photoKey?: string;
}
