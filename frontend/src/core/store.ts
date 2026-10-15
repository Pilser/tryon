/* core/store.ts — the ONLY file that touches localStorage.
   Person imageId persists ~6 days (Genlook TTL is 7). Timeline is
   newest-first, capped. Device id is a stable random id for this
   browser/device (the "fingerprint"): keys stay local, and the id lets a
   future server sync scope timelines per device. */
import type { TimelineEntry } from "./types";

const PK = "tryon.person.v1";
const TK = "tryon.timeline.v1";
const DK = "tryon.device.v1";
const OK = "tryon.owner.v1";
export const PERSON_TTL = 6 * 24 * 3600;
export const TIMELINE_CAP = 12;

interface PersonRec {
  imageId: string;
  thumb?: string;
  ts: number;
}

function load<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") as T | null;
  } catch {
    return null;
  }
}

function save(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full/blocked: session-only mode */
  }
}

export const nowSecs = (): number => Math.floor(Date.now() / 1000);

export const loadPerson = (): PersonRec | null => load<PersonRec>(PK);
export const savePerson = (imageId: string, thumb = ""): void =>
  save(PK, { imageId, thumb, ts: nowSecs() } as PersonRec);

export const personUsable = (p: PersonRec | TimelineEntry | null | undefined): boolean =>
  !!p && !!p.imageId && nowSecs() - p.ts < PERSON_TTL;

export const loadTimeline = (): TimelineEntry[] => load<TimelineEntry[]>(TK) || [];

export function pushTimeline(e: TimelineEntry): void {
  const list = loadTimeline().filter((x) => x.thumb !== e.thumb);
  list.unshift(e);
  save(TK, list.slice(0, TIMELINE_CAP));
}

/* Patch a timeline entry (e.g. fill in imageId after upload finishes). */
export function updateTimelineEntry(thumb: string, patch: Partial<TimelineEntry>): void {
  save(TK, loadTimeline().map((e) => (e.thumb === thumb ? { ...e, ...patch } : e)).slice(0, TIMELINE_CAP));
}

/* Stable per-browser/device id. localStorage already persists per device;
   this id names the device for display + future server sync. */
export function deviceId(): string {
  let d: string | undefined;
  try {
    d = JSON.parse(localStorage.getItem(DK) || "null")?.id;
  } catch { d = undefined; }
  if (!d) {
    d = (crypto.randomUUID ? crypto.randomUUID() : "dev-" + Date.now() + "-" + Math.floor(Math.random() * 1e9));
    try { localStorage.setItem(DK, JSON.stringify({ id: d })); } catch { /* private mode */ }
  }
  return d;
}

export const shortDevice = (): string => deviceId().slice(0, 8);

/* Owner token for bundle upload (sent as Bearer; empty = open v1 backend). */
export const loadOwner = (): string => load<{ t: string }>(OK)?.t ?? "";
export const saveOwner = (t: string): void => save(OK, { t });
