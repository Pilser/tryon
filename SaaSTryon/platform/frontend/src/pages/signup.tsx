/* pages/signup.tsx - create account. Polished card with OAuth + email. */
import { useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { ApiError, signup, saveSession, type Session } from "../api";
import { base as b, boot, cx, pf, ui as u } from "../kit";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" />
  </svg>
);

const TikTokIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.2 8.2 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07Z" />
  </svg>
);

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
        setError(e instanceof ApiError ? e.message : "Could not create account");
      } finally {
        setBusy(false);
      }
    })();
  }

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #dadce0", fontSize: 14, boxSizing: "border-box" as const };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg, #f7f7f5)" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="Latiforge" width={40} height={40} style={{ borderRadius: 8, marginBottom: 12 }} />
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Create your account</h1>
          <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>Free to start. 5 free try-ons included.</p>
        </div>
        {done ? (
          <div style={{ padding: 24, borderRadius: 12, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)", textAlign: "center" }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Welcome!</h2>
            <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>Your account is ready. Opening your platform home…</p>
          </div>
        ) : (
          <div style={{ padding: 24, borderRadius: 12, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <a href="/api/v1/auth/google" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 16px", borderRadius: 8, border: "1px solid #dadce0", background: "#fff", color: "#3c4043", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
                <GoogleIcon /> Sign up with Google
              </a>
              <a href="/api/v1/auth/tiktok" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 16px", borderRadius: 8, border: "none", background: "#010101", color: "#fff", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
                <TikTokIcon /> Sign up with TikTok
              </a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
              <span style={{ fontSize: 12, color: "#999" }}>or with email</span>
              <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
            </div>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Your name</label>
                <input style={inputStyle} type="text" placeholder="e.g. Amina Nakato" autoComplete="name" value={form.name} onChange={edit("name")} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Email</label>
                <input style={inputStyle} type="email" placeholder="you@shop.example" autoComplete="email" value={form.email} onChange={edit("email")} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>WhatsApp contact</label>
                <input style={inputStyle} type="tel" placeholder="0772 000 111" autoComplete="tel" value={form.contact} onChange={edit("contact")} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Shop name (optional)</label>
                <input style={inputStyle} type="text" placeholder="Amina's Kanzu Co" value={form.shopName} onChange={edit("shopName")} />
              </div>
              <button type="submit" disabled={busy} style={{ padding: "12px 16px", borderRadius: 8, border: "none", background: "#556b2f", color: "#fff", fontSize: 14, fontWeight: 500, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
                {busy ? "Creating…" : "Create account"}
              </button>
              {error ? <p style={{ fontSize: 13, color: "#c00", margin: 0 }}>{error}</p> : null}
            </form>
            <p style={{ fontSize: 13, color: "#666", textAlign: "center", marginTop: 16 }}>
              Already have an account? <a href="login.html" style={{ color: "#556b2f", fontWeight: 500 }}>Sign in</a>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<SignupPage />);