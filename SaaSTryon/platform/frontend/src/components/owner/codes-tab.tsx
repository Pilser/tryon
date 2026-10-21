/* components/owner/codes-tab.tsx - the platform codes of the owner.

   Two ways to get a code: claim one the admin gave them (it becomes
   theirs and buys a try-on credit) or mint their own (a code for a
   customer, redeemable in the shop dashboard). The platform does not
   list the codes of a shop to the owner, so the ones minted here are
   shown once - copy them away. */
import { useEffect, useMemo, useState, type JSX } from "react";
import { ApiError, type ShopToken, type ShopView } from "../../api";
import { ownerClaimToken, ownerCodes } from "../../api-admin";
import { base as b, cx, pf, ui as u } from "../../kit";
import { CopyCode } from "../shared/copy-code";
import { EmptyState } from "../shared/empty-state";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { MintCodes } from "./mint-codes";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

export function CodesTab(props: {
  shops: ShopView[];
  sessionId: string;
  shopParam: string;
  codes: ShopToken[];
  onCodes: (codes: ShopToken[]) => void;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [shopId, setShopId] = useState(props.shopParam || props.shops[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  /* The platform's ledger of the owner's codes - the used ones included.
     The codes minted in this session are only on screen (the platform
     owns the rest). */
  const [ledger, setLedger] = useState<ShopToken[]>([]);
  const [fromCodes, setFromCodes] = useState(0);

  /* The ledger comes from the platform: which code was used, by which
     shop, and what it was worth. */
  const loadLedger = (): void => {
    void (async () => {
      try {
        const out = await ownerCodes(props.sessionId);
        setLedger(out.codes || []);
        setFromCodes(out.credits_from_codes || 0);
      } catch {
        setLedger([]);
      }
    })();
  };

  useEffect(loadLedger, [props.sessionId]);

  /* The shop of the URL wins: the panel sends the owner here with it. */
  useEffect(() => {
    if (props.shopParam) setShopId(props.shopParam);
  }, [props.shopParam]);

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: open ? "Close" : "Mint codes",
      tone: open ? "secondary" : "primary",
      run: () => setOpen((v) => !v),
    }),
    [open],
  );
  usePrimary(props.onPrimary, action);

  /* Claim: the code the admin gave the owner. It becomes bound to the
     shop and buys one try-on credit. */
  function claim(): void {
    const value = code.trim();
    if (!value) {
      setBad(true);
      setNote("Type the code you were given.");
      return;
    }
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await ownerClaimToken(props.sessionId, value, shopId || undefined);
        props.onCodes([...(out.token ? [out.token] : []), ...props.codes]);
        const shop = props.shops.find((s) => s.id === out.shop_id);
        setNote(
          `Code ${value} claimed - ${n(out.credits ?? 1)} credit(s) added to ${
            shop ? shop.name || shop.subdomain : "your shop"
          }.`,
        );
        setCode("");
        props.onChanged();
        loadLedger();
      } catch (e) {
        setBad(true);
        setNote(e instanceof ApiError ? e.message : "That code cannot be claimed.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <>
      <Panel title="Claim a code">
        <p className={cx(u.rowSub)}>
          A code buys one try-on credit for the shop. The admin may have given you one
          - type it here and it becomes yours.
        </p>
        <div className={cx(pf.fieldRow)}>
          <input
            className={cx(pf.field)}
            value={code}
            inputMode="numeric"
            maxLength={8}
            placeholder="0421"
            aria-label="the code to claim"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setCode(e.currentTarget.value)}
          />
          <select
            className={cx(pf.field)}
            value={shopId}
            aria-label="the shop that gets the credit"
            disabled={busy}
            onChange={(e) => setShopId(e.currentTarget.value)}
          >
            <option value="">my newest shop</option>
            {props.shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.subdomain}
              </option>
            ))}
          </select>
        </div>
        {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
        <div className={cx(u.btnRow)}>
          <button
            className={cx(b.btn, b.btnPrimary, u.btnGrow, (busy || !code.trim()) && b.btnDisabled)}
            type="button"
            disabled={busy || !code.trim()}
            onClick={claim}
          >
            {busy ? "Claiming…" : "Claim the code"}
          </button>
        </div>
      </Panel>

      {open ? (
        <Panel title="Mint codes">
          <p className={cx(u.rowSub)}>
            A minted code belongs to your newest shop from the start - nobody else can
            redeem it. It tops up the try-on credits when it is redeemed in the shop
            dashboard.
          </p>
          <MintCodes
            sessionId={props.sessionId}
            onMinted={(minted) => {
              props.onCodes([...minted, ...props.codes]);
              setOpen(false);
            }}
          />
        </Panel>
      ) : null}

      <Panel title="Your codes">
        {props.codes.length === 0 ? (
          <EmptyState
            title="No codes yet."
            reason="Mint a code for a customer, or claim the one the admin gave you. A code is worth one try-on."
          />
        ) : (
          <div className={cx(u.rows)}>
            {props.codes.map((c, i) => (
              <div key={c.code}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <CopyCode code={c.code} />
                    <p className={cx(u.rowSub)}>
                      {c.status}
                      {c.note ? ` · ${c.note}` : ""} · {day(c.created_ms)}
                    </p>
                  </div>
                  <span className={cx(pf.chips)}>
                    <span className={cx(pf.chip, c.status === "active" ? pf.chipGood : pf.chip)}>
                      {c.status === "active" ? "ready" : c.status}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={cx(u.meta)}>
          {n(props.codes.length)} code(s) in this session. The platform does not list
          the codes of a shop to the owner - copy them while they are here.
        </p>
      </Panel>

      <Panel title="The codes of your shops">
        <p className={cx(u.rowSub)}>
          Every code that belongs to one of your shops or that a shop of yours
          used - with what it was worth.{" "}
          {fromCodes > 0
            ? `${n(fromCodes)} credit(s) reached your shops through these codes.`
            : "Nothing has been spent yet."}
        </p>
        {ledger.length === 0 ? (
          <EmptyState
            title="No code on the platform yet."
            reason="When the admin gives you a code, or when a code of yours is redeemed, it shows up here."
          />
        ) : (
          <div className={cx(u.rows)}>
            {ledger.map((c, i) => (
              <div key={c.code}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <CopyCode code={c.code} />
                    <p className={cx(u.rowSub)}>
                      worth {n(c.credits ?? 1)} credit(s)
                      {c.note ? ` · ${c.note}` : ""} · {day(c.created_ms)}
                      {c.redeemed_ms ? ` · used ${day(c.redeemed_ms)}` : ""}
                    </p>
                  </div>
                  <span className={cx(pf.chips)}>
                    <span
                      className={cx(
                        pf.chip,
                        c.status === "used"
                          ? pf.chipGood
                          : c.status === "active"
                            ? pf.chipGood
                            : pf.chip,
                      )}
                    >
                      {c.status === "used"
                        ? "used"
                        : c.status === "active"
                          ? "ready"
                          : c.status}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
