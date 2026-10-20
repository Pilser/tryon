/* pages/home.tsx - the gated "My platform" home. With no session it is
   the token-card login (shop dashboard pattern, tryon.platform.v1 key);
   with one it is the owner's console: the shops that are live (URL,
   domain, credits, landing files) with the actions that belong to a shop,
   the try-on credits and the activity feed - plus the admin console entry
   when the signed-in seat is the admin role. */
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  type AuditRow,
  type MeOut,
  type ShopView,
  clearSession,
  deployShop,
  loadSession,
  login,
  me,
  ownerActivity,
  ownerShops,
  saveSession,
} from "../api";
import { ActivityFeed, ShopList, StatTile, ValueRow } from "../components/shop-list";
import { TokenCard } from "../components/token-card";
import { base as b, boot, cx, pf, ui as u } from "../kit";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

export default function HomePage(): JSX.Element {
  const [view, setView] = useState<"loading" | "gate" | "ready">("loading");
  const [data, setData] = useState<MeOut | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [shops, setShops] = useState<ShopView[]>([]);
  const [activity, setActivity] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [sub, setSub] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [liveUrl, setLiveUrl] = useState("");

  /* The shops and the activity feed: two owner reads that go together.
     One of them failing must not hide the other. */
  const refresh = useCallback(async (sid: string): Promise<void> => {
    const [s, a] = await Promise.allSettled([ownerShops(sid), ownerActivity(sid)]);
    setShops(s.status === "fulfilled" ? s.value.shops : []);
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

  const left = data ? Math.max(0, data.deploy_allowance - data.deploy_used) : 0;
  const creditsLeft = shops.reduce((a, s) => a + s.credits_left, 0);
  const creditsGranted = shops.reduce((a, s) => a + s.credits_granted, 0);
  const creditsUsed = shops.reduce((a, s) => a + s.credits_used, 0);
  const activeShop = shops.reduce<ShopView | null>(
    (best, s) => (!best || s.created_ms > best.created_ms ? s : best),
    null,
  );
  const activeUrl = activeShop
    ? activeShop.url || `https://${activeShop.subdomain}.latiforge.com`
    : "";
  const predicted = sub.trim().toLowerCase();

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
          {error ? <p className={cx(b.error)}>{error}</p> : null}
          {listError ? <p className={cx(b.error)}>{listError}</p> : null}
          <div className={cx(u.card)}>
            <h2 className={cx(u.cardTitle)}>
              {data.user.shop_name || data.user.email}
            </h2>
            <p className={cx(u.rowSub)}>
              {data.user.email} · {data.user.contact || "no contact"}
            </p>
          </div>
          <div className={cx(u.statGrid)}>
            <StatTile label="Deploy allowance" value={String(data.deploy_allowance)} />
            <StatTile label="Shops deployed" value={String(data.deploy_used)} />
            <StatTile label="Left to deploy" value={String(left)} />
            <StatTile label="Shops live" value={String(shops.length)} />
          </div>
          <ShopList
            shops={shops}
            sessionId={sessionId}
            onChanged={() => void refresh(sessionId)}
          />
          <div className={cx(u.card)}>
            <h2 className={cx(u.cardTitle)}>Deploy shop</h2>
            <p className={cx(u.rowSub)}>
              Each deploy uses 1 from your allowance, so {left} deploy
              {left === 1 ? " remains" : "s remain"} before a top-up.
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
                This deploy produces{" "}
                <strong>https://{predicted || "your-shop"}.latiforge.com</strong>{" "}
                - the studio answers at /app, your landing page at the root.
              </p>
              {deployError ? <p className={cx(b.error)}>{deployError}</p> : null}
              {liveUrl ? (
                <p className={cx(u.inlineNote)}>
                  Shop is live:{" "}
                  <a className={cx(pf.code)} href={liveUrl} target="_blank" rel="noreferrer">
                    {liveUrl}
                  </a>
                </p>
              ) : null}
              <div className={cx(u.btnRow)}>
                <button
                  className={cx(
                    b.btn,
                    b.btnPrimary,
                    u.btnGrow,
                    (deploying || left < 1 || !sub.trim()) && b.btnDisabled,
                  )}
                  type="submit"
                  disabled={deploying || left < 1 || !sub.trim()}
                >
                  {deploying
                    ? "Deploying…"
                    : left < 1
                      ? "Allowance exhausted"
                      : "Deploy shop"}
                </button>
              </div>
            </form>
          </div>
          <div className={cx(u.card)}>
            <h2 className={cx(u.cardTitle)}>Try-on credits</h2>
            <p className={cx(u.rowSub)}>
              Every try-on spends 1 credit. These are the totals over your{" "}
              {n(shops.length)} shop{shops.length === 1 ? "" : "s"}.
            </p>
            <div className={cx(u.rows)}>
              <ValueRow
                label="Credits left"
                sub="what your customers may spend now"
                value={n(creditsLeft)}
              />
              <ValueRow
                label="Credits granted"
                sub="codes, gifts and top-ups"
                value={n(creditsGranted)}
              />
              <ValueRow
                label="Credits used"
                sub="try-ons already spent"
                value={n(creditsUsed)}
              />
            </div>
            {activeUrl ? (
              <div className={cx(u.btnRow)}>
                <a
                  className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                  href={`${activeUrl}/dashboard`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Request more credits in the shop dashboard
                </a>
              </div>
            ) : null}
          </div>
          <ActivityFeed activity={activity} />
          {/* The admin console has its own ADMIN_TOKEN gate, so the link
              is always there - the session says nothing about it. */}
          <div className={cx(u.btnRow)}>
            <a className={cx(b.btn, b.btnSecondary, u.btnGrow)} href="admin.html">
              Open admin console
            </a>
          </div>        </>
      )}
    </main>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<HomePage />);
