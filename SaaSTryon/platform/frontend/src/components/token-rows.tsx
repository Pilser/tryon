/* components/token-rows.tsx - the admin Tokens tab: mint 4-digit shop
   codes, print them, cancel the ones a shop has not redeemed yet. Used
   codes keep their row (shop + when) so the admin can audit who got what
   - the shop dashboard's give-code pattern, one level up. */
import { useState, type JSX } from "react";
import { type ShopToken } from "../api";
import { base as b, cx, pf, ui as u } from "../kit";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* Status chip: capsule with token colour only (olive active, grey used,
   red cancelled) - matches the user-row chips, self-contained class. */
function TokenChip(props: { status: ShopToken["status"] }): JSX.Element {
  const cls =
    props.status === "active"
      ? cx(pf.chip, pf.chipGood)
      : props.status === "cancelled"
        ? cx(pf.chip, pf.chipBad)
        : cx(pf.chip);
  return <span className={cls}>{props.status}</span>;
}

/* One token row: code first (that is what gets printed), state after. */
function TokenRow(props: { t: ShopToken; onCancel: (code: string) => void }): JSX.Element {
  const { t } = props;
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>
          <span className={cx(pf.code)}>{t.code}</span> <TokenChip status={t.status} />
        </p>
        <p className={cx(u.rowSub)}>
          {t.shop_id
            ? `redeemed by ${t.shop_id} · ${new Date(t.redeemed_ms || 0).toLocaleDateString()}`
            : t.note || "unassigned"}
          {t.status === "cancelled" ? ` · cancelled ${new Date(t.cancelled_ms || 0).toLocaleDateString()}` : ""}
        </p>
      </div>
      <div className={cx(u.btnRow)}>
        {t.status === "active" ? (
          <button
            className={cx(b.btn, b.btnDanger)}
            type="button"
            onClick={() => props.onCancel(t.code)}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TokensTab(props: {
  tokens: ShopToken[];
  busy: boolean;
  onMint: (count: number, note: string) => void;
  onCancel: (code: string) => void;
}): JSX.Element {
  const [count, setCount] = useState("10");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"all" | ShopToken["status"]>("all");
  const rows = props.tokens.filter((t) => filter === "all" || t.status === filter);
  const active = props.tokens.filter((t) => t.status === "active").length;

  return (
    <div className={cx(u.card)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Shop tokens</p>
        <span className={cx(u.meta)}>{n(active)} active</span>
      </div>
      <p className={cx(u.rowSub)}>
        Mint 4-digit codes, print the list, hand them to shop owners. A shop redeems a code in
        its dashboard settings and the balance lands on its try-on credits.
      </p>
      <form
        className={cx(pf.fieldRow)}
        onSubmit={(e) => {
          e.preventDefault();
          const c = Math.max(1, Math.min(100, Number(count) || 0));
          if (c && !props.busy) props.onMint(c, note.trim());
        }}
      >
        <input
          className={cx(pf.num)}
          type="number"
          min={1}
          max={100}
          value={count}
          aria-label="how many tokens"
          onChange={(e) => setCount(e.currentTarget.value)}
        />
        <input
          className={cx(pf.field)}
          type="text"
          placeholder="note (optional, e.g. March batch)"
          value={note}
          aria-label="note"
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <button className={cx(b.btn, b.btnPrimary, u.btnGrow)} type="submit" disabled={props.busy}>
          {props.busy ? "Minting…" : "Mint"}
        </button>
      </form>
      <div className={cx(pf.tabs)}>
        {(["all", "active", "used", "cancelled"] as const).map((f) => (
          <button
            key={f}
            className={cx(pf.tab, filter === f && pf.tabOn)}
            type="button"
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <hr className={cx(u.hairline)} />
      <div className={cx(u.rows)}>
        {rows.length === 0 ? (
          <p className={cx(u.empty)}>No {filter === "all" ? "" : `${filter} `}tokens yet.</p>
        ) : (
          rows.map((t, i) => (
            <div key={t.code}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <TokenRow t={t} onCancel={props.onCancel} />
            </div>
          ))
        )}
      </div>
      {rows.length ? (
        <p className={cx(u.meta)}>
          {esc(`${rows.length} shown`)} · use the browser print dialog on this page for a paper list
        </p>
      ) : null}
    </div>
  );
}
