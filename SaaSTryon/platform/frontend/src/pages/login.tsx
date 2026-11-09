/* pages/login.tsx - sign in with the token the platform sent after
   approval (the shop dashboard's token-card pattern). A successful
   exchange is stored as the platform session (tryon.platform.v1) and
   shows the owner's name once before landing on home.html. */
import { useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { ApiError, type Session, login, saveSession } from "../api";
import { TokenCard } from "../components/token-card";
import { base, boot, cx, ui as u } from "../kit";

export default function LoginPage(): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  const who = session ? (session.user.shop_name || session.user.email) : "";
  if (session) window.setTimeout(() => window.location.replace("home.html"), 900);

  return (
    <main className={cx(base.reset, u.page)}>
      <header className={cx(u.header)}>
        <div>
          <h1 className={cx(u.h1)}>Sign in</h1>
          <p className={cx(u.lead)}>
            Sign in with Google or TikTok — no password, no token.
          </p>
        </div>
      </header>
      {session ? (
        <div className={cx(u.card)}>
          <h2 className={cx(u.cardTitle)}>Signed in as {who}</h2>
          <p className={cx(u.rowSub)}>Opening your platform home…</p>
        </div>
      ) : (
        <div className={cx(u.card)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <a
              className={cx(base.btn, base.btnPrimary, u.btnGrow)}
              href="/api/v1/auth/google"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Sign in with Google
            </a>
            <a
              className={cx(base.btn, base.btnSecondary, u.btnGrow)}
              href="/api/v1/auth/tiktok"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Sign in with TikTok
            </a>
          </div>
          <p className={cx(u.rowSub)} style={{ marginTop: 16 }}>
            Or paste a sign-in token if you have one.
          </p>
          <TokenCard
            title="Token"
            lead="One token per owner."
            placeholder="Sign-in token"
            cta="Log in"
            busy={busy}
            error={error}
            onToken={(token) => {
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  const res = await login(token);
                  saveSession(res);
                  setSession(res);
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Could not sign in - offline?");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
        </div>
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<LoginPage />);
