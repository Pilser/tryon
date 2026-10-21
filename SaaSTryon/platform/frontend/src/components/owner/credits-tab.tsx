/* components/owner/credits-tab.tsx - the try-on credits: the totals over
   the owner's shops, the split per shop, and the request for more.

   A credit is one generation. The platform grants them by hand (there
   is no card checkout), so the request is a request: the admin approves
   it and the credits land on the shop. */
import { useMemo, useState, type JSX } from "react";
import type { ShopView } from "../../api";
import { base as b, cx, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { Panel } from "../shared/panel";
import { ProgressBar } from "../shared/progress-bar";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { ValueRow } from "../shared/value-row";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

export function CreditsTab(props: {
  shops: ShopView[];
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [shopId, setShopId] = useState(props.shops[0]?.id || "");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const left = props.shops.reduce((a, s) => a + s.credits_left, 0);
  const granted = props.shops.reduce((a, s) => a + s.credits_granted, 0);
  const used = props.shops.reduce((a, s) => a + s.credits_used, 0);
  const shop = props.shops.find((s) => s.id === shopId) || null;
  const host = shop ? shop.url || `https://${shop.subdomain}.latiforge.com` : "";

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: open ? "Close" : "Request more credits",
      tone: open ? "secondary" : "primary",
      run: () => setOpen((v) => !v),
    }),
    [open],
  );
  usePrimary(props.onPrimary, action);

  /* The request goes to the shop's own studio endpoint (the platform
     only accepts the shop token there). A browser that blocks the
     cross-origin call says so and points at the studio. */
  function request(): void {
    if (!shop) {
      setBad(true);
      setNote("Pick the shop that needs the credits.");
      return;
    }
    const want = Number(amount);
    if (!want || want < 1) {
      setBad(true);
      setNote("How many credits do you want? (1 - 10000)");
      return;
    }
    setBusy(true);
    setNote("");
    setBad(false);
    setBlocked(false);
    /* The call leaves for another origin: it may hang, so it gets a
       deadline. */
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 15000);
    void (async () => {
      try {
        const res = await fetch(`${host}/api/studio/tokens/request`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${shop.owner_token || ""}`,
          },
          body: JSON.stringify({ requested: want, reason: reason.trim() }),
          signal: ctl.signal,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          setBad(true);
          setNote(data.message || `The shop refused the request (${res.status}).`);
          return;
        }
        setNote(
          `Requested ${n(want)} credits for ${shop.name || shop.subdomain}. The platform approves the request by hand.`,
        );
      } catch {
        setBlocked(true);
        setBad(true);
        setNote(
          "The browser could not reach the shop from here (it is another origin, and the shop does not answer cross-origin calls). Open the studio of the shop and send the request there - the studio sends it to the platform for you.",
        );
      } finally {
        window.clearTimeout(timer);
        setBusy(false);
      }
    })();
  }

  if (props.shops.length === 0) {
    return (
      <Panel title="Your try-on credits">
        <EmptyState
          title="No credits yet."
          reason="Credits belong to a shop: deploy one and every try-on it serves spends 1 credit."
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Your try-on credits">
        <p className={cx(u.rowSub)}>
          Every try-on spends 1 credit. These are the totals over your{" "}
          {n(props.shops.length)} shop{props.shops.length === 1 ? "" : "s"}.
        </p>
        <div className={cx(u.rows)}>
          <ValueRow
            label="Credits left"
            sub="what your customers may spend now"
            value={n(left)}
          />
          <hr className={cx(u.hairline)} />
          <ValueRow
            label="Credits granted"
            sub="codes, gifts and top-ups"
            value={n(granted)}
          />
          <hr className={cx(u.hairline)} />
          <ValueRow
            label="Credits used"
            sub="try-ons already spent"
            value={n(used)}
          />
        </div>
      </Panel>

      <Panel title="The split per shop">
        <p className={cx(u.rowSub)}>
          The shop that is about to run out is the one that asks first.
        </p>
        <div className={cx(u.rows)}>
          {props.shops.map((s, i) => (
            <div key={s.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <div className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(u.rowTitle)}>{s.name || s.subdomain}</p>
                  <p className={cx(u.rowSub)}>
                    {n(s.credits_granted)} granted · {n(s.credits_used)} used ·{" "}
                    {n(s.tokens_redeemed)} code(s) redeemed
                  </p>
                  <ProgressBar
                    value={s.credits_used}
                    total={Math.max(1, s.credits_granted)}
                    bad={s.credits_left === 0}
                  />
                </div>
                <p className={cx(u.rowTitle)}>{n(s.credits_left)}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {open ? (
        <Panel title="Request more credits">
          <p className={cx(u.rowSub)}>
            The request goes to the platform, which approves it by hand. The credits
            land on the shop you pick.
          </p>
          <label className={cx(pf.label)} htmlFor="credit-shop">
            Shop
          </label>
          <select
            id="credit-shop"
            className={cx(pf.field)}
            value={shopId}
            disabled={busy}
            onChange={(e) => setShopId(e.currentTarget.value)}
          >
            {props.shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.subdomain}
              </option>
            ))}
          </select>
          <label className={cx(pf.label)} htmlFor="credit-amount">
            Credits
          </label>
          <input
            id="credit-amount"
            className={cx(pf.num)}
            type="number"
            min={1}
            max={10000}
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.currentTarget.value)}
          />
          <label className={cx(pf.label)} htmlFor="credit-reason">
            Why
          </label>
          <input
            id="credit-reason"
            className={cx(pf.field)}
            value={reason}
            placeholder="the busy weekend, a new collection…"
            disabled={busy}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
          {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
          <div className={cx(u.btnRow)}>
            <button
              className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
              type="button"
              disabled={busy || !shop}
              onClick={request}
            >
              {busy ? "Sending…" : "Request credits"}
            </button>
          </div>
          {blocked && shop ? (
            <div className={cx(u.btnRow)}>
              <a
                className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                href={`${host}/app/studio.html?owner=1`}
                target="_blank"
                rel="noreferrer"
              >
                Open the studio of the shop
              </a>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
