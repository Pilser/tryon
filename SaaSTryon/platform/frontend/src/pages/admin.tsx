/* pages/admin.tsx - the ADMIN console: the ADMIN_TOKEN gate (the token
   is kept in memory only, never persisted), then the console itself.

   The shell keeps the token; the console (the tab strip, the URL
   state and the seven tabs) lives in components/admin/admin-console.tsx
   and the data lives in components/admin/use-admin.ts. The URL carries
   the state (the tab, the tenant, the search, the filters), the tab
   strip is not the primary action - the primary action sits in the page
   header, right-aligned, and changes with the tab (DESIGN.md P1, P6).

   The people in here are the platform's own customers: the owner of a
   shop is never the operator. */
import { useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { adminPlatformRedeploy, adminTryonApi, type TryonApiOut } from "../api-admin";
import { AdminConsole } from "../components/admin/admin-console";
import { useAdmin } from "../components/admin/use-admin";
import { ConsoleHeader } from "../components/shared/console-header";
import { ConsoleSkeleton } from "../components/shared/console-skeleton";
import type { PrimaryAction } from "../components/shared/primary-action";
import { TokenCard } from "../components/token-card";
import { base as b, boot, cx, pf, ui as u } from "../kit";

export default function AdminPage(): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [primary, setPrimary] = useState<PrimaryAction | null>(null);
  const [healing, setHealing] = useState(false);
  const [healNote, setHealNote] = useState("");
  /* The try-on API's own balance: the one number the admin has to
     watch, so it sits in the header of every tab. */
  const [tryon, setTryon] = useState<TryonApiOut | null>(null);
  const admin = useAdmin(token);

  /* Read the balance whenever the console opens (and after a change). */
  useEffect(() => {
    if (!token) return;
    let live = true;
    void (async () => {
      try {
        const out = await adminTryonApi(token);
        if (live) setTryon(out);
      } catch {
        if (live) setTryon(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [token, admin.data]);

  if (!token) {
    return (
      <main className={cx(b.reset, pf.pageWide)}>
        <ConsoleHeader
          title="Platform admin"
          lead="The control plane of Latiforge: the owners who asked for a shop, the shops they run, the versions they run on and the codes they spend."
        />
        <TokenCard
          title="Admin access"
          lead="Operators only. Paste the platform ADMIN_TOKEN to open the console. The token stays in this tab and is never stored."
          placeholder="ADMIN_TOKEN"
          cta="Unlock"
          busy={admin.busy}
          error={admin.error}
          onToken={(value) => {
            setToken(value);
            admin.reload(value);
          }}
        />
      </main>
    );
  }

  return (
    <main className={cx(b.reset, pf.pageWide)}>
      <ConsoleHeader
        title="Platform admin"
        lead="Requests at the top, the tenants below. You run the shops of the platform - the owner of a shop is a customer with their own sign-in."
        primary={primary}
        aside={
          <>
            <span className={cx(pf.chips)} title="The balance of the try-on API - the account the generations spend">
              <span className={cx(pf.chip, tryon?.configured ? pf.chipGood : pf.chip)}>
                try-on API:{" "}
                {tryon === null
                  ? "…"
                  : !tryon.configured
                    ? "not set"
                    : tryon.balance === null
                      ? "unknown"
                      : `${tryon.balance} left`}
              </span>
            </span>
            <button
              className={cx(b.btn, b.btnSecondary)}
              type="button"
              onClick={() => {
                setPrimary(null);
                setToken(null);
                admin.lock();
              }}
            >
              Lock the console
            </button>
          </>
        }
      />
      {admin.note ? <p className={cx(u.inlineNote)}>{admin.note}</p> : null}
      {admin.error ? <p className={cx(b.error)}>{admin.error}</p> : null}
      {admin.unreachable ? (
        <div className={cx(u.card, b.error)}>
          <p className={cx(u.rowTitle)}>The platform worker is poisoned</p>
          <p className={cx(u.rowSub)}>
            A panic inside a Worker leaves the isolate unable to start again
            (every request answers &quot;error 1101&quot;). The script itself is
            fine - a new version spawns fresh isolates, and the platform
            keeps a copy of itself in R2 for exactly this.
          </p>
          <div className={cx(u.btnRow)}>
            <button
              className={cx(b.btn, b.btnPrimary)}
              type="button"
              disabled={healing}
              onClick={() => {
                setHealing(true);
                void (async () => {
                  try {
                    await adminPlatformRedeploy(token || "");
                    setHealNote("The platform was redeployed - give it a few seconds.");
                  } catch (e) {
                    setHealNote(
                      e instanceof Error
                        ? e.message
                        : "The redeploy did not go through.",
                    );
                  } finally {
                    setHealing(false);
                  }
                })();
              }}
            >
              {healing ? "Redeploying…" : "Redeploy the platform"}
            </button>
          </div>
          {healNote ? <p className={cx(u.meta)}>{healNote}</p> : null}
        </div>
      ) : null}
      {!admin.data ? (
        <>
          <p className={cx(u.empty)}>
            {admin.error ? "The platform is not reachable." : "Loading the platform…"}
          </p>
          {!admin.error ? <ConsoleSkeleton /> : null}
        </>
      ) : (
        <AdminConsole
          adminToken={token}
          data={admin.data}
          actions={admin.actions}
          busy={admin.busy}
          issued={admin.issued}
          allowance={admin.allowance}
          userToken={admin.userToken}
          onPrimary={setPrimary}
        />
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<AdminPage />);
