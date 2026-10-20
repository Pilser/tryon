/* components/admin-users.tsx - the two request tabs of the admin
   console: the pending requests (approve with a deploy allowance or a
   red reject) and the approved shops (allowance edit, suspend or
   reactivate). The rows themselves live in user-row.tsx. */
import type { JSX } from "react";
import { type PlatformUser } from "../api";
import { base as b, cx, ui as u } from "../kit";
import { ApprovedRow, PendingRow } from "./user-row";

/** The pending / approved tab: one card with the rows of the tab. */
export function UsersTab(props: {
  tab: "pending" | "approved";
  rows: PlatformUser[];
  allowanceOf: (x: PlatformUser) => string;
  issued: Record<string, string>;
  busy: boolean;
  onAllowance: (id: string, value: string) => void;
  onApprove: (user: PlatformUser) => void;
  onReject: (user: PlatformUser) => void;
  onSave: (user: PlatformUser) => void;
  onToggle: (user: PlatformUser) => void;
}): JSX.Element {
  const pending = props.tab === "pending";
  return (
    <div className={cx(u.cardFlush)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>{pending ? "Requests" : "Approved shops"}</p>
        <span className={cx(u.meta)}>
          {props.busy ? "working…" : `${props.rows.length} shown`}
        </span>
      </div>
      <hr className={cx(u.hairline)} />
      <div className={cx(u.rows)}>
        {props.rows.length === 0 ? (
          <p className={cx(u.empty)}>
            {pending ? "No pending requests." : "No approved shops yet."}
          </p>
        ) : (
          props.rows.map((x, i) => (
            <div key={x.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              {pending ? (
                <PendingRow
                  user={x}
                  allowance={props.allowanceOf(x)}
                  issued={props.issued[x.id] || null}
                  onAllowance={(v) => props.onAllowance(x.id, v)}
                  onApprove={() => props.onApprove(x)}
                  onReject={() => props.onReject(x)}
                />
              ) : (
                <ApprovedRow
                  user={x}
                  allowance={props.allowanceOf(x)}
                  issued={props.issued[x.id] || null}
                  onAllowance={(v) => props.onAllowance(x.id, v)}
                  onSave={() => props.onSave(x)}
                  onToggle={() => props.onToggle(x)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
