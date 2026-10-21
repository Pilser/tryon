/* components/owner/shops-tab.tsx - the owner's shops: the allowance on
   top, the shops as small tiles, and the manage panel under the tile
   row when a tile is opened. The deploy form is a panel too - it opens
   from the header's primary action. */
import { useMemo, useState, type JSX } from "react";
import type { AuditRow, MeOut, ShopToken, ShopView } from "../../api";
import { base as b, cx, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { Panel } from "../shared/panel";
import { StatTile } from "../shared/stat-tile";
import { TileGrid } from "../shared/tile-grid";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { DeployForm } from "./deploy-form";
import { ShopManage } from "./shop-manage";
import { ShopTile } from "./shop-tile";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

export function ShopsTab(props: {
  shops: ShopView[];
  sessionId: string;
  me: MeOut;
  activity: AuditRow[];
  codes: ShopToken[];
  shopParam: string;
  onShop: (shopId: string) => void;
  onGoTo: (tab: string, shopId: string) => void;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [deployOpen, setDeployOpen] = useState(false);

  /* The platform works on the newest shop of the owner: the older ones
     say so instead of pretending. */
  let active = props.shops[0];
  for (const s of props.shops) if (!active || s.created_ms > active.created_ms) active = s;
  const activeName = active ? active.name || active.subdomain : "";
  const left = Math.max(0, props.me.deploy_allowance - props.me.deploy_used);
  const selected = props.shops.find((s) => s.id === props.shopParam) || null;

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: deployOpen ? "Close" : "Deploy a shop",
      tone: deployOpen ? "secondary" : "primary",
      run: () => setDeployOpen((v) => !v),
      disabled: false,
    }),
    [deployOpen],
  );
  usePrimary(props.onPrimary, action);

  return (
    <>
      <div className={cx(u.statGrid)}>
        <StatTile label="Deploy allowance" value={n(props.me.deploy_allowance)} />
        <StatTile label="Shops deployed" value={n(props.me.deploy_used)} />
        <StatTile label="Left to deploy" value={n(left)} />
        <StatTile label="Shops live" value={n(props.shops.length)} />
      </div>

      {props.shops.length === 0 ? (
        <Panel title="Your shops">
          <EmptyState
            title="No shop yet."
            reason="Each shop gets its own address, its own landing page and its own try-on credits. One deploy uses 1 from your allowance."
            action={
              <button
                className={cx(b.btn, b.btnPrimary)}
                type="button"
                onClick={() => setDeployOpen(true)}
              >
                Deploy a shop
              </button>
            }
          />
        </Panel>
      ) : (
        <TileGrid>
          {props.shops.map((s) => (
            <ShopTile
              key={s.id}
              shop={s}
              open={s.id === props.shopParam}
              onOpen={() => props.onShop(props.shopParam === s.id ? "" : s.id)}
            />
          ))}
        </TileGrid>
      )}

      {selected ? (
        <ShopManage
          shop={selected}
          sessionId={props.sessionId}
          active={!!active && selected.id === active.id}
          activeName={activeName}
          activity={props.activity}
          codes={props.codes}
          onChanged={props.onChanged}
          onGoTo={props.onGoTo}
        />
      ) : null}

      {deployOpen ? (
        <Panel title="Deploy a shop">
          <p className={cx(u.rowSub)}>
            A deploy uses 1 from your allowance, so {left} deploy
            {left === 1 ? " remains" : "s remain"} before a top-up.
          </p>
          <DeployForm
            sessionId={props.sessionId}
            left={left}
            onDeployed={() => {
              setDeployOpen(false);
              props.onChanged();
            }}
          />
        </Panel>
      ) : null}
    </>
  );
}
