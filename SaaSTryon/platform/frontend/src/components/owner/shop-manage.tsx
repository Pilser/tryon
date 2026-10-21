/* components/owner/shop-manage.tsx - the manage panel of one shop: the
   six blocks that belong to a shop (settings, domain, landing, bundle,
   codes, activity). It opens IN PLACE under the tile row - the list
   stays visible, the panel is the durable object (P2).

   The owner has no delete here: removing a shop is the admin's job
   (SHOP-API.md 1.7b), so nothing in this panel is red - except the
   version switch, which restarts the shop's worker and therefore asks
   for a confirm. */
import { useEffect, useState, type JSX } from "react";
import { ApiError, type AuditRow, type ShopToken, type ShopView } from "../../api";
import { ownerBundles, ownerRedeploy } from "../../api-admin";
import { base as b, cx, pf, ui as u } from "../../kit";
import { ConfirmBox } from "../shared/confirm-box";
import { CopyCode } from "../shared/copy-code";
import { KV } from "../shared/kv";
import { Panel } from "../shared/panel";
import { Split } from "../shared/split";
import { ShopDomain } from "../shop-domain";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

const when = (ms: number): string => (ms ? new Date(ms).toLocaleString() : "unknown");

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/** The activity rows that belong to this shop. */
const belongsTo = (row: AuditRow, shop: ShopView): boolean =>
  row.subject === shop.id ||
  row.subject === shop.subdomain ||
  row.subject.includes(shop.id);

