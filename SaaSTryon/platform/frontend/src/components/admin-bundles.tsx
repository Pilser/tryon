/* components/admin-bundles.tsx - the admin's Bundles tab: the versions
   that live in the BUNDLES bucket, the upload of a new one (the files
   land under bundles/<version>/…) and the bulk redeploy that moves
   every shop onto one bundle. The bundle list is the same read the
   redeploy picker uses, so it is loaded once here. */
import { useEffect, useRef, useState, type JSX } from "react";
import { ApiError, type ShopView } from "../api";
import { adminRedeployShop, adminUploadBundle } from "../api-admin";
import { base as b, cx, pf, ui as u } from "../kit";
import { useBundles } from "./use-bundles";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/* The version label the server accepts (letters, digits, dot, dash,
   underscore). */
const VERSION = /^[A-Za-z0-9._-]+$/;

/* The path of a file inside the bundle: the name for a loose file, the
   path without the picked folder for a folder drop. */
const relPath = (file: File): string => {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const parts = rel.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join("/") : rel;
};

/* One line of the bulk redeploy: what happened to one shop. */
type RedeployLine = { shop: string; ok: boolean; text: string };

/** The Bundles tab: the list, the upload and the bulk redeploy. */
export function BundlesTab(props: {
  adminToken: string;
  shops: ShopView[] | null;
  onChanged: () => void;
}): JSX.Element {
  const { bundles, error, reload } = useBundles(props.adminToken);
  const [version, setVersion] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  const [target, setTarget] = useState("");
  const [armed, setArmed] = useState(false);
  const [lines, setLines] = useState<RedeployLine[]>([]);
  const [rdNote, setRdNote] = useState("");
  const [rdBad, setRdBad] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  /* A folder picker (webkitdirectory) keeps the paths of the files. */
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  const shops = props.shops || [];
  const onVersion = (v: string): number =>
    shops.filter((s) => (s.bundle || "") === v).length;

  function pick(list: FileList | null): void {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    setNote("");
    setBad(false);
  }

  function upload(): void {
    const v = version.trim();
    if (!VERSION.test(v)) {
      setNote("The version label needs letters, digits, dot, dash or underscore.");
      setBad(true);
      return;
    }
    if (files.length === 0) {
      setNote("Pick the bundle files first (manifest.json, shop.wasm, worker.js…).");
      setBad(true);
      return;
    }
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminUploadBundle(
          props.adminToken,
          v,
          files.map((file) => ({ path: relPath(file), file })),
        );
        setNote(`Uploaded ${v} - ${out.files.length} file(s): ${out.files.join(", ")}`);
        setFiles([]);
        setVersion("");
        reload();
      } catch (e) {
        setNote(msg(e, "Could not upload that bundle."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  /* The bulk redeploy: every shop onto one bundle, one answer per
     shop. */
  function redeployAll(): void {
    const id = target.trim();
    if (!id || shops.length === 0) return;
    setBusy(true);
    setNote("");
    setBad(false);
    setRdNote("");
    setRdBad(false);
    setArmed(false);
    void (async () => {
      const out: RedeployLine[] = [];
      for (const s of shops) {
        const label = s.name || s.subdomain || s.id;
        try {
          const res = await adminRedeployShop(props.adminToken, s.id, id);
          out.push({ shop: label, ok: true, text: res.url || "ok" });
        } catch (e) {
          out.push({ shop: label, ok: false, text: msg(e, "failed") });
        }
        /* the operator sees the answer of every shop as it comes. */
        setLines([...out]);
      }
      const good = out.filter((l) => l.ok).length;
      setRdNote(`${good} of ${out.length} shop(s) are on ${id}.`);
      setRdBad(good === 0);
      props.onChanged();
      setBusy(false);
    })();
  }

  return (
    <div className={cx(u.cardFlush)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Bundles</p>
        <span className={cx(u.meta)}>{bundles.length} version(s)</span>
      </div>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.rowSub)}>
          A bundle is the shop itself: the worker script, the wasm, the schema and the
          assets. A shop runs on one bundle - the redeploy moves it.
        </p>
      </div>
      <hr className={cx(u.hairline)} />
      <div className={cx(u.rows)}>
        {error ? <p className={cx(b.error)}>{error}</p> : null}
        {bundles.length === 0 ? (
          <p className={cx(u.empty)}>No bundle in the bucket yet - upload one below.</p>
        ) : (
          bundles.map((v, i) => (
            <div key={v}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <div className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(u.rowTitle)}>
                    <span className={cx(pf.code)}>{v}</span>
                  </p>
                  <p className={cx(u.rowSub)}>
                    {onVersion(v)} shop(s) run on this bundle
                  </p>
                </div>
                <div className={cx(u.btnRow)}>
                  {armed && target === v ? (
                    <>
                      <button
                        className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
                        type="button"
                        disabled={busy}
                        onClick={redeployAll}
                      >
                        {busy ? "Redeploying…" : `Redeploy ${shops.length} shops on ${v}`}
                      </button>
                      <button
                        className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                        type="button"
                        disabled={busy}
                        onClick={() => setArmed(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setTarget(v);
                        setArmed(true);
                        setLines([]);
                      }}
                    >
                      Redeploy every shop
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {lines.length ? (
        <>
          <hr className={cx(u.hairline)} />
          <div className={cx(u.rows)}>
            {lines.map((l, i) => (
              <div key={l.shop}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>{l.shop}</p>
                    <p className={l.ok ? cx(u.rowSub) : cx(b.error)}>{l.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {rdNote ? (
            <div className={cx(u.cardHead)}>
              <p className={rdBad ? cx(b.error) : cx(u.inlineNote)}>{rdNote}</p>
            </div>
          ) : null}
        </>
      ) : null}
      <hr className={cx(u.hairline)} />
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Upload a bundle</p>
        <span className={cx(u.meta)}>bundles/&lt;version&gt;/…</span>
      </div>
      <div className={cx(u.cardHead)}>
        <div className={cx(u.rowMain)}>
          <label className={cx(pf.label)} htmlFor="bundle-version">
            Version label
          </label>
          <input
            id="bundle-version"
            className={cx(pf.field)}
            value={version}
            placeholder="v0.9.16"
            aria-label="bundle version label"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setVersion(e.currentTarget.value)}
          />
          <p className={cx(u.rowSub)}>
            Pick the bundle folder (its files keep their paths, so assets/ stays
            assets/) or the files themselves: manifest.json, shop.wasm, worker.js,
            shop-schema.sql, assets/…
          </p>
          <div className={cx(pf.fieldRow)}>
            <div className={cx(u.rowMain)}>
              <span className={cx(u.meta)}>The bundle folder (keeps the paths)</span>
              <input
                ref={folderRef}
                className={cx(pf.field)}
                type="file"
                multiple
                aria-label="bundle folder"
                disabled={busy}
                onChange={(e) => pick(e.currentTarget.files)}
              />
            </div>
            <div className={cx(u.rowMain)}>
              <span className={cx(u.meta)}>Or the files themselves</span>
              <input
                className={cx(pf.field)}
                type="file"
                multiple
                aria-label="bundle files"
                disabled={busy}
                onChange={(e) => pick(e.currentTarget.files)}
              />
            </div>
          </div>
          {files.length ? (
            <p className={cx(u.meta)}>
              {files.length} file(s) picked: {files.map(relPath).slice(0, 8).join(", ")}
              {files.length > 8 ? " …" : ""}
            </p>
          ) : null}
          {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
          <div className={cx(u.btnRow)}>
            <button
              className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
              type="button"
              disabled={busy}
              onClick={upload}
            >
              {busy ? "Uploading…" : "Upload bundle"}
            </button>
            {files.length ? (
              <button
                className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                type="button"
                disabled={busy}
                onClick={() => setFiles([])}
              >
                Clear files
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
