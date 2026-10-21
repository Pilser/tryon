/* components/admin/codes-tab.tsx - the Codes tab: the platform's
   4-digit codes as a LEDGER.

   A code is a billing instrument: one code buys one try-on. Minting it
   bound to a tenant makes it unredeemable by anybody else. Two ways
   out: freeze it (the row stays for the audit trail, the code stops
   working) or delete it (the row is gone for good - red and
   confirmed). */
import { useMemo, useState, type JSX } from "react";
import { ApiError, adminMintTokens, type ShopToken, type ShopView } from "../../api";
import { adminDeleteToken, adminMintShopTokens } from "../../api-admin";
import { base as b, cx, pa, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { FilterBar } from "../shared/filter-bar";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

const chipOf = (status: string): string =>
  status === "active"
    ? cx(pf.chip, pf.chipGood)
    : status === "cancelled"
      ? cx(pf.chip, pf.chipBad)
      : cx(pf.chip);

const STATES = ["all", "active", "used", "cancelled"] as const;

export function CodesTab(props: {
  codes: ShopToken[];
  shops: ShopView[];
  adminToken: string;
  busy: boolean;
  query: string;
  filter: string;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onCancel: (code: string) => void;
  onDelete: (code: string) => void;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("10");
  const [credits, setCredits] = useState("1");
  const [note, setNote] = useState("");
  const [shopId, setShopId] = useState("");
  const [minted, setMinted] = useState<ShopToken[]>([]);
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState("");
  const [bad, setBad] = useState(false);

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: open ? "Close" : "Mint codes",
      tone: open ? "secondary" : "primary",
      run: () => setOpen((v) => !v),
    }),
    [open],
  );
  usePrimary(props.onPrimary, action);

  const state = (STATES as readonly string[]).includes(props.filter)
    ? props.filter
    : "all";
  const q = props.query.trim().toLowerCase();
  const shopName = (id: string | null): string => {
    if (!id) return "unbound";
    const shop = props.shops.find((s) => s.id === id);
    return shop ? shop.name || shop.subdomain : id;
  };

  const rows = props.codes.filter((t) => {
    if (state !== "all" && t.status !== state) return false;
    if (!q) return true;
    return [t.code, t.note || "", shopName(t.shop_id)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const active = props.codes.filter((t) => t.status === "active").length;

  /* Mint: bound to a tenant when one is picked, free otherwise. */
  function mint(): void {
    const c = Math.max(1, Math.min(100, Number(count) || 0));
    if (!c) return;
    const v = Math.max(1, Math.min(100000, Number(credits) || 1));
    setBusy(true);
    setSay("");
    setBad(false);
    void (async () => {
      try {
        const out = shopId
          ? await adminMintShopTokens(
              props.adminToken,
              shopId,
              c,
              note.trim() || undefined,
              v,
            )
          : await adminMintTokens(props.adminToken, c, note.trim() || undefined, v);
        setMinted(out.tokens);
        setSay(
          `${out.tokens.length} code(s) minted${
            shopId ? ` and bound to ${shopName(shopId)}` : ""
          } - each worth ${v} credit(s). Copy them now.`,
        );
        props.onChanged();
      } catch (e) {
        setSay(msg(e, "Could not mint the codes."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <>
      {open ? (
        <Panel title="Mint codes">
          <p className={cx(u.rowSub)}>
            A code buys try-on credits - you decide how many when you mint it.
            Bind it to a tenant at mint time and nobody else can redeem it;
            leave it unbound and whoever has it may spend it.
          </p>
          <div className={cx(pf.fieldRow)}>
            <input
              className={cx(pf.num)}
              type="number"
              min={1}
              max={100}
              value={count}
              aria-label="how many codes"
              disabled={busy}
              onChange={(e) => setCount(e.currentTarget.value)}
            />
            <input
              className={cx(pf.num)}
              type="number"
              min={1}
              max={100000}
              value={credits}
              aria-label="credits per code"
              disabled={busy}
              onChange={(e) => setCredits(e.currentTarget.value)}
            />
            <input
              className={cx(pf.field)}
              type="text"
              value={note}
              placeholder="note (optional, e.g. March batch)"
              aria-label="note"
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
            <select
              className={cx(pf.field)}
              value={shopId}
              aria-label="bind the codes to a tenant"
              disabled={busy}
              onChange={(e) => setShopId(e.currentTarget.value)}
            >
              <option value="">unbound - anyone may redeem</option>
              {props.shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.subdomain} - {s.owner_email || "no owner"}
                </option>
              ))}
            </select>
            <button
              className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
              type="button"
              disabled={busy}
              onClick={mint}
            >
              {busy ? "Minting…" : "Mint"}
            </button>
          </div>
          {say ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{say}</p> : null}
          {minted.length > 0 ? (
            <div className={cx(pf.codeBox)}>
              <span className={cx(pf.code)}>{minted.map((t) => t.code).join("  ")}</span>
              <button
                className={cx(b.btn, b.btnSecondary)}
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(
                        minted.map((t) => t.code).join(" "),
                      );
                      setSay("Copied. Hand the codes to the owner.");
                    } catch {
                      window.prompt("Copy them by hand:", minted.map((t) => t.code).join(" "));
                    }
                  })();
                }}
              >
                Copy all
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="The code ledger">
        <p className={cx(u.rowSub)}>
          Every code of the platform, the tenant it belongs to and where it
          stands. Freezing keeps the row for the audit trail; deleting takes it
          away for good.
        </p>
        <FilterBar
          search={props.query}
          onSearch={props.onQuery}
          placeholder="search code, note, tenant"
          chips={STATES.map((s) => ({
            id: s,
            label:
              s === "all"
                ? `all (${props.codes.length})`
                : `${s} (${props.codes.filter((t) => t.status === s).length})`,
            on: s === state,
          }))}
          onChip={(id) => props.onFilter(id === state ? "all" : id)}
          onClear={() => {
            props.onQuery("");
            props.onFilter("all");
          }}
          filtered={props.query.trim() !== "" || (state !== "" && state !== "all")}
          count={`${n(rows.length)} of ${n(props.codes.length)} code(s) · ${n(active)} ready`}
        />
        {props.codes.length === 0 ? (
          <EmptyState
            title="No code minted yet."
            reason="A code buys try-on credits. Mint a batch and hand it to an owner."
            action={
              <button
                className={cx(b.btn, b.btnPrimary)}
                type="button"
                onClick={() => setOpen(true)}
              >
                Mint codes
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing matches that filter."
            reason="No code matches the search and the filter - clear them to see the whole ledger."
            action={
              <button
                className={cx(pf.textLink)}
                type="button"
                onClick={() => {
                  props.onQuery("");
                  props.onFilter("all");
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className={cx(u.rows)}>
            {rows.map((t) => (
              <div key={t.code} className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(u.rowTitle)}>
                    <span className={cx(pa.codeCell)}>{t.code}</span>{" "}
                    <span className={chipOf(t.status)}>{t.status}</span>
                  </p>
                  <p className={cx(pa.fact)}>
                    {shopName(t.shop_id)}
                    {t.note ? ` · ${t.note}` : ""} · created {day(t.created_ms)}
                    {t.redeemed_ms ? ` · redeemed ${day(t.redeemed_ms)}` : ""}
                    {t.cancelled_ms ? ` · frozen ${day(t.cancelled_ms)}` : ""}
                  </p>
                  <p className={cx(pa.fact)}>
                    worth {n(t.credits ?? 1)} credit(s)
                    {t.status === "used" ? " · spent" : ""}
                  </p>
                </div>
                <div className={cx(u.btnRow)}>
                  {t.status === "active" ? (
                    <button
                      className={cx(pa.btnSm)}
                      type="button"
                      disabled={props.busy}
                      onClick={() => props.onCancel(t.code)}
                    >
                      Freeze
                    </button>
                  ) : null}
                  <DeleteCode code={t.code} busy={props.busy} onDelete={props.onDelete} />
                </div>
              </div>
            ))}
          </div>
        )}
        {props.codes.length > 0 ? (
          <p className={cx(u.meta)}>
            Use the print dialog of the browser for a paper list of the codes.
          </p>
        ) : null}
      </Panel>
    </>
  );
}

/** The red row action of a code: deleting it keeps no trace. */
function DeleteCode(props: {
  code: string;
  busy: boolean;
  onDelete: (code: string) => void;
}): JSX.Element {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        className={cx(pa.btnSmDanger)}
        type="button"
        disabled={props.busy}
        onClick={() => setArmed(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <>
      <button
        className={cx(pa.btnSmDanger)}
        type="button"
        disabled={props.busy}
        onClick={() => props.onDelete(props.code)}
      >
        Really delete
      </button>
      <button
        className={cx(pa.btnSm)}
        type="button"
        disabled={props.busy}
        onClick={() => setArmed(false)}
      >
        Keep
      </button>
    </>
  );
}
