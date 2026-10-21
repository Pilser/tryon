/* components/admin/accounts-tab.tsx - the Accounts tab: the people
   who are already on the platform (approved), the ones suspended and
   the ones whose request was rejected.

   The deploy allowance is the account's own limit - how many shops the
   owner may deploy. The owner keeps their shops and their credits when
   the account is suspended; they just cannot deploy a new one. */
import { type JSX } from "react";
import type { PlatformUser } from "../../api";
import { base as b, cx, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { FilterBar } from "../shared/filter-bar";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { StatusChip, TokenNote } from "../user-row";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const STATES = ["approved", "suspended", "rejected"] as const;

/** One account: the owner, the allowance and the two decisions. */
function AccountRow(props: {
  user: PlatformUser;
  allowance: string;
  issued: string | null;
  userToken: string;
  onAllowance: (value: string) => void;
  onUserToken: (value: string) => void;
  onSetToken: () => void;
  onSave: () => void;
  onToggle: () => void;
}): JSX.Element {
  const x = props.user;
  const off = x.status === "suspended";
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>
          {x.name || x.shop_name || x.email}
          {x.reg_no ? (
            <span className={cx(pf.chip, pf.chipAdmin)}> {x.reg_no}</span>
          ) : null}
        </p>
        <p className={cx(u.rowSub)}>
          {x.email} · {x.contact || "no contact"} · {x.deploy_used} of{" "}
          {x.deploy_allowance} deploy(s) used
        </p>
        {props.issued ? (
          <TokenNote owner={x.name || x.shop_name || x.email} token={props.issued} />
        ) : null}
        <div className={cx(pf.fieldRow)}>
          <input
            className={cx(pf.field)}
            type="text"
            value={props.userToken}
            placeholder="set a sign-in token (optional)"
            aria-label={`the sign-in token for ${x.email}`}
            autoComplete="off"
            onChange={(e) => props.onUserToken(e.currentTarget.value)}
          />
          <button
            className={cx(b.btn, b.btnSecondary)}
            type="button"
            disabled={!props.userToken.trim()}
            onClick={props.onSetToken}
          >
            Set the token
          </button>
        </div>
      </div>
      <div className={cx(u.btnRow)}>
        <span className={cx(pf.chips)}>
          <StatusChip status={x.status} />
        </span>
        <input
          className={cx(pf.num)}
          type="number"
          min={0}
          max={500}
          value={props.allowance}
          aria-label={`shops ${x.email} may deploy`}
          onChange={(e) => props.onAllowance(e.currentTarget.value)}
        />
        <button className={cx(b.btn, b.btnSecondary)} type="button" onClick={props.onSave}>
          Save allowance
        </button>
        <button
          className={cx(b.btn, off ? b.btnSecondary : b.btnDanger)}
          type="button"
          onClick={props.onToggle}
        >
          {off ? "Reactivate" : "Suspend"}
        </button>
      </div>
    </div>
  );
}

/** A rejected request: the decision is final, so the row has no
    buttons - only the facts. */
function ClosedRow(props: { user: PlatformUser }): JSX.Element {
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>
          {props.user.name || props.user.shop_name || props.user.email}
          {props.user.reg_no ? (
            <span className={cx(pf.chip, pf.chipAdmin)}> {props.user.reg_no}</span>
          ) : null}
        </p>
        <p className={cx(u.rowSub)}>
          {props.user.email} · {props.user.contact || "no contact"}
        </p>
      </div>
      <div className={cx(u.btnRow)}>
        <span className={cx(pf.chips)}>
          <StatusChip status={props.user.status} />
        </span>
        <p className={cx(u.meta)}>A rejected request is final.</p>
      </div>
    </div>
  );
}

export function AccountsTab(props: {
  users: PlatformUser[];
  busy: boolean;
  issued: Record<string, string>;
  allowance: Record<string, string>;
  userToken: Record<string, string>;
  query: string;
  filter: string;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onAllowance: (id: string, value: string) => void;
  onUserToken: (id: string, value: string) => void;
  onSetToken: (user: PlatformUser) => void;
  onSave: (user: PlatformUser) => void;
  onToggle: (user: PlatformUser) => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  usePrimary(props.onPrimary, null);

  const accounts = props.users.filter((u) => u.status !== "pending");
  const q = props.query.trim().toLowerCase();
  const state = STATES.includes(props.filter as (typeof STATES)[number])
    ? props.filter
    : "";
  const rows = accounts.filter((u) => {
    if (state && u.status !== state) return false;
    if (!q) return true;
    return [u.email, u.contact, u.shop_name, u.status, u.name, u.reg_no]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const chips = STATES.map((s) => ({
    id: s,
    label: `${s} (${accounts.filter((u) => u.status === s).length})`,
    on: s === state,
  }));

  return (
    <Panel title="Accounts">
      <p className={cx(u.rowSub)}>
        The owners of the shops the platform hosts. The allowance is how many
        shops an owner may deploy; suspending an account stops new deploys and
        keeps the shops and their credits alive.
      </p>
      <FilterBar
        search={props.query}
        onSearch={props.onQuery}
        placeholder="search email, contact, shop name"
        chips={chips}
        onChip={(id) => props.onFilter(id === state ? "" : id)}
        onClear={() => {
          props.onQuery("");
          props.onFilter("");
        }}
        count={`${n(rows.length)} of ${n(accounts.length)} account(s)`}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={accounts.length === 0 ? "No accounts yet." : "Nothing matches that filter."}
          reason={
            accounts.length === 0
              ? "An account appears here the moment a request is approved."
              : "No account matches the search and the filter - clear them to see every account."
          }
          action={
            accounts.length > 0 ? (
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
            ) : null
          }
        />
      ) : (
        <div className={cx(u.rows)}>
          {rows.map((x, i) => (
            <div key={x.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              {x.status === "rejected" ? (
                <ClosedRow user={x} />
              ) : (
                <AccountRow
                  user={x}
                  allowance={props.allowance[x.id] || String(x.deploy_allowance || 0)}
                  issued={props.issued[x.id] || null}
                  userToken={props.userToken[x.id] || ""}
                  onAllowance={(v) => props.onAllowance(x.id, v)}
                  onUserToken={(v) => props.onUserToken(x.id, v)}
                  onSetToken={() => props.onSetToken(x)}
                  onSave={() => props.onSave(x)}
                  onToggle={() => props.onToggle(x)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
