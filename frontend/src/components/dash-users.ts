/* components/dash-users.ts - the Users tab: who is using the shop, what
   each device costs in object storage, and the three things the owner does
   about it - look at their backed-up photos, give a code, block the device.

   Layout follows the workspace kit: one card holding hairline-separated
   rows, actions in their own row (full width on phones) so nothing looks
   glued together. The photo folder opens INSIDE the row it belongs to and
   scrolls itself into view - with hundreds of users, a panel at the bottom
   of the list would never be found. */
import {
  deletePhotos,
  deviceBlock,
  devicePhotos,
  mintTokens,
  photoBlob,
  type StoredPhoto,
  type UsageOut,
} from "../core/api";
import { esc, size } from "../core/format";
import { dash as s } from "../styles/dash.stylex";
import { ui as u } from "../styles/ui.stylex";
import { cx, n, short, when, who, type Device } from "./dash-util";

/** Open folder: a device id, or "" for every device (null = closed). */
interface Folder {
  device: string | null;
  label: string;
  days: number;
  photos: StoredPhoto[];
  bytes: number;
  loading: boolean;
}
const folder: Folder = { device: null, label: "", days: 30, photos: [], bytes: 0, loading: false };
let objectUrls: string[] = [];
/** The code handed to each device most recently (shown in their row). */
const given = new Map<string, string>();
let copied = "";

const DAYS = [7, 30, 90];

function copyBtn(code: string): string {
  return `<button class="btn secondary ${cx(u.btnIcon)}" type="button" data-copycode="${esc(code)}" title="Copy code" aria-label="Copy code">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>
    ${copied === code ? "Copied" : "Copy"}</button>`;
}

/** "Amina's code ABCD - copy" once a code was handed out in this row. */
function givenNote(d: Device): string {
  const code = given.get(d.id);
  if (!code) return "";
  const owner = who(d.id, d.name, d.whatsapp);
  return `<p class="${cx(u.inlineNote)}">Code for ${esc(owner)}:
    <span class="${cx(s.code)}">${esc(code)}</span> ${copyBtn(code)}
    <span class="${cx(u.meta)}">send it on WhatsApp - it works once</span></p>`;
}

function storageChip(d: Device): string {
  if (!d.photo_count) return `<span class="${cx(s.chipUsed)}">no photos stored</span>`;
  return `<span class="${cx(s.chipFree)}">${n(d.photo_count)} photo${d.photo_count === 1 ? "" : "s"} · ${esc(size(d.photo_bytes))}</span>`;
}

/** The folder panel, rendered inside the row that opened it. */
function folderPanel(): string {
  if (folder.device === null) return "";
  const scope = folder.device ? `device ${short(folder.device)}` : "all devices";
  const who_ = folder.label ? " · " + folder.label : "";
  return `<div class="${cx(s.folder)}" id="dash-folder">
    <div class="${cx(u.header)}">
      <p class="${cx(u.cardTitle)}">Backed-up photos · ${esc(scope)}${esc(who_)}</p>
      <button class="btn secondary" type="button" id="dash-folder-close">Close</button>
    </div>
    <p class="${cx(u.rowSub)}">${folder.loading
      ? "Loading…"
      : `${esc(size(folder.bytes))} in ${n(folder.photos.length)} photo${folder.photos.length === 1 ? "" : "s"}. Delete the old ones to keep storage small.`}</p>
    <div class="${cx(s.photoGrid)}">${folder.loading ? "" : folder.photos.map((p, i) => `
      <div class="${cx(s.photo)}">
        <img class="${cx(s.photoImg)}" data-shot="${i}" alt="stored photo" loading="lazy"/>
        <span class="${cx(s.photoMeta)}">${esc(new Date(p.created_ms).toLocaleDateString())}<br/>${esc(size(p.bytes))}</span>
      </div>`).join("")}</div>
    <div class="${cx(s.filters)}">
      <span class="${cx(s.label)}">Delete</span>
      ${DAYS.map((d) => `<button class="${cx(s.filter, folder.days === d && s.filterOn)}" type="button" data-folder-days="${d}">older than ${d} days</button>`).join("")}
    </div>
    <div class="${cx(u.btnRow)}">
      <button class="btn danger ${cx(u.btnGrow)}" type="button" data-folder-del="old">Delete older than ${n(folder.days)} days</button>
      <button class="btn danger ${cx(u.btnGrow)}" type="button" data-folder-del="all">Delete all in this folder</button>
    </div>
    <p class="${cx(u.meta)}">Deleted photos are gone for good; the shopper keeps their own copy on their phone.</p>
  </div>`;
}

