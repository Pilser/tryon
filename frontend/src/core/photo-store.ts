/* core/photo-store.ts - keeps picked photo files in this browser (IndexedDB),
   so ribbon photos survive reloads and product switches. No network involved:
   upload still waits for Start. Quota/full failures are swallowed; callers
   fall back to asking for the photo again. */

const DB = "tryon.photos.v1";
const STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function tx(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function savePhoto(key: string, blob: Blob): Promise<void> {
  try {
    await tx("readwrite", (s) => s.put(blob, key));
  } catch {
    /* storage unavailable: photo just won't survive reloads */
  }
}

export async function loadPhoto(key: string): Promise<Blob | null> {
  try {
    const v = (await tx("readonly", (s) => s.get(key))) as Blob | undefined;
    return v instanceof Blob ? v : null;
  } catch {
    return null;
  }
}

/* Drop blobs whose timeline entries are gone (cap evictions, old visits). */
export async function prunePhotos(keep: Set<string>): Promise<void> {
  try {
    const db = await openDb();
    const keys: string[] = await new Promise((resolve, reject) => {
      const out: string[] = [];
      const t = db.transaction(STORE, "readonly");
      const cursor = t.objectStore(STORE).openKeyCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) { out.push(String(c.key)); c.continue(); }
        else resolve(out);
      };
      cursor.onerror = () => reject(cursor.error);
    });
    const stale = keys.filter((k) => !keep.has(k));
    if (stale.length) {
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE, "readwrite");
        const store = t.objectStore(STORE);
        for (const k of stale) store.delete(k);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    }
    db.close();
  } catch {
    /* ignore */
  }
}
