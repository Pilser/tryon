/* pages/product.ts - compose only: duo + info + share + studio. */
import { getProduct, getShop } from "../core/api";
import { esc, money } from "../core/format";
import { inquireUrl, waShareUrl } from "../core/whatsapp";
import { waIcon } from "../components/whatsapp-icon";
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
  detail.innerHTML =
    `<article class="detail">${duoHTML(p)}
     <div><h1>${esc(p.title)}</h1><p>${esc(p.description)}</p><p class="price">${esc(money(p))}</p>
     <div class="row"><a class="btn wa" target="_blank" href="${esc(inquireUrl(shop.owner_whatsapp, shop.shop_name, p.title, p.id))}">${waIcon()}Inquire on WhatsApp</a></div>
     <div class="share-row"><input class="share-link" readonly value="${esc(location.origin + "/app/product.html?id=" + p.id)}" onclick="this.select()"/>
     <a class="btn" target="_blank" href="${esc(waShareUrl(location.origin, p.title, p.id))}">Share</a></div>
     </div></article>`;
  armDuo(detail);
  initStudio(p);
  skin();
}
