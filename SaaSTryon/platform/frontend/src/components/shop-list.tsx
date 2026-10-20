/* components/shop-list.tsx - the owner's shops: one card per shop with
   the live URL, the customer domain, the bundle, the deploy date and the
   numbers (try-on credits, redeemed platform codes, published landing
   files) - plus the actions that belong to a SHOP, not to a deploy:
   attach a domain, upload and publish the landing dist, open the shop,
   open the feed. The platform API works on the owner's active shop (the
   newest one), so an older shop says so instead of pretending.
   The activity feed of the same owner lives here too - it is the history
   of those shops, not a page of its own. */
import { useEffect, useState, type FormEvent, type JSX } from "react";
import {
  ApiError,
  type AuditRow,
  type ShopView,
  applyLanding,
  attachShopDomain,
  listLanding,
  uploadLandingFile,
} from "../api";
import { base as b, cx, pf, ui as u } from "../kit";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

const day = (ms: number): string => (ms ? new Date(ms).toLocaleDateString() : "unknown");

const when = (ms: number): string => (ms ? new Date(ms).toLocaleString() : "unknown");

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/* A number with its label: the kit's stat tile. */
export function StatTile(props: { label: string; value: string }): JSX.Element {
  return (
    <div className={cx(u.stat)}>
      <p className={cx(u.statLabel)}>{props.label}</p>
      <p className={cx(u.statValue)}>{props.value}</p>
      <hr className={cx(u.statRule)} />
    </div>
  );
}

/* A number with its meaning: label left, value right (the kit's row). */
export function ValueRow(props: {
  label: string;
  sub: string;
  value: string;
}): JSX.Element {
  return (
    <div className={cx(u.row)}>
      <div className={cx(u.rowMain)}>
        <p className={cx(u.rowTitle)}>{props.label}</p>
        <p className={cx(u.rowSub)}>{props.sub}</p>
      </div>
      <p className={cx(u.rowTitle)}>{props.value}</p>
    </div>
  );
}

