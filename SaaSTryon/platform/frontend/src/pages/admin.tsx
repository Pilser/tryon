/* pages/admin.tsx - the approval console. ADMIN_TOKEN gate (the shop
   dashboard's #db-token pattern), then three tabs: pending requests
   (approve with a deploy allowance - the minted plat_ sign-in token
   shows in the row - or a red reject), approved/suspended (allowance
   edits + suspend/reactivate), and tokens (mint 4-digit shop codes,
   cancel unclaimed ones). The admin token is kept in memory only. */
import { useCallback, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  adminAllowance,
  adminApprove,
  adminCancelToken,
  adminCreditApprove,
  adminCreditReject,
  adminCreditRequests,
  adminMintTokens,
  adminReject,
  adminSuspend,
  adminReactivate,
  adminTokens,
  adminUsers,
  type CreditRequest,
  type PlatformUser,
  type ShopToken,
} from "../api";
import { ApprovedRow, PendingRow } from "../components/user-row";
import { TokenCard } from "../components/token-card";
import { TokensTab } from "../components/token-rows";
import { base as b, boot, cx, pf, ui as u } from "../kit";

type Tab = "pending" | "approved" | "tokens" | "credits";

export default function AdminPage(): JSX.Element {
  const [admin, setAdmin] = useState<string | null>(null);
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [tokens, setTokens] = useState<ShopToken[] | null>(null);
  const [credits, setCredits] = useState<CreditRequest[] | null>(null);
  const [allow, setAllow] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  /* One load feeds both tabs: pending + approved come back together. */
  const collect = useCallback((token: string) => {
    setBusy(true);
    void (async () => {
      try {
        const [p, a, t, c] = await Promise.all([
          adminUsers(token, "pending"),
          adminUsers(token, "approved"),
          adminTokens(token),
          adminCreditRequests(token),
        ]);
        setUsers([...p.users, ...a.users]);
        setTokens(t.tokens);
        setCredits(c.requests);
        setAdmin(token);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load users - offline?");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  /* Any admin write: run it, then reload the lists (approve mints a token
     that is shown inside the row it belongs to). */
  const run = (fn: () => Promise<unknown>, after?: () => void): void =>
    void (async () => {
      if (!admin) return;
      setError("");
      setBusy(true);
      try {
        await fn();
        await collect(admin);
        after?.();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "That did not go through - offline?");
        setBusy(false);
      }
    })();

  /* Approve = grant the requested credits in one step; reject closes it. */
  const decideCredit = (id: string, approve: boolean): void => {
    const token = admin;
    if (!token) return;
    run(async () => {
      if (approve) {
        const out = await adminCreditApprove(token, id);
        setNote(`Granted ${out.granted} credits to shop ${out.shop_id}.`);
      } else {
        await adminCreditReject(token, id);
        setNote("Request rejected.");
      }
      setCredits((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    });
  };

  if (!admin) {
    return (
      <main className={cx(b.reset, u.page)}>
        <header className={cx(u.header)}>
          <div>
            <h1 className={cx(u.h1)}>Platform admin</h1>
            <p className={cx(u.lead)}>
              Approve shops, set their deploy allowance, suspend bad actors.
            </p>
          </div>
        </header>
        <TokenCard
          title="Admin access"
          lead="Operators only. Paste the platform ADMIN_TOKEN to open the approval console."
          placeholder="ADMIN_TOKEN"
          cta="Unlock"
          busy={busy}
          error={error}
          onToken={collect}
        />
      </main>
    );
  }

  if (!users) {
    return (
      <main className={cx(b.reset, u.page)}>
        <p className={cx(u.empty)}>{error || "Loading users…"}</p>
      </main>
    );
  }

  const pending = users.filter((x) => x.status === "pending");
  const approved = users.filter((x) => x.status === "approved" || x.status === "suspended");
  const rows = tab === "pending" ? pending : approved;
  const allowanceOf = (x: PlatformUser): string =>
    allow[x.id] || String(x.status === "pending" ? 3 : x.deploy_allowance);

  return (
    <main className={cx(b.reset, u.page)}>
      <header className={cx(u.header)}>
        <div>
          <h1 className={cx(u.h1)}>Platform admin</h1>
          <p className={cx(u.lead)}>
            Requests at the top, live shops below. Approve = allowance + a plat_ token to copy to the owner.
          </p>
        </div>
      </header>
      {note ? <p className={cx(u.inlineNote)}>{note}</p> : null}
      {error ? <p className={cx(b.error)}>{error}</p> : null}
      <div className={cx(pf.tabs)}>
        <button
          className={cx(pf.tab, tab === "pending" && pf.tabOn)}
          type="button"
          onClick={() => setTab("pending")}
        >
          Pending ({pending.length})
        </button>
        <button
          className={cx(pf.tab, tab === "approved" && pf.tabOn)}
          type="button"
          onClick={() => setTab("approved")}
        >
          Approved ({approved.length})
        </button>
        <button
          className={cx(pf.tab, tab === "tokens" && pf.tabOn)}
          type="button"
          onClick={() => setTab("tokens")}
        >
          Tokens ({tokens ? tokens.filter((t) => t.status === "active").length : 0})
        </button>
        <button
          className={cx(pf.tab, tab === "credits" && pf.tabOn)}
          type="button"
          onClick={() => setTab("credits")}
        >
          Credit requests ({credits ? credits.length : 0})
        </button>
      </div>
      {tab === "tokens" && tokens ? (
        <TokensTab
          tokens={tokens}
          busy={busy}
          onMint={(count, note) =>
            run(
              async () => {
                const res = await adminMintTokens(admin, count, note || undefined);
                setTokens([...(tokens || []), ...res.tokens]);
                setNote(`Minted ${res.tokens.length} tokens: ${res.tokens.map((t) => t.code).join(" ")}`);
              },
            )
          }
          onCancel={(code) =>
            run(
              async () => {
                const res = await adminCancelToken(admin, code);
                setTokens((tokens || []).map((t) => (t.code === code ? res.token : t)));
                setNote(`Cancelled ${code}.`);
              },
            )
          }
        />
      ) : null}
      {tab === "credits" ? (
        <div className={cx(u.card)}>
          <p className={cx(u.cardTitle)}>
            Credit requests ({credits ? credits.length : 0})
          </p>
          {!credits || credits.length === 0 ? (
            <p className={cx(u.rowSub)}>No pending requests. Shops ask from their dashboard.</p>
          ) : (
            credits.map((r) => (
              <div key={r.id}>
                <p className={cx(u.rowSub)}>
                  Shop {r.shop_id} asks for <strong>{r.requested}</strong> credits
                  {r.reason ? ` - ${r.reason}` : ""}.
                </p>
                <div className={cx(u.btnRow)}>
                  <button
                    className={cx(b.btn, b.btnPrimary, u.btnGrow)}
                    type="button"
                    disabled={busy}
                    onClick={() => decideCredit(r.id, true)}
                  >
                    Approve and grant
                  </button>
                  <button
                    className={cx(b.btn, b.btnDanger, u.btnGrow)}
                    type="button"
                    disabled={busy}
                    onClick={() => decideCredit(r.id, false)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
      {tab === "pending" || tab === "approved" ? (
      <div className={cx(u.cardFlush)}>
        <div className={cx(u.cardHead)}>
          <p className={cx(u.cardTitle)}>{tab === "pending" ? "Requests" : "Approved shops"}</p>
          <span className={cx(u.meta)}>{busy ? "working…" : `${rows.length} shown`}</span>
        </div>
        <hr className={cx(u.hairline)} />
        <div className={cx(u.rows)}>
          {rows.length === 0 ? (
            <p className={cx(u.empty)}>
              {tab === "pending" ? "No pending requests." : "No approved shops yet."}
            </p>
          ) : (
            rows.map((x, i) => (
              <div key={x.id}>
                {i ? <hr className={cx(u.hairline)} /> : null}
                {tab === "pending" ? (
                  <PendingRow
                    user={x}
                    allowance={allowanceOf(x)}
                    issued={issued[x.id] || null}
                    onAllowance={(v) => setAllow({ ...allow, [x.id]: v })}
                    onApprove={() =>
                      run(
                        async () => {
                          const res = await adminApprove(admin, x.id, Number(allowanceOf(x)) || 3);
                          setIssued({ ...issued, [x.id]: res.token });
                          setNote(`Approved ${x.email} - token below, copy it to the owner.`);
                        },
                      )
                    }
                    onReject={() =>
                      run(
                        () => adminReject(admin, x.id),
                        () => setNote(`Rejected ${x.email}.`),
                      )
                    }
                  />
                ) : (
                  <ApprovedRow
                    user={x}
                    allowance={allowanceOf(x)}
                    issued={issued[x.id] || null}
                    onAllowance={(v) => setAllow({ ...allow, [x.id]: v })}
                    onSave={() =>
                      run(
                        () => adminAllowance(admin, x.id, Number(allowanceOf(x)) || 0),
                        () => setNote(`Allowance saved for ${x.email}.`),
                      )
                    }
                    onToggle={() =>
                      run(
                        x.status === "suspended"
                          ? () => adminReactivate(admin, x.id)
                          : () => adminSuspend(admin, x.id),
                        () =>
                          setNote(
                            x.status === "suspended"
                              ? `Reactivated ${x.email}.`
                              : `Suspended ${x.email}.`,
                          ),
                      )
                    }
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
      ) : null}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<AdminPage />);
