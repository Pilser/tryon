/* components/admin/admin-console.tsx - the admin console: the tab
   strip, the URL that carries the state (the tab, the tenant, the
   search, the filter) and the seven tabs.

   The page shell keeps the ADMIN_TOKEN (in memory only); this keeps the
   console. The tab strip is NOT the primary action - the primary
   action sits in the page header, right-aligned, and changes with the
   tab (DESIGN.md P1, P6). */
import { type JSX } from "react";
import type {
  AuditRow,
  CreditRequest,
  PlatformUser,
  ShopToken,
  ShopView,
} from "../../api";
import { TabStrip } from "../shared/tab-strip";
import { useUrlParam } from "../shared/url-state";
import type { PrimaryAction } from "../shared/primary-action";
import { ActivityTab } from "./activity-tab";
import { AccountsTab } from "./accounts-tab";
import { BundlesTab } from "./bundles-tab";
import { CodesTab } from "./codes-tab";
import { CreditsTab } from "./credits-tab";
import { RequestsTab } from "./requests-tab";
import { ShopsTab } from "./shops-tab";

const TABS = [
  "requests",
  "accounts",
  "shops",
  "bundles",
  "codes",
  "credits",
  "activity",
] as const;

type Tab = (typeof TABS)[number];

const isTab = (v: string): v is Tab => (TABS as readonly string[]).includes(v);

/** Everything the admin console reads. */
export interface AdminData {
  users: PlatformUser[];
  tokens: ShopToken[];
  credits: CreditRequest[];
  shops: ShopView[];
  activity: AuditRow[];
  /** The bundle versions in the bucket (the rollback surface). */
  bundles: string[];
}

/** Everything the admin console writes from the shell (the tabs that
    own their own writes call the API themselves and then ask for a
    reload). */
export interface AdminActions {
  approve: (user: PlatformUser) => void;
  reject: (user: PlatformUser) => void;
  setAllowance: (id: string, value: string) => void;
  /** The sign-in token the operator is typing for a user. */
  setUserToken: (id: string, value: string) => void;
  /** The operator sets (or rotates) a user's sign-in token. */
  setUserLoginToken: (user: PlatformUser) => void;
  saveAllowance: (user: PlatformUser) => void;
  toggleUser: (user: PlatformUser) => void;
  creditApprove: (id: string) => void;
  creditReject: (id: string, reason: string) => void;
  cancelToken: (code: string) => void;
  deleteToken: (code: string) => void;
  /** Delete many codes at once (the spent, the frozen, or both). */
  purgeTokens: (statuses: ("used" | "cancelled")[]) => void;
  /** The bundle list changed (a new version was uploaded). */
  reloadBundles: () => void;
  /** Something changed on the server: read it all again. */
  changed: () => void;
}

export function AdminConsole(props: {
  adminToken: string;
  data: AdminData;
  actions: AdminActions;
  busy: boolean;
  /** The sign-in token minted by an approve, shown once. */
  issued: Record<string, string>;
  /** The allowance the operator is typing but has not saved yet. */
  allowance: Record<string, string>;
  /** The sign-in token the operator is typing for a user. */
  userToken: Record<string, string>;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [tabParam, setTabParam] = useUrlParam("tab", "requests");
  const [shopParam, setShopParam] = useUrlParam("shop", "");
  const [query, setQuery] = useUrlParam("q", "");
  const [filter, setFilter] = useUrlParam("status", "");
  const tab: Tab = isTab(tabParam) ? tabParam : "requests";

  const d = props.data;
  const pending = d.users.filter((u) => u.status === "pending").length;
  const accounts = d.users.length - pending;
  const activeCodes = d.tokens.filter((t) => t.status === "active").length;
  const pendingCredits = d.credits.length;

  const tabs = [
    { id: "requests", label: `Requests (${pending})` },
    { id: "accounts", label: `Accounts (${accounts})` },
    { id: "shops", label: `Shops (${d.shops.length})` },
    { id: "bundles", label: `Bundles (${d.bundles.length})` },
    { id: "codes", label: `Codes (${activeCodes})` },
    { id: "credits", label: `Credits (${pendingCredits})` },
    { id: "activity", label: `Activity (${d.activity.length})` },
  ];

  /* A tab carries its own search and filter: the URL keeps them, so a
     filtered view is a link - but they never leak from one tab into
     the next. */
  const changeTab = (id: string): void => {
    props.onPrimary(null);
    setQuery("");
    setFilter("");
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
      {tab === "requests" ? (
        <RequestsTab
          users={d.users}
          busy={props.busy}
          issued={props.issued}
          allowance={props.allowance}
          userToken={props.userToken}
          query={query}
          onQuery={setQuery}
          onAllowance={props.actions.setAllowance}
          onUserToken={props.actions.setUserToken}
          onApprove={props.actions.approve}
          onReject={props.actions.reject}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "accounts" ? (
        <AccountsTab
          users={d.users}
          busy={props.busy}
          issued={props.issued}
          allowance={props.allowance}
          userToken={props.userToken}
          query={query}
          filter={filter}
          onQuery={setQuery}
          onFilter={setFilter}
          onAllowance={props.actions.setAllowance}
          onUserToken={props.actions.setUserToken}
          onSetToken={props.actions.setUserLoginToken}
          onSave={props.actions.saveAllowance}
          onToggle={props.actions.toggleUser}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "shops" ? (
        <ShopsTab
          shops={d.shops}
          tokens={d.tokens}
          credits={d.credits}
          bundles={d.bundles}
          adminToken={props.adminToken}
          shopParam={shopParam}
          onShop={setShopParam}
          query={query}
          filter={filter}
          onQuery={setQuery}
          onFilter={setFilter}
          onGoTo={goTo}
          onChanged={props.actions.changed}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "bundles" ? (
        <BundlesTab
          shops={d.shops}
          bundles={d.bundles}
          adminToken={props.adminToken}
          onReload={props.actions.reloadBundles}
          onChanged={props.actions.changed}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "codes" ? (
        <CodesTab
          codes={d.tokens}
          shops={d.shops}
          adminToken={props.adminToken}
          busy={props.busy}
          query={query}
          filter={filter}
          onQuery={setQuery}
          onFilter={setFilter}
          onCancel={props.actions.cancelToken}
          onDelete={props.actions.deleteToken}
          onPurge={props.actions.purgeTokens}
          onChanged={props.actions.changed}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "credits" ? (
        <CreditsTab
          adminToken={props.adminToken}
          requests={d.credits}
          shops={d.shops}
          busy={props.busy}
          onApprove={props.actions.creditApprove}
          onReject={props.actions.creditReject}
          onPrimary={props.onPrimary}
        />
      ) : null}
      {tab === "activity" ? (
        <ActivityTab
          activity={d.activity}
          shops={d.shops}
          query={query}
          filter={filter}
          onQuery={setQuery}
          onFilter={setFilter}
          onGoTo={goTo}
          onPrimary={props.onPrimary}
        />
      ) : null}
    </>
  );
}
