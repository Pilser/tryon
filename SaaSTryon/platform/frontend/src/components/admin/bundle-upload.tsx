/* components/admin/bundle-upload.tsx - the upload of a bundle VERSION.

   The same pattern as the owner's landing upload, because it is the
   same code path on the server: the folder is picked in the browser,
   every file keeps its path inside the bundle, a preflight names every
   file that may not go up (and flags the missing manifest.json BEFORE
   a byte moves), and the staging queue uploads one file per call with
   a byte-weighted bar that never lies.

   The server takes the file under the field name `file`, the file name
   IS its path inside the bundle, and the version label travels in the
   `?version=` query parameter. */
import { useEffect, useRef, useState, type JSX } from "react";
import { base as b, cx, pf, ui as u } from "../../kit";
import { DropZone } from "../shared/drop-zone";
import { fileTree, type PickedFile } from "../shared/landing-files";
import { Panel } from "../shared/panel";
import { ProgressBar } from "../shared/progress-bar";
import { useBundleQueue } from "./bundle-queue";

/* The version label the server accepts (letters, digits, dot, dash,
   underscore). */
export const VERSION = /^[A-Za-z0-9._-]+$/;

/* The files a bundle must carry (PLATFORM.md 3.4). A bundle without a
   manifest cannot be deployed, so the preflight says so up front. */
export const EXPECTED = [
  "manifest.json",
  "shop.mjs",
  "shop.wasm",
  "shop-schema.sql",
];

/* The rules of a path inside a bundle: no `..`, no absolute path, no
   control characters. */
