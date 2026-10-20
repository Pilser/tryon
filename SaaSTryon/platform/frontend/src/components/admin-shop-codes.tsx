/* components/admin-shop-codes.tsx - the codes of ONE shop: the ones it
   owns, the new ones (minted for this shop, so they belong to it from
   the start) and the two ways out of a code - freeze it (it keeps its
   row, it just cannot be redeemed) or delete it (it is gone for good).
   The admin's code list is the source; the codes minted here are added
   on top of it, so the panel answers right away. */
import { useState, type JSX } from "react";
import { ApiError, adminCancelToken, type ShopToken, type ShopView } from "../api";
import { adminDeleteToken, adminMintShopTokens } from "../api-admin";
import { base as b, cx, pf, ui as u } from "../kit";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

const when = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

/* The chip of a code: olive while it can be redeemed, red when it is
   frozen. */
function CodeChip(props: { status: string }): JSX.Element {
  const cls =
    props.status === "active"
      ? cx(pf.chip, pf.chipGood)
      : props.status === "cancelled"
        ? cx(pf.chip, pf.chipBad)
        : cx(pf.chip);
  return <span className={cls}>{props.status}</span>;
}

/* One code: the code itself, its state and the two ways out. */
function CodeRow(props: {
  token: ShopToken;
  busy: boolean;
  onFreeze: (code: string) => void;
  onDelete: (code: string) => void;
}): JSX.Element {
  const t = props.token;
  const [armed, setArmed] = useState(false);
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>
          <span className={cx(pf.code)}>{t.code}</span> <CodeChip status={t.status} />
        </p>
        <p className={cx(u.rowSub)}>
          {t.note ? `${t.note} · ` : ""}created {when(t.created_ms)}
          {t.redeemed_ms ? ` · redeemed ${when(t.redeemed_ms)}` : ""}
        </p>
      </div>
      <div className={cx(u.btnRow)}>
        {t.status === "active" ? (
          <button
            className={cx(b.btn, b.btnSecondary, props.busy && b.btnDisabled)}
            type="button"
            disabled={props.busy}
            onClick={() => props.onFreeze(t.code)}
          >
            Freeze
          </button>
        ) : null}
        {armed ? (
          <button
            className={cx(b.btn, b.btnDanger, props.busy && b.btnDisabled)}
            type="button"
            disabled={props.busy}
            onClick={() => props.onDelete(t.code)}
          >
            Really delete
          </button>
        ) : (
          <button
            className={cx(b.btn, b.btnDanger, props.busy && b.btnDisabled)}
            type="button"
            disabled={props.busy}
            onClick={() => setArmed(true)}
          >
            Delete
          </button>
        )}
        {armed ? (
          <button
            className={cx(b.btn, b.btnSecondary, props.busy && b.btnDisabled)}
            type="button"
            disabled={props.busy}
            onClick={() => setArmed(false)}
          >
            Keep
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The codes of one shop, with the mint for this shop. */
export function ShopCodes(props: {
  shop: ShopView;
  adminToken: string;
  tokens: ShopToken[] | null;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const [extra, setExtra] = useState<ShopToken[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const [patched, setPatched] = useState<Record<string, ShopToken>>({});
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const base = (props.tokens || []).filter((t) => t.shop_id === s.id);
  /* The list of the platform and the codes minted here are one list -
     the code is keyed by its code, so it is never listed twice. */
  const merged = new Map<string, ShopToken>();
  for (const t of [...base, ...extra]) merged.set(t.code, t);
  for (const [code, t] of Object.entries(patched)) merged.set(code, t);
  const codes = [...merged.values()].filter((t) => !gone.includes(t.code));

  /* Mint: the code belongs to this shop from the start. */
  function mint(): void {
    const c = Math.max(1, Math.min(50, Number(count) || 0));
    if (!c) return;
    setBusy(true);
    setErr("");
    setNote("");
    void (async () => {
      try {
        const out = await adminMintShopTokens(props.adminToken, s.id, c, note.trim() || undefined);
        setExtra((prev) => [...prev, ...out.tokens]);
        setNote(`Minted ${out.tokens.length} code(s) for ${s.name || s.subdomain}.`);
        props.onChanged();
      } catch (e) {
        setErr(msg(e, "Could not mint the codes."));
      } finally {
        setBusy(false);
      }
    })();
  }

  /* Freeze: the code keeps its row, it just cannot be redeemed. */
  function freeze(code: string): void {
    setBusy(true);
    setErr("");
    void (async () => {
      try {
        const out = await adminCancelToken(props.adminToken, code);
        setPatched((prev) => ({ ...prev, [code]: out.token }));
        setNote(`Code ${code} is frozen.`);
        props.onChanged();
      } catch (e) {
        setErr(msg(e, "Could not freeze that code."));
      } finally {
        setBusy(false);
      }
    })();
  }

  /* Delete: the code is gone for good. */
  function destroy(code: string): void {
    setBusy(true);
    setErr("");
    void (async () => {
      try {
        await adminDeleteToken(props.adminToken, code);
        setGone((prev) => [...prev, code]);
        setExtra((prev) => prev.filter((t) => t.code !== code));
        setNote(`Code ${code} is deleted.`);
        props.onChanged();
      } catch (e) {
        setErr(msg(e, "Could not delete that code."));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(pf.label)}>Codes of this shop</p>
      <p className={cx(u.rowSub)}>
        A code minted here belongs to this shop from the start - the owner
        redeems it in the shop dashboard and the credits land here.
      </p>
      <div className={cx(pf.fieldRow)}>
        <input
          className={cx(pf.num)}
          type="number"
          min={1}
          max={50}
          value={count}
          aria-label="how many codes"
          disabled={busy}
          onChange={(e) => setCount(e.currentTarget.value)}
        />
        <input
          className={cx(pf.field)}
          type="text"
          value={note}
          placeholder="note (optional)"
          aria-label="note"
          disabled={busy}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <button
          className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
          type="button"
          disabled={busy}
          onClick={mint}
        >
          {busy ? "Working…" : "New code"}
        </button>
      </div>
      {note ? <p className={cx(u.inlineNote)}>{note}</p> : null}
      {err ? <p className={cx(b.error)}>{err}</p> : null}
      <hr className={cx(u.hairline)} />
      <div className={cx(u.rows)}>
        {codes.length === 0 ? (
          <p className={cx(u.empty)}>No code for this shop yet.</p>
        ) : (
          codes.map((t, i) => (
            <div key={t.code}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <CodeRow
                token={t}
                busy={busy}
                onFreeze={freeze}
                onDelete={destroy}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
