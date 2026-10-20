/* pages/admin.tsx - the approval console. ADMIN_TOKEN gate (the shop
   dashboard's #db-token pattern), then the tabs: pending requests
   (approve with a deploy allowance - the minted plat_ sign-in token
   shows in the row - or a red reject), approved/suspended (allowance
   edits + suspend/reactivate), tokens (mint 4-digit shop codes, cancel
   or delete unclaimed ones, the pending credit requests), shops (every
   shop with its owner, URL, domain and numbers - and the controls over
   it: settings, bundle, codes, delete), bundles (the versions in R2,
   the upload and the bulk redeploy) and activity (the audit feed).
   The admin token is kept in memory only. */
import { useCallback, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  adminActivity,
  adminAllowance,
  adminApprove,
  adminCancelToken,
  adminCreditApprove,
  adminCreditReject,
  adminCreditRequests,
  adminMintTokens,
  adminReject,
  adminShops,
  adminSuspend,
  adminReactivate,
  adminTokens,
  adminUsers,
  type AuditRow,
  type CreditRequest,
  type PlatformUser,
  type ShopToken,
  type ShopView,
} from "../api";
import { ActivityTab, CreditRequests, ShopsTab } from "../components/admin-shops";
import { BundlesTab } from "../components/admin-bundles";
import { UsersTab } from "../components/admin-users";
import { adminDeleteToken } from "../api-admin";
import { TokenCard } from "../components/token-card";
import { TokensTab } from "../components/token-rows";
import { base as b, boot, cx, pf, ui as u } from "../kit";

type Tab = "pending" | "approved" | "tokens" | "credits" | "shops" | "bundles" | "activity";

export default function AdminPage(): JSX.Element {
  const [admin, setAdmin] = useState<string | null>(null);
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [tokens, setTokens] = useState<ShopToken[] | null>(null);
  const [credits, setCredits] = useState<CreditRequest[] | null>(null);
  const [shops, setShops] = useState<ShopView[] | null>(null);
  const [activity, setActivity] = useState<AuditRow[] | null>(null);
  const [allow, setAllow] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  /* The shops and the audit feed are a second read: they never block the
     approval console, so a failure there only says so. */
  const collectShops = useCallback((token: string) => {
    void (async () => {
      try {
        const [s, a] = await Promise.all([adminShops(token), adminActivity(token)]);
        setShops(s.shops);
        setActivity(a.activity);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load the shops - offline?");
      }
    })();
  }, []);

  /* One load feeds the request tabs: pending + approved come back together. */
  const collect = useCallback(
    (token: string) => {
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
          collectShops(token);
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not load users - offline?");
        } finally {
          setBusy(false);
        }
      })();
    },
    [collectShops],
  );

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
  const creditList = credits || [];
  const token = admin;
  const activeTokens = tokens ? tokens.filter((t) => t.status === "active").length : 0;

  /* The user actions: approve with a sign-in token, reject, save the
     deploy allowance, suspend or reactivate. */
  const approveUser = (x: PlatformUser): void =>
    run(async () => {
      const res = await adminApprove(token, x.id, Number(allowanceOf(x)) || 3);
      setIssued({ ...issued, [x.id]: res.token });
      setNote(`Approved ${x.email} - token below, copy it to the owner.`);
    });
  const rejectUser = (x: PlatformUser): void =>
    run(() => adminReject(token, x.id), () => setNote(`Rejected ${x.email}.`));
  const saveAllowance = (x: PlatformUser): void =>
    run(
      () => adminAllowance(token, x.id, Number(allowanceOf(x)) || 0),
      () => setNote(`Allowance saved for ${x.email}.`),
    );
  const toggleUser = (x: PlatformUser): void =>
    run(
      x.status === "suspended"
        ? () => adminReactivate(token, x.id)
        : () => adminSuspend(token, x.id),
      () =>
        setNote(x.status === "suspended" ? `Reactivated ${x.email}.` : `Suspended ${x.email}.`),
    );
  const mintTokens = (count: number, memo: string): void =>
    run(async () => {
      const res = await adminMintTokens(token, count, memo || undefined);
      setTokens([...(tokens || []), ...res.tokens]);
      setNote(`Minted ${res.tokens.length} tokens: ${res.tokens.map((t) => t.code).join(" ")}`);
    });
  const cancelToken = (code: string): void =>
    run(async () => {
      const res = await adminCancelToken(token, code);
      setTokens((tokens || []).map((t) => (t.code === code ? res.token : t)));
      setNote(`Cancelled ${code}.`);
    });
  /* Delete a code for good (a cancelled code keeps its row). */
  const deleteToken = (code: string): void =>
    run(async () => {
      await adminDeleteToken(token, code);
      setTokens((tokens || []).filter((t) => t.code !== code));
      setNote(`Deleted ${code} for good.`);
    });
  const tabs: { id: Tab; label: string }[] = [
    { id: "pending", label: `Pending (${pending.length})` },
    { id: "approved", label: `Approved (${approved.length})` },
    { id: "tokens", label: `Tokens (${activeTokens})` },
    { id: "credits", label: `Credit requests (${creditList.length})` },
    { id: "shops", label: `Shops (${shops ? shops.length : 0})` },
    { id: "bundles", label: "Bundles" },
    { id: "activity", label: `Activity (${activity ? activity.length : 0})` },
  ];
  /* The credit requests sit next to the tokens (the billing queue) and
     on their own tab too. */
  const creditCard = (
    <CreditRequests
      requests={credits}
      busy={busy}
      onApprove={(id) => decideCredit(id, true)}
      onReject={(id) => decideCredit(id, false)}
    />
  );

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
        {tabs.map((t) => (
          <button
            key={t.id}
            className={cx(pf.tab, tab === t.id && pf.tabOn)}
            type="button"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tokens" && tokens ? (
        <>
          <TokensTab
            tokens={tokens}
            busy={busy}
            onMint={mintTokens}
            onCancel={cancelToken}
            onDelete={deleteToken}
          />
          {creditCard}
        </>
      ) : null}
      {tab === "credits" ? creditCard : null}
      {tab === "shops" ? (
        <ShopsTab
          shops={shops}
          adminToken={token}
          tokens={tokens}
          onChanged={() => collect(token)}
        />
      ) : null}
      {tab === "bundles" ? (
        <BundlesTab
          adminToken={token}
          shops={shops}
          onChanged={() => collect(token)}
        />
      ) : null}
      {tab === "activity" ? <ActivityTab activity={activity} /> : null}
      {tab === "pending" || tab === "approved" ? (
        <UsersTab
          tab={tab}
          rows={rows}
          allowanceOf={allowanceOf}
          issued={issued}
          busy={busy}
          onAllowance={(id, v) => setAllow({ ...allow, [id]: v })}
          onApprove={approveUser}
          onReject={rejectUser}
          onSave={saveAllowance}
          onToggle={toggleUser}
        />
      ) : null}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<AdminPage />);
