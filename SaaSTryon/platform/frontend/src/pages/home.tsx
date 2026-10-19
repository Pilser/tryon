/* pages/home.tsx - the gated "My platform" home. With no session it is
   the token-card login (shop dashboard pattern, tryon.platform.v1 key);
   with one it is the owner's allowance numbers - and the admin console
   entry when the signed-in seat is the admin role. */
import { useCallback, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  type MeOut,
  clearSession,
  loadSession,
  login,
  me,
  saveSession,
} from "../api";
import { TokenCard } from "../components/token-card";
import { base as b, boot, cx, ui as u } from "../kit";

export default function HomePage(): JSX.Element {
  const [view, setView] = useState<"loading" | "gate" | "ready">("loading");
  const [data, setData] = useState<MeOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const s = loadSession();
    if (!s) return setView("gate");
    setBusy(true);
    void (async () => {
      try {
        setData(await me(s.session_id));
        setView("ready");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          clearSession();
          setError("Session expired - sign in again.");
        } else {
          setError(e instanceof ApiError ? e.message : "The platform is not reachable - retry.");
        }
        setView("gate");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

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

  const tile = (label: string, value: string): JSX.Element => (
    <div className={cx(u.stat)}>
      <p className={cx(u.statLabel)}>{label}</p>
      <p className={cx(u.statValue)}>{value}</p>
      <hr className={cx(u.statRule)} />
    </div>
  );

  const left = data ? Math.max(0, data.deploy_allowance - data.deploy_used) : 0;

  return (
    <main className={cx(b.reset, u.page)}>
      <header className={cx(u.header)}>
        <div>
          <h1 className={cx(u.h1)}>My platform</h1>
          <p className={cx(u.lead)}>
            Your seat on the platform: what you may deploy, what is live already.
          </p>
        </div>
      </header>
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
        <p className={cx(u.empty)}>{error || "Loading your platform…"}</p>
      ) : (
        <>
          {error ? <p className={cx(u.inlineNote)}>{error}</p> : null}
          <div className={cx(u.card)}>
            <h2 className={cx(u.cardTitle)}>
              {data.user.shop_name || data.user.name || data.user.email}
            </h2>
            <p className={cx(u.rowSub)}>
              {data.user.email} · {data.user.contact || "no contact"}
            </p>
          </div>
          <div className={cx(u.statGrid)}>
            {tile("Deploy allowance", String(data.deploy_allowance))}
            {tile("Shops deployed", String(data.deploy_used))}
            {tile("Left to deploy", String(left))}
          </div>
          <div className={cx(u.card)}>
            <h2 className={cx(u.cardTitle)}>Deploy shop</h2>
            <p className={cx(u.rowSub)}>
              Shop deploys start in the next phase - each one uses 1 from your
              allowance, so {left} deploy{left === 1 ? "" : "s"} remain before a top-up.
            </p>
          </div>
          {data.user.role === "admin" ? (
            <div className={cx(u.btnRow)}>
              <a className={cx(b.btn, b.btnSecondary, u.btnGrow)} href="admin.html">
                Open admin console
              </a>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<HomePage />);
