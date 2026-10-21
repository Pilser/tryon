/* components/shared/panel.tsx - the expanded manage panel: a head (the
   name, the actions) and a body. The panel is a region, not a drawer -
   the list behind it stays visible (P2). */
import type { JSX, ReactNode } from "react";
import { cx, pf, ui as u } from "../../kit";

export function Panel(props: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className={cx(pf.panel)}>
      <div className={cx(pf.panelHead)}>
        <p className={cx(u.cardTitle)}>{props.title}</p>
        {props.actions ? <div className={cx(u.btnRow)}>{props.actions}</div> : null}
      </div>
      {props.children}
    </section>
  );
}
