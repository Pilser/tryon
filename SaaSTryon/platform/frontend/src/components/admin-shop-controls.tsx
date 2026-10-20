/* components/admin-shop-controls.tsx - the controls the admin has over
   ONE shop: the settings (name, tier, status), the redeploy on a bundle
   and the total delete. The delete is destructive - the Worker script,
   the per-shop database, the domains, the images and the rows all go -
   so it asks for the shop's name before it fires. */
import { useEffect, useState, type JSX } from "react";
import { ApiError, type ShopView } from "../api";
import { adminDeleteShop, adminRedeployShop, adminUpdateShop } from "../api-admin";
import { base as b, cx, pf, ui as u } from "../kit";
import { useBundles } from "./use-bundles";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/* The states a shop may be put in: the ones the platform writes itself
   plus the admin's own approved/suspended. */
const STATUSES = ["live", "deploying", "failed", "approved", "suspended"];

/* The settings: the name, the tier and the status of one shop. */
function ShopSettings(props: {
  shop: ShopView;
  adminToken: string;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const [name, setName] = useState(s.name || "");
  const [tier, setTier] = useState(s.tier || "");
  const [status, setStatus] = useState(s.status || "live");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  /* The row is the truth: a reload moves the fields with it. */
  useEffect(() => {
    setName(s.name || "");
    setTier(s.tier || "");
    setStatus(s.status || "live");
  }, [s.name, s.tier, s.status]);

  function save(): void {
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminUpdateShop(props.adminToken, s.id, {
          name: name.trim(),
          tier: tier.trim(),
          status,
        });
        setNote(`Saved: ${out.name} · ${out.tier} · ${out.status}.`);
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not save the settings."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(pf.label)}>Settings</p>
      <div className={cx(pf.fieldRow)}>
        <input
          className={cx(pf.field)}
          value={name}
          placeholder="shop name"
          aria-label="shop name"
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <input
          className={cx(pf.field)}
          value={tier}
          placeholder="tier (starter, pro…)"
          aria-label="tier"
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setTier(e.currentTarget.value)}
        />
      </div>
      <div className={cx(pf.fieldRow)}>
        <select
          className={cx(pf.field)}
          value={STATUSES.includes(status) ? status : "live"}
          aria-label="shop status"
          disabled={busy}
          onChange={(e) => setStatus(e.currentTarget.value)}
        >
          {STATUSES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button
          className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
          type="button"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
    </div>
  );
}

/* The redeploy: the shop moves to another bundle, its data stays. */
function ShopRedeploy(props: {
  shop: ShopView;
  adminToken: string;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const { bundles, error } = useBundles(props.adminToken);
  const [bundle, setBundle] = useState(s.bundle || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => setBundle(s.bundle || ""), [s.bundle]);

  /* The running bundle stays in the list even when the bucket does not
     have it (an old version). */
  const versions = bundles.includes(bundle) ? bundles : [bundle, ...bundles].filter(Boolean);

  function redeploy(): void {
    const id = bundle.trim();
    if (!id) return;
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminRedeployShop(props.adminToken, s.id, id);
        setNote(`Redeployed on ${id}${out.url ? ` - ${out.url}` : ""}.`);
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not redeploy that shop."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(pf.label)}>Bundle</p>
      <p className={cx(u.rowSub)}>
        The shop runs on {s.bundle || "no bundle"}. A redeploy re-sends the script and
        keeps the data of the shop.
      </p>
      <div className={cx(pf.fieldRow)}>
        <select
          className={cx(pf.field)}
          value={bundle}
          aria-label="bundle version"
          disabled={busy || versions.length === 0}
          onChange={(e) => setBundle(e.currentTarget.value)}
        >
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button
          className={cx(b.btn, b.btnSecondary, u.btnGrow, busy && b.btnDisabled)}
          type="button"
          disabled={busy || !bundle.trim()}
          onClick={redeploy}
        >
          {busy ? "Redeploying…" : "Redeploy"}
        </button>
      </div>
      {error ? <p className={cx(b.error)}>{error}</p> : null}
      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
    </div>
  );
}

/* The delete: everything of the shop goes, so the shop's name has to be
   typed before the button fires. */
function ShopDelete(props: {
  shop: ShopView;
  adminToken: string;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const label = s.name || s.subdomain;
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  const ready = typed.trim() === label;

  function destroy(): void {
    if (!ready) return;
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminDeleteShop(props.adminToken, s.id);
        const gone = out.removed.length ? out.removed.join(", ") : "nothing left";
        setNote(`Shop ${label} deleted (${gone}).`);
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not delete that shop."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(pf.label)}>Delete shop</p>
      <p className={cx(u.rowSub)}>
        This is the total one: the Worker script, the database of the shop, its
        domains, its images and its rows are gone. There is no undo.
      </p>
      {armed ? (
        <>
          <label className={cx(pf.label)} htmlFor={`del-${s.id}`}>
            Type <strong>{label}</strong> to confirm
          </label>
          <input
            id={`del-${s.id}`}
            className={cx(pf.field)}
            value={typed}
            placeholder={label}
            aria-label="confirm the shop name"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setTyped(e.currentTarget.value)}
          />
          <div className={cx(u.btnRow)}>
            <button
              className={cx(b.btn, b.btnDanger, u.btnGrow, (busy || !ready) && b.btnDisabled)}
              type="button"
              disabled={busy || !ready}
              onClick={destroy}
            >
              {busy ? "Deleting…" : "Delete for good"}
            </button>
            <button
              className={cx(b.btn, b.btnSecondary, u.btnGrow)}
              type="button"
              disabled={busy}
              onClick={() => {
                setArmed(false);
                setTyped("");
                setNote("");
              }}
            >
              Keep the shop
            </button>
          </div>
        </>
      ) : (
        <div className={cx(u.btnRow)}>
          <button
            className={cx(b.btn, b.btnDanger, u.btnGrow)}
            type="button"
            onClick={() => setArmed(true)}
          >
            Delete shop
          </button>
        </div>
      )}
      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
    </div>
  );
}

/** The three controls of one shop, in one panel. */
export function ShopControls(props: {
  shop: ShopView;
  adminToken: string;
  onChanged: () => void;
}): JSX.Element {
  return (
    <div className={cx(u.rowMain)}>
      <ShopSettings
        shop={props.shop}
        adminToken={props.adminToken}
        onChanged={props.onChanged}
      />
      <hr className={cx(u.hairline)} />
      <ShopRedeploy
        shop={props.shop}
        adminToken={props.adminToken}
        onChanged={props.onChanged}
      />
      <hr className={cx(u.hairline)} />
      <ShopDelete
        shop={props.shop}
        adminToken={props.adminToken}
        onChanged={props.onChanged}
      />
    </div>
  );
}
