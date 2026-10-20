/* components/shop-bundle.tsx - the owner's bundle: the version the shop
   runs on and the button that moves it to another one. The data of the
   shop stays - a redeploy re-sends the script, it does not touch the
   products. The platform API redeploys the owner's ACTIVE shop, so an
   older shop says so instead of pretending. */
import { useEffect, useState, type JSX } from "react";
import { ApiError, type ShopView } from "../api";
import { ownerRedeploy } from "../api-admin";
import { base as b, cx, pf, ui as u } from "../kit";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/** The bundle of the owner's shop: the label and the update. */
export function ShopBundle(props: {
  shop: ShopView;
  sessionId: string;
  active: boolean;
}): JSX.Element {
  const s = props.shop;
  const [bundle, setBundle] = useState(s.bundle || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  /* The shop list is the truth about the running bundle. */
  useEffect(() => setBundle(s.bundle || ""), [s.bundle]);

  function update(): void {
    const id = bundle.trim();
    if (!id || !props.active) return;
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await ownerRedeploy(props.sessionId, id);
        setNote(`The shop now runs on ${id}${out.url ? ` - ${out.url}` : ""}.`);
      } catch (e) {
        setNote(msg(e, "Could not update the shop."));
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
        The shop runs on {s.bundle || "no bundle"}. A new bundle brings new features
        (or a fix); the products and the credits of the shop stay.
      </p>
      <label className={cx(pf.label)} htmlFor={`bundle-${s.id}`}>
        Bundle version
      </label>
      <input
        id={`bundle-${s.id}`}
        className={cx(pf.field)}
        value={bundle}
        placeholder="v0.9.15"
        aria-label="bundle version"
        autoComplete="off"
        disabled={busy || !props.active}
        onChange={(e) => setBundle(e.currentTarget.value)}
      />
      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
      <div className={cx(u.btnRow)}>
        <button
          className={cx(
            b.btn,
            b.btnPrimary,
            u.btnGrow,
            (busy || !bundle.trim() || !props.active) && b.btnDisabled,
          )}
          type="button"
          disabled={busy || !bundle.trim() || !props.active}
          onClick={update}
        >
          {busy ? "Updating…" : "Update my shop"}
        </button>
      </div>
      {!props.active ? (
        <p className={cx(u.meta)}>Only your active shop can be updated.</p>
      ) : null}
    </div>
  );
}
