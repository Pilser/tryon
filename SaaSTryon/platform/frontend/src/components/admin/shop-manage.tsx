/* components/admin/shop-manage.tsx - the manage panel of ONE tenant.

   The blocks: Settings and the Studio token (shop-settings.tsx), the
   Version, the Codes, the Credits, the Domain and the Landing. The
   panel opens IN PLACE under the tile row - the list behind it stays
   visible (P2).

   The owner of a shop is a different person from the operator: the
   copy never pretends otherwise, and the destructive action at the
   bottom is the only red thing in the panel. */
import { useEffect, useState, type JSX } from "react";
import { ApiError, type CreditRequest, type ShopToken, type ShopView } from "../../api";
import { adminRedeployShop } from "../../api-admin";
import { base as b, cx, pf, ui as u } from "../../kit";
import { ConfirmBox } from "../shared/confirm-box";
import { KV } from "../shared/kv";
import { Panel } from "../shared/panel";
import { Split } from "../shared/split";
import { ShopCodesBlock } from "./shop-codes";
import { DeleteShop } from "./shop-delete";
import { ShopSettings } from "./shop-settings";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

export function ShopManage(props: {
  shop: ShopView;
  tokens: ShopToken[];
  credits: CreditRequest[];
  bundles: string[];
  adminToken: string;
  onShop: (shopId: string) => void;
  onGoTo: (tab: string, shopId: string) => void;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const host = s.url || `https://${s.subdomain}.latiforge.com`;
  const label = s.name || s.subdomain;

  const [bundle, setBundle] = useState(s.bundle || "");
  const [redeployArmed, setRedeployArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [typed, setTyped] = useState("");

  /* The row is the truth: a reload moves the picker with it. */
  useEffect(() => setBundle(s.bundle || ""), [s.bundle]);

  /* The running bundle stays in the list even when the bucket does not
     have it (an old version). */
  const versions = props.bundles.includes(bundle)
    ? props.bundles
    : [bundle, ...props.bundles].filter(Boolean);

  const myCodes = props.tokens.filter((t) => t.shop_id === s.id);
  const myRequests = props.credits.filter((r) => r.shop_id === s.id);

  const say = (text: string, wrong: boolean): void => {
    setNote(text);
    setBad(wrong);
  };

  /* One shop on another bundle: the worker restarts, the data stays. */
  function redeploy(): void {
    const id = bundle.trim();
    if (!id) return;
    setBusy(true);
    say("", false);
    void (async () => {
      try {
        const out = await adminRedeployShop(props.adminToken, s.id, id);
        say(`Redeployed on ${id}${out.url ? ` - ${out.url}` : ""}.`, false);
        setRedeployArmed(false);
        props.onChanged();
      } catch (e) {
        say(msg(e, "Could not redeploy that shop."), true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <Panel
      title={
        <>
          {label} <span className={cx(pf.chip, pf.chipAdmin)}>tenant</span>
        </>
      }
      actions={
        <>
          <button
            className={cx(b.btn, b.btnSecondary)}
            type="button"
            onClick={() => props.onShop("")}
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
        Owner: <span className={cx(pf.code)}>{s.owner_email || "no owner"}</span>
        {s.owner_name ? ` (${s.owner_name})` : ""} — the owner signs in with their
        own token; you run the shop from here.
      </p>

      <Split
        left={
          <>
            <ShopSettings
              shop={s}
              adminToken={props.adminToken}
              onChanged={props.onChanged}
              onNote={say}
            />

            <hr className={cx(u.hairline)} />

            <p className={cx(pf.label)}>Version</p>
            <p className={cx(u.rowSub)}>
              The shop runs on{" "}
              <span className={cx(pf.code)}>{s.bundle || "no bundle"}</span>. A
              redeploy sends the new script and keeps the products, the credits
              and the landing files.
            </p>
            <select
              className={cx(pf.field)}
              value={bundle}
              aria-label="bundle version"
              disabled={busy || versions.length === 0}
              onChange={(e) => {
                setBundle(e.currentTarget.value);
                setRedeployArmed(false);
              }}
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {redeployArmed ? (
              <ConfirmBox
                title={`Redeploy ${label} on ${bundle}?`}
                body={
                  <>
                    The worker of the shop restarts (about 20 seconds). The
                    products, the credits and the landing page stay.
                  </>
                }
                confirmLabel={`Redeploy on ${bundle}`}
                busy={busy}
                onConfirm={redeploy}
                onCancel={() => setRedeployArmed(false)}
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
                  onClick={() => setRedeployArmed(true)}
                >
                  Redeploy this tenant
                </button>
              </div>
            )}
          </>
        }
        right={
          <>
            <ShopCodesBlock
              shop={s}
              tokens={myCodes}
              adminToken={props.adminToken}
              onChanged={props.onChanged}
              onGoTo={props.onGoTo}
            />

            <hr className={cx(u.hairline)} />

            <p className={cx(pf.label)}>Credits</p>
            <KV
              rows={[
                { key: "Granted", value: n(s.credits_granted) },
                { key: "Used", value: n(s.credits_used) },
                { key: "Left", value: n(s.credits_left) },
              ]}
            />
            {myRequests.length === 0 ? (
              <p className={cx(u.rowSub)}>No credit request open for this shop.</p>
            ) : (
              <div className={cx(u.rows)}>
                {myRequests.map((r) => (
                  <div key={r.id} className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>asks for {n(r.requested)} credit(s)</p>
                    <p className={cx(u.rowSub)}>{r.reason || "no reason given"}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              className={cx(pf.textLink)}
              type="button"
              onClick={() => props.onGoTo("credits", s.id)}
            >
              Open the credit queue →
            </button>

            <hr className={cx(u.hairline)} />

            <p className={cx(pf.label)}>Domain</p>
            {s.domain ? (
              <p className={cx(u.rowSub)}>
                <a
                  className={cx(pf.code)}
                  href={`https://${s.domain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.domain}
                </a>{" "}
                - the customer&apos;s own hostname.
              </p>
            ) : (
              <p className={cx(u.rowSub)}>
                Not set - the shop answers on our zone only. The owner attaches
                their own hostname from their console.
              </p>
            )}
            {s.hostnames && s.hostnames.length > 0 ? (
              <p className={cx(pf.code)}>{s.hostnames.join("  ")}</p>
            ) : null}

            <hr className={cx(u.hairline)} />

            <p className={cx(pf.label)}>Landing page</p>
            {s.landing_files.length === 0 ? (
              <p className={cx(u.rowSub)}>
                Nothing published. The owner uploads their built folder in their
                own console - publishing never happens from here.
              </p>
            ) : (
              <>
                <p className={cx(u.rowSub)}>
                  {n(s.landing_files.length)} published file(s):
                </p>
                <p className={cx(pf.code)}>{s.landing_files.join("  ")}</p>
              </>
            )}
            <a className={cx(pf.textLink)} href={host} target="_blank" rel="noreferrer">
              Open the live shop →
            </a>
          </>
        }
      />

      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}

      <hr className={cx(u.hairline)} />

      <p className={cx(pf.label)}>Delete shop</p>
      <p className={cx(u.rowSub)}>
        The total one: the Worker script, the database of the shop, its domains,
        its images, its landing files and all its rows are gone. There is no
        undo.
      </p>
      <DeleteShop
        shop={s}
        label={label}
        adminToken={props.adminToken}
        armed={deleteArmed}
        typed={typed}
        onArmed={setDeleteArmed}
        onTyped={setTyped}
        onChanged={props.onChanged}
        onClose={() => props.onShop("")}
      />
    </Panel>
  );
}
