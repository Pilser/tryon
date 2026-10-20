/* components/user-row.tsx - the admin console's user rows: pending
   requests (approve with a deploy allowance + reject) and approved or
   suspended shops (allowance edit + suspend/reactivate). When an approve
   succeeds, the plat_ sign-in token appears INSIDE the row it was minted
   for with a copy button - the shop dashboard's give-code pattern. */
import { useState, type JSX } from "react";
import { type PlatformUser } from "../api";
import { base as b, cx, pf, ui as u } from "../kit";

/* Status chip: capsule with token colour only (olive healthy, red spent). */
export function StatusChip(props: { status: string; admin?: boolean }): JSX.Element {
  const label = props.admin ? "admin" : props.status;
  const cls = props.admin
    ? cx(pf.chip, pf.chipAdmin)
    : props.status === "approved"
      ? cx(pf.chip, pf.chipGood)
      : props.status === "suspended"
        ? cx(pf.chip, pf.chipBad)
        : cx(pf.chip);
  return <span className={cls}>{label}</span>;
}

/* Copyable plat_ token note in the row that minted it. */
export function TokenNote(props: { owner: string; token: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <p className={cx(u.inlineNote)}>
      Sign-in token for {props.owner}:
      <span className={cx(pf.codeBox)}>
        <span className={cx(pf.code)}>{props.token}</span>
        <button
          className={cx(b.btn, b.btnSecondary)}
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(props.token);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch {
                window.prompt("Copy the token by hand:", props.token);
              }
            })();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
      <span className={cx(u.meta)}>send it to the owner - they log in with it</span>
    </p>
  );
}

function OwnerHead(props: { user: PlatformUser }): JSX.Element {
  return (
    <div className={cx(u.rowMain)}>
      <p className={cx(u.rowTitle)}>{props.user.shop_name || props.user.email}</p>
      <p className={cx(u.rowSub)}>
        {props.user.email} · {props.user.contact || "no contact"}
      </p>
    </div>
  );
}

function AllowanceInput(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
}): JSX.Element {
  return (
    <input
      className={cx(pf.num)}
      id={props.id}
      type="number"
      min={0}
      max={100}
      value={props.value}
      aria-label={props.label}
      onChange={(e) => props.onChange(e.currentTarget.value)}
    />
  );
}

/** Pending row: allowance + approve with token handout, or a red reject. */
export function PendingRow(props: {
  user: PlatformUser;
  allowance: string;
  issued: string | null;
  onAllowance: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
}): JSX.Element {
  return (
    <div className={cx(u.row)}>
      <OwnerHead user={props.user} />
      <div className={cx(u.rowMain)}>
        <span className={cx(pf.chips)}>
          <StatusChip status={props.user.status} />
        </span>
        {props.issued ? <TokenNote owner={props.user.shop_name || props.user.email} token={props.issued} /> : null}
        <div className={cx(pf.fieldRow)}>
          <AllowanceInput
            id={`allow-${props.user.id}`}
            value={props.allowance}
            label="shops this owner may deploy"
            onChange={props.onAllowance}
          />
          <button className={cx(b.btn, b.btnPrimary, u.btnGrow)} type="button" onClick={props.onApprove}>
            Approve
          </button>
          <button className={cx(b.btn, b.btnDanger, u.btnGrow)} type="button" onClick={props.onReject}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/** Approved/suspended row: allowance edit + suspend/reactivate. Shows the
    just-minted sign-in token when this row was approved in this visit. */
export function ApprovedRow(props: {
  user: PlatformUser;
  allowance: string;
  issued: string | null;
  onAllowance: (v: string) => void;
  onSave: () => void;
  onToggle: () => void;
}): JSX.Element {
  const off = props.user.status === "suspended";
  return (
    <div className={cx(u.row)}>
      <OwnerHead user={props.user} />
      <div className={cx(u.rowMain)}>
        <span className={cx(pf.chips)}>
          <StatusChip status={props.user.status} />
          <span className={cx(pf.chip)}>{props.user.deploy_used} deployed</span>
          <span className={cx(pf.chip)}>{props.user.deploy_allowance} allowance</span>
        </span>
        {props.issued ? <TokenNote owner={props.user.shop_name || props.user.email} token={props.issued} /> : null}
        <div className={cx(pf.fieldRow)}>
          <AllowanceInput
            id={`allow-${props.user.id}`}
            value={props.allowance}
            label="shops this owner may deploy"
            onChange={props.onAllowance}
          />
          <button className={cx(b.btn, b.btnSecondary, u.btnGrow)} type="button" onClick={props.onSave}>
            Save allowance
          </button>
          <button
            className={cx(b.btn, off ? b.btnSecondary : b.btnDanger, u.btnGrow)}
            type="button"
            onClick={props.onToggle}
          >
            {off ? "Reactivate" : "Suspend"}
          </button>
        </div>
      </div>
    </div>
  );
}
