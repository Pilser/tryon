/* components/admin/shop-codes.tsx - the Codes block of the manage
   panel: the codes that belong to THIS tenant.

   A code minted here belongs to the shop from the start, so nobody
   else can redeem it. Two ways out of a code: freeze it (it keeps its
   row, it just cannot be redeemed) or delete it (the row is gone for
   good - red and confirmed). */
import { useState, type JSX } from "react";
import { ApiError, adminCancelToken, type ShopToken, type ShopView } from "../../api";
import { adminDeleteToken, adminMintShopTokens } from "../../api-admin";
import { base as b, cx, pf, ui as u } from "../../kit";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

const chipOf = (status: string): string =>
  status === "active"
    ? cx(pf.chip, pf.chipGood)
    : status === "cancelled"
      ? cx(pf.chip, pf.chipBad)
      : cx(pf.chip);

export function ShopCodesBlock(props: {
  shop: ShopView;
  tokens: ShopToken[];
  adminToken: string;
  onChanged: () => void;
  onGoTo: (tab: string, shopId: string) => void;
}): JSX.Element {
  const s = props.shop;
  const [count, setCount] = useState("1");
  const [credits, setCredits] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState("");
  const [bad, setBad] = useState(false);
  const [gone, setGone] = useState<string[]>([]);

  const codes = props.tokens.filter((t) => !gone.includes(t.code));

  function mint(): void {
    const c = Math.max(1, Math.min(50, Number(count) || 0));
    if (!c) return;
    const v = Math.max(1, Math.min(100000, Number(credits) || 1));
    setBusy(true);
    setSay("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminMintShopTokens(
          props.adminToken,
          s.id,
          c,
          note.trim() || undefined,
          v,
        );
        setSay(
          `Minted ${out.tokens.length} code(s) for ${s.name || s.subdomain}, each worth ${v} credit(s).`,
        );
        setNote("");
        props.onChanged();
      } catch (e) {
        setSay(msg(e, "Could not mint the codes."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  /* Freeze: the code keeps its row, it just cannot be redeemed. */
  function freeze(code: string): void {
    setBusy(true);
    setSay("");
    setBad(false);
    void (async () => {
      try {
        await adminCancelToken(props.adminToken, code);
        setSay(`Code ${code} is frozen.`);
        props.onChanged();
      } catch (e) {
        setSay(msg(e, "Could not freeze that code."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  /* Delete: the row is gone for good. */
  function destroy(code: string): void {
    setBusy(true);
    setSay("");
    setBad(false);
    void (async () => {
      try {
        await adminDeleteToken(props.adminToken, code);
        setGone((prev) => [...prev, code]);
        setSay(`Code ${code} is deleted.`);
        props.onChanged();
      } catch (e) {
        setSay(msg(e, "Could not delete that code."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <>
      <p className={cx(pf.label)}>Codes of this tenant</p>
      <p className={cx(u.rowSub)}>
        A code buys one try-on credit. Minted here, it belongs to this shop from
        the start - the owner redeems it and the credit lands here.
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
          className={cx(pf.num)}
          type="number"
          min={1}
          max={100000}
          value={credits}
          aria-label="credits per code"
          disabled={busy}
          onChange={(e) => setCredits(e.currentTarget.value)}
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
          className={cx(b.btn, b.btnSecondary, u.btnGrow, busy && b.btnDisabled)}
          type="button"
          disabled={busy}
          onClick={mint}
        >
          {busy ? "Working…" : "Mint for this shop"}
        </button>
      </div>
      {say ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{say}</p> : null}
      {codes.length === 0 ? (
        <p className={cx(u.rowSub)}>
          No code for this tenant yet - the owner has redeemed {s.tokens_redeemed}{" "}
          code(s) in the past.
        </p>
      ) : (
        <div className={cx(u.rows)}>
          {codes.map((t) => (
            <div key={t.code} className={cx(u.row)}>
              <div className={cx(u.rowMain)}>
                <p className={cx(u.rowTitle)}>
                  <span className={cx(pf.code)}>{t.code}</span>{" "}
                  <span className={chipOf(t.status)}>{t.status}</span>
                </p>
                <p className={cx(u.rowSub)}>
                  {t.note ? `${t.note} · ` : ""}created {day(t.created_ms)}
                  {t.redeemed_ms ? ` · redeemed ${day(t.redeemed_ms)}` : ""}
                </p>
              </div>
              <div className={cx(u.btnRow)}>
                {t.status === "active" ? (
                  <button
                    className={cx(b.btn, b.btnSecondary, busy && b.btnDisabled)}
                    type="button"
                    disabled={busy}
                    onClick={() => freeze(t.code)}
                  >
                    Freeze
                  </button>
                ) : null}
                <DeleteCode code={t.code} busy={busy} onDelete={destroy} />
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        className={cx(pf.textLink)}
        type="button"
        onClick={() => props.onGoTo("codes", s.id)}
      >
        The whole code ledger →
      </button>
      <p className={cx(u.meta)}>
        The platform binds a code to the shop id{" "}
        <span className={cx(pf.code)}>{s.id}</span>.
      </p>
    </>
  );
}

/** The red row action: a code that is deleted keeps no trace. */
function DeleteCode(props: {
  code: string;
  busy: boolean;
  onDelete: (code: string) => void;
}): JSX.Element {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        className={cx(b.btn, b.btnDanger, props.busy && b.btnDisabled)}
        type="button"
        disabled={props.busy}
        onClick={() => setArmed(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <>
      <button
        className={cx(b.btn, b.btnDanger, props.busy && b.btnDisabled)}
        type="button"
        disabled={props.busy}
        onClick={() => props.onDelete(props.code)}
      >
        Really delete {props.code}
      </button>
      <button
        className={cx(b.btn, b.btnSecondary, props.busy && b.btnDisabled)}
        type="button"
        disabled={props.busy}
        onClick={() => setArmed(false)}
      >
        Keep
      </button>
    </>
  );
}
