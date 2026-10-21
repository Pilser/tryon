/* components/admin/shop-settings.tsx - the Settings block of the
   manage panel: the name, the tier and the status of the tenant, the
   facts that do not change, and the STUDIO TOKEN.

   The studio token is the tenant's own secret for the studio at /app.
   The admin sees it (the admin runs the shop) and may SET it by hand:
   the owner types it into their dashboard, so a readable one ("jam-fit-2026")
   beats a random blob. Setting it redeploys the shop, so the old token
   dies at once and the products, the credits and the landing files
   stay. */
import { useEffect, useState, type JSX } from "react";
import { ApiError, type ShopView } from "../../api";
import { adminSetOwnerToken, adminUpdateShop } from "../../api-admin";
import { base as b, cx, pf, ui as u } from "../../kit";
import { ConfirmBox } from "../shared/confirm-box";
import { CopyCode } from "../shared/copy-code";
import { KV } from "../shared/kv";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/* The states a shop may be put in: the ones the platform writes itself
   plus the admin's own approved/suspended. */
const STATUSES = ["live", "deploying", "failed", "approved", "suspended"];

export function ShopSettings(props: {
  shop: ShopView;
  adminToken: string;
  onChanged: () => void;
  onNote: (note: string, bad: boolean) => void;
}): JSX.Element {
  const s = props.shop;
  const [name, setName] = useState(s.name || "");
  const [tier, setTier] = useState(s.tier || "");
  const [status, setStatus] = useState(s.status || "live");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(s.owner_token || "");
  /* What the admin is typing: the token they want the shop to use. */
  const [draft, setDraft] = useState(s.owner_token || "");
  const [armed, setArmed] = useState(false);

  /* The row is the truth: a reload moves the fields with it. */
  useEffect(() => {
    setName(s.name || "");
    setTier(s.tier || "");
    setStatus(s.status || "live");
    setToken(s.owner_token || "");
    setDraft(s.owner_token || "");
  }, [s.name, s.tier, s.status, s.owner_token]);

  function save(): void {
    setBusy(true);
    props.onNote("", false);
    void (async () => {
      try {
        const out = await adminUpdateShop(props.adminToken, s.id, {
          name: name.trim(),
          tier: tier.trim(),
          status,
        });
        props.onNote(`Saved: ${out.name} · ${out.tier} · ${out.status}.`, false);
        props.onChanged();
      } catch (e) {
        props.onNote(msg(e, "Could not save the settings."), true);
      } finally {
        setBusy(false);
      }
    })();
  }

  /* The studio token, typed by hand. The admin can also let the
     platform mint a fresh one (the same call, no token). */
  function applyToken(value: string): void {
    setBusy(true);
    props.onNote("", false);
    void (async () => {
      try {
        const out = await adminSetOwnerToken(props.adminToken, s.id, value || undefined);
        setToken(out.owner_token || "");
        setDraft(out.owner_token || "");
        props.onNote(
          out.owner_token
            ? `The studio token is now "${out.owner_token}" - the old one no longer works.`
            : "The shop was redeployed, but the platform returned no token.",
          false,
        );
        setArmed(false);
        props.onChanged();
      } catch (e) {
        props.onNote(msg(e, "Could not set the studio token."), true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <>
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
          placeholder="tier (starter, studio…)"
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
      <KV
        rows={[
          { key: "Status", value: s.status || "unknown" },
          { key: "URL", value: <CopyCode code={s.url || s.subdomain} /> },
          { key: "Subdomain", value: s.subdomain },
          { key: "Tier", value: s.tier || "none" },
          { key: "Created", value: day(s.created_ms) },
          {
            key: "Codes redeemed",
            value: `${n(s.tokens_redeemed)} code(s) turned into credits`,
          },
        ]}
      />

      <hr className={cx(u.hairline)} />

      <p className={cx(pf.label)}>Studio token</p>
      <p className={cx(u.rowSub)}>
        The owner&apos;s secret for the studio at /app. You can see it because you
        run the shop - the owner signs in with it. Set it to something the owner
        can type: letters, digits, dash and underscore, 8 to 64 of them.
      </p>
      {token ? (
        <CopyCode code={token} label="Copy token" />
      ) : (
        <p className={cx(u.meta)}>No token on this shop yet.</p>
      )}
      <div className={cx(pf.fieldRow)}>
        <input
          className={cx(pf.field)}
          value={draft}
          placeholder="jam-fit-2026"
          aria-label="the studio token to set"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => setDraft(e.currentTarget.value)}
        />
        <button
          className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
          type="button"
          disabled={busy || draft.trim().length < 8}
          onClick={() => applyToken(draft.trim())}
        >
          {busy ? "Saving…" : "Set this token"}
        </button>
      </div>
      {armed ? (
        <ConfirmBox
          title="Mint a new studio token?"
          body={
            <>
              The platform picks a fresh token and redeploys the shop: its worker
              restarts (about 20 seconds) and the old token stops working at once.
              The owner needs the new one.
            </>
          }
          confirmLabel="Mint a new token"
          busy={busy}
          onConfirm={() => applyToken("")}
          onCancel={() => setArmed(false)}
        />
      ) : (
        <div className={cx(u.btnRow)}>
          <button
            className={cx(b.btn, b.btnSecondary, u.btnGrow)}
            type="button"
            disabled={busy}
            onClick={() => setArmed(true)}
          >
            Mint a new token instead
          </button>
        </div>
      )}
    </>
  );
}
