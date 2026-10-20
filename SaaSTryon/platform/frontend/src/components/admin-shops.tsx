/* components/admin-shops.tsx - the admin console's Shops and Activity
   tabs (Phase G): every shop the platform hosts with its owner, the live
   URL, the customer domain, the credits, the redeemed platform codes,
   the landing state and the activity count - searchable as you type -
   plus the platform audit feed, newest first. The pending credit
   requests live here too: they are the billing queue the admin works
   through next to the shop tokens. */
import { useState, type JSX } from "react";
import { type AuditRow, type CreditRequest, type ShopView } from "../api";
import { base as b, cx, pf, ui as u } from "../kit";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

const when = (ms: number): string => (ms ? new Date(ms).toLocaleString() : "unknown");

/* The customer's own domain, or the plain fact that the shop only
   answers on our zone. */
function domainText(s: ShopView): JSX.Element {
  if (s.domain) {
    return (
      <a
        className={cx(pf.code)}
        href={`https://${s.domain}`}
        target="_blank"
        rel="noreferrer"
      >
        {s.domain}
      </a>
    );
  }
  return <span>on our zone only</span>;
}

/* The landing state: no files published yet, or how many. */
function landingText(s: ShopView): string {
  const files = s.landing_files || [];
  if (files.length === 0) return "no landing page";
  return `${n(files.length)} file${files.length === 1 ? "" : "s"} published`;
}

/* Status chip: olive for a live shop, red for a broken one. */
function statusChip(status: string): string {
  if (status === "live" || status === "active") return cx(pf.chip, pf.chipGood);
  if (status === "failed" || status === "suspended") return cx(pf.chip, pf.chipBad);
  return cx(pf.chip);
}

/* One shop: who owns it, where it lives, what it may spend. */
function ShopRow(props: { shop: ShopView }): JSX.Element {
  const s = props.shop;
  const owner = s.owner_email || "no owner";
  const ownerName = s.owner_name || "";
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>{s.name || s.subdomain}</p>
        <p className={cx(u.rowSub)}>
          {owner}
          {ownerName ? ` · ${ownerName}` : ""} · subdomain {s.subdomain}
        </p>
        <p className={cx(u.rowSub)}>
          <a className={cx(pf.code)} href={s.url} target="_blank" rel="noreferrer">
            {s.url}
          </a>
          {" · "}
          {domainText(s)}
        </p>
        <span className={cx(pf.chips)}>
          <span className={statusChip(s.status)}>{s.status || "unknown"}</span>
          <span className={cx(pf.chip)}>{s.tier || "no tier"}</span>
          <span className={cx(pf.chip)}>bundle {s.bundle || "unknown"}</span>
          <span className={cx(pf.chip)}>{n(s.credits_granted)} granted</span>
          <span className={cx(pf.chip)}>{n(s.credits_used)} used</span>
          <span className={cx(pf.chip)}>{n(s.credits_left)} left</span>
          <span className={cx(pf.chip)}>{n(s.tokens_redeemed)} codes redeemed</span>
          <span className={cx(pf.chip)}>{landingText(s)}</span>
          <span className={cx(pf.chip)}>{n(s.activity_count)} events</span>
          <span className={cx(pf.chip)}>created {day(s.created_ms)}</span>
        </span>
      </div>
      <div className={cx(u.btnRow)}>
        <a
          className={cx(b.btn, b.btnSecondary, u.btnGrow)}
          href={s.url}
          target="_blank"
          rel="noreferrer"
        >
          Open shop
        </a>
      </div>
    </div>
  );
}

/* The Shops tab: every shop, searchable by name, subdomain, owner or
   domain, filterable by state. */
