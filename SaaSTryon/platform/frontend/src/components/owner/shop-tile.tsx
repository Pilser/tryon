/* components/owner/shop-tile.tsx - one shop as a small tile: the name,
   the status, the address and the numbers that matter. Ten of them fit
   on one screen - the owner must be able to scan, not to read. */
import type { JSX } from "react";
import type { ShopView } from "../../api";
import { Tile, type TileStatus } from "../shared/tile";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const statusKind = (status: string): TileStatus =>
  status === "live" || status === "active"
    ? "good"
    : status === "failed" || status === "suspended"
      ? "bad"
      : "plain";

export function ShopTile(props: {
  shop: ShopView;
  open: boolean;
  onOpen: () => void;
}): JSX.Element {
  const s = props.shop;
  const host = s.url || `https://${s.subdomain}.latiforge.com`;
  return (
    <Tile
      title={s.name || s.subdomain}
      chips={[
        { label: s.status, kind: statusKind(s.status) },
        { label: s.tier, kind: "admin" },
      ]}
      url={host.replace(/^https?:\/\//, "")}
      lines={[
        `${n(s.credits_left)} credits left`,
        `${s.bundle || "no bundle"} · ${n(s.landing_files.length)} landing file(s)`,
      ]}
      open={props.open}
      onOpen={props.onOpen}
    />
  );
}