function deviceRow(d: Device, free: number): string {
  const window_ = d.bonus_until_ms > Date.now();
  const spent = d.used >= free && !window_ && d.bonus <= 0;
  const blocked = !!d.blocked;
  const name = d.name || d.whatsapp || "Guest " + short(d.id);
  const chips = [
    `<span class="${cx(spent ? s.chipUsed : s.chipFree)}">${n(d.used)} tries</span>`,
    d.bonus > 0 ? `<span class="${cx(s.chipPaid)}">+${n(d.bonus)} paid</span>` : "",
    window_ ? `<span class="${cx(s.chipPaid)}">unlimited</span>` : "",
    blocked ? `<span class="${cx(s.chipBad)}">blocked</span>` : "",
    storageChip(d),
    d.whatsapp
      ? `<a class="${cx(s.chip)}" href="https://wa.me/${esc(d.whatsapp)}" target="_blank" rel="noopener">+${esc(d.whatsapp)}</a>`
      : `<span class="${cx(s.chipUsed)}">no number yet</span>`,
  ].join("");
  const open = folder.device === d.id;
  return `<div class="${cx(u.row)}">
    <div class="${cx(u.rowMain)}">
      <p class="${cx(u.rowTitle)}">${esc(name)}</p>
      <p class="${cx(u.rowSub)}">seen ${esc(when(d.last_seen_ms))} · device ${esc(short(d.id))}</p>
      <div class="${cx(s.chips)}">${chips}</div>
      ${givenNote(d)}
    </div>
    <div class="${cx(u.btnRow)} ${cx(u.btnGrow)}">
      <button class="btn secondary ${cx(u.btnGrow)}" type="button" data-photos="${esc(d.id)}" data-who="${esc(name)}">
        ${open ? "Hide photos" : `Photos${d.photo_count ? ` (${n(d.photo_count)})` : ""}`}</button>
      <button class="btn secondary ${cx(u.btnGrow)}" type="button" data-give="${esc(d.id)}">Give code</button>
      <button class="btn ${blocked ? "" : "danger"} ${cx(u.btnGrow)}" type="button" data-block="${esc(d.id)}" data-on="${blocked ? "1" : "0"}">${blocked ? "Unblock" : "Block"}</button>
    </div>
  </div>
  ${open ? `<hr class="${cx(u.hairline)}"/>${folderPanel()}` : ""}`;
}

/** Users tab: storage summary, the code-value control, then the list. */
export function usersTab(d: UsageOut, giveValue: string): string {
  const blocked = d.devices.filter((x) => x.blocked).length;
  const allOpen = folder.device === "" ? folderPanel() : "";
  const empty = `<p class="${cx(u.empty)}">No devices yet - a device appears here the first time someone opens the studio.</p>`;
  return `<div class="${cx(u.card)}">
      <div class="${cx(u.header)}">
        <div>
          <p class="${cx(u.statValue)}">${esc(size(d.photos_bytes))}</p>
          <p class="${cx(u.rowSub)}">in ${n(d.photos_total)} backed-up photo${d.photos_total === 1 ? "" : "s"} across
            ${n(d.devices_total)} device${d.devices_total === 1 ? "" : "s"}${blocked ? ` · ${n(blocked)} blocked` : ""}</p>
        </div>
        <button class="btn secondary" type="button" id="dash-folder-all">${folder.device === "" ? "Hide all photos" : "Review all photos"}</button>
      </div>
      <hr class="${cx(u.hairline)}"/>
      <div class="${cx(u.header)}">
        <div>
          <p class="${cx(u.cardTitle)}">Give a code to one user</p>
          <p class="${cx(u.rowSub)}">Pick how many try-ons the code gives, tap <b>Give code</b> on their
            row, then send them the code that appears there.</p>
        </div>
        <div class="${cx(u.btnRow)}">
          <input class="${cx(s.num)}" id="dash-give-val" type="number" min="1" max="10000" value="${esc(giveValue)}" aria-label="try-ons per code"/>
          <span class="${cx(u.meta)}">try-ons per code</span>
        </div>
      </div>
    </div>

    ${allOpen}

    <div class="${cx(u.cardFlush)}">
      <div class="${cx(u.cardHead)}">
        <p class="${cx(u.cardTitle)}">Users (${n(d.devices_total)})</p>
        <span class="${cx(u.meta)}">newest activity first</span>
      </div>
      <hr class="${cx(u.hairline)}"/>
      <div class="${cx(u.rows)}">${
        d.devices.length
          ? d.devices
              .map((x, i) => (i ? `<hr class="${cx(u.hairline)}"/>` : "") + deviceRow(x, d.free_tries))
              .join("")
          : empty
      }</div>
    </div>`;
}

