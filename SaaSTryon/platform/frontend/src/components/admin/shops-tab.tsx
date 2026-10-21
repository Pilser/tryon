/* components/admin/shops-tab.tsx - the admin's Shops tab: every tenant
   the platform hosts as a SMALL TILE, and the manage panel that opens
   IN PLACE under the tile row when a tile is opened (the list stays
   visible - the panel is the tenant's durable object, not a drawer).

   A tile says who the owner is: the owner of a shop is a customer of
   the platform, never the operator. */
import { type JSX } from "react";
import type { CreditRequest, ShopToken, ShopView } from "../../api";
import { cx, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { FilterBar } from "../shared/filter-bar";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { StatTile } from "../shared/stat-tile";
import { Tile } from "../shared/tile";
import { TileGrid } from "../shared/tile-grid";
import { ShopManage } from "./shop-manage";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const live = (s: ShopView): boolean => s.status === "live" || s.status === "active";

const statusKind = (status: string): "good" | "bad" | "plain" =>
  status === "live" || status === "active"
    ? "good"
    : status === "failed" || status === "suspended"
      ? "bad"
      : "plain";

export function ShopsTab(props: {
  shops: ShopView[];
  tokens: ShopToken[];
  credits: CreditRequest[];
  bundles: string[];
  adminToken: string;
  shopParam: string;
  onShop: (shopId: string) => void;
  query: string;
  filter: string;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onGoTo: (tab: string, shopId: string) => void;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  usePrimary(props.onPrimary, null);

  const shops = props.shops;
  const q = props.query.trim().toLowerCase();
  const state = props.filter === "live" || props.filter === "other" ? props.filter : "";
  const rows = shops.filter((s) => {
    if (state === "live" && !live(s)) return false;
    if (state === "other" && live(s)) return false;
    if (!q) return true;
    return [
      s.name,
      s.subdomain,
      s.url,
      s.domain || "",
      s.owner_email || "",
      s.owner_name || "",
      s.bundle,
      s.tier,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const selected = shops.find((s) => s.id === props.shopParam) || null;
  const liveCount = shops.filter(live).length;
  const creditsLeft = shops.reduce((a, s) => a + s.credits_left, 0);
  const owners = new Set(shops.map((s) => s.owner_email || "").filter(Boolean)).size;

  const chips = [
    { id: "all", label: `all (${shops.length})`, on: state === "" },
    { id: "live", label: `live (${liveCount})`, on: state === "live" },
    { id: "other", label: `other (${shops.length - liveCount})`, on: state === "other" },
  ];

  return (
    <>
      <div className={cx(u.statGrid)}>
        <StatTile label="Tenants" value={n(shops.length)} />
        <StatTile label="Live" value={n(liveCount)} />
        <StatTile label="Credits left" value={n(creditsLeft)} />
        <StatTile label="Owners" value={n(owners)} />
      </div>

      <Panel title="Tenants">
        <p className={cx(u.rowSub)}>
          Every shop the platform hosts. The owner of a shop is a customer with
          their own sign-in - you run their shop from here, they run it from
          theirs.
        </p>
        <FilterBar
          search={props.query}
          onSearch={props.onQuery}
          placeholder="search shop, subdomain, owner, domain"
          chips={chips}
          onChip={(id) => props.onFilter(id === "all" || id === state ? "" : id)}
          onClear={() => {
            props.onQuery("");
            props.onFilter("");
          }}
          filtered={props.query.trim() !== "" || state !== ""}
          count={`${n(rows.length)} of ${n(shops.length)} tenant(s)`}
        />
        {shops.length === 0 ? (
          <EmptyState
            title="No tenant yet."
            reason="A shop appears here the moment an approved owner deploys one. Until then there is nothing to manage."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing matches that filter."
            reason="No tenant matches the search and the filter - clear them to see every shop."
            action={
              <button
                className={cx(pf.textLink)}
                type="button"
                onClick={() => {
                  props.onQuery("");
                  props.onFilter("");
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <TileGrid>
            {rows.map((s) => (
              <Tile
                key={s.id}
                title={s.name || s.subdomain}
                chips={[
                  { label: s.status || "unknown", kind: statusKind(s.status) },
                  { label: s.tier || "no tier", kind: "admin" },
                ]}
                url={s.url}
                lines={[
                  `${s.owner_email || "no owner"} · ${s.tier || "no tier"}`,
                  `${n(s.credits_left)} credits left · ${s.bundle || "no bundle"} · ${n(
                    s.landing_files.length,
                  )} landing file(s)`,
                ]}
                open={s.id === props.shopParam}
                onOpen={() => props.onShop(props.shopParam === s.id ? "" : s.id)}
              />
            ))}
          </TileGrid>
        )}
      </Panel>

      {selected ? (
        <ShopManage
          shop={selected}
          tokens={props.tokens}
          credits={props.credits}
          bundles={props.bundles}
          adminToken={props.adminToken}
          onShop={props.onShop}
          onGoTo={props.onGoTo}
          onChanged={props.onChanged}
        />
      ) : null}
    </>
  );
}