/* One shop: the numbers, the domain, the landing dist. */
function ShopCard(props: {
  shop: ShopView;
  sessionId: string;
  active: boolean;
  activeName: string;
  onChanged: () => void;
}): JSX.Element {
  const s = props.shop;
  const host = s.url || `https://${s.subdomain}.latiforge.com`;
  const [domain, setDomain] = useState("");
  const [domainOpen, setDomainOpen] = useState(false);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainNote, setDomainNote] = useState("");
  const [domainBad, setDomainBad] = useState(false);
  const [landingBusy, setLandingBusy] = useState(false);
  const [landingNote, setLandingNote] = useState("");
  const [landingBad, setLandingBad] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [published, setPublished] = useState<string[]>(s.landing_files);

  /* The shop list is the truth about what is published - the local copy
     only carries the answer of the publish call itself. */
  useEffect(() => {
    setPublished(s.landing_files);
  }, [s.landing_files]);

  /* Attach the customer's own domain. The server's answer is the
     instruction the customer has to act on - it is shown verbatim. */
  function submitDomain(ev: FormEvent): void {
    ev.preventDefault();
    const value = domain.trim();
    if (!value) return;
    setDomainBusy(true);
    setDomainNote("");
    setDomainBad(false);
    void (async () => {
      try {
        const out = await attachShopDomain(props.sessionId, value);
        setDomainNote(`Live on ${out.url} (zone ${out.zone}).`);
        setDomain("");
        props.onChanged();
      } catch (e) {
        setDomainNote(msg(e, "Could not attach that domain."));
        setDomainBad(true);
      } finally {
        setDomainBusy(false);
      }
    })();
  }

  /* Upload the dist, one file at a time (the path is its place in the
     dist, so a folder drop keeps its folders). */
  function upload(files: FileList | null): void {
    if (!files || files.length === 0) return;
    setLandingBusy(true);
    setLandingNote("");
    setLandingBad(false);
    const list = Array.from(files);
    void (async () => {
      const done: string[] = [];
      for (const f of list) {
        const rel =
          (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        try {
          const out = await uploadLandingFile(props.sessionId, rel, f, props.shop.id);
          done.push(out.path);
        } catch (e) {
          setUploaded(done.length);
          setLandingNote(msg(e, "Upload failed."));
          setLandingBad(true);
          setLandingBusy(false);
          return;
        }
      }
      setUploaded(done.length);
      setLandingBusy(false);
      setLandingNote(`${done.length} file(s) uploaded - publish to make them live.`);
    })();
  }

  /* Publish: the uploaded files become the shop's root assets. */
  function publish(): void {
    setLandingBusy(true);
    setLandingNote("");
    setLandingBad(false);
    void (async () => {
      try {
        const out = await applyLanding(props.sessionId, props.shop.id);
        try {
          const listed = await listLanding(props.sessionId);
          const mine = listed.shops.find((s) => s.shop_id === props.shop.id);
          setPublished(mine?.files ?? []);
        } catch {
          /* the shop list below carries the published files anyway */
        }
        setLandingNote(
          `Published ${out.files} file(s) - the landing page is live at ${out.url}.`,
        );
        props.onChanged();
      } catch (e) {
        setLandingNote(msg(e, "Could not publish the landing page."));
        setLandingBad(true);
      } finally {
        setLandingBusy(false);
      }
    })();
  }

  /* Status chip: olive for a live shop, red for a broken one, grey while
     it is still being provisioned. */
  const statusChip =
    s.status === "live" || s.status === "active"
      ? cx(pf.chip, pf.chipGood)
      : s.status === "failed" || s.status === "suspended"
        ? cx(pf.chip, pf.chipBad)
        : cx(pf.chip);

  return (
    <div className={cx(u.card)}>
      <div className={cx(u.inlineHead)}>
        <p className={cx(u.cardTitle)}>{s.name || s.subdomain}</p>
        <span className={cx(pf.chips)}>
          <span className={statusChip}>{s.status}</span>
          <span className={cx(pf.chip, pf.chipAdmin)}>{s.tier}</span>
        </span>
      </div>
      <p className={cx(u.rowSub)}>
        <a className={cx(pf.code)} href={host} target="_blank" rel="noreferrer">
          {host}
        </a>
      </p>
      <p className={cx(u.rowSub)}>
        Bundle {s.bundle || "unknown"} · created {day(s.created_ms)} ·{" "}
        {n(s.landing_files.length)} landing file(s) published
      </p>
      <div className={cx(u.statGrid)}>
        <StatTile label="Try-on credits left" value={n(s.credits_left)} />
        <StatTile label="Credits granted" value={n(s.credits_granted)} />
        <StatTile label="Credits used" value={n(s.credits_used)} />
        <StatTile label="Platform codes redeemed" value={n(s.tokens_redeemed)} />
      </div>
      <hr className={cx(u.hairline)} />
      <p className={cx(pf.label)}>Your domain</p>
      {s.domain ? (
        <p className={cx(u.rowSub)}>
          <a
            className={cx(pf.code)}
            href={`https://${s.domain}`}
            target="_blank"
            rel="noreferrer"
          >
            {s.domain}
          </a>
        </p>
      ) : (
        <p className={cx(u.rowSub)}>
          No domain yet - the shop answers on {host} until you attach your own.
        </p>
      )}
      {domainOpen ? (
        <>
          <p className={cx(u.rowSub)}>
            Add this Cloudflare account as a collaborator on that domain's zone,
            then type the domain here - the certificate is issued for you.
          </p>
          <form onSubmit={submitDomain}>
            <label className={cx(pf.label)} htmlFor={`dom-${s.id}`}>
              Domain
            </label>
            <input
              id={`dom-${s.id}`}
              className={cx(pf.field)}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="myshop.com"
              autoComplete="off"
              disabled={domainBusy || !props.active}
            />
            {domainNote ? (
              <p className={domainBad ? cx(b.error) : cx(u.inlineNote)}>{domainNote}</p>
            ) : null}
            <div className={cx(u.btnRow)}>
              <button
                className={cx(
                  b.btn,
                  b.btnPrimary,
                  u.btnGrow,
                  (domainBusy || !domain.trim() || !props.active) && b.btnDisabled,
                )}
                type="submit"
                disabled={domainBusy || !domain.trim() || !props.active}
              >
                {domainBusy ? "Attaching…" : "Attach domain"}
              </button>
              <button
                className={cx(b.btn, b.btnSecondary, u.btnGrow)}
                type="button"
                onClick={() => setDomainOpen(false)}
                disabled={domainBusy}
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className={cx(u.btnRow)}>
          <button
            className={cx(b.btn, b.btnPrimary, u.btnGrow, !props.active && b.btnDisabled)}
            type="button"
            onClick={() => setDomainOpen(true)}
            disabled={!props.active}
          >
            {s.domain ? "Change domain" : "Add your domain"}
          </button>
        </div>
      )}
      {!props.active ? (
        <p className={cx(u.meta)}>
          Domain and landing files belong to your active shop ({props.activeName}).
        </p>
      ) : null}
      <hr className={cx(u.hairline)} />
      <p className={cx(pf.label)}>Landing page (dist)</p>
      <p className={cx(u.rowSub)}>
        Upload the dist folder of your own landing page. It is served at the root
        of the shop, the studio stays at /app. List your products with the feed:
        <code>/api/feed</code> returns JSON with a card per product.
      </p>
      <div className={cx(pf.fieldRow)}>
        <input
          className={cx(pf.field)}
          type="file"
          multiple
          aria-label="landing files"
          onChange={(e) => void upload(e.target.files)}
          disabled={landingBusy || !props.active}
        />
      </div>
      {uploaded > 0 ? (
        <p className={cx(u.meta)}>
          {n(uploaded)} file(s) uploaded - publish to make them live.
        </p>
      ) : null}
      {landingNote ? (
        <p className={landingBad ? cx(b.error) : cx(u.inlineNote)}>{landingNote}</p>
      ) : null}
      <div className={cx(u.btnRow)}>
        <button
          className={cx(
            b.btn,
            b.btnPrimary,
            u.btnGrow,
            (landingBusy || uploaded === 0 || !props.active) && b.btnDisabled,
          )}
          type="button"
          disabled={landingBusy || uploaded === 0 || !props.active}
          onClick={() => publish()}
        >
          {landingBusy ? "Working…" : "Publish landing page"}
        </button>
      </div>
      {published.length ? (
        <p className={cx(u.meta)}>
          Published: {published.slice(0, 6).join(", ")}
          {published.length > 6 ? ` (+${published.length - 6} more)` : ""}
        </p>
      ) : null}
      <hr className={cx(u.hairline)} />
      <div className={cx(u.btnRow)}>
        <a
          className={cx(b.btn, b.btnSecondary, u.btnGrow)}
          href={host}
          target="_blank"
          rel="noreferrer"
        >
          Open shop
        </a>
        <a
          className={cx(b.btn, b.btnSecondary, u.btnGrow)}
          href={`${host}/api/feed`}
          target="_blank"
          rel="noreferrer"
        >
          Open feed
        </a>
      </div>
    </div>
  );
}

