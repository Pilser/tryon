/* components/admin/activity-tab.tsx - the Activity tab: the platform
   audit feed, newest first.

   The feed is the operator's memory of the platform: who did what to
   which tenant. The filters (a search over actor and subject, a chip
   per action) live in the URL, so a filtered feed is a link. A row that
   belongs to a tenant opens its manage panel. */
import { useMemo, useState, type JSX } from "react";
import type { AuditRow, ShopView } from "../../api";
import { cx, pa, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { FilterBar } from "../shared/filter-bar";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const when = (ms: number): string => (ms ? new Date(ms).toLocaleString() : "unknown");

/* The short "2 min ago" of a moment - the absolute time is in the
   title of the row. */
const ago = (ms: number): string => {
  if (!ms) return "unknown";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min === 1) return "1 min ago";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
};

export function ActivityTab(props: {
  activity: AuditRow[];
  shops: ShopView[];
  query: string;
  filter: string;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onGoTo: (tab: string, shopId: string) => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  usePrimary(props.onPrimary, null);
  const [shown, setShown] = useState(100);

  /* The filter chips are the actions that are really there. */
  const actions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of props.activity) seen.add(row.action);
    return [...seen].sort();
  }, [props.activity]);

  const rows = useMemo(() => {
    const q = props.query.trim().toLowerCase();
    return props.activity
      .filter((row) => {
        if (props.filter && row.action !== props.filter) return false;
        if (!q) return true;
        return (
          row.actor.toLowerCase().includes(q) ||
          row.action.toLowerCase().includes(q) ||
          row.subject.toLowerCase().includes(q) ||
          (row.meta || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.created_ms - a.created_ms);
  }, [props.activity, props.query, props.filter]);

  const filtered = props.query.trim() !== "" || props.filter !== "";
  const visible = rows.slice(0, shown);

  /* A row that belongs to a tenant opens its manage panel. */
  const shopOf = (subject: string): ShopView | undefined =>
    props.shops.find((s) => s.id === subject || s.subdomain === subject);

  return (
    <Panel title="Activity">
      <p className={cx(u.rowSub)}>
        Everything that happened on the platform: deploys, landing files, codes,
        credits and the admin&apos;s own decisions. Newest first.
      </p>
      <FilterBar
        search={props.query}
        onSearch={props.onQuery}
        placeholder="search actor, action, subject"
        chips={actions.map((a) => ({ id: a, label: a, on: a === props.filter }))}
        onChip={(id) => props.onFilter(id === props.filter ? "" : id)}
        onClear={() => {
          props.onQuery("");
          props.onFilter("");
        }}
        count={`${n(rows.length)} of ${n(props.activity.length)} event(s)`}
      />
      {visible.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches that filter." : "Nothing happened yet."}
          reason={
            filtered
              ? "No event matches the search and the filter - clear them to see the whole feed."
              : "The first deploy of the platform shows up here."
          }
          action={
            filtered ? (
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
          {visible.map((row, i) => {
            const shop = shopOf(row.subject);
            return (
              <div key={row.id}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>
                      {shop ? (
                        <button
                          className={cx(pf.textLink)}
                          type="button"
                          onClick={() => props.onGoTo("shops", shop.id)}
                        >
                          {row.action} · {shop.name || shop.subdomain}
                        </button>
                      ) : (
                        `${row.action} · ${row.subject}`
                      )}
                    </p>
                    <p className={cx(pa.fact)} title={when(row.created_ms)}>
                      {ago(row.created_ms)} · {row.actor || "system"}
                      {row.meta ? ` · ${row.meta}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > visible.length ? (
        <button
          className={cx(pf.textLink)}
          type="button"
          onClick={() => setShown((s) => s + 100)}
        >
          Load more ({n(rows.length - visible.length)} left)
        </button>
      ) : null}
    </Panel>
  );
}