const hasControl = (path: string): boolean => {
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

const bundleReject = (path: string): string | null => {
  if (!path) return "empty path";
  if (path.includes("..")) return '".." not allowed';
  if (path.startsWith("/")) return "absolute path not allowed";
  if (path.length > 200) return "path too long (>200)";
  if (hasControl(path)) return "unsupported character";
  return null;
};

const bytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/** The next label after the newest version the platform knows. */
const nextVersion = (bundles: string[]): string => {
  const newest = bundles[bundles.length - 1] || "";
  const m = /^(.*?)(\d+)$/.exec(newest);
  if (!m) return "v0.1.0";
  return `${m[1]}${Number(m[2]) + 1}`;
};

export function BundleUpload(props: {
  adminToken: string;
  /** The versions that exist - the label is suggested from them. */
  bundles: string[];
  /** The operator pressed the primary action: focus the version field. */
  focusSignal: number;
  onUploaded: (version: string, files: string[]) => void;
}): JSX.Element {
  const [version, setVersion] = useState(() => nextVersion(props.bundles));
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pick, setPick] = useState(0);
  const [removed, setRemoved] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  const queue = useBundleQueue(props.adminToken);
  const versionRef = useRef(version);
  const inputRef = useRef<HTMLInputElement>(null);
  const reported = useRef("");
  const onUploaded = useRef(props.onUploaded);
  onUploaded.current = props.onUploaded;

  /* The primary action of the tab: jump to the version field. */
  useEffect(() => {
    if (props.focusSignal > 0) inputRef.current?.focus();
  }, [props.focusSignal]);

  /* A new pick: the queue starts over and the files go up on their
     own, against the version label that was on screen when the folder
     was picked. */
  const pickKey = useRef("");
  useEffect(() => {
    const label = versionRef.current;
    const accepted = files.filter((f) => !bundleReject(f.path));
    const key = `${pick}|${label}|${accepted.map((f) => `${f.path}:${f.size}`).join("|")}`;
    if (key === pickKey.current) return;
    pickKey.current = key;
    setRemoved([]);
    if (accepted.length === 0) {
      queue.clear();
      return;
    }
    if (!VERSION.test(label)) {
      queue.clear();
      setNote("The version label needs letters, digits, dot, dash or underscore.");
      setBad(true);
      return;
    }
    queue.start(accepted, label);
  }, [files, pick, queue]);

  /* When the queue settles, the version list is read again. */
  useEffect(() => {
    if (queue.items.length === 0) return;
    if (queue.items.some((i) => i.state === "queued" || i.state === "uploading")) return;
    const key = `${versionRef.current}|${queue.items
      .map((i) => `${i.path}:${i.state}`)
      .join("|")}`;
    if (reported.current === key) return;
    reported.current = key;
    onUploaded.current(
      versionRef.current,
      queue.items.filter((i) => i.state === "done").map((i) => i.path),
    );
  }, [queue.items]);

  /* The preflight: what may go up, what may not, and why. */
  const accepted = files.filter(
    (f) => !bundleReject(f.path) && !removed.includes(f.path),
  );
  const rejected = files
    .map((f) => ({ path: f.path, reason: bundleReject(f.path) }))
    .filter((r): r is { path: string; reason: string } => r.reason !== null);
  const totalBytes = accepted.reduce((a, f) => a + f.size, 0);
  const paths = accepted.map((f) => f.path);
  const missing = EXPECTED.filter((f) => !paths.includes(f));
  const done = queue.items.filter((i) => i.state === "done").length;
  const failed = queue.items.filter((i) => i.state === "failed").length;

  return (
    <>
      <Panel title="Upload a version">
        <p className={cx(u.rowSub)}>
          A version is the shop itself: the worker script, the wasm, the schema
          and the assets. Pick the bundle folder - the files keep their paths
          inside the bundle - and they go up one call per file. A version stays
          in the list forever: it is the rollback surface.
        </p>
        <label className={cx(pf.label)} htmlFor="bundle-version">
          Version label
        </label>
        <div className={cx(pf.fieldRow)}>
          <input
            id="bundle-version"
            ref={inputRef}
            className={cx(pf.field)}
            value={version}
            placeholder={nextVersion(props.bundles)}
            aria-label="bundle version label"
            autoComplete="off"
            onChange={(e) => {
              setVersion(e.currentTarget.value);
              versionRef.current = e.currentTarget.value;
            }}
          />
          <button
            className={cx(b.btn, b.btnSecondary, u.btnGrow)}
            type="button"
            onClick={() => {
              const next = nextVersion(props.bundles);
              setVersion(next);
              versionRef.current = next;
            }}
          >
            Next version
          </button>
        </div>
        <p className={cx(u.meta)}>
          The label travels with every call (?version=). Letters, digits, dot,
          dash and underscore.
        </p>
        <DropZone
          onFiles={(picked) => {
            setFiles(picked);
            setPick((n) => n + 1);
            setNote("");
            setBad(false);
          }}
          label="Drop the bundle folder here — or choose a folder"
          hint="The bundle folder: manifest.json, shop.mjs, shop.wasm, shop-schema.sql and assets/ keep their place inside the bundle."
        />
        {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
      </Panel>

      {files.length === 0 ? null : (
        <>
          <Panel title="Preflight">
            <span className={cx(u.meta)}>
              {accepted.length} file(s) · {bytes(totalBytes)}
            </span>
            <p className={cx(u.rowSub)}>
              The files below are the ones that go up. The rejected ones never
              reach the server.
            </p>
            <pre className={cx(pf.tree)}>{fileTree(paths)}</pre>
            {missing.length > 0 ? (
              <p className={cx(b.error)}>
                Missing {missing.join(", ")} - a bundle without a manifest.json
                cannot be deployed.
              </p>
            ) : (
              <p className={cx(u.inlineNote)}>
                The bundle carries {EXPECTED.join(", ")} and{" "}
                {paths.filter((p) => p.startsWith("assets/")).length} asset(s).
              </p>
            )}
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
          </Panel>

          <Panel title="Staging">
            <span className={cx(u.meta)}>
              {done}/{queue.items.length} uploaded
            </span>
            <ProgressBar value={queue.loaded} total={queue.total} bad={failed > 0} />
            <div className={cx(u.rows)}>
              {queue.items.map((i) => (
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
                        onClick={() => queue.retry(i.path)}
                      >
                        Retry
                      </button>
                    ) : null}
                    <button
                      className={cx(b.btn, b.btnSecondary)}
                      type="button"
                      onClick={() => {
                        setRemoved((prev) =>
                          prev.includes(i.path) ? prev : [...prev, i.path],
                        );
                        queue.remove(i.path);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