/* "Your shops": the section the owner comes back to. Always there after
   the sign-in - the list is a read, not a side effect of a deploy. */
export function ShopList(props: {
  shops: ShopView[];
  sessionId: string;
  onChanged: () => void;
}): JSX.Element {
  const shops = props.shops;
  /* The platform API works on the newest shop of the owner. */
  let active = shops[0];
  for (const s of shops) if (!active || s.created_ms > active.created_ms) active = s;
  const activeName = active ? active.name || active.subdomain : "";

  if (shops.length === 0) {
    return (
      <div className={cx(u.card)}>
        <p className={cx(u.cardTitle)}>Your shops</p>
        <p className={cx(u.rowSub)}>
          No shop yet. Deploy one below - it gets its own URL, its own domain,
          its own landing page and its own try-on credits.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Your shops</p>
        <span className={cx(u.meta)}>
          {n(shops.length)} shop{shops.length === 1 ? "" : "s"}
        </span>
      </div>
      {shops.map((s) => (
        <ShopCard
          key={s.id}
          shop={s}
          sessionId={props.sessionId}
          active={!!active && s.id === active.id}
          activeName={activeName}
          onChanged={props.onChanged}
        />
      ))}
    </>
  );
}

/* The activity feed: what happened to the owner's shops - the last ten
   rows, newest first, as "action - subject" with the local time. */
export function ActivityFeed(props: { activity: AuditRow[] }): JSX.Element {
  const rows = props.activity.slice(0, 10);
  return (
    <div className={cx(u.card)}>
      <div className={cx(u.cardHead)}>
        <p className={cx(u.cardTitle)}>Activity</p>
        <span className={cx(u.meta)}>{n(props.activity.length)} event(s)</span>
      </div>
      {rows.length === 0 ? (
        <p className={cx(u.empty)}>Nothing yet - your first deploy shows up here.</p>
      ) : (
        <div className={cx(u.rows)}>
          {rows.map((a, i) => (
            <div key={a.id}>
              {i ? <hr className={cx(u.hairline)} /> : null}
              <div className={cx(u.row)}>
                <div className={cx(u.rowMain)}>
                  <p className={cx(u.rowTitle)}>
                    {a.action} - {a.subject}
                  </p>
                  <p className={cx(u.rowSub)}>
                    {when(a.created_ms)} · {a.actor}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
