/* components/shared/console-skeleton.tsx - the loading state of a
   console: the geometry of the page without the data. A spinner in an
   empty card would move everything when the data lands; a skeleton
   keeps the layout still (P8). */
import type { JSX } from "react";
import { cx, pf, ui as u } from "../../kit";

export function ConsoleSkeleton(props: { tiles?: number }): JSX.Element {
  const count = props.tiles ?? 4;
  return (
    <>
      <div className={cx(u.statGrid)}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cx(u.stat)}>
            <p className={cx(u.statLabel)}>—</p>
            <p className={cx(u.statValue)}>—</p>
            <hr className={cx(u.statRule)} />
          </div>
        ))}
      </div>
      <div className={cx(pf.tileGrid)}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={cx(pf.tile)}>
            <span className={cx(u.rowTitle)}>—</span>
            <span className={cx(u.rowSub)}>—</span>
            <span className={cx(u.rowSub)}>—</span>
          </div>
        ))}
      </div>
    </>
  );
}
