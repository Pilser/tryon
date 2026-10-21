/* components/shared/console-header.tsx - the header of a console: the
   title and the lead on the left, the ONE primary action on the right
   (P1). The primary button is rendered from the action the current tab
   registered. */
import type { JSX, ReactNode } from "react";
import { base as b, cx, ui as u } from "../../kit";
import type { PrimaryAction } from "./primary-action";

export function ConsoleHeader(props: {
  title: string;
  lead: string;
  primary?: PrimaryAction | null;
  aside?: ReactNode;
}): JSX.Element {
  return (
    <header className={cx(u.header)}>
      <div>
        <h1 className={cx(u.h1)}>{props.title}</h1>
        <p className={cx(u.lead)}>{props.lead}</p>
      </div>
      <div className={cx(u.btnRow)}>
        {props.aside}
        {props.primary ? (
          <button
            className={cx(
              b.btn,
              props.primary.tone === "secondary" ? b.btnSecondary : b.btnPrimary,
              props.primary.disabled && b.btnDisabled,
            )}
            type="button"
            disabled={props.primary.disabled || props.primary.busy}
            onClick={props.primary.run}
          >
            {props.primary.busy ? "Working…" : props.primary.label}
          </button>
        ) : null}
      </div>
    </header>
  );
}
