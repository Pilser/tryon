/* components/shop-domain.tsx - the customer's own domain: the zone has
   to be a collaborator of the platform account, then the domain is
   typed here and the certificate is issued for it. The answer of the
   server is the instruction the customer has to act on, so it is shown
   verbatim. */
import { useState, type FormEvent, type JSX } from "react";
import { ApiError, type ShopView, attachShopDomain } from "../api";
import { base as b, cx, pf, ui as u } from "../kit";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/** The domain block of one shop card. */
export function ShopDomain(props: {
  shop: ShopView;
  sessionId: string;
  active: boolean;
  activeName: string;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const host = s.url || `https://${s.subdomain}.latiforge.com`;
  const [domain, setDomain] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  function submit(ev: FormEvent): void {
    ev.preventDefault();
    const value = domain.trim();
    if (!value) return;
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await attachShopDomain(props.sessionId, value);
        setNote(`Live on ${out.url} (zone ${out.zone}).`);
        setDomain("");
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not attach that domain."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(pf.label)}>Your domain</p>
      {s.domain ? (
        <p className={cx(u.rowSub)}>
          <a
            className={cx(pf.code)}
            href={`https://${s.domain}`}
            target="_blank"
            rel="noreferrer"
          >
            {s.domain}
          </a>
        </p>
      ) : (
        <p className={cx(u.rowSub)}>
          No domain yet - the shop answers on {host} until you attach your own.
        </p>
      )}
      {open ? (
        <>
          <p className={cx(u.rowSub)}>
            Add this Cloudflare account as a collaborator on that domain's zone,
            then type the domain here - the certificate is issued for you.
          </p>
          <form onSubmit={submit}>
            <label className={cx(pf.label)} htmlFor={`dom-${s.id}`}>
              Domain
            </label>
            <input
              id={`dom-${s.id}`}
              className={cx(pf.field)}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="myshop.com"
              autoComplete="off"
              disabled={busy || !props.active}
            />
            {note ? (
              <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p>
            ) : null}
            <div className={cx(u.btnRow)}>
              <button
                className={cx(
                  b.btn,
                  b.btnSecondary,
                  u.btnGrow,
                  (busy || !domain.trim() || !props.active) && b.btnDisabled,
                )}
                type="submit"
                disabled={busy || !domain.trim() || !props.active}
              >
                {busy ? "Attaching…" : "Attach domain"}
              </button>
              <button
                className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className={cx(u.btnRow)}>
          <button
            className={cx(b.btn, b.btnSecondary, u.btnGrow, !props.active && b.btnDisabled)}
            type="button"
            onClick={() => setOpen(true)}
            disabled={!props.active}
          >
            {s.domain ? "Change domain" : "Add your domain"}
          </button>
        </div>
      )}
      {!props.active ? (
        <p className={cx(u.meta)}>
          Domain and landing files belong to your active shop ({props.activeName}).
        </p>
      ) : null}
    </div>
  );
}
