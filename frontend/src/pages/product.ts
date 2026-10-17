/* pages/product.ts - compose only: duo + info + share + studio. */
import { getProduct, getShop } from "../core/api";
import { esc, money, brandHTML, sizesHTML } from "../core/format";
import { inquireUrl, waShareUrl } from "../core/whatsapp";
import { waIcon } from "../components/whatsapp-icon";
import { linkIcon, shareIcon, downloadIcon } from "../components/icons";
import { loadOwner, loadTimeline } from "../core/store";
import { duoHTML, armDuo } from "../components/duo";
import { initStudio } from "../components/studio";
import { skin } from "../skin";

export async function product(): Promise<void> {
  const id = new URLSearchParams(location.search).get("id") || "";
  const p = await getProduct(id);
  const shop = await getShop();
  document.title = p.title + " - " + shop.shop_name;
  const brand = document.querySelector(".brand");
  if (brand) brand.innerHTML = brandHTML(shop);
  const detail = document.getElementById("detail");
  if (!detail) throw new Error("missing #detail");
  const link = location.origin + "/app/product.html?id=" + p.id;
  detail.innerHTML =
    `<article class="detail">${duoHTML(p)}
     <div><div class="detail-head"><h1>${esc(p.title)}</h1>${sizesHTML(p.sizes)}</div><p>${esc(p.description)}</p>
     <div class="row"><span class="price">${esc(money(p))}</span>
     <button id="cp-link" class="icon-btn" type="button" title="Copy link" aria-label="Copy link">${linkIcon()}</button>
     <a id="wa-share" class="icon-btn" target="_blank" title="Share" aria-label="Share" href="${esc(waShareUrl(location.origin, p.title, p.id))}">${shareIcon()}</a>
     <button id="dl-first" class="icon-btn" type="button" title="Download latest photo" aria-label="Download latest photo">${downloadIcon()}</button></div>
     </div></article>`;
  armDuo(detail);
  document.getElementById("cp-link")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    const done = (): void => {
      btn.style.opacity = ".5";
      window.setTimeout(() => { btn.style.opacity = ""; }, 1200);
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
  // Downloads the ribbon's first (newest) photo: person thumbs save
  // directly, remote results via fetch with a new-tab fallback.
  document.getElementById("dl-first")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    const first = loadTimeline()[0];
    if (!first) return;
    const src = first.kind === "person" ? first.thumb : first.url;
    if (!src) return;
    const save = (href: string): void => {
      const a = document.createElement("a");
      a.href = href; a.download = "tryon-photo.jpg"; a.click();
    };
    if (src.startsWith("data:")) { save(src); return; }
    btn.style.opacity = ".5";
    void fetch(src).then(async (r) => {
      const b = await r.blob();
      save(URL.createObjectURL(b));
      btn.style.opacity = "";
    }).catch(() => {
      btn.style.opacity = "";
      window.open(src, "_blank", "noopener");
    });
  });
  // Inquire sits left in the CTA row; Start appears right of it on photo.
  const inq = document.getElementById("st-inquire") as HTMLAnchorElement | null;
  if (inq) {
    inq.href = inquireUrl(shop.owner_whatsapp, shop.shop_name, p.title, link);
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
        location.href = "/app/studio.html?owner=1";
        return;
      }
      location.href = "/app/studio.html?id=" + encodeURIComponent(p.id) + "&owner=1&edit=1";
    });
    if (loadOwner()) edit.style.display = "";
  }
  initStudio(p);
  skin();
}
