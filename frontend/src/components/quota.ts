/* components/quota.ts - shopper side of the free try-on allowance: the
   banner shown when the tries are used up (collect name + WhatsApp, hand
   over the owner number, take the 4-character unlock code). It starts as a
   one-line bar so the studio still fits the phone screen, and expands when
   the shopper acts (or right after a blocked try-on). */
import * as stylex from "@stylexjs/stylex";
import { redeemToken, saveContact } from "../core/api";
import { deviceId, allowanceLabel, type Allowance } from "../core/device";
import { esc } from "../core/format";
import { waIcon } from "./whatsapp-icon";
import { skin } from "../skin";
import { quota as s } from "../styles/dash.stylex";

const cx = (...ss: any[]): string =>
  ss.filter(Boolean).map((x) => (typeof x === "string" ? x : stylex.props(x).className || "")).join(" ");

const el = (id: string): HTMLElement | null => document.getElementById(id);

/* st-quota is in the studio shell; missing on other pages = no banner. */
export function paintQuota(a: Allowance | null, exceeded = false, open = false): void {
  const box = el("st-quota");
  if (!box) return;
  if (!a) {
    box.innerHTML = "";
    box.style.display = "none";
    return;
  }
  let expanded = open;

  const render = (): void => {
    const shop = (document.querySelector(".brand")?.textContent || "the shop").trim();
    const owner = a.owner_whatsapp || "";
    const blocked = !!a.blocked;
    const waText = encodeURIComponent(
      blocked
        ? `Hi ${shop}! My device was blocked from try-ons. My number is ${a.whatsapp || "..."}. Please help me.`
        : `Hi ${shop}! I used all my free try-ons. My number is ${a.whatsapp || "..."}${a.name ? " (" + a.name + ")" : ""}. Please send me an unlock code.`,
    );
    const waHref = "https://wa.me/" + owner + "?text=" + waText;
    const done = !!a.whatsapp;
    box.innerHTML = `
      <div class="${cx(s.head)}">
        <p class="${cx(s.title)}">${blocked
          ? "Blocked by the shop"
          : exceeded
            ? "Free try-ons used up"
            : "Free try-ons: " + esc(allowanceLabel(a))}</p>
        <button class="btn secondary" id="st-q-toggle" type="button">${expanded ? "Hide" : "Details"}</button>
      </div>
      <div id="st-q-body" class="${cx(s.panel)}" style="${expanded ? "" : "display:none"}">
        ${
          blocked
            ? `<p class="${cx(s.body)}">This device was <span class="${cx(s.strong)}">blocked by the shop</span>, so try-ons are paused here. If you think this is a mistake, message the shop${
                owner ? ` at <span class="${cx(s.strong)}">+${esc(owner)}</span>` : ""
              }.</p>
        <div class="${cx(s.form)}">${done && owner ? `<a class="${cx(s.wa)}" href="${waHref}" target="_blank" rel="noopener">${waIcon(17)} Message the shop</a>` : ""}</div>`
            : `<p class="${cx(s.body)}">You get <span class="${cx(s.strong)}">${a.free_tries}</span> free try-ons on this
          device and you have used <span class="${cx(s.strong)}">${a.used}</span>.
          ${owner
            ? `Send your number to the shop (WhatsApp <span class="${cx(s.strong)}">+${esc(owner)}</span>) and they will send you a 4-character unlock code.`
            : `Ask the shop for a 4-character unlock code.`}</p>
        <div class="${cx(s.form)}">
          <input class="${cx(s.input)}" id="st-q-name" placeholder="Your name (optional)" value="${esc(a.name)}"/>
          <input class="${cx(s.input)}" id="st-q-wa" inputmode="tel" placeholder="Your WhatsApp number" value="${esc(a.whatsapp)}"/>
          <button class="btn primary" id="st-q-send" type="button">${done ? "Update number" : "Send to shop"}</button>
          ${done && owner ? `<a class="${cx(s.wa)}" id="st-q-chat" href="${waHref}" target="_blank" rel="noopener">${waIcon(17)} Message the shop</a>` : ""}
        </div>
        <div class="${cx(s.row)}">
          <input class="${cx(s.codeInput)}" id="st-q-code" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off"/>
          <button class="btn primary" id="st-q-redeem" type="button">Unlock try-ons</button>
          <p class="${cx(s.sub)}">Have a code from the shop? Type it and unlock instantly.</p>
        </div>`
        }
        <p class="${cx(s.ok)}" id="st-q-ok" style="display:none"></p>
        <p class="${cx(s.err)}" id="st-q-err" style="display:none"></p>
      </div>`;
    box.style.display = "";
    // Injected after the shell was skinned: fuse the literal classes.
    skin(box.parentElement ?? box);
    wire();
  };

  const say = (msg: string): void => {
    const ok = el("st-q-ok");
    const err = el("st-q-err");
    if (ok) { ok.textContent = msg; ok.style.display = ""; }
    if (err) err.style.display = "none";
  };
  const fail = (msg: string): void => {
    const err = el("st-q-err");
    const ok = el("st-q-ok");
    if (err) { err.textContent = msg; err.style.display = ""; }
    if (ok) ok.style.display = "none";
  };
  /* The studio owns the allowance state (button + banner), so report the
     new snapshot to it instead of repainting here. */
  const announce = (next: Allowance, note: string): void => {
    document.dispatchEvent(new CustomEvent("quota-changed", { detail: { allowance: next, note } }));
  };

  const wire = (): void => {
    el("st-q-toggle")?.addEventListener("click", () => {
      expanded = !expanded;
      render();
    });
    el("st-q-send")?.addEventListener("click", () => void (async () => {
      const name = (el("st-q-name") as HTMLInputElement | null)?.value || "";
      const wa = (el("st-q-wa") as HTMLInputElement | null)?.value || "";
      if (wa.replace(/\D/g, "").length < 9) { fail("Enter your full WhatsApp number (with country code)."); return; }
      try {
        const next = await saveContact(deviceId(), name, wa);
        say("Saved.");
        announce(next, "Number saved. Tap message to reach the shop, or enter the code they send you.");
      } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
    })());
    el("st-q-redeem")?.addEventListener("click", () => void (async () => {
      const code = ((el("st-q-code") as HTMLInputElement | null)?.value || "").trim().toUpperCase();
      if (code.length !== 4) { fail("The code is 4 characters."); return; }
      try {
        const next = await redeemToken(deviceId(), code);
        if (next.remaining === 0 && next.bonus <= 0 && next.bonus_until_ms <= Date.now()) {
          fail("Code accepted, but there is still nothing left. Ask the shop again.");
          return;
        }
        announce(next, "Unlocked: " + allowanceLabel(next) + ".");
      } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
    })());
    el("st-q-code")?.addEventListener("input", (ev) => {
      const i = ev.target as HTMLInputElement;
      i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    });
  };

  render();
}
