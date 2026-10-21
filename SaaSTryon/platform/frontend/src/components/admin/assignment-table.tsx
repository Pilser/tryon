/* components/admin/assignment-table.tsx - the per-tenant assignment
   of the bundle versions: which shop runs on which version.

   The table is the only table of the console (the rest are dense
   rows). A row may be deployed on its own, and the selection buys a
   bulk assign - but the bulk assign never fires blind: the operator
   sees the DIFF first (what changes, what is skipped) and the confirm
   button carries the count. */
import { useMemo, useState, type JSX } from "react";
import { ApiError, type ShopView } from "../../api";
import { adminRedeployShop } from "../../api-admin";
import { base as b, cx, pa, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { Panel } from "../shared/panel";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

const label = (s: ShopView): string => s.name || s.subdomain;

interface Line {
  shop: ShopView;
  from: string;
  to: string;
  skip: boolean;
}

interface Result {
  shop: string;
  ok: boolean;
  text: string;
}

export function AssignmentTable(props: {
  shops: ShopView[];
  bundles: string[];
  adminToken: string;
  onChanged: () => void;
}): JSX.Element {
  const [picked, setPicked] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [bulkTarget, setBulkTarget] = useState("");
  const [preview, setPreview] = useState<Line[] | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  const newest = props.bundles[props.bundles.length - 1] || "";
  const target = bulkTarget || newest;

  /* The target of a row: what the operator chose, else the version the
     shop runs on. */
  const targetOf = (s: ShopView): string => targets[s.id] || s.bundle || newest;

  const selected = useMemo(
    () => props.shops.filter((s) => picked.includes(s.id)),
    [props.shops, picked],
  );

  const toggle = (id: string): void =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /* The diff of the selection: what moves, what stays. */
  const diff = useMemo(
    () =>
      selected.map((s) => ({
        shop: s,
        from: s.bundle || "none",
        to: target,
        skip: s.bundle === target,
      })),
    [selected, target],
  );

  const changing = diff.filter((l) => !l.skip);
  const skipped = diff.filter((l) => l.skip);

  function deployOne(shop: ShopView, version: string): void {
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminRedeployShop(props.adminToken, shop.id, version);
        setResults((prev) => [
          ...prev,
          { shop: label(shop), ok: true, text: out.url || `now on ${version}` },
        ]);
        props.onChanged();
      } catch (e) {
        setResults((prev) => [
          ...prev,
          { shop: label(shop), ok: false, text: msg(e, "the deploy failed") },
        ]);
        setNote(msg(e, "Could not redeploy that shop."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  /* The bulk assign: one call per shop that really changes, so one
     failure never takes the others down. */
  function assign(): void {
    if (!preview) return;
    const todo = preview.filter((l) => !l.skip);
    setBusy(true);
    setNote("");
    setBad(false);
    setPreview(null);
    void (async () => {
      const out: Result[] = [];
      for (const line of todo) {
        try {
          const res = await adminRedeployShop(props.adminToken, line.shop.id, line.to);
          out.push({ shop: label(line.shop), ok: true, text: res.url || `now on ${line.to}` });
        } catch (e) {
          out.push({
            shop: label(line.shop),
            ok: false,
            text: msg(e, "the deploy failed"),
          });
        }
        setResults([...out]);
      }
      const good = out.filter((r) => r.ok).length;
      setNote(`${good} of ${out.length} shop(s) moved to ${target}.`);
      setBad(good === 0 && out.length > 0);
      setPicked([]);
      props.onChanged();
      setBusy(false);
    })();
  }

  if (props.shops.length === 0) {
    return (
      <Panel title="Per-tenant assignment">
        <EmptyState
          title="No tenant to assign."
          reason="A version is assigned to a shop - when an owner deploys one, it shows up here."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Per-tenant assignment">
      <p className={cx(u.rowSub)}>
        Which tenant runs on which version. A deploy sends the new script and
        keeps the products, the credits and the landing files of the shop.
      </p>

      {selected.length > 0 ? (
        <div className={cx(pf.bulkBar)}>
          <span className={cx(pf.bulkCount)}>{n(selected.length)} selected</span>
          <button
            className={cx(pf.textLink)}
            type="button"
            onClick={() => setPicked([])}
          >
            Clear
          </button>
          <label className={cx(pf.label)} htmlFor="bulk-target">
            Assign
          </label>
          <select
            id="bulk-target"
            className={cx(pa.selectSm)}
            value={target}
            aria-label="the version to assign"
            onChange={(e) => setBulkTarget(e.currentTarget.value)}
          >
            {props.bundles.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button
            className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
            type="button"
            disabled={busy || !target}
            onClick={() => setPreview(diff)}
          >
            {busy ? "Working…" : `Assign ${target} to ${n(selected.length)} shop(s)`}
          </button>
        </div>
      ) : null}

      <div className={cx(pf.tableWrap)}>
        <table className={cx(pf.table)}>
          <thead>
            <tr>
              <th className={cx(pf.check)}>
                <input
                  className={cx(pa.checkSm)}
                  type="checkbox"
                  aria-label="select every tenant"
                  checked={picked.length > 0 && picked.length === props.shops.length}
                  onChange={(e) =>
                    setPicked(e.currentTarget.checked ? props.shops.map((s) => s.id) : [])
                  }
                />
              </th>
              <th className={cx(pf.th)}>Shop</th>
              <th className={cx(pf.th)}>Owner</th>
              <th className={cx(pf.th)}>Current version</th>
              <th className={cx(pf.th)}>Target</th>
              <th className={cx(pf.th)}>Deploy</th>
            </tr>
          </thead>
          <tbody>
            {props.shops.map((s) => (
              <tr key={s.id}>
                <td className={cx(pf.check)}>
                  <input
                    className={cx(pa.checkSm)}
                    type="checkbox"
                    aria-label={`select ${label(s)}`}
                    checked={picked.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                </td>
                <td className={cx(pf.td)}>{label(s)}</td>
                <td className={cx(pf.td)}>{s.owner_email || "no owner"}</td>
                <td className={cx(pf.td)}>
                  <span className={cx(pa.codeCell)}>{s.bundle || "none"}</span>
                </td>
                <td className={cx(pf.td)}>
                  <select
                    className={cx(pa.selectSm)}
                    value={targetOf(s)}
                    aria-label={`the target version of ${label(s)}`}
                    onChange={(e) =>
                      setTargets((prev) => ({ ...prev, [s.id]: e.currentTarget.value }))
                    }
                  >
                    {props.bundles
                      .filter((v) => v !== s.bundle)
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    <option value={s.bundle || ""}>{s.bundle || "none"}</option>
                  </select>
                </td>
                <td className={cx(pf.td)}>
                  <button
                    className={cx(pa.btnSm)}
                    type="button"
                    disabled={busy || !targetOf(s) || targetOf(s) === s.bundle}
                    onClick={() => deployOne(s, targetOf(s))}
                  >
                    Deploy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={cx(pa.tableNote)}>
        The platform reports the versions it holds; the file count and the
        upload date of a version are not part of that answer yet.
      </p>

      {preview ? (
        <div className={cx(pf.panel)}>
          <p className={cx(u.cardTitle)}>
            Assign {target} to {n(preview.length)} shop(s)
          </p>
          <pre className={cx(pf.diff)}>
            {preview
              .map(
                (l) =>
                  `${label(l.shop).padEnd(22)} ${l.from} → ${l.to}   ${
                    l.skip ? "already on it, skipped" : "will redeploy (worker restarted, ~20 s)"
                  }`,
              )
              .join("\n")}
          </pre>
          <p className={cx(u.rowSub)}>
            {n(changing.length)} shop(s) will change. {n(skipped.length)} shop(s){" "}
            {skipped.length === 1 ? "is" : "are"} skipped. 0 shops fail.
          </p>
          <div className={cx(u.btnRow)}>
            <button
              className={cx(b.btn, b.btnSecondary, u.btnGrow)}
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
            <button
              className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
              type="button"
              disabled={busy || changing.length === 0}
              onClick={assign}
            >
              {busy
                ? "Assigning…"
                : `Assign ${target} to ${n(changing.length)} shop(s)`}
            </button>
          </div>
        </div>
      ) : null}

      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}

      {results.length > 0 ? (
        <div className={cx(u.rows)}>
          {results.map((r) => (
            <div key={`${r.shop}-${r.text}`} className={cx(u.row)}>
              <div className={cx(u.rowMain)}>
                <p className={cx(u.rowTitle)}>{r.shop}</p>
                <p className={r.ok ? cx(u.rowSub) : cx(b.error)}>{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
