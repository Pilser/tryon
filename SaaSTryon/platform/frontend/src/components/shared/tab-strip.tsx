/* components/shared/tab-strip.tsx - the tab strip of a console. The
   strip is NOT the primary action: the primary action lives in the page
   header, right-aligned (P1). */
import type { JSX } from "react";
import { cx, pf } from "../../kit";

export interface TabDef {
  id: string;
  label: string;
}

export function TabStrip(props: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}): JSX.Element {
  return (
    <div className={cx(pf.tabs)} role="tablist" aria-label="console sections">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === props.active}
          className={cx(pf.tab, t.id === props.active && pf.tabOn)}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
