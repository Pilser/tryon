/* components/dash-users.ts - the Users tab: who is using the shop, what
   each device is costing in object storage, and the two things the owner
   does about it - give a code, or block the device.

   Cleanup is folder-style on purpose: a per-device folder of backed-up
   photos with ONE filter (older than N days / everything), never a delete
   button per file. The dashboard keeps no photo state outside this file. */
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
import { cx, n, short, when, type Device } from "./dash-util";

/** Which folder is open: one device id, or "" for all devices. */
interface Folder {
  device: string | null;
  label: string;
  days: number;
  photos: StoredPhoto[];
  bytes: number;
  loading: boolean;
}
const folder: Folder = { device: null, label: "", days: 30, photos: [], bytes: 0, loading: false };
/** Blob URLs of the thumbnails we loaded, revoked when the panel closes. */
let objectUrls: string[] = [];

const DAYS = [7, 30, 90];

/** Storage chip for one device row. */
function storageChip(d: Device): string {
  if (!d.photo_count) return `<span class="${cx(s.chipUsed)}">no photos stored</span>`;
  return `<span class="${cx(s.chipFree)}">${n(d.photo_count)} photo${d.photo_count === 1 ? "" : "s"} · ${esc(size(d.photo_bytes))}</span>`;
}

function deviceRow(d: Device, free: number): string {
  const window_ = d.bonus_until_ms > Date.now();
  const spent = d.used >= free && !window_ && d.bonus <= 0;
  const blocked = !!d.blocked;
  const who = d.name || d.whatsapp || "Guest " + short(d.id);
  const chips = [
    `<span class="${cx(spent ? s.chipUsed : s.chipFree)}">${n(d.used)} tries</span>`,
    d.bonus > 0 ? `<span class="${cx(s.chipPaid)}">+${n(d.bonus)} paid</span>` : "",
    window_ ? `<span class="${cx(s.chipPaid)}">unlimited</span>` : "",
    blocked ? `<span class="${cx(s.chipBad)}">blocked</span>` : "",
    storageChip(d),
  ].join("");
  const wa = d.whatsapp
    ? `<a class="${cx(s.chip)}" href="https://wa.me/${esc(d.whatsapp)}" target="_blank" rel="noopener">+${esc(d.whatsapp)}</a>`
    : `<span class="${cx(s.chipUsed)}">no number yet</span>`;
  return `<div class="${cx(s.devRow)}">
    <div><p class="${cx(s.who)}">${esc(who)}</p>
      <p class="${cx(s.sub)}">seen ${esc(when(d.last_seen_ms))} · device ${esc(short(d.id))}</p>
      <div class="${cx(s.chips)}">${chips}${wa}</div>
    </div>
    <div class="${cx(s.devActions)}">
      <button class="btn secondary" type="button" data-photos="${esc(d.id)}">Photos${d.photo_count ? ` (${n(d.photo_count)})` : ""}</button>
      <button class="btn secondary" type="button" data-give="${esc(d.id)}" title="Create one code for this user">Give code</button>
      <button class="btn${blocked ? "" : " danger"}" type="button" data-block="${esc(d.id)}" data-on="${blocked ? "1" : "0"}">${blocked ? "Unblock" : "Block"}</button>
    </div>
  </div>`;
}

/** The folder panel: thumbnails fill in after the list arrives. */
function folderHTML(): string {
  if (folder.device === null) return "";
  const scope = folder.device ? `device ${short(folder.device)}` : "all devices";
  const who = folder.label ? " · " + folder.label : "";
  return `<div class="${cx(s.folder)}" id="dash-folder">
    <div class="${cx(s.stepHead)}">
      <span class="${cx(s.stepNum)}">${n(folder.photos.length)}</span>
      <p class="${cx(s.stepTitle)}">Backed-up photos · ${esc(scope)}${who ? " · " + esc(who) : ""}</p>
      <button class="btn secondary" type="button" id="dash-folder-close">Close</button>
    </div>
    <p class="${cx(s.sub)}">${folder.loading ? "Loading…" : `${esc(size(folder.bytes))} in ${n(folder.photos.length)} photo${folder.photos.length === 1 ? "" : "s"}. These are the shopper photos kept in your object storage; delete the old ones to keep it small.`}</p>
    <div class="${cx(s.photoGrid)}">${folder.loading ? "" : folder.photos.map((p, i) => `
      <div class="${cx(s.photo)}">
        <img class="${cx(s.photoImg)}" data-shot="${i}" alt="stored photo" loading="lazy"/>
        <span class="${cx(s.photoMeta)}">${esc(new Date(p.created_ms).toLocaleDateString())}<br/>${esc(size(p.bytes))}</span>
      </div>`).join("")}</div>
    <div class="${cx(s.filters)}">
      <span class="${cx(s.label)}">Delete</span>
      ${DAYS.map((d) => `<button class="${cx(s.filter, folder.days === d && s.filterOn)}" type="button" data-folder-days="${d}">older than ${d} days</button>`).join("")}
    </div>
    <div class="${cx(s.actions)}">
      <button class="btn danger" type="button" data-folder-del="old">Delete older than ${n(folder.days)} days</button>
      <button class="btn danger" type="button" data-folder-del="all">Delete all in this folder</button>
    </div>
    <p class="${cx(s.sub)}">Deleted photos are gone for good; the shopper keeps their own copy on their phone.</p>
  </div>`;
}

