/* components/owner/mint-codes.tsx - minting platform codes for the
   owner's shop. A code tops up the try-on credits when it is redeemed,
   and the owner decides at mint time how many credits it is worth.
   The codes are shown once - copy them away. */
import { useState, type JSX } from "react";
import { ApiError, type ShopToken } from "../../api";
import { ownerMintTokens } from "../../api-admin";
import { base as b, cx, pf, ui as u } from "../../kit";

export function MintCodes(props: {
  sessionId: string;
  onMinted: (tokens: ShopToken[]) => void;
}): JSX.Element {
  const [count, setCount] = useState("1");
  const [credits, setCredits] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function submit(): void {
    const c = Math.max(1, Math.min(50, Number(count) || 0));
    if (!c) {
      setError("How many codes do you want? (1 - 50)");
      return;
    }
    const v = Math.max(1, Math.min(100000, Number(credits) || 1));
    setBusy(true);
    setError("");
    void (async () => {
      try {
        const out = await ownerMintTokens(
          props.sessionId,
          c,
          note.trim() || undefined,
          v,
        );
        props.onMinted(out.tokens || []);
        setNote("");
        setCount("1");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not mint the code.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div>
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
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
      </div>
      <p className={cx(u.rowSub)}>
        Each code is worth the credits you set here when it is redeemed.
      </p>
      {error ? <p className={cx(b.error)}>{error}</p> : null}
      <div className={cx(u.btnRow)}>
        <button
          className={cx(
            b.btn,
            b.btnPrimary,
            u.btnGrow,
            (busy || !Number(count)) && b.btnDisabled,
          )}
          type="button"
          disabled={busy || !Number(count)}
          onClick={submit}
        >
          {busy ? "Minting…" : "Mint codes"}
        </button>
      </div>
    </div>
  );
}
