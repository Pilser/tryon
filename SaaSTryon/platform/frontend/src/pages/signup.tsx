/* pages/signup.tsx - request platform access: email + WhatsApp contact +
   optional shop name. The card flips to a "pending approval" state -
   approval and the sign-in token handout happen in the admin console,
   then the owner signs in on login.html. */
import { useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { ApiError, signup } from "../api";
import { base as b, boot, cx, pf, ui as u } from "../kit";

export default function SignupPage(): JSX.Element {
  const [form, setForm] = useState({ email: "", contact: "", shopName: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const edit = (key: "email" | "contact" | "shopName") => (e: ChangeEvent<HTMLInputElement>) =>
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
        await signup({
          email,
          contact,
          ...(form.shopName.trim() ? { shop_name: form.shopName.trim() } : {}),
        });
        setSent(true);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not send the request - offline?");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <main className={cx(b.reset, u.page)}>
      <header className={cx(u.header)}>
        <div>
          <h1 className={cx(u.h1)}>Request platform access</h1>
          <p className={cx(u.lead)}>
            One request per shop. The platform team approves it, sends a sign-in
            token to your WhatsApp contact, and your shop deploys from your home page.
          </p>
        </div>
        <a className={cx(b.btn, b.btnSecondary, u.btnGrow)} href="login.html">
          Already approved?
        </a>
      </header>
      {sent ? (
        <div className={cx(u.card)}>
          <h2 className={cx(u.cardTitle)}>Pending approval</h2>
          <p className={cx(u.rowSub)}>
            Your request is in. Every shop is approved by hand; once approved a
            sign-in token lands on your WhatsApp contact.
          </p>
          <p className={cx(u.inlineNote)}>
            Enter that token on <a href="login.html">the login page</a> to open your platform home.
          </p>
        </div>
      ) : (
        <form className={cx(u.card)} onSubmit={submit}>
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
          <p className={cx(u.rowSub)}>The number that receives your sign-in token.</p>
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
              {busy ? "Sending…" : "Request access"}
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
