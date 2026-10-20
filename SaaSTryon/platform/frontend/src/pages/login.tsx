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
            Approved by the team? Your sign-in token arrived on your WhatsApp contact.
            Paste it once - the session stays on this device.
          </p>
        </div>
      </header>
      {session ? (
        <div className={cx(u.card)}>
          <h2 className={cx(u.cardTitle)}>Signed in as {who}</h2>
          <p className={cx(u.rowSub)}>Opening your platform home…</p>
        </div>
      ) : (
        <TokenCard
          title="Token"
          lead="One token per owner. No token yet? Request access first."
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
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<LoginPage />);
