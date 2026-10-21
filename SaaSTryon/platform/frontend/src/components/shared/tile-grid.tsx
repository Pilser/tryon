/* components/shared/tile-grid.tsx - the grid the tiles live in. The
   geometry is fixed (auto-fit, 240px) so a skeleton row keeps the
   layout while the list loads. */
import type { JSX, ReactNode } from "react";
import { cx, pf } from "../../kit";

export function TileGrid(props: { children: ReactNode }): JSX.Element {
  return <div className={cx(pf.tileGrid)}>{props.children}</div>;
}
