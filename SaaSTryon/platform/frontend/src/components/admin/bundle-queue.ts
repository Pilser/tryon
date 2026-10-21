/* components/admin/bundle-queue.ts - the upload engine of a bundle
   version.

   The server takes ONE file per call (the field name is `file`, the
   file name is its path inside the bundle, the version travels in
   `?version=`), so the engine does the same: three calls at a time, a
   per-file state, a byte-weighted progress that never lies and never
   goes backwards, and a retry that only touches the broken file. */
import { useCallback, useRef, useState } from "react";
import { ApiError } from "../../api";
import type { PickedFile } from "../shared/landing-files";

export type ItemState = "queued" | "uploading" | "done" | "failed";

export interface QueueItem {
  path: string;
  size: number;
  file: File;
  state: ItemState;
  loaded: number;
  error: string;
}

/** One file of the bundle, on its own call. */
const uploadOne = (
  item: QueueItem,
  version: string,
  adminToken: string,
  onProgress: (loaded: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const q = new URLSearchParams({ version });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/admin/bundles?${q.toString()}`);
    xhr.setRequestHeader("authorization", `Bearer ${adminToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `request failed (${xhr.status})`;
      try {
        const data = JSON.parse(xhr.responseText) as { message?: string };
        if (data.message) message = data.message;
      } catch {
        /* the answer was not JSON - the status is the message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("the network dropped"));
    xhr.onabort = () => reject(new Error("the upload was cancelled"));
    const form = new FormData();
    form.append("file", item.file, item.path);
    xhr.send(form);
  });

export interface BundleQueue {
  items: QueueItem[];
  /** The bytes that are through, and the bytes there are. */
  loaded: number;
  total: number;
  /** Start a run: the files that may go up, against the version. */
  start: (files: PickedFile[], version: string) => void;
  /** One broken file, on its own. */
  retry: (path: string) => void;
  /** Take a file out of the queue. */
  remove: (path: string) => void;
  /** Empty the queue (the pick was refused). */
  clear: () => void;
}

export function useBundleQueue(adminToken: string): BundleQueue {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const runId = useRef(0);
  const versionRef = useRef("");

  const write = useCallback((next: QueueItem[]): void => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (path: string, change: Partial<QueueItem>): void => {
      write(
        itemsRef.current.map((i) => (i.path === path ? { ...i, ...change } : i)),
      );
    },
    [write],
  );

  /* The engine: three at a time, a failure never stops the others. */
  const pump = useCallback(
    async (list: QueueItem[], id: number, label: string): Promise<void> => {
      const queue = list.filter((i) => i.state !== "done");
      const worker = async (): Promise<void> => {
        for (;;) {
          const item = queue.shift();
          if (!item) return;
          if (runId.current !== id) return;
          patch(item.path, { state: "uploading" });
          try {
            await uploadOne(item, label, adminToken, (loaded) => {
              const cur = itemsRef.current.find((i) => i.path === item.path);
              patch(item.path, { loaded: Math.max(cur ? cur.loaded : 0, loaded) });
            });
            patch(item.path, { state: "done", loaded: item.size, error: "" });
          } catch (e) {
            patch(item.path, {
              state: "failed",
              error: e instanceof ApiError ? e.message : "the upload failed",
            });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    },
    [patch, adminToken],
  );

  const start = useCallback(
    (files: PickedFile[], version: string): void => {
      versionRef.current = version;
      const id = runId.current + 1;
      runId.current = id;
      const fresh: QueueItem[] = files.map((f) => ({
        path: f.path,
        size: f.size,
        file: f.file,
        state: "queued",
        loaded: 0,
        error: "",
      }));
      write(fresh);
      void pump(fresh, id, version);
    },
    [pump, write],
  );

  const retry = useCallback(
    (path: string): void => {
      const item = itemsRef.current.find((i) => i.path === path);
      if (!item) return;
      patch(path, { state: "queued", error: "" });
      void pump([{ ...item, state: "queued" }], runId.current, versionRef.current);
    },
    [patch, pump],
  );

  const remove = useCallback(
    (path: string): void => {
      write(itemsRef.current.filter((i) => i.path !== path));
    },
    [write],
  );

  const clear = useCallback((): void => {
    runId.current += 1;
    write([]);
  }, [write]);

  /* The bytes that are through - the bar is weighted by bytes, never
     by the number of files. */
  const loaded = items.reduce((a, i) => a + i.loaded, 0);
  const total = items.reduce((a, i) => a + i.size, 0);

  return { items, loaded, total, start, retry, remove, clear };
}
