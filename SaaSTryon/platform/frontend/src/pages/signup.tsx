/* pages/signup.tsx - request platform access: email + WhatsApp contact +
   optional shop name. The card flips to a "pending approval" state -
   approval and the sign-in token handout happen in the admin console,
   then the owner signs in on login.html. */
import { useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { ApiError, signup, saveSession, type Session } from "../api";
import { base as b, boot, cx, pf, ui as u } from "../kit";

export default function SignupPage(): JSX.Element {
  const [form, setForm] = useState({ name: "", email: "", contact: "", shopName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const edit =
    (key: "name" | "email" | "contact" | "shopName") =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.currentTarget.value });

  function submit(ev: FormEvent<HTMLFormElement>): void {
    ev.preventDefault();
    const email = form.email.trim();
    const contact = form.contact.replace(/\s/g, "");
    if (!email.includes("@")) return setError("Enter your email, it is how we reach you.");
    if (contact.replace(/\D/g, "").length < 9) return setError("Enter a full WhatsApp number.");
    setError("");
    setBusy(true);
    void (async () => {
      try {
        const out = await signup({
          email,
          contact,
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
          ...(form.shopName.trim() ? { shop_name: form.shopName.trim() } : {}),
        });
        if (out.session_id) {
          saveSession({ session_id: out.session_id, user: out.user! });
        }
        setDone(true);
        setTimeout(() => window.location.replace("home.html"), 900);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not create account - offline?");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <main className={cx(b.reset, u.page)}>
      <header className={cx(u.header)}>
        <div>
          <h1 className={cx(u.h1)}>Create your account</h1>
          <p className={cx(u.lead)}>
            Free to start — 5 free try-ons included. Sign up with email or use Google/TikTok.
          </p>
        </div>
        <a className={cx(b.btn, b.btnSecondary, u.btnGrow)} href="login.html">
          Already have an account?
        </a>
      </header>
      {done ? (
        <div className={cx(u.card)}>
          <h2 className={cx(u.cardTitle)}>Welcome!</h2>
          <p className={cx(u.rowSub)}>Your account is ready. Opening your platform home…</p>
        </div>
      ) : (
        <form className={cx(u.card)} onSubmit={submit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <a
              className={cx(b.btn, b.btnPrimary, u.btnGrow)}
              href="/api/v1/auth/google"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Sign up with Google
            </a>
            <a
              className={cx(b.btn, b.btnSecondary, u.btnGrow)}
              href="/api/v1/auth/tiktok"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              Sign up with TikTok
            </a>
          </div>
          <p className={cx(u.rowSub)} style={{ marginBottom: 16 }}>Or create with email:</p>
          <label className={cx(pf.label)} htmlFor="su-name">Your name</label>
          <input
            className={cx(pf.field)}
            id="su-name"
            type="text"
            placeholder="e.g. Amina Nakato"
            autoComplete="name"
            value={form.name}
            onChange={edit("name")}
          />
          <label className={cx(pf.label)} htmlFor="su-email">Email</label>
          <input
            className={cx(pf.field)}
            id="su-email"
            type="email"
            placeholder="you@shop.example"
            autoComplete="email"
            value={form.email}
            onChange={edit("email")}
          />
          <label className={cx(pf.label)} htmlFor="su-contact">WhatsApp contact</label>
          <input
            className={cx(pf.field)}
            id="su-contact"
            type="tel"
            placeholder="0772 000 111"
            autoComplete="tel"
            value={form.contact}
            onChange={edit("contact")}
          />
          <label className={cx(pf.label)} htmlFor="su-shop">Shop name (optional)</label>
          <input
            className={cx(pf.field)}
            id="su-shop"
            type="text"
            placeholder="Amina's Kanzu Co"
            value={form.shopName}
            onChange={edit("shopName")}
          />
          <div className={cx(pf.fieldRow)}>
            <button className={cx(b.btn, b.btnPrimary, u.btnGrow)} type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
          {error ? <p className={cx(b.error)}>{error}</p> : null}
        </form>
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<SignupPage />);
