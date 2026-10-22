/* pages/studio.ts - compose only: product context + studio + owner bundle.
   Visitor: pick/take photo (instant timeline) + try-on + results on top.
   Owner (??owner=1 or saved token): bundle upload below; styled slot can
   be uploaded OR filled from the latest try-on result.
   Boot fan: shop + all-products + a deep-linked product now resolve
   TOGETHER (the old chain made 4-5 sequential round trips); the cache a
   previous page left behind paints first. */
import { getProduct, getShop, listProducts, listCategories } from "../core/api";
import { all, shop, shopSync, productsSync, productSync, invalidateProducts } from "../core/shop-cache";
import { inquireUrl, shareUrl } from "../core/whatsapp";
import { waIcon } from "../components/whatsapp-icon";
import { duoHTML, armDuo } from "../components/duo";
import { skStudioHTML } from "../components/skeleton";
import { ribbonCats, catRibbonHTML, armCatRibbon } from "../components/cat-ribbon";
import { initStudio } from "../components/studio";
import { initOwnerForm } from "../components/owner-form";
import { brandHTML } from "../core/format";
import { loadOwner } from "../core/store";
import { skin } from "../skin";
import type { Product, ShopSettings } from "../core/types";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

export async function studio(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const id = q.get("id") || "";
  const owner = q.get("owner") === "1" || !!loadOwner();
  const brand = document.querySelector(".brand");

  // instant paint from the cache of the previous page
  const cachedShop = shopSync();
  if (brand && cachedShop) brand.innerHTML = brandHTML(cachedShop);
  const box = el("st-product");
  const cachedList = productsSync();
  const cachedP = id ? productSync(id) : null;
  if (!id && cachedList?.length && cachedShop) {
    await paintProduct(cachedList[0], cachedShop, owner, q, cachedList, true);
  } else if (cachedP && cachedShop) {
    await paintProduct(cachedP, cachedShop, owner, q, cachedList ?? [], true);
  } else {
    box.innerHTML = skStudioHTML(); // shimmer silhouette until data arrives
  }

  // one parallel round trip replaces the cached paint
  const [fetchedShop, list, deep] = await Promise.all([shop(), all(), id ? getProduct(id) : Promise.resolve(null)]);
  if (brand) brand.innerHTML = brandHTML(fetchedShop);

  const target = id || list[0]?.id || "";
  if (!target) {
    box.innerHTML = `<p class="error">No products yet - the owner adds them from this page.</p>`;
  } else {
    const p = (deep as Product | null) ?? (list[0] as Product);
    await paintProduct(p, fetchedShop, owner, q, list, false);
  }

  const own = document.getElementById("owner");
  const gate = document.getElementById("owner-gate");
  if (own) {
    if (owner) {
      own.style.display = ""; initOwnerForm();
      if (gate) gate.style.display = "none";
    } else own.style.display = "none";
  }
  skin();
}

/** The whole product block: duo + category ribbon + studio wiring.
    `tentative` marks the from-cache paint (listeners rebuild when the
    fresh paint follows; the quota handler is idempotent). */
async function paintProduct(
  p: Product,
  shopS: ShopSettings,
  owner: boolean,
  q: URLSearchParams,
  list: Product[],
  tentative: boolean,
): Promise<void> {
  void tentative;
  document.title = "Try on " + p.title + " - " + shopS.shop_name;
  const box = el("st-product");
  box.innerHTML = `<div id="st-cats"></div>`
    + duoHTML(p);
  armDuo(box);

  // Category icon ribbon: collapsed icons, tap to expand search + grid.
  // Repaints on cats-changed (owner adds/updates a category below).
  const paintCats = async (): Promise<void> => {
    const zone = document.getElementById("st-cats");
    if (!zone) return;
    const fresh = await listProducts();
    const cats = ribbonCats(await listCategories(), fresh.length ? fresh : list);
    if (!cats.length) { zone.innerHTML = ""; return; }
    zone.innerHTML = catRibbonHTML(cats);
    armCatRibbon(zone, cats, fresh.length ? fresh : list, owner);
  };
  await paintCats();
  const w = window as unknown as { __studioCats?: () => void };
  if (w.__studioCats) window.removeEventListener("cats-changed", w.__studioCats);
  w.__studioCats = () => void paintCats();
  window.addEventListener("cats-changed", w.__studioCats);

  // Inquire sits left in the CTA row; Start appears right of it on photo.
  const inq = document.getElementById("st-inquire") as HTMLAnchorElement | null;
  if (inq) {
    inq.href = inquireUrl(shopS.owner_whatsapp, shopS.shop_name, p.title, shareUrl(location.origin, p.id));
    inq.innerHTML = waIcon() + "<span>Inquire</span>";
    (inq as HTMLElement).style.display = "";
  }
  // Update (owner only): fills the bundle form with this product so the
  // owner can change photos, title or text and re-save the same id.
  // Shown only with a saved login token (?owner=1 alone is not enough).
  const edit = document.getElementById("st-edit") as HTMLButtonElement | null;
  if (edit) {
    edit.addEventListener("click", () => {
      if (!loadOwner()) {
        document.getElementById("owner")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      const fn = (window as unknown as { __bdEdit?: (prod: typeof p) => void }).__bdEdit;
      if (fn) fn(p);
      else document.getElementById("owner")?.scrollIntoView({ behavior: "smooth" });
    });
    if (loadOwner()) edit.style.display = "";
  }
  initStudio(p);
  // Deep link from product-page Update: fill the form for this product.
  if (q.get("edit") === "1" && loadOwner()) {
    const fn = (window as unknown as { __bdEdit?: (prod: typeof p) => void }).__bdEdit;
    if (fn) window.setTimeout(() => fn(p), 0);
  }
  void q; void tentative;
}
