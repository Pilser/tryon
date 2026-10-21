/* components/shared/filter-bar.tsx - the row under the tab strip: a
   search field, the status chips and the "clear filters" escape hatch
   (P3: when a filter is active, the way out is visible). */
import type { JSX } from "react";
import { cx, pf } from "../../kit";

export interface FilterChip {
  id: string;
  label: string;
  on: boolean;
}

export function FilterBar(props: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  chips?: FilterChip[];
  onChip?: (id: string) => void;
  onClear?: () => void;
  count?: string;
  /** Say it yourself when the bar knows better than the chips (a bar
      with an "all" chip is not a filtered view). */
  filtered?: boolean;
}): JSX.Element {
  const active =
    props.filtered ??
    (props.search.trim() !== "" || (props.chips || []).some((c) => c.on));
  return (
    <div className={cx(pf.toolbar)}>
      <input
        className={cx(pf.search)}
        type="search"
        value={props.search}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        autoComplete="off"
        onChange={(e) => props.onSearch(e.currentTarget.value)}
      />
      {(props.chips || []).map((c) => (
        <button
          key={c.id}
          type="button"
          className={cx(pf.chipBtn, c.on && pf.chipBtnOn)}
          aria-pressed={c.on}
          onClick={() => props.onChip?.(c.id)}
        >
          {c.label}
        </button>
      ))}
      {active ? (
        <button className={cx(pf.textLink)} type="button" onClick={props.onClear}>
          Clear filters
        </button>
      ) : null}
      {props.count ? <span className={cx(pf.bulkCount)}>{props.count}</span> : null}
    </div>
  );
}
