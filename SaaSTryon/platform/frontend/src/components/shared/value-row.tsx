/* components/shared/value-row.tsx - a number with its meaning: the label
   on the left, the value on the right (the kit's row). */
import type { JSX } from "react";
import { cx, ui as u } from "../../kit";

export function ValueRow(props: {
  label: string;
  sub: string;
  value: string;
}): JSX.Element {
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>{props.label}</p>
        <p className={cx(u.rowSub)}>{props.sub}</p>
      </div>
      <p className={cx(u.rowTitle)}>{props.value}</p>
    </div>
  );
}
