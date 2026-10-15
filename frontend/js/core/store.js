/* core/store.js — the ONLY file that touches localStorage.
   Person imageId persists ~6 days (Genlook TTL is 7). Timeline is
   newest-first, capped, entries: {kind, thumb, imageId, url, ts}. */
const PK = "tryon.person.v1";
const TK = "tryon.timeline.v1";
export const PERSON_TTL = 6 * 24 * 3600;
export const TIMELINE_CAP = 12;

const load = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

export const nowSecs = () => Math.floor(Date.now() / 1000);

export const loadPerson = () => load(PK);
export const savePerson = (imageId, thumb = "") => save(PK, { imageId, thumb, ts: nowSecs() });
export const personUsable = (p) =>
  !!p && !!p.imageId && nowSecs() - p.ts < PERSON_TTL;

export const loadTimeline = () => load(TK) || [];
export function pushTimeline(e) {
  const list = loadTimeline().filter((x) => x.thumb !== e.thumb);
  list.unshift(e);
  save(TK, list.slice(0, TIMELINE_CAP));
}
