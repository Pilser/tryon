/* core/store.ts — the ONLY file that touches localStorage.
   Person imageId persists ~6 days (Genlook TTL is 7). Timeline is
   newest-first, capped. */
import type { TimelineEntry } from "./types";

const PK = "tryon.person.v1";
const TK = "tryon.timeline.v1";
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
