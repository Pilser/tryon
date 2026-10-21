/* components/shared/empty-state.tsx - the designed empty moment (P3):
   the reason first, then the next action. A list that shows "no
   results" without saying why is a bug, not a state. */
import type { JSX, ReactNode } from "react";
import { cx, ui as u } from "../../kit";

export function EmptyState(props: {
  title: string;
  reason: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div>
      <p className={cx(u.cardTitle)}>{props.title}</p>
      <p className={cx(u.rowSub)}>{props.reason}</p>
      {props.action ? <div className={cx(u.btnRow)}>{props.action}</div> : null}
    </div>
  );
}
