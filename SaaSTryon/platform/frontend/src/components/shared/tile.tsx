/* components/shared/tile.tsx - the small tile: one shop, three lines and
   the "manage" affordance. The whole tile is the button (P2: a click
   opens the detail in place, not a card with five links). */
import type { JSX } from "react";
import { cx, pf, ui as u } from "../../kit";

export type TileStatus = "good" | "bad" | "admin" | "plain";

export interface TileChip {
  label: string;
  kind: TileStatus;
}

const chipOf = (kind: TileStatus): string =>
  kind === "good"
    ? cx(pf.chip, pf.chipGood)
    : kind === "bad"
      ? cx(pf.chip, pf.chipBad)
      : kind === "admin"
        ? cx(pf.chip, pf.chipAdmin)
        : cx(pf.chip);

export function Tile(props: {
  title: string;
  chips?: TileChip[];
  url?: string;
  lines?: string[];
  open?: boolean;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={cx(pf.tile, props.open && pf.tileOn)}
      aria-expanded={props.open}
      onClick={props.onOpen}
    >
      <span className={cx(u.inlineHead)}>
        <span className={cx(u.rowTitle)}>{props.title}</span>
        {(props.chips || []).map((c, i) => (
          <span key={i} className={chipOf(c.kind)}>
            {c.label}
          </span>
        ))}
      </span>
      {props.url ? <span className={cx(pf.code)}>{props.url}</span> : null}
      {(props.lines || []).map((line, i) => (
        <span key={i} className={cx(u.rowSub)}>
          {line}
        </span>
      ))}
      <span className={cx(pf.tileFoot)}>{props.open ? "▸ close" : "▸ manage"}</span>
    </button>
  );
}
