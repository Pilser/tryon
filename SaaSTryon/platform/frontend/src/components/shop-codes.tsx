/* components/shop-codes.tsx - the owner's own codes: mint a platform
   code for the shop (it lands on the try-on credits when it is redeemed
   in the shop dashboard) and copy it away. The platform API mints for
   the owner's ACTIVE shop, so an older shop says so instead of
   pretending. */
import { useState, type JSX } from "react";
import { ApiError, type ShopToken, type ShopView } from "../api";
import { ownerMintTokens } from "../api-admin";
import { base as b, cx, pf, ui as u } from "../kit";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/** One code with a copy button (the give-code pattern of the admin). */
function CodeBox(props: { code: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <span className={cx(pf.codeBox)}>
      <span className={cx(pf.code)}>{props.code}</span>
      <button
        className={cx(b.btn, b.btnSecondary)}
        type="button"
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(props.code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              window.prompt("Copy the code by hand:", props.code);
            }
          })();
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/** The codes of the owner's shop: mint and copy. */
export function ShopCodes(props: {
  shop: ShopView;
  sessionId: string;
  active: boolean;
  activeName: string;
}): JSX.Element {
  const s = props.shop;
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");
  const [codes, setCodes] = useState<ShopToken[]>([]);
  const [busy, setBusy] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [bad, setBad] = useState(false);

  function mint(): void {
    const c = Math.max(1, Math.min(50, Number(count) || 0));
    if (!c || !props.active) return;
    setBusy(true);
    setMsgText("");
    setBad(false);
    void (async () => {
      try {
        const out = await ownerMintTokens(props.sessionId, c, note.trim() || undefined);
        setCodes((prev) => [...out.tokens, ...prev]);
        setMsgText(`Minted ${out.tokens.length} code(s).`);
      } catch (e) {
        setMsgText(msg(e, "Could not mint the code."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(pf.label)}>Platform codes</p>
      <p className={cx(u.rowSub)}>
        A code tops up the try-on credits of the shop when it is redeemed in the shop
        dashboard. Keep it - it is shown here once.
      </p>
      <div className={cx(pf.fieldRow)}>
        <input
          className={cx(pf.num)}
          type="number"
          min={1}
          max={50}
          value={count}
          aria-label="how many codes"
          disabled={busy || !props.active}
          onChange={(e) => setCount(e.currentTarget.value)}
        />
        <input
          className={cx(pf.field)}
          type="text"
          value={note}
          placeholder="note (optional)"
          aria-label="note"
          disabled={busy || !props.active}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <button
          className={cx(b.btn, b.btnPrimary, u.btnGrow, (busy || !props.active) && b.btnDisabled)}
          type="button"
          disabled={busy || !props.active}
          onClick={mint}
        >
          {busy ? "Minting…" : "New code"}
        </button>
      </div>
      {!props.active ? (
        <p className={cx(u.meta)}>
          Codes belong to your active shop ({props.activeName}).
        </p>
      ) : null}
      {msgText ? (
        <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{msgText}</p>
      ) : null}
      {codes.length ? (
        <div className={cx(u.rows)}>
          {codes.map((t, i) => (
            <div key={t.code}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <div className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <CodeBox code={t.code} />
                  <p className={cx(u.meta)}>
                    {t.status}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
