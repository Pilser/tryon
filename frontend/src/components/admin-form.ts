/* components/admin-form.ts — 3-slot bundle upload (owner section of
   studio page). Slot tap picks that slot's photo; previews + validation
   inline; styled slot also accepts the latest try-on result; submit posts
   multipart with the saved owner token. */
import { createProduct, listProducts, ownerLogin, ownerLogout } from "../core/api";
import { esc, money } from "../core/format";
import { loadOwner, saveOwner, loadTimeline } from "../core/store";
import type { Product } from "../core/types";
import { skin } from "../skin";

function el(id: string): HTMLElement {
  const n = document.getElementById(id);
  if (!n) throw new Error("missing #" + id);
  return n;
}
const show = (e: HTMLElement, on: boolean): void => { e.style.display = on ? "" : "none"; };

export function initAdminForm(): void {
  const fail = (m: string): void => { el("bd-err").textContent = m; show(el("bd-err"), true); };
  const loginBox = document.getElementById("owner-login");
  const panel = document.getElementById("owner-panel");
  const gated = !!(loginBox && panel);
  const showPanel = (on: boolean): void => {
    if (!gated) return;
    show(loginBox as HTMLElement, !on); show(panel as HTMLElement, on);
  };
  const loginFail = (m: string): void => { el("bd-login-err").textContent = m; show(el("bd-login-err"), true); };
  const refresh = async (): Promise<void> => {
    if (!gated) { await loadList(); return; }
    const t = loadOwner();
    if (t) {
      try { await ownerLogin(t); showPanel(true); await loadList(); return; }
      catch { saveOwner(""); }
    }
    showPanel(false);
  };
  document.getElementById("bd-login")?.addEventListener("click", () => void (async () => {
    const input = document.getElementById("bd-token") as HTMLInputElement | null;
    const t = (input?.value || "").trim();
    if (!t) { loginFail("Enter your owner token."); return; }
    try {
      await ownerLogin(t);
      saveOwner(t); showPanel(true);
      el("bd-ok").textContent = "Logged in — add products below.";
      show(el("bd-ok"), true);
      await loadList();
    } catch { loginFail("Wrong token — try again."); }
  })());
  document.getElementById("bd-logout")?.addEventListener("click", () => void (async () => {
    await ownerLogout();
    saveOwner("");
    const input = document.getElementById("bd-token") as HTMLInputElement | null;
    if (input) input.value = "";
    showPanel(false);
  })());
  { // Styled slot from latest try-on result (fetched to a File on save).
    document.getElementById("bd-use-result")?.addEventListener("click", () => {
      const last = loadTimeline().find((e) => e.kind === "result" && e.url);
      if (!last) { fail("No try-on result yet — run one above first."); return; }
      const img = el("slot-img-2") as HTMLImageElement;
      img.src = last.url; show(img, true);
      img.dataset.genUrl = last.url;
      el("bd-ok").textContent = "Styled photo set from your last try-on.";
      show(el("bd-ok"), true);
    });
  }
  [0, 1, 2].forEach((i) => {
    (el("file" + i) as HTMLInputElement).addEventListener("change", (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { fail(`Photo ${i + 1} over 10 MB.`); (ev.target as HTMLInputElement).value = ""; return; }
      const img = el("slot-img-" + i) as HTMLImageElement;
      img.src = URL.createObjectURL(f); show(img, true);
    });
  });
  el("btn-photo").addEventListener("click", () => el("file0").click());
  el("btn-cam").addEventListener("click", () => el("filecam").click());
  el("filecam").addEventListener("change", (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f);
    (el("file0") as HTMLInputElement).files = dt.files;
    el("file0").dispatchEvent(new Event("change"));
  });
  el("bundle-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    void (async () => {
      const fd = new FormData(ev.target as HTMLFormElement);
      if (!String(fd.get("title") || "").trim()) { fail("Title is required."); return; }
      const img0 = fd.get("image0");
      if (!(img0 instanceof File) || !img0.size) { fail("Garment photo is required."); return; }
      // Generated styled photo: fetch the (temporary) result URL now.
      const slot2 = document.getElementById("slot-img-2") as HTMLImageElement | null;
      const gen = slot2?.dataset.genUrl || "";
      const img2 = fd.get("image2");
      if ((!(img2 instanceof File) || !img2.size) && gen) {
        try {
          const b = await (await fetch(gen)).blob();
          fd.set("image2", new File([b], "styled.jpg", { type: b.type || "image/jpeg" }));
        } catch { fail("Styled result expired — run try-on again, then save."); return; }
      }
      const btn = el("bd-submit") as HTMLButtonElement;
      btn.disabled = true; btn.textContent = "Uploading…";
      try {
        const j = await createProduct(fd, loadOwner());
        btn.disabled = false; btn.textContent = "Save bundle";
        const ok = el("bd-ok");
        ok.innerHTML = `Saved: <a href="/app/product.html?id=${encodeURIComponent(j.id)}">${esc(j.id)}</a> — now on the landing grid.`;
        show(ok, true);
        await loadList();
      } catch (e) { btn.disabled = false; btn.textContent = "Save bundle"; fail(e instanceof Error ? e.message : String(e)); }
    })();
  });
  async function loadList(): Promise<void> {
    try {
      const list: Product[] = await listProducts();
      skin();
      el("admin-list").innerHTML = list.slice(0, 8).map((p) =>
        `<p><a href="/app/product.html?id=${esc(p.id)}">${esc(p.title)}</a> — ${esc(money(p))}</p>`).join("");
    } catch { /* grid still works without list */ }
  }
  void refresh();
}
