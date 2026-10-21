/* components/owner/activity-tab.tsx - the owner's audit feed: every
   event of every shop, newest first, with a search and a filter per
   action. The filters live in the URL, so a filtered feed is a link
   (P6). */
import { useMemo, useState, type JSX } from "react";
import type { AuditRow } from "../../api";
import { cx, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { FilterBar } from "../shared/filter-bar";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { useUrlParam } from "../shared/url-state";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const when = (ms: number): string => (ms ? new Date(ms).toLocaleString() : "unknown");

export function ActivityTab(props: {
  activity: AuditRow[];
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [query, setQuery] = useUrlParam("q", "");
  const [action, setAction] = useUrlParam("status", "");

  usePrimary(props.onPrimary, null);

  /* The filter chips are the actions that are actually there. */
  const actions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of props.activity) seen.add(row.action);
    return [...seen].sort();
  }, [props.activity]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return props.activity.filter((row) => {
      if (action && row.action !== action) return false;
      if (!q) return true;
      return (
        row.actor.toLowerCase().includes(q) ||
        row.action.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q) ||
        (row.meta || "").toLowerCase().includes(q)
      );
    });
  }, [props.activity, query, action]);

  const filtered = query.trim() !== "" || action !== "";

  return (
    <Panel title="Activity">
      <p className={cx(u.rowSub)}>
        Every event of every shop you own: deploys, landing files, codes, credits.
      </p>
      <FilterBar
        search={query}
        onSearch={setQuery}
        placeholder="search actor, action, subject"
        chips={actions.map((a) => ({ id: a, label: a, on: a === action }))}
        onChip={(id) => setAction(id === action ? "" : id)}
        onClear={() => {
          setQuery("");
          setAction("");
        }}
        count={`${n(rows.length)} of ${n(props.activity.length)} event(s)`}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches that filter." : "Nothing yet."}
          reason={
            filtered
              ? "No event of your shops matches the search and the filter - clear them to see the whole feed."
              : "Your first deploy shows up here."
          }
          action={
            filtered ? (
              <button
                className={cx(pf.textLink)}
                type="button"
                onClick={() => {
                  setQuery("");
                  setAction("");
                }}
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <div className={cx(u.rows)}>
          {rows.map((row, i) => (
            <div key={row.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <div className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(u.rowTitle)}>
                    {row.action} - {row.subject}
                  </p>
                  <p className={cx(u.rowSub)}>
                    {when(row.created_ms)} · {row.actor}
                    {row.meta ? ` · ${row.meta}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
