/* components/owner/deploy-form.tsx - the deploy form: the address the
   customers will type. It opens as a panel under the shop list (the
   header's primary action opens it) and the button inside the panel
   does the deploy. */
import { useState, type FormEvent, type JSX } from "react";
import { ApiError, deployShop } from "../../api";
import { base as b, cx, pf, ui as u } from "../../kit";

export function DeployForm(props: {
  sessionId: string;
  left: number;
  onDeployed: (url: string) => void;
}): JSX.Element {
  const [sub, setSub] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liveUrl, setLiveUrl] = useState("");

  function submit(ev: FormEvent): void {
    ev.preventDefault();
    const slug = sub.trim().toLowerCase();
    if (!slug) {
      setError("Pick the address your customers will type.");
      return;
    }
    if (props.left < 1) {
      setError("Your deploy allowance is used up - ask the platform for more.");
      return;
    }
    setBusy(true);
    setError("");
    setLiveUrl("");
    void (async () => {
      try {
        const out = await deployShop(props.sessionId, { subdomain: slug });
        const url = out.url || `https://${out.subdomain}.latiforge.com`;
        setLiveUrl(url);
        setSub("");
        props.onDeployed(url);
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "Deploy failed - the platform did not answer.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }

  const predicted = sub.trim().toLowerCase();

  return (
    <form onSubmit={submit}>
      <label className={cx(pf.label)} htmlFor="dp-sub">
        Shop address
      </label>
      <input
        id="dp-sub"
        className={cx(pf.field)}
        value={sub}
        onChange={(e) => setSub(e.target.value)}
        placeholder="amina-studio"
        autoComplete="off"
        disabled={busy}
      />
      <p className={cx(u.inlineNote)}>
        This deploy produces{" "}
        <strong>https://{predicted || "your-shop"}.latiforge.com</strong> - the studio
        answers at /app, your landing page at the root.
      </p>
      {error ? <p className={cx(b.error)}>{error}</p> : null}
      {liveUrl ? (
        <p className={cx(u.inlineNote)}>
          Shop is live:{" "}
          <a className={cx(pf.code)} href={liveUrl} target="_blank" rel="noreferrer">
            {liveUrl}
          </a>
        </p>
      ) : null}
      <div className={cx(u.btnRow)}>
        <button
          className={cx(
            b.btn,
            b.btnPrimary,
            u.btnGrow,
            (busy || !sub.trim() || props.left < 1) && b.btnDisabled,
          )}
          type="submit"
          disabled={busy || !sub.trim() || props.left < 1}
        >
          {busy ? "Deploying…" : "Deploy shop"}
        </button>
      </div>
    </form>
  );
}