export function ShopManage(props: {
  shop: ShopView;
  sessionId: string;
  active: boolean;
  activeName: string;
  activity: AuditRow[];
  codes: ShopToken[];
  onChanged: () => void;
  onGoTo: (tab: string, shopId: string) => void;
}): JSX.Element {
  const s = props.shop;
  const host = s.url || `https://${s.subdomain}.latiforge.com`;
  const [bundles, setBundles] = useState<string[]>([]);
  const [bundle, setBundle] = useState(s.bundle || "");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => setBundle(s.bundle || ""), [s.bundle]);

  /* The versions the owner may move the shop to. */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const out = await ownerBundles(props.sessionId);
        if (live) setBundles(out.bundles || []);
      } catch {
        /* the picker keeps the current version only */
      }
    })();
    return () => {
      live = false;
    };
  }, [props.sessionId]);

  const rows = props.activity.filter((a) => belongsTo(a, s)).slice(0, 5);
  const myCodes = props.codes.filter((c) => c.shop_id === s.id);

  function switchVersion(): void {
    const id = bundle.trim();
    if (!id || id === s.bundle) return;
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await ownerRedeploy(props.sessionId, id);
        setNote(`The shop now runs on ${id}${out.url ? ` - ${out.url}` : ""}.`);
        setArmed(false);
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not update the shop."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <Panel
      title={s.name || s.subdomain}
      actions={
        <>
          <button
            className={cx(b.btn, b.btnSecondary)}
            type="button"
            onClick={() => props.onGoTo("", "")}
          >
            Close
          </button>
          <a
            className={cx(b.btn, b.btnSecondary)}
            href={host}
            target="_blank"
            rel="noreferrer"
          >
            Open shop
          </a>
          <a
            className={cx(b.btn, b.btnSecondary)}
            href={`${host}/app/studio.html?owner=1`}
            target="_blank"
            rel="noreferrer"
          >
            Open studio
          </a>
        </>
      }
    >
      <p className={cx(u.rowSub)}>
        <span className={cx(pf.code)}>{host}</span> ·{" "}
        <a
          className={cx(pf.textLink)}
          href={`${host}/api/feed`}
          target="_blank"
          rel="noreferrer"
        >
          open the feed
        </a>
      </p>

      <Split
        left={
          <>
            <p className={cx(pf.label)}>Shop</p>
            <KV
              rows={[
                { key: "Status", value: s.status },
                { key: "URL", value: <CopyCode code={host} /> },
                {
                  key: "Domain",
                  value: s.domain ? (
                    <a className={cx(pf.code)} href={`https://${s.domain}`} target="_blank" rel="noreferrer">
                      {s.domain}
                    </a>
                  ) : (
                    "not set"
                  ),
                },
                { key: "Tier", value: s.tier },
                { key: "Bundle", value: s.bundle || "unknown" },
                { key: "Created", value: day(s.created_ms) },
                {
                  key: "Studio token",
                  value: s.owner_token ? <CopyCode code={s.owner_token} /> : "not set",
                },
              ]}
            />
            <hr className={cx(u.hairline)} />
            <ShopDomain
              shop={s}
              sessionId={props.sessionId}
              active={props.active}
              activeName={props.activeName}
              onChanged={props.onChanged}
            />
            <hr className={cx(u.hairline)} />
            <p className={cx(pf.label)}>Version</p>
            <p className={cx(u.rowSub)}>
              The shop runs on {s.bundle || "no bundle"}. A new bundle brings new
              features (or a fix); the products, the credits and the landing files stay.
            </p>
            <label className={cx(pf.label)} htmlFor={`bundle-${s.id}`}>
              Bundle version
            </label>
            <select
              id={`bundle-${s.id}`}
              className={cx(pf.field)}
              value={bundle}
              disabled={busy}
              onChange={(e) => {
                setBundle(e.currentTarget.value);
                setArmed(false);
                setNote("");
              }}
            >
              <option value={s.bundle || ""}>{s.bundle || "unknown"}</option>
              {bundles
                .filter((v) => v !== s.bundle)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
            </select>
            {armed ? (
              <ConfirmBox
                title="Move the shop to another version?"
                body={
                  <>
                    The shop&apos;s worker restarts (about 20 seconds). The products,
                    the credits and the landing page stay. The studio at /app answers
                    again after the restart.
                  </>
                }
                confirmLabel={`Switch to ${bundle}`}
                busy={busy}
                onConfirm={switchVersion}
                onCancel={() => setArmed(false)}
              />
            ) : (
              <div className={cx(u.btnRow)}>
                <button
                  className={cx(
                    b.btn,
                    b.btnSecondary,
                    u.btnGrow,
                    (!bundle.trim() || bundle.trim() === s.bundle || busy) && b.btnDisabled,
                  )}
                  type="button"
                  disabled={!bundle.trim() || bundle.trim() === s.bundle || busy}
                  onClick={() => setArmed(true)}
                >
                  Switch version
                </button>
              </div>
            )}
            {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
          </>
        }
        right={
          <>
            <p className={cx(pf.label)}>Landing</p>
            {s.landing_files.length === 0 ? (
              <p className={cx(u.rowSub)}>
                No landing page published. Upload your built folder in the Landing tab,
                then publish it.
              </p>
            ) : (
              <p className={cx(u.rowSub)}>
                {n(s.landing_files.length)} published file(s):{" "}
                <span className={cx(pf.code)}>
                  {s.landing_files.slice(0, 4).join("  ")}
                  {s.landing_files.length > 4 ? `  (+${s.landing_files.length - 4} more)` : ""}
                </span>
              </p>
            )}
            <button
              className={cx(pf.textLink)}
              type="button"
              onClick={() => props.onGoTo("landing", s.id)}
            >
              Edit in the Landing tab →
            </button>
            <hr className={cx(u.hairline)} />
            <p className={cx(pf.label)}>Codes</p>
            {myCodes.length === 0 ? (
              <p className={cx(u.rowSub)}>
                {n(s.tokens_redeemed)} platform code(s) redeemed for this shop. A code
                buys one try-on credit.
              </p>
            ) : (
              <div className={cx(u.rows)}>
                {myCodes.map((c) => (
                  <div key={c.code} className={cx(u.rowMain)}>
                    <CopyCode code={c.code} />
                    <p className={cx(u.meta)}>
                      {c.status}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <button
              className={cx(pf.textLink)}
              type="button"
              onClick={() => props.onGoTo("codes", s.id)}
            >
              Mint codes →
            </button>
            <hr className={cx(u.hairline)} />
            <p className={cx(pf.label)}>Activity</p>
            {rows.length === 0 ? (
              <p className={cx(u.rowSub)}>
                Nothing yet for this shop - its first deploy shows up here.
              </p>
            ) : (
              <div className={cx(u.rows)}>
                {rows.map((a) => (
                  <div key={a.id} className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>
                      {a.action} - {a.subject}
                    </p>
                    <p className={cx(u.rowSub)}>
                      {when(a.created_ms)} · {a.actor}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <button
              className={cx(pf.textLink)}
              type="button"
              onClick={() => props.onGoTo("activity", s.id)}
            >
              All activity →
            </button>
          </>
        }
      />
    </Panel>
  );
}