export function ShopsTab(props: { shops: ShopView[] | null }): JSX.Element {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | "live" | "other">("all");
  const shops = props.shops || [];
  const q = query.trim().toLowerCase();

  const rows = shops.filter((s) => {
    if (state === "live" && !(s.status === "live" || s.status === "active")) return false;
    if (state === "other" && (s.status === "live" || s.status === "active")) return false;
    if (!q) return true;
    const hay = [
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
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className={cx(u.cardFlush)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Shops</p>
        <span className={cx(u.meta)}>
          {props.shops ? `${n(rows.length)} of ${n(shops.length)} shown` : "loading…"}
        </span>
      </div>
      <div className={cx(u.cardHead)}>
        <input
          className={cx(pf.field)}
          type="search"
          value={query}
          placeholder="search name, subdomain, owner, domain…"
          aria-label="search shops"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      <div className={cx(u.cardHead)}>
        <div className={cx(pf.tabs)}>
          {(["all", "live", "other"] as const).map((f) => (
            <button
              key={f}
              className={cx(pf.tab, state === f && pf.tabOn)}
              type="button"
              onClick={() => setState(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <hr className={cx(u.hairline)} />
      <div className={cx(u.rows)}>
        {!props.shops ? (
          <p className={cx(u.empty)}>Loading the shops…</p>
        ) : rows.length === 0 ? (
          <p className={cx(u.empty)}>
            {shops.length === 0
              ? "No shop yet - the first deploy shows up here."
              : "No shop matches that filter."}
          </p>
        ) : (
          rows.map((s, i) => (
            <div key={s.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <ShopRow shop={s} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* The Activity tab: the platform audit feed, newest first, capped at
   100 visible rows. */
export function ActivityTab(props: { activity: AuditRow[] | null }): JSX.Element {
  const rows = (props.activity || [])
    .slice()
    .sort((a, b) => b.created_ms - a.created_ms)
    .slice(0, 100);
  const total = props.activity ? props.activity.length : 0;

  return (
    <div className={cx(u.cardFlush)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Activity</p>
        <span className={cx(u.meta)}>
          {props.activity ? `${n(rows.length)} of ${n(total)} shown` : "loading…"}
        </span>
      </div>
      <hr className={cx(u.hairline)} />
      <div className={cx(u.rows)}>
        {!props.activity ? (
          <p className={cx(u.empty)}>Loading the feed…</p>
        ) : rows.length === 0 ? (
          <p className={cx(u.empty)}>Nothing happened yet.</p>
        ) : (
          rows.map((a, i) => (
            <div key={a.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <div className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(u.rowTitle)}>
                    {a.action} - {a.subject}
                  </p>
                  <p className={cx(u.rowSub)}>
                    {a.actor || "system"} · {when(a.created_ms)}
                    {a.meta ? ` · ${a.meta}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* The pending credit requests: what the shops asked for, and the two
   answers an operator can give (grant the credits or close it). */
export function CreditRequests(props: {
  requests: CreditRequest[] | null;
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}): JSX.Element {
  const requests = props.requests || [];
  return (
    <div className={cx(u.card)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Credit requests</p>
        <span className={cx(u.meta)}>{n(requests.length)} pending</span>
      </div>
      {requests.length === 0 ? (
        <p className={cx(u.rowSub)}>No pending requests. Shops ask from their dashboard.</p>
      ) : (
        requests.map((r, i) => (
          <div key={r.id}>
            {i ? <hr className={cx(u.hairline)} /> : null}
            <p className={cx(u.rowSub)}>
              Shop {r.shop_id} asks for <strong>{r.requested}</strong> credits
              {r.reason ? ` - ${r.reason}` : ""}.
            </p>
            <p className={cx(u.meta)}>asked {when(r.created_ms)}</p>
            <div className={cx(u.btnRow)}>
              <button
                className={cx(b.btn, b.btnPrimary, u.btnGrow)}
                type="button"
                disabled={props.busy}
                onClick={() => props.onApprove(r.id)}
              >
                Approve and grant
              </button>
              <button
                className={cx(b.btn, b.btnDanger, u.btnGrow)}
                type="button"
                disabled={props.busy}
                onClick={() => props.onReject(r.id)}
              >
                Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
