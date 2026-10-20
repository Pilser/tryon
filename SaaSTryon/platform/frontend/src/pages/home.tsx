/* pages/home.tsx - the gated "My platform" home. With no session it is
   the token-card login (shop dashboard pattern, tryon.platform.v1 key);
   with one it is the owner's allowance numbers - and the admin console
   entry when the signed-in seat is the admin role. */
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  type MeOut,
  applyLanding,
  attachShopDomain,
  clearSession,
  deployShop,
  loadSession,
  login,
  me,
  saveSession,
  uploadLandingFile,
} from "../api";
import { TokenCard } from "../components/token-card";
import { base as b, boot, cx, pf, ui as u } from "../kit";

export default function HomePage(): JSX.Element {
  const [view, setView] = useState<"loading" | "gate" | "ready">("loading");
  const [data, setData] = useState<MeOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sub, setSub] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainNote, setDomainNote] = useState("");
  const [landingFiles, setLandingFiles] = useState<string[]>([]);
  const [landingBusy, setLandingBusy] = useState(false);
  const [landingNote, setLandingNote] = useState("");

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

  function submitDeploy(ev: FormEvent): void {
    ev.preventDefault();
    const s = loadSession();
    if (!s) return;
    const slug = sub.trim().toLowerCase();
    if (!slug) {
      setDeployError("Pick the address your customers will type.");
      return;
    }
    setDeploying(true);
    setDeployError("");
    setLiveUrl("");
    void (async () => {
      try {
        const out = await deployShop(s.session_id, { subdomain: slug });
        setLiveUrl(out.url || `https://${out.subdomain}.latiforge.com`);
        setSub("");
        load();
      } catch (e) {
        setDeployError(
          e instanceof ApiError ? e.message : "Deploy failed - the platform did not answer.",
        );
      } finally {
        setDeploying(false);
      }
    })();
  }

  function submitDomain(ev: FormEvent): void {
    ev.preventDefault();
    const s = loadSession();
    if (!s) return;
    setDomainBusy(true);
    setDomainNote("");
    void (async () => {
      try {
        const out = await attachShopDomain(s.session_id, domain.trim());
        setDomainNote(`Live on ${out.url} (zone ${out.zone}).`);
        setDomain("");
      } catch (e) {
        setDomainNote(e instanceof ApiError ? e.message : "Could not attach that domain.");
      } finally {
        setDomainBusy(false);
      }
    })();
  }

  function uploadLanding(files: FileList | null): void {
    const s = loadSession();
    if (!s || !files || files.length === 0) return;
    setLandingBusy(true);
    setLandingNote("");
    const list = Array.from(files);
    void (async () => {
      const done: string[] = [];
      for (const f of list) {
        try {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          const out = await uploadLandingFile(s.session_id, rel, f);
          done.push(out.path);
        } catch (e) {
          setLandingNote(e instanceof ApiError ? e.message : "Upload failed.");
        }
      }
      setLandingFiles(done);
      setLandingBusy(false);
      if (done.length) setLandingNote(`${done.length} file(s) uploaded - publish when ready.`);
    })();
  }

  function publishLanding(): void {
    const s = loadSession();
    if (!s) return;
    setLandingBusy(true);
    setLandingNote("");
    void (async () => {
      try {
        const out = await applyLanding(s.session_id);
        setLandingNote(`Published ${out.files} file(s). The landing page is live at the shop root.`);
      } catch (e) {
        setLandingNote(e instanceof ApiError ? e.message : "Could not publish the landing page.");
      } finally {
        setLandingBusy(false);
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
              Each deploy uses 1 from your allowance, so {left} deploy
              {left === 1 ? "" : "s"} remain before a top-up.
            </p>
            <form onSubmit={submitDeploy}>
              <label className={cx(pf.label)} htmlFor="dp-sub">
                Shop address
              </label>
              <input
                id="dp-sub"
                className={cx(pf.field)}
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                placeholder="amina-studio"
                autoComplete="off"
                disabled={deploying || left < 1}
              />
              <p className={cx(u.inlineNote)}>
                Customers will reach your shop at{" "}
                <strong>{sub.trim() || "your-shop"}.latiforge.com</strong>.
              </p>
              {deployError ? <p className={cx(u.inlineNote)}>{deployError}</p> : null}
              {liveUrl ? (
                <p className={cx(u.inlineNote)}>Shop is live: {liveUrl}</p>
              ) : null}
              <div className={cx(u.btnRow)}>
                <button
                  className={cx(b.btn, b.btnPrimary, u.btnGrow)}
                  type="submit"
                  disabled={deploying || left < 1 || !sub.trim()}
                >
                  {deploying ? "Deploying..." : left < 1 ? "Allowance exhausted" : "Deploy shop"}
                </button>
              </div>
            </form>
          </div>
          {liveUrl ? (
            <>
              <div className={cx(u.card)}>
                <h2 className={cx(u.cardTitle)}>Your own domain</h2>
                <p className={cx(u.rowSub)}>
                  Point a domain you own at this shop. Add this Cloudflare
                  account as a collaborator on that domain's zone, then type
                  the domain here - the certificate is issued for you.
                </p>
                <form onSubmit={submitDomain}>
                  <label className={cx(pf.label)} htmlFor="dp-domain">
                    Your domain
                  </label>
                  <input
                    id="dp-domain"
                    className={cx(pf.field)}
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="myshop.com"
                    autoComplete="off"
                    disabled={domainBusy}
                  />
                  {domainNote ? (
                    <p className={cx(u.inlineNote)}>{domainNote}</p>
                  ) : null}
                  <div className={cx(u.btnRow)}>
                    <button
                      className={cx(b.btn, b.btnPrimary, u.btnGrow)}
                      type="submit"
                      disabled={domainBusy || !domain.trim()}
                    >
                      {domainBusy ? "Attaching..." : "Attach domain"}
                    </button>
                  </div>
                </form>
              </div>
              <div className={cx(u.card)}>
                <h2 className={cx(u.cardTitle)}>Landing page</h2>
                <p className={cx(u.rowSub)}>
                  Upload the dist folder of your own landing page. It is
                  served at the root of your shop, the shop itself stays at
                  /app. List your products in it with the feed:
                  <br />
                  <code>/api/feed</code> returns JSON with a card per
                  product and the link to its page.
                </p>
                <div className={cx(pf.fieldRow)}>
                  <input
                    id="dp-landing"
                    className={cx(pf.field)}
                    type="file"
                    multiple
                    onChange={(e) => void uploadLanding(e.target.files)}
                    disabled={landingBusy}
                  />
                </div>
                {landingNote ? <p className={cx(u.inlineNote)}>{landingNote}</p> : null}
                <div className={cx(u.btnRow)}>
                  <button
                    className={cx(b.btn, b.btnPrimary, u.btnGrow)}
                    type="button"
                    disabled={landingBusy || !landingFiles.length}
                    onClick={() => void publishLanding()}
                  >
                    {landingBusy ? "Publishing..." : "Publish landing page"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
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