/** Users tab HTML: total storage, the list, and the open folder. */
export function usersTab(d: UsageOut, giveValue: string): string {
  const blocked = d.devices.filter((x) => x.blocked).length;
  return `
  <div class="${cx(s.summary)}">
    <div>
      <p class="${cx(s.who)}">${esc(size(d.photos_bytes))} in ${n(d.photos_total)} photo${d.photos_total === 1 ? "" : "s"}</p>
      <p class="${cx(s.sub)}">Backed-up shopper photos across ${n(d.devices_total)} device${d.devices_total === 1 ? "" : "s"}${blocked ? ` · ${n(blocked)} blocked` : ""}</p>
    </div>
    <button class="btn secondary" type="button" id="dash-folder-all">Review all photos</button>
  </div>
  <p class="${cx(s.sectionTitle)}">Give a code to one user</p>
  <p class="${cx(s.sub)}">Set how many try-ons the code gives, tap <b>Give code</b> on their row, then
    send them the code that appears. One use only.</p>
  <div class="${cx(s.form)}">
    <input class="${cx(s.num)}" id="dash-give-val" type="number" min="1" max="10000" value="${esc(giveValue)}" aria-label="try-ons per given code"/>
    <span class="${cx(s.sub)}">try-ons per code</span>
  </div>
  <p class="${cx(s.sub)}" id="dash-given" style="display:none"></p>
  <div class="${cx(s.list)}">${
    d.devices.map((x) => deviceRow(x, d.free_tries)).join("") ||
    `<p class="${cx(s.empty)}">No devices yet.</p>`
  }</div>
  ${folderHTML()}
  <p class="${cx(s.sectionTitle)}">Blocked devices</p>
  <p class="${cx(s.sub)}">Blocked = try-ons pause on that device (a red <b>BLOCKED</b> answer from the
    server) until you tap Unblock. Use it for a wrong number or tries nobody paid for.</p>`;
}

/** Loads the open folder, then hands back URLs for each thumbnail. */
async function loadFolder(opts: ArmOpts): Promise<void> {
  const dir = folder.device;
  folder.loading = true;
  opts.repaint();
  const res = await devicePhotos(opts.token(), dir || "");
  folder.photos = res.photos;
  folder.bytes = res.bytes;
  folder.loading = false;
  opts.repaint();
  const imgs = opts.scope().querySelectorAll<HTMLImageElement>("[data-shot]");
  await Promise.all(folder.photos.map(async (p, i) => {
    const url = await photoBlob(opts.token(), p.key);
    if (!url) return;
    objectUrls.push(url);
    const img = imgs[i];
    if (img) img.src = url;
  }));
}

export function closeFolder(opts: ArmOpts): void {
  folder.device = null;
  folder.photos = [];
  folder.bytes = 0;
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls = [];
  opts.repaint();
}

interface ArmOpts {
  scope: () => HTMLElement;
  token: () => string;
  repaint: () => void;
  after: () => Promise<void>;
  fail: (m: string) => void;
  note: (m: string) => void;
  shop: () => string;
}

/** Wires the users tab (block, give code, photo folders). */
export function armUsers(opts: ArmOpts): void {
  const scope = opts.scope();
  const giveVal = (): string => (scope.querySelector("#dash-give-val") as HTMLInputElement | null)?.value || "3";
  const labelFor = (id: string): string => {
    const row = scope.querySelector(`[data-photos="${id}"]`);
    const d = row?.closest("div")?.parentElement?.querySelector("p")?.textContent || "";
    return d.trim() || short(id);
  };
  scope.querySelector("#dash-folder-all")?.addEventListener("click", () => void (async () => {
    folder.device = "";
    folder.label = "";
    await loadFolder(opts);
  })());
  scope.querySelectorAll("[data-photos]").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      folder.device = (b as HTMLElement).dataset.photos || "";
      folder.label = labelFor(folder.device);
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
        folder.photos = [];
        folder.bytes = 0;
        for (const u of objectUrls) URL.revokeObjectURL(u);
        objectUrls = [];
        await loadFolder(opts);
        await opts.after();
        opts.note(`Deleted ${n(res.deleted)} photo${res.deleted === 1 ? "" : "s"} (${size(res.freed)} freed).`);
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
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
          note: `given from dashboard to ${id}`,
        });
        const said = scope.querySelector<HTMLElement>("#dash-given");
        if (said) {
          said.innerHTML = `Code for ${esc(short(id))}: <span class="${cx(s.code)}">${esc(res.codes.join(", "))}</span> - send it to them on WhatsApp.`;
          said.style.display = "";
        }
      } catch (e) {
        opts.fail(e instanceof Error ? e.message : String(e));
      }
    })()),
  );
}

export const isFolderOpen = (): boolean => folder.device !== null;
export const folderDevice = (): string | null => folder.device;
