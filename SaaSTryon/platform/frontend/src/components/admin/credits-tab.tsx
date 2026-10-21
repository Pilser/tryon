/* components/admin/credits-tab.tsx - the Credits tab: the billing queue
   and the balance sheet.

   A credit request is a tenant asking for more try-ons. Approving grants
   the requested amount and closes the request in one step; a second
   approve cannot double-grant, because the server checks the state
   before it writes. Rejecting is red and asks for a reason, so the
   tenant can be told what happened. */
import { useEffect, useMemo, useState, type JSX } from "react";
import type { CreditRequest, ShopView } from "../../api";
import { ApiError } from "../../api";
import { adminSetTryonApi, adminTryonApi, type TryonApiOut } from "../../api-admin";
import { base as b, cx, pa, pf, ui as u } from "../../kit";
import { EmptyState } from "../shared/empty-state";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const when = (ms: number): string => (ms ? new Date(ms).toLocaleString() : "unknown");

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

const age = (ms: number): string => {
  if (!ms) return "unknown";
  const days = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
};

export function CreditsTab(props: {
  adminToken: string;
  requests: CreditRequest[];
  shops: ShopView[];
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  usePrimary(props.onPrimary, null);

  /* The try-on API's own balance: the one number the admin watches. */
  const [api, setApi] = useState<TryonApiOut | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const out = await adminTryonApi(props.adminToken);
        if (live) setApi(out);
      } catch {
        if (live) {
          setApi({
            configured: false,
            balance: null,
            message: "the platform did not answer",
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [props.adminToken]);

  const [reason, setReason] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState("");

  const shopName = (id: string): string => {
    const shop = props.shops.find((s) => s.id === id);
    return shop ? shop.name || shop.subdomain : id;
  };

  /* The balances: the tenants that are about to run out come first -
     an operator should see them before they ask. */
  const balances = useMemo(
    () =>
      props.shops
        .slice()
        .sort((a, b) => a.credits_left - b.credits_left)
        .map((s) => ({
          shop: s,
          granted: s.credits_granted,
          used: s.credits_used,
          left: s.credits_left,
        })),
    [props.shops],
  );

  return (
    <>
      <Panel title="Credit requests">
        <p className={cx(u.rowSub)}>
          The tenants that asked for more try-ons. Approving grants the asked
          amount and closes the request; rejecting stores the reason the tenant
          is told.
        </p>
        {props.requests.length === 0 ? (
          <EmptyState
            title="No pending request."
            reason="The queue is empty - a tenant asks from its own console, and the request lands here."
          />
        ) : (
          <div className={cx(u.rows)}>
            {props.requests.map((r, i) => (
              <div key={r.id}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>
                      {shopName(r.shop_id)} asks for {n(r.requested)} credit(s)
                    </p>
                    <p className={cx(pa.fact)}>
                      {r.reason || "no reason given"} · asked {age(r.created_ms)}
                      {" · "}
                      {when(r.created_ms)}
                    </p>
                  </div>
                  <div className={cx(u.btnRow)}>
                    <button
                      className={cx(b.btn, b.btnPrimary, u.btnGrow, props.busy && b.btnDisabled)}
                      type="button"
                      disabled={props.busy}
                      onClick={() => props.onApprove(r.id)}
                    >
                      Approve and grant
                    </button>
                    {armed === r.id ? (
                      <>
                        <input
                          className={cx(pf.field)}
                          value={reason[r.id] || ""}
                          placeholder="why (the tenant is told)"
                          aria-label="the reason of the rejection"
                          autoComplete="off"
                          disabled={props.busy}
                          onChange={(e) =>
                            setReason((prev) => ({ ...prev, [r.id]: e.currentTarget.value }))
                          }
                        />
                        <button
                          className={cx(b.btn, b.btnDanger, u.btnGrow, props.busy && b.btnDisabled)}
                          type="button"
                          disabled={props.busy}
                          onClick={() => {
                            props.onReject(r.id, (reason[r.id] || "").trim());
                            setArmed("");
                          }}
                        >
                          Reject
                        </button>
                        <button
                          className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                          type="button"
                          disabled={props.busy}
                          onClick={() => setArmed("")}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className={cx(b.btn, b.btnDanger, u.btnGrow, props.busy && b.btnDisabled)}
                        type="button"
                        disabled={props.busy}
                        onClick={() => setArmed(r.id)}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="The try-on API">
        <p className={cx(u.rowSub)}>
          The platform&apos;s own balance on the try-on API - the account the
          generations actually spend. It is the only balance the admin needs to
          watch; the tenants&apos; numbers are theirs.
        </p>
        {api === null ? (
          <p className={cx(u.meta)}>Reading the try-on API…</p>
        ) : api.configured ? (
          <div className={cx(u.row)}>
            <div className={cx(u.rowMain)}>
              <p className={cx(u.rowTitle)}>Try-on API balance</p>
              <p className={cx(pa.fact)}>
                {api.message || `read from the provider account (${api.source})`}
              </p>
            </div>
            <span className={cx(pf.chips)}>
              <span className={cx(pf.chip)}>
                {api.balance === null ? "unknown" : `${n(api.balance)} left`}
              </span>
            </span>
          </div>
        ) : (
          <EmptyState
            title="The try-on API is not configured."
            reason={
              api.message ||
              "Paste the provider key below - it is live on the next request, no deploy needed."
            }
          />
        )}
        <div className={cx(pf.fieldRow)}>
          <input
            className={cx(pf.field)}
            type="password"
            value={keyDraft}
            placeholder="paste the try-on API key"
            aria-label="the try-on API key"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setKeyDraft(e.currentTarget.value)}
          />
          <button
            className={cx(b.btn, b.btnPrimary, u.btnGrow, busy && b.btnDisabled)}
            type="button"
            disabled={busy || !keyDraft.trim()}
            onClick={() => {
              setBusy(true);
              void (async () => {
                try {
                  await adminSetTryonApi(props.adminToken, keyDraft.trim());
                  setKeyDraft("");
                  setApi(await adminTryonApi(props.adminToken));
                } catch (e) {
                  setApi({
                    configured: false,
                    balance: null,
                    message: msg(e, "Could not save the key."),
                    source: null,
                  });
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Saving…" : "Save the key"}
          </button>
          {api?.configured ? (
            <button
              className={cx(b.btn, b.btnSecondary, u.btnGrow)}
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void (async () => {
                  try {
                    await adminSetTryonApi(props.adminToken, "");
                    setKeyDraft("");
                    setApi(await adminTryonApi(props.adminToken));
                  } catch (e) {
                    setApi({
                      configured: false,
                      balance: null,
                      message: msg(e, "Could not clear the key."),
                      source: null,
                    });
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Clear the key
            </button>
          ) : null}
        </div>
        <p className={cx(u.meta)}>
          The key is stored in the platform database and read on every call, so
          it takes effect immediately - no worker restart, no new deploy.
        </p>
      </Panel>

      <Panel title="Balances">
        <p className={cx(u.rowSub)}>
          What every tenant has: granted, used and left. The tenants that are
          about to run out are first - they are the ones that will ask.
        </p>
        {balances.length === 0 ? (
          <EmptyState
            title="No tenant yet."
            reason="A balance appears here the moment a shop exists on the platform."
          />
        ) : (
          <div className={cx(u.rows)}>
            {balances.map((b0, i) => (
              <div key={b0.shop.id}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>
                      {b0.shop.name || b0.shop.subdomain}
                    </p>
                    <p className={cx(pa.fact)}>
                      {b0.shop.owner_email || "no owner"} ·{" "}
                      {b0.shop.status || "unknown"}
                    </p>
                  </div>
                  <div className={cx(u.btnRow)}>
                    <span className={cx(pf.chips)}>
                      <span className={cx(pf.chip)}>{n(b0.granted)} granted</span>
                      <span className={cx(pf.chip)}>{n(b0.used)} used</span>
                      <span
                        className={cx(
                          pf.chip,
                          b0.left === 0 ? pf.chipBad : pf.chipGood,
                        )}
                      >
                        {n(b0.left)} left
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={cx(u.meta)}>
          Granting credits directly is not on the platform yet - the queue above
          is the only way.
        </p>
      </Panel>
    </>
  );
}
