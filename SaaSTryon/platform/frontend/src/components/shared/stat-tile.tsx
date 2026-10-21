/* components/shared/stat-tile.tsx - a number with its label: the KPI
   row of a console. The kit owns the look (u.stat*). */
import type { JSX } from "react";
import { cx, ui as u } from "../../kit";

export function StatTile(props: { label: string; value: string }): JSX.Element {
  return (
    <div className={cx(u.stat)}>
      <p className={cx(u.statLabel)}>{props.label}</p>
      <p className={cx(u.statValue)}>{props.value}</p>
      <hr className={cx(u.statRule)} />
    </div>
  );
}
