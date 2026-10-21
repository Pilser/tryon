/* components/shared/confirm-box.tsx - the red confirm. A destructive
   action is red AND confirmed; an irreversible one asks for the name of
   the thing to be typed. */
import type { JSX, ReactNode } from "react";
import { base as b, cx, pf, ui as u } from "../../kit";

export function ConfirmBox(props: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** The phrase the operator has to type (irreversible actions). */
  phrase?: string;
  typed?: string;
  onTyped?: (value: string) => void;
}): JSX.Element {
  const ready = !props.phrase || (props.typed || "").trim() === props.phrase;
  return (
    <div className={cx(pf.confirm)}>
      <p className={cx(u.cardTitle)}>{props.title}</p>
      <div className={cx(u.rowSub)}>{props.body}</div>
      {props.phrase ? (
        <>
          <label className={cx(pf.label)} htmlFor="confirm-phrase">
            Type <strong>{props.phrase}</strong> to confirm
          </label>
          <input
            id="confirm-phrase"
            className={cx(pf.field)}
            value={props.typed || ""}
            autoComplete="off"
            onChange={(e) => props.onTyped?.(e.currentTarget.value)}
          />
        </>
      ) : null}
      <div className={cx(u.btnRow)}>
        <button
          className={cx(
            b.btn,
            b.btnDanger,
            u.btnGrow,
            (!ready || props.busy) && b.btnDisabled,
          )}
          type="button"
          disabled={!ready || props.busy}
          onClick={props.onConfirm}
        >
          {props.busy ? "Working…" : props.confirmLabel}
        </button>
        <button
          className={cx(b.btn, b.btnSecondary, u.btnGrow)}
          type="button"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
