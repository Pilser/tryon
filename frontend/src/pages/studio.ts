/* pages/studio.ts - compose only: product context + studio + owner bundle.
   Visitor: pick/take photo (instant timeline) + try-on + results on top.
   Owner (??owner=1 or saved token): bundle upload below; styled slot can
   be uploaded OR filled from the latest try-on result. */
import { getProduct, getShop, listProducts, listCategories } from "../core/api";
import { inquireUrl } from "../core/whatsapp";
import { waIcon } from "../components/whatsapp-icon";
import { duoHTML, armDuo } from "../components/duo";
import { ribbonCats, catRibbonHTML, armCatRibbon } from "../components/cat-ribbon";
import { initStudio } from "../components/studio";
import { initDashboard } from "../components/dashboard";
import { initOwnerForm } from "../components/owner-form";
import { brandHTML } from "../core/format";
import { loadOwner } from "../core/store";
import { skin } from "../skin";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n as T;
}

export async function studio(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const id = q.get("id") || "";
  const owner = q.get("owner") === "1" || !!loadOwner();
  const shop = await getShop();
  const brand = document.querySelector(".brand");
  if (brand) brand.innerHTML = brandHTML(shop);

  const box = el("st-product");
  const list = await listProducts();
  const target = id || list[0]?.id || "";
  if (!target) {
    box.innerHTML = `<p class="error">No products yet - the owner adds them from this page.</p>`;
  } else {
    const p = id ? await getProduct(target) : list[0];
    document.title = "Try on " + p.title + " - " + shop.shop_name;
    box.innerHTML = `<div id="st-cats"></div>`
      + duoHTML(p);
    armDuo(box);
    { // Category icon ribbon: collapsed icons, tap to expand search + grid.
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
      window.addEventListener("cats-changed", () => void paintCats());
    }
    // Inquire sits left in the CTA row; Start appears right of it on photo.
    const inq = document.getElementById("st-inquire") as HTMLAnchorElement | null;
    if (inq) {
      inq.href = inquireUrl(shop.owner_whatsapp, shop.shop_name, p.title, p.id);
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
  }

  const own = document.getElementById("owner");
  const gate = document.getElementById("owner-gate");
  if (own) {
    if (owner) {
      own.style.display = ""; initOwnerForm(); initDashboard();
      if (gate) gate.style.display = "none";
    } else own.style.display = "none";
  }
  skin();
}
