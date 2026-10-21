/* components/admin/bundles-tab.tsx - the admin's Bundles tab: the
   versions the platform holds (the rollback surface), the upload of a
   new one and the per-tenant assignment.

   Nothing is ever deleted when a version is superseded: the list is
   the rollback surface, so a rollback is "assign the older version
   again". */
import { useMemo, useState, type JSX } from "react";
import { ApiError, type ShopView } from "../../api";
import { adminDeployAll, type DeployAllResult } from "../../api-admin";
import { base as b, cx, pa, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { AssignmentTable } from "./assignment-table";
import { BundleUpload } from "./bundle-upload";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

export function BundlesTab(props: {
  shops: ShopView[];
  bundles: string[];
  adminToken: string;
  onReload: () => void;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [focus, setFocus] = useState(0);
  const [armed, setArmed] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  const [results, setResults] = useState<DeployAllResult[]>([]);

  const onVersion = (v: string): number =>
    props.shops.filter((s) => (s.bundle || "") === v).length;

  /* The platform-wide assign: the diff of EVERY tenant before the
     call, because the call does not take a selection. */
  const diff = useMemo(() => {
    if (!armed) return [];
    return props.shops.map((s) => ({
      shop: s,
      from: s.bundle || "none",
      to: armed,
      skip: s.bundle === armed,
    }));
  }, [armed, props.shops]);

  const changing = diff.filter((l) => !l.skip).length;
  const same = diff.filter((l) => l.skip).length;

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: "Upload a version",
      run: () => setFocus((n) => n + 1),
    }),
    [],
  );
  usePrimary(props.onPrimary, action);

  /* The platform-wide deploy: every tenant moves, one answer per
     tenant. */
  function deployAll(): void {
    const version = armed;
    if (!version) return;
    setBusy(true);
    setNote("");
    setBad(false);
    setArmed("");
    void (async () => {
      try {
        const out = await adminDeployAll(props.adminToken, version);
        setResults(out.results || []);
        const good = (out.results || []).filter((r) => r.ok).length;
        setNote(
          `${good} of ${(out.results || []).length} tenant(s) are on ${version}.`,
        );
        setBad(good === 0);
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not deploy that version."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <>
      <Panel title="Versions">
        <p className={cx(u.rowSub)}>
          Every version the platform holds, newest last. Nothing is deleted when
          a version is superseded - the list is the rollback surface, so a
          rollback is assigning the older version again.
        </p>
        {props.bundles.length === 0 ? (
          <EmptyState
            title="No version in the bucket yet."
            reason="A version is the shop itself - the worker script, the wasm, the schema and the assets. Upload the first one below."
          />
        ) : (
          <div className={cx(u.rows)}>
            {props.bundles
              .slice()
              .reverse()
              .map((v, i) => (
                <div key={v}>
                  {i ? <hr className={cx(u.hairline)} /> : null}
                  <div className={cx(u.row)}>
                    <div className={cx(u.rowMain)}>
                      <p className={cx(u.rowTitle)}>
                        <span className={cx(pa.codeCell)}>{v}</span>{" "}
                        <span className={cx(pf.chip, pf.chipAdmin)}>version</span>
                      </p>
                      <p className={cx(pa.fact)}>
                        {n(onVersion(v))} tenant(s) run on it · the platform does
                        not report its file count yet
                      </p>
                    </div>
                    <div className={cx(u.btnRow)}>
                      <button
                        className={cx(b.btn, b.btnSecondary, u.btnGrow, busy && b.btnDisabled)}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setResults([]);
                          setArmed(v);
                        }}
                      >
                        Assign to every tenant
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
        {armed ? (
          <div className={cx(pf.panel)}>
            <p className={cx(u.cardTitle)}>
              Assign {armed} to every tenant
            </p>
            <pre className={cx(pf.diff)}>
              {diff
                .map(
                  (l) =>
                    `${(l.shop.name || l.shop.subdomain).padEnd(22)} ${l.from} → ${
                      l.to
                    }   ${
                      l.skip
                        ? "already on it (still redeployed)"
                        : "will redeploy (worker restarted, ~20 s)"
                    }`,
                )
                .join("\n")}
            </pre>
            <p className={cx(u.rowSub)}>
              {n(changing)} tenant(s) change. {n(same)} are already on it and are
              redeployed anyway - the platform-wide call moves every shop.
            </p>
            <div className={cx(u.btnRow)}>
              <button
                className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                type="button"
                disabled={busy}
                onClick={() => setArmed("")}
              >
                Cancel
              </button>
              <button
                className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
                type="button"
                disabled={busy}
                onClick={deployAll}
              >
                {busy
                  ? "Deploying…"
                  : `Assign ${armed} to ${n(props.shops.length)} tenant(s)`}
              </button>
            </div>
          </div>
        ) : null}
        {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
        {results.length > 0 ? (
          <div className={cx(u.rows)}>
            {results.map((r) => {
              const shop = props.shops.find((s) => s.id === r.shop_id);
              const name = shop ? shop.name || shop.subdomain : r.shop_id;
              return (
                <div key={r.shop_id} className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>{name}</p>
                    <p className={r.ok ? cx(u.rowSub) : cx(b.error)}>
                      {r.ok ? r.url || "deployed" : r.error || "the deploy failed"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Panel>

      <BundleUpload
        adminToken={props.adminToken}
        bundles={props.bundles}
        focusSignal={focus}
        onUploaded={() => {
          props.onReload();
          props.onChanged();
        }}
      />

      <AssignmentTable
        shops={props.shops}
        bundles={props.bundles}
        adminToken={props.adminToken}
        onChanged={props.onChanged}
      />
    </>
  );
}