interface ArmOpts {
  scope: () => HTMLElement;
  token: () => string;
  repaint: () => void;
  after: () => Promise<void>;
  fail: (m: string) => void;
  note: (m: string) => void;
}

async function loadFolder(opts: ArmOpts): Promise<void> {
  folder.loading = true;
  opts.repaint();
  const res = await devicePhotos(opts.token(), folder.device || "");
  folder.photos = res.photos;
  folder.bytes = res.bytes;
  folder.loading = false;
  opts.repaint();
  // The panel belongs to the row just tapped: bring it into view instead
  // of leaving the owner to hunt for it further down a long list.
  const panel = opts.scope().querySelector<HTMLElement>("#dash-folder");
  panel?.scrollIntoView({ block: "center", behavior: "smooth" });
  const imgs = panel?.querySelectorAll<HTMLImageElement>("[data-shot]");
  await Promise.all(folder.photos.map(async (p, i) => {
    const url = await photoBlob(opts.token(), p.key);
    if (!url) return;
    objectUrls.push(url);
    const img = imgs?.[i];
    if (img) img.src = url;
  }));
}

function clearThumbs(): void {
  for (const u_ of objectUrls) URL.revokeObjectURL(u_);
  objectUrls = [];
}

/** Drops the open folder (used when leaving the tab). */
export function resetFolder(): void {
  folder.device = null;
  folder.label = "";
  folder.photos = [];
  folder.bytes = 0;
  clearThumbs();
}

function closeFolder(opts: ArmOpts): void {
  resetFolder();
  opts.repaint();
}

/** Wires the users tab (photos, give code, copy code, block). */
export function armUsers(opts: ArmOpts): void {
  const scope = opts.scope();
  const giveVal = (): string => (scope.querySelector("#dash-give-val") as HTMLInputElement | null)?.value || "3";
  // The row's own label travels with its button: no class hunting needed.
  const rowName = (id: string): string =>
    (scope.querySelector(`[data-photos="${id}"]`) as HTMLElement | null)?.dataset.who?.trim() || "";
  scope.querySelector("#dash-folder-all")?.addEventListener("click", () => void (async () => {
    if (folder.device === "") return closeFolder(opts);
    folder.device = "";
    folder.label = "";
    await loadFolder(opts);
  })());
  scope.querySelectorAll("[data-photos]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const id = (b as HTMLElement).dataset.photos || "";
      if (folder.device === id) return closeFolder(opts);
      clearThumbs();
      folder.device = id;
      folder.label = rowName(id);
      await loadFolder(opts);
    })()),
  );
  scope.querySelectorAll("[data-folder-days]").forEach((b) =>
    b.addEventListener("click", () => {
      folder.days = Number((b as HTMLElement).dataset.folderDays) || 30;
      opts.repaint();
    }),
  );
  scope.querySelector("#dash-folder-close")?.addEventListener("click", () => closeFolder(opts));
  scope.querySelectorAll("[data-folder-del]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const filter = ((b as HTMLElement).dataset.folderDel || "old") as "all" | "old";
      try {
        const res = await deletePhotos(opts.token(), {
          device_id: folder.device || undefined,
          filter,
          days: folder.days,
        });
        clearThumbs();
        await loadFolder(opts);
        await opts.after();
        opts.note(`Deleted ${n(res.deleted)} photo${res.deleted === 1 ? "" : "s"} (${size(res.freed)} freed).`);
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  scope.querySelectorAll("[data-copycode]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const code = (b as HTMLElement).dataset.copycode || "";
      try {
        await navigator.clipboard.writeText(code);
        copied = code;
        opts.repaint();
        window.setTimeout(() => {
          if (copied === code) {
            copied = "";
            opts.repaint();
          }
        }, 1500);
      } catch {
        opts.fail("Copy the code by hand: " + code);
      }
    })()),
  );
  scope.querySelectorAll("[data-block]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const btn = b as HTMLElement;
      try {
        await deviceBlock(opts.token(), btn.dataset.block || "", btn.dataset.on !== "1");
        await opts.after();
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
  scope.querySelectorAll("[data-give]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const id = (b as HTMLElement).dataset.give || "";
      try {
        const res = await mintTokens(opts.token(), {
          kind: "count",
          value: Math.max(1, Number(giveVal()) || 1),
          count: 1,
          note: `for ${rowName(id) || id}`,
        });
        const code = res.codes[0] || "";
        if (code) given.set(id, code);
        opts.repaint();
        const note = opts.scope().querySelector<HTMLElement>(`[data-copycode="${code}"]`);
        note?.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
}

