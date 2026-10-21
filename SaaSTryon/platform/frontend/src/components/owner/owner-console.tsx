/* components/owner/owner-console.tsx - the console itself: the tab
   strip, the URL that carries the state (the tab, the shop, the
   filters) and the six tabs. The page shell keeps the session; this
   keeps the console. */
import type { JSX } from "react";
import type { AuditRow, MeOut, ShopToken, ShopView } from "../../api";
import { TabStrip } from "../shared/tab-strip";
import { useUrlParam } from "../shared/url-state";
import type { PrimaryAction } from "../shared/primary-action";
import { ActivityTab } from "./activity-tab";
import { CodesTab } from "./codes-tab";
import { CreditsTab } from "./credits-tab";
import { LandingTab } from "./landing-tab";
import { SettingsTab } from "./settings-tab";
import { ShopsTab } from "./shops-tab";

const TABS = ["shops", "landing", "credits", "codes", "activity", "settings"] as const;

type Tab = (typeof TABS)[number];

const isTab = (v: string): v is Tab => (TABS as readonly string[]).includes(v);

export function OwnerConsole(props: {
  me: MeOut;
  sessionId: string;
  shops: ShopView[];
  activity: AuditRow[];
  codes: ShopToken[];
  onCodes: (codes: ShopToken[]) => void;
  onChanged: () => void;
  onSignOut: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [tabParam, setTabParam] = useUrlParam("tab", "shops");
  const [shopParam, setShopParam] = useUrlParam("shop", "");
  const tab: Tab = isTab(tabParam) ? tabParam : "shops";

  const creditsLeft = props.shops.reduce((a, s) => a + s.credits_left, 0);

  const tabs = [
    { id: "shops", label: `Shops (${props.shops.length})` },
    { id: "landing", label: "Landing" },
    { id: "credits", label: `Credits (${creditsLeft})` },
    { id: "codes", label: `Codes (${props.codes.length})` },
    { id: "activity", label: `Activity (${props.activity.length})` },
    { id: "settings", label: "Settings" },
  ];

  /* The tab and the shop live in the URL - a console view is a link. */
  const changeTab = (id: string): void => {
    props.onPrimary(null);
    setTabParam(id);
  };

  const goTo = (to: string, shopId: string): void => {
    props.onPrimary(null);
    if (to) setTabParam(to);
    setShopParam(shopId);
  };

  return (
    <>
      <TabStrip tabs={tabs} active={tab} onChange={changeTab} />
      {tab === "shops" ? (
        <ShopsTab
          shops={props.shops}
          sessionId={props.sessionId}
          me={props.me}
          activity={props.activity}
          codes={props.codes}
          shopParam={shopParam}
          onShop={setShopParam}
          onGoTo={goTo}
          onChanged={props.onChanged}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "landing" ? (
        <LandingTab
          shops={props.shops}
          sessionId={props.sessionId}
          shopParam={shopParam}
          onShop={setShopParam}
          onChanged={props.onChanged}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "credits" ? (
        <CreditsTab shops={props.shops} onPrimary={props.onPrimary} />
      ) : null}
      {tab === "codes" ? (
        <CodesTab
          shops={props.shops}
          sessionId={props.sessionId}
          shopParam={shopParam}
          codes={props.codes}
          onCodes={props.onCodes}
          onChanged={props.onChanged}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "activity" ? (
        <ActivityTab activity={props.activity} onPrimary={props.onPrimary} />
      ) : null}
      {tab === "settings" ? (
        <SettingsTab
          me={props.me}
          sessionId={props.sessionId}
          onSignOut={props.onSignOut}
          onPrimary={props.onPrimary}
        />
      ) : null}
    </>
  );
}
