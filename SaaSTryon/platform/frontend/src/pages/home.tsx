/* pages/home.tsx - the owner console: the token-card gate (the shop
   dashboard's pattern with a platform key), then the console itself.

   The shell keeps the session and the header; the console (the tab
   strip, the URL state and the six tabs) lives in
   components/owner/owner-console.tsx. The URL carries the state (the
   tab, the shop, the filters), the tab strip is not the primary action
   - the primary action sits in the page header, right-aligned, and
   changes with the tab (DESIGN.md P1, P6). */
import { useCallback, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  type AuditRow,
  type MeOut,
  type ShopToken,
  type ShopView,
  clearSession,
  loadSession,
  login,
  me,
  ownerActivity,
  ownerShops,
  saveSession,
} from "../api";
import { OwnerConsole } from "../components/owner/owner-console";
import { ConsoleHeader } from "../components/shared/console-header";
import { ConsoleSkeleton } from "../components/shared/console-skeleton";
import type { PrimaryAction } from "../components/shared/primary-action";
import { TokenCard } from "../components/token-card";
import { base as b, boot, cx, ui as u } from "../kit";

export default function HomePage(): JSX.Element {
  const [view, setView] = useState<"loading" | "gate" | "ready">("loading");
  const [data, setData] = useState<MeOut | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [shops, setShops] = useState<ShopView[]>([]);
  const [activity, setActivity] = useState<AuditRow[]>([]);
  const [codes, setCodes] = useState<ShopToken[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [primary, setPrimary] = useState<PrimaryAction | null>(null);

  /* The shops and the activity feed: two owner reads that go together.
     One of them failing must not hide the other. */
  const refresh = useCallback(async (sid: string): Promise<void> => {
    const [s, a] = await Promise.allSettled([ownerShops(sid), ownerActivity(sid)]);
    setShops(s.status === "fulfilled" ? s.value.shops ?? [] : []);
    setActivity(a.status === "fulfilled" ? a.value.activity : []);
    setListError(
      s.status === "rejected"
        ? s.reason instanceof ApiError
          ? s.reason.message
          : "Could not load your shops."
        : a.status === "rejected"
          ? a.reason instanceof ApiError
            ? a.reason.message
            : "Could not load the activity feed."
          : "",
    );
  }, []);

  const load = useCallback(() => {
    const s = loadSession();
    if (!s) return setView("gate");
    setBusy(true);
    void (async () => {
      try {
        setData(await me(s.session_id));
        setSessionId(s.session_id);
        setView("ready");
        await refresh(s.session_id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearSession();
          setError("Session expired - sign in again.");
        } else if (e instanceof ApiError && e.status === 403) {
          /* not approved / suspended: the console says so and why */
          setError(e.message || "This account may not use the console yet.");
        } else {
          setError(e instanceof ApiError ? e.message : "The platform is not reachable - retry.");
        }
        setView("gate");
      } finally {
        setBusy(false);
      }
    })();
  }, [refresh]);

  useEffect(() => load(), [load]);

  function forge(token: string): void {
    setBusy(true);
    setError("");
    void (async () => {
      try {
        saveSession(await login(token));
        load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not sign in - offline?");
        setBusy(false);
      }
    })();
  }

  function signOut(): void {
    clearSession();
    setData(null);
    setShops([]);
    setActivity([]);
    setCodes([]);
    setPrimary(null);
    setView("gate");
  }

  return (
    <main className={cx(b.reset, u.page)}>
      <ConsoleHeader
        title="My platform"
        lead="Your seat on the platform: the shops that are live, the credits they may spend and what happened to them."
        primary={view === "ready" ? primary : null}
        aside={
          view === "ready" ? (
            <a className={cx(b.btn, b.btnSecondary)} href="admin.html">
              Admin console
            </a>
          ) : null
        }
      />
      {view === "gate" ? (
        <TokenCard
          title="Sign in"
          lead="Paste the token you received on approval. No token yet? Request access on the signup page."
          placeholder="Sign-in token"
          cta="Log in"
          busy={busy}
          error={error}
          onToken={forge}
        />
      ) : view === "loading" || !data ? (
        <>
          <p className={cx(u.empty)}>{error || "Loading your platform…"}</p>
          {!error ? <ConsoleSkeleton /> : null}
        </>
      ) : (
        <>
          {error ? <p className={cx(b.error)}>{error}</p> : null}
          {listError ? <p className={cx(b.error)}>{listError}</p> : null}
          <OwnerConsole
            me={data}
            sessionId={sessionId}
            shops={shops}
            activity={activity}
            codes={codes}
            onCodes={setCodes}
            onChanged={() => void refresh(sessionId)}
            onSignOut={signOut}
            onPrimary={setPrimary}
          />
        </>
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<HomePage />);
