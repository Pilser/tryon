/* pages/studio.ts - compose only: product context + studio + owner bundle.
   Visitor: pick/take photo (instant timeline) + try-on + results on top.
   Owner (??owner=1 or saved token): bundle upload below; styled slot can
   be uploaded OR filled from the latest try-on result. */
import { getProduct, getShop, listProducts } from "../core/api";
import { esc, money } from "../core/format";
import { inquireUrl } from "../core/whatsapp";
import { waIcon } from "../components/whatsapp-icon";
import { duoHTML, armDuo } from "../components/duo";
import { initStudio } from "../components/studio";
import { initOwnerForm } from "../components/owner-form";
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
  if (brand) brand.textContent = shop.shop_name;

  const box = el("st-product");
  const list = await listProducts();
  const target = id || list[0]?.id || "";
  if (!target) {
    box.innerHTML = `<p class="error">No products yet - the owner adds them from this page.</p>`;
  } else {
    const p = id ? await getProduct(target) : list[0];
    document.title = "Try on " + p.title + " - " + shop.shop_name;
    box.innerHTML = `<div class="st-pick-row"><a class="back" href="/">&#8592; all products</a>
      <label class="hint" for="st-prod">Garment:</label>
      <select id="st-prod" class="st-select">${list.map((x) => `<option value="${esc(x.id)}"${x.id === p.id ? " selected" : ""}>${esc(x.title)} - ${esc(money(x))}</option>`).join("")}</select></div>`
      + duoHTML(p);
    armDuo(box);
    // Inquire sits left in the CTA row; Start appears right of it on photo.
    const inq = document.getElementById("st-inquire") as HTMLAnchorElement | null;
    if (inq) {
      inq.href = inquireUrl(shop.owner_whatsapp, shop.shop_name, p.title, p.id);
      inq.innerHTML = waIcon() + "<span>Inquire</span>";
      (inq as HTMLElement).style.display = "";
    }
    el<HTMLSelectElement>("st-prod").addEventListener("change", (ev) => {
      location.href = "/app/studio.html?id=" + encodeURIComponent((ev.target as HTMLSelectElement).value) + (owner ? "&owner=1" : "");
    });
    initStudio(p);
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
