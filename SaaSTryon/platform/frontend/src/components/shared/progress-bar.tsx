/* components/shared/progress-bar.tsx - the byte-weighted bar. The fill
   is the share of the BYTES that are done, never the share of the
   files: a bar that counts files lies about a big file (P8). */
import type { JSX } from "react";
import { cx, pf } from "../../kit";

export function ProgressBar(props: {
  value: number;
  total: number;
  bad?: boolean;
}): JSX.Element {
  const pct =
    props.total > 0
      ? Math.max(0, Math.min(100, Math.round((props.value / props.total) * 100)))
      : 0;
  return (
    <div
      className={cx(pf.bar)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(props.bad ? pf.barFillBad : pf.barFill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
