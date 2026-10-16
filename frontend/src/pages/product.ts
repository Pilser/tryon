/* pages/product.ts - compose only: duo + info + share + studio. */
import { getProduct, getShop } from "../core/api";
import { esc, money } from "../core/format";
import { inquireUrl, waShareUrl } from "../core/whatsapp";
import { waIcon } from "../components/whatsapp-icon";
import { loadOwner } from "../core/store";
import { duoHTML, armDuo } from "../components/duo";
import { initStudio } from "../components/studio";
import { skin } from "../skin";

export async function product(): Promise<void> {
  const id = new URLSearchParams(location.search).get("id") || "";
  const p = await getProduct(id);
  const shop = await getShop();
  document.title = p.title + " - " + shop.shop_name;
  const detail = document.getElementById("detail");
  if (!detail) throw new Error("missing #detail");
  const link = location.origin + "/app/product.html?id=" + p.id;
  detail.innerHTML =
    `<article class="detail">${duoHTML(p)}
     <div><h1>${esc(p.title)}</h1><p>${esc(p.description)}</p>
     <div class="row"><span class="price">${esc(money(p))}</span>
     <button id="cp-link" class="btn secondary" type="button">Copy link</button>
     <a class="btn secondary" target="_blank" href="${esc(waShareUrl(location.origin, p.title, p.id))}">Share</a></div>
     </div></article>`;
  armDuo(detail);
  document.getElementById("cp-link")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    const done = (): void => {
      btn.textContent = "Copied";
      window.setTimeout(() => { btn.textContent = "Copy link"; }, 1500);
    };
    const fallback = (): void => {
      const i = document.createElement("input");
      i.value = link;
      document.body.appendChild(i);
      i.select();
      document.execCommand("copy");
      i.remove();
      done();
    };
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(link).then(done).catch(fallback);
    else fallback();
  });
  // Inquire sits left in the CTA row; Start appears right of it on photo.
  const inq = document.getElementById("st-inquire") as HTMLAnchorElement | null;
  if (inq) {
    inq.href = inquireUrl(shop.owner_whatsapp, shop.shop_name, p.title, p.id);
    inq.innerHTML = waIcon() + "<span>Inquire</span>";
    (inq as HTMLElement).style.display = "";
  }
  // Update (owner only): fills the bundle form with this product so the
  // owner can change photos, title or text and re-save the same id.
  const isOwner = new URLSearchParams(location.search).get("owner") === "1" || !!loadOwner();
  const edit = document.getElementById("st-edit") as HTMLButtonElement | null;
  if (edit && isOwner) {
    edit.style.display = "";
    edit.addEventListener("click", () => {
      const fn = (window as unknown as { __bdEdit?: (prod: typeof p) => void }).__bdEdit;
      if (fn) fn(p);
      else document.getElementById("owner")?.scrollIntoView({ behavior: "smooth" });
    });
  }
  initStudio(p);
  skin();
}
