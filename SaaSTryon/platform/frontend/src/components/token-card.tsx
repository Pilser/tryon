/* components/token-card.tsx - the shared token-card login, copied from
   the shop dashboard's pattern (one field, one button, nothing clever):
   the platform login, the home page gate and the admin console all hold
   their token here. The caller owns what happens with it. */
import { base as b, cx, pf, ui as u } from "../kit";

export function TokenCard(props: {
  title: string;
  lead: string;
  placeholder: string;
  cta: string;
  busy?: boolean;
  error?: string;
  onToken: (token: string) => void;
}) {
  return (
    <form
      className={cx(u.card)}
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("token") as HTMLInputElement | null;
        const token = (input?.value || "").trim();
        if (token && !props.busy) props.onToken(token);
      }}
    >
      <h2 className={cx(u.cardTitle)}>{props.title}</h2>
      <p className={cx(u.rowSub)}>{props.lead}</p>
      <div className={cx(pf.fieldRow)}>
        <input
          className={cx(pf.field)}
          name="token"
          type="password"
          placeholder={props.placeholder}
          autoComplete="off"
          aria-label={props.placeholder}
        />
        <button
          className={cx(b.btn, b.btnPrimary, u.btnGrow)}
          type="submit"
          disabled={props.busy}
        >
          {props.busy ? "Checking…" : props.cta}
        </button>
      </div>
      {props.error ? <p className={cx(b.error)}>{props.error}</p> : null}
    </form>
  );
}
