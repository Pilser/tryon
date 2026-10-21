/* components/shared/upload-queue.tsx - the preflight and the staging
   queue of a folder upload.

   The preflight runs BEFORE a single byte is uploaded: it counts the
   files, weighs them, shows the tree and names every rejected file with
   its reason. A file that breaks a rule never reaches the server.

   The queue then uploads the accepted files, three at a time, with a
   per-file state and a byte-weighted aggregate bar that never lies and
   never goes backwards. A failed file keeps the files that succeeded
   and can be retried on its own. */
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { base as b, cx, pf, ui as u } from "../../kit";
import { fileTree, rejectReason, type PickedFile } from "./landing-files";
import { ProgressBar } from "./progress-bar";

type ItemState = "queued" | "uploading" | "done" | "failed";

interface QueueItem {
  path: string;
  size: number;
  file: File;
  state: ItemState;
  loaded: number;
  error: string;
}

export interface QueueProgress {
  uploaded: number;
  failed: number;
  total: number;
  bytes: number;
  totalBytes: number;
}

const bytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/** One file of the dist, uploaded on its own (one POST per file). */
const uploadOne = (
  item: QueueItem,
  sessionId: string,
  shopId: string,
  onProgress: (loaded: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const q = new URLSearchParams({ path: item.path });
    if (shopId) q.set("shop_id", shopId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/shop/landing/file?${q.toString()}`);
    xhr.setRequestHeader("authorization", `Bearer ${sessionId}`);
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
    form.append("file", item.file, item.file.name);
    xhr.send(form);
  });

export function UploadQueue(props: {
  sessionId: string;
  shopId: string;
  files: PickedFile[];
  /** Counts the picks: the same folder picked twice is a new pick. */
  pickId?: number;
  onProgress?: (progress: QueueProgress) => void;
}): JSX.Element {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  const runId = useRef(0);
  const reportRef = useRef(props.onProgress);
  reportRef.current = props.onProgress;

  const write = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (path: string, change: Partial<QueueItem>) => {
      write(
        itemsRef.current.map((i) => (i.path === path ? { ...i, ...change } : i)),
      );
    },
    [write],
  );

  /* The report the tab needs: how many files are through. */
  useEffect(() => {
    reportRef.current?.({
      uploaded: items.filter((i) => i.state === "done").length,
      failed: items.filter((i) => i.state === "failed").length,
      total: items.length,
      bytes: items.reduce((a, i) => a + i.loaded, 0),
      totalBytes: items.reduce((a, i) => a + i.size, 0),
    });
  }, [items]);

  /* The upload engine: three at a time, a failure never stops the
     others, the progress never goes backwards. */
  const pump = useCallback(
    async (list: QueueItem[], id: number) => {
      const queue = list.filter((i) => i.state !== "done");
      const worker = async (): Promise<void> => {
        for (;;) {
          const item = queue.shift();
          if (!item) return;
          if (runId.current !== id) return;
          patch(item.path, { state: "uploading" });
          try {
            await uploadOne(item, props.sessionId, props.shopId, (loaded) => {
              const cur = itemsRef.current.find((i) => i.path === item.path);
              patch(item.path, { loaded: Math.max(cur ? cur.loaded : 0, loaded) });
            });
            patch(item.path, { state: "done", loaded: item.size, error: "" });
          } catch (e) {
            patch(item.path, {
              state: "failed",
              error: e instanceof Error ? e.message : "the upload failed",
            });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    },
    [patch, props.sessionId, props.shopId],
  );

  /* A new pick: the queue starts over and uploads on its own. The key
     is the pick itself - a shop that changes under the queue must not
     send the files of the old shop to the new one. Only the files the
     preflight accepted are ever sent. */
  const pickKey = useRef("");
  useEffect(() => {
    const accepted = props.files.filter((f) => !rejectReason(f.path, f.size));
    const key = `${props.pickId ?? 0}|${accepted.map((f) => `${f.path}:${f.size}`).join("|")}`;
    if (key === pickKey.current) return;
    pickKey.current = key;
    setRemoved([]);
    if (accepted.length === 0) {
      write([]);
      return;
    }
    const id = runId.current + 1;
    runId.current = id;
    const fresh: QueueItem[] = accepted.map((f) => ({
      path: f.path,
      size: f.size,
      file: f.file,
      state: "queued",
      loaded: 0,
      error: "",
    }));
    write(fresh);
    void pump(fresh, id);
  }, [props.files, props.pickId, pump, write]);

  /* The preflight: what may go up, what may not, and why. */
  const accepted = props.files.filter(
    (f) => !rejectReason(f.path, f.size) && !removed.includes(f.path),
  );
  const rejected = props.files
    .map((f) => ({ path: f.path, reason: rejectReason(f.path, f.size) }))
    .filter((r): r is { path: string; reason: string } => r.reason !== null);
  const totalBytes = accepted.reduce((a, f) => a + f.size, 0);
  const hasIndex = accepted.some((f) => f.path === "index.html");

  const retry = (path: string): void => {
    const item = itemsRef.current.find((i) => i.path === path);
    if (!item) return;
    patch(path, { state: "queued", error: "" });
    void pump([{ ...item, state: "queued" }], runId.current);
  };

  const remove = (path: string): void => {
    setRemoved((prev) => (prev.includes(path) ? prev : [...prev, path]));
    write(itemsRef.current.filter((i) => i.path !== path));
  };

  if (props.files.length === 0) return <></>;

  return (
    <>
      <div className={cx(u.card)}>
        <div className={cx(u.cardHead)}>
          <p className={cx(u.cardTitle)}>Preflight</p>
          <span className={cx(u.meta)}>
            {accepted.length} file(s) · {bytes(totalBytes)}
          </span>
        </div>
        <p className={cx(u.rowSub)}>
          The files below are the ones that will be uploaded. The rejected ones are
          never sent to the server.
        </p>
        <pre className={cx(pf.tree)}>{fileTree(accepted.map((f) => f.path))}</pre>
        {!hasIndex ? (
          <p className={cx(b.error)}>
            Your site root needs an index.html — the shop root will show the studio
            instead.
          </p>
        ) : null}
        {rejected.length > 0 ? (
          <div className={cx(u.rows)}>
            {rejected.map((r) => (
              <div key={r.path} className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(pf.code)}>{r.path}</p>
                  <p className={cx(b.error)}>{r.reason}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={cx(u.card)}>
        <div className={cx(u.cardHead)}>
          <p className={cx(u.cardTitle)}>Staging</p>
          <span className={cx(u.meta)}>
            {items.filter((i) => i.state === "done").length}/{items.length} uploaded
          </span>
        </div>
        <ProgressBar
          value={items.reduce((a, i) => a + i.loaded, 0)}
          total={items.reduce((a, i) => a + i.size, 0)}
          bad={items.some((i) => i.state === "failed")}
        />
        <div className={cx(u.rows)}>
          {items.map((i) => (
            <div key={i.path} className={cx(pf.fileRow)}>
              <div className={cx(u.rowMain)}>
                <p className={cx(pf.code)}>{i.path}</p>
                <ProgressBar value={i.loaded} total={i.size} bad={i.state === "failed"} />
              </div>
              <div className={cx(u.btnRow)}>
                <span
                  className={cx(
                    pf.fileState,
                    i.state === "done" && pf.fileStateGood,
                    i.state === "failed" && pf.fileStateBad,
                  )}
                >
                  {i.state === "uploading"
                    ? `uploading ${i.size ? Math.round((i.loaded / i.size) * 100) : 0}%`
                    : i.state === "failed"
                      ? `failed — ${i.error}`
                      : i.state === "done"
                        ? "done"
                        : "queued"}
                </span>
                {i.state === "failed" ? (
                  <button
                    className={cx(b.btn, b.btnSecondary)}
                    type="button"
                    onClick={() => retry(i.path)}
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  className={cx(b.btn, b.btnSecondary)}
                  type="button"
                  onClick={() => remove(i.path)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
