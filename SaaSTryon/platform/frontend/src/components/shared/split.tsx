/* components/shared/split.tsx - the two-column body of a manage panel:
   one column on a phone, two on a wide screen. */
import type { JSX, ReactNode } from "react";
import { cx, pf } from "../../kit";

export function Split(props: { left: ReactNode; right: ReactNode }): JSX.Element {
  return (
    <div className={cx(pf.split)}>
      <div>{props.left}</div>
      <div>{props.right}</div>
    </div>
  );
}
