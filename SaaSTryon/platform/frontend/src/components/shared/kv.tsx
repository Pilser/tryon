/* components/shared/kv.tsx - a key/value list: the left column names the
   thing, the right column carries the value. Dense, no dots, no guess. */
import { Fragment, type JSX, type ReactNode } from "react";
import { cx, pf } from "../../kit";

export function KV(props: {
  rows: { key: string; value: ReactNode }[];
}): JSX.Element {
  return (
    <div className={cx(pf.kv)}>
      {props.rows.map((r, i) => (
        <Fragment key={`${r.key}-${i}`}>
          <span className={cx(pf.kvKey)}>{r.key}</span>
          <span className={cx(pf.kvVal)}>{r.value}</span>
        </Fragment>
      ))}
    </div>
  );
}
