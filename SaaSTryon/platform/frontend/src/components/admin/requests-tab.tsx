/* components/admin/requests-tab.tsx - the Requests tab: the signups
   that wait for a decision.

   The person in a row is the SHOP OWNER - a customer of the platform,
   not a colleague. Approving gives them a one-shot `plat_` sign-in
   token that is shown exactly once, in the row it was minted for. */
import { type JSX } from "react";
import type { PlatformUser } from "../../api";
import { base as b, cx, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { FilterBar } from "../shared/filter-bar";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { StatusChip, TokenNote } from "../user-row";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const age = (ms: number): string => {
  if (!ms) return "unknown";
  const days = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
};

/** One request: who asked, how many shops they may deploy and the two
    answers an operator can give. */
function RequestRow(props: {
  user: PlatformUser;
  allowance: string;
  issued: string | null;
  onAllowance: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}): JSX.Element {
  const x = props.user;
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>{x.shop_name || x.email}</p>
        <p className={cx(u.rowSub)}>
          {x.email} · {x.contact || "no contact"} · asked {age(x.created_ms)}
        </p>
        {props.issued ? (
          <TokenNote owner={x.shop_name || x.email} token={props.issued} />
        ) : null}
      </div>
      <div className={cx(u.btnRow)}>
        <input
          className={cx(pf.num)}
          type="number"
          min={0}
          max={500}
          value={props.allowance}
          aria-label={`shops ${x.email} may deploy`}
          onChange={(e) => props.onAllowance(e.currentTarget.value)}
        />
        <button className={cx(b.btn, b.btnPrimary)} type="button" onClick={props.onApprove}>
          Approve
        </button>
        <button className={cx(b.btn, b.btnDanger)} type="button" onClick={props.onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}

export function RequestsTab(props: {
  users: PlatformUser[];
  busy: boolean;
  issued: Record<string, string>;
  allowance: Record<string, string>;
  query: string;
  onQuery: (value: string) => void;
  onAllowance: (id: string, value: string) => void;
  onApprove: (user: PlatformUser) => void;
  onReject: (user: PlatformUser) => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  usePrimary(props.onPrimary, null);

  const pending = props.users.filter((u) => u.status === "pending");
  const q = props.query.trim().toLowerCase();
  const rows = pending.filter((u) => {
    if (!q) return true;
    return [u.email, u.contact, u.shop_name]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <Panel title="Requests">
      <p className={cx(u.rowSub)}>
        Each row is a person who asked for a shop of their own - they are the
        owner, not you. Approving mints their one-shot sign-in token and sets
        how many shops they may deploy.
      </p>
      <FilterBar
        search={props.query}
        onSearch={props.onQuery}
        placeholder="search email, contact, shop name"
        count={`${n(rows.length)} of ${n(pending.length)} request(s)`}
        onClear={() => props.onQuery("")}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={pending.length === 0 ? "No open requests." : "Nothing matches that search."}
          reason={
            pending.length === 0
              ? "Every signup has been decided. New ones land here with the email, the WhatsApp number and the shop name they want."
              : "No request matches that search - clear it to see the whole queue."
          }
          action={
            pending.length > 0 ? (
              <button className={cx(pf.textLink)} type="button" onClick={() => props.onQuery("")}>
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
              <RequestRow
                user={x}
                allowance={props.allowance[x.id] || String(x.deploy_allowance || 3)}
                issued={props.issued[x.id] || null}
                onAllowance={(v) => props.onAllowance(x.id, v)}
                onApprove={() => props.onApprove(x)}
                onReject={() => props.onReject(x)}
              />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
