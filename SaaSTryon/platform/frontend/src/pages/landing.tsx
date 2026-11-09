/* pages/landing.tsx - the public landing page of latiforge.com.

   Eleven sections, in order (DESIGN.md 2.2): S0 nav, S1 hero, S2 live
   catalogue, S3 how it works, S4 what you get, S5 who it is for, S6 the
   numbers, S7 pricing, S8 FAQ, S9 final CTA, S10 footer.

   The rules that shape it: one primary action per screen ("Request a
   shop"), every claim countable (no testimonials, no customer logos,
   no invented numbers), and every screenshot a real running screen
   (DESIGN.md P1, P7). */
import { useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { base as b, boot, cx, pf, ui as u } from "../kit";
import { DEMO, loadDemoFeed, type Feed } from "../demo";
import { ld } from "../kit";
import { Hero } from "../components/landing/hero";
import { LiveDemo } from "../components/landing/live-demo";
import { TryonFlip } from "../components/landing/tryon-flip";
import { Gallery } from "../components/landing/gallery";
import { Catalogue } from "../components/landing/catalogue";
import { Features } from "../components/landing/features";
import { Pricing } from "../components/landing/pricing";
import { Faq } from "../components/landing/faq";

const STEPS = [
  {
    n: "01",
    title: "Request your shop",
    body: "Your email and WhatsApp number. We approve, and your address is yours — {sub}.latiforge.com, or your own domain.",
  },
  {
    n: "02",
    title: "Add your catalogue",
    body: "Garment photos, prices and sizes, added from the studio — from a phone, from your own phone.",
  },
  {
    n: "03",
    title: "Publish your page",
    body: "Upload your own landing page and it is served at your domain. Your catalogue is at /api/feed, as JSON, open to any page.",
  },
  {
    n: "04",
    title: "Get the order",
    body: "The shopper tries the garment on, then confirms on WhatsApp. You keep the customer, the order and the margin.",
  },
];

const AUDIENCES = [
  {
    title: "Garment shops & retail",
    body: "Ready-to-wear stock that people want to see on themselves before they pay. Your photos, your prices, your sizes - and the order still comes to you.",
  },
  {
    title: "Studios & collections",
    body: "Made-to-order pieces and small collections. One collection, one storefront, one product feed, one address of your own.",
  },
  {
    title: "Brands & tailors",
    body: "A brand with a handful of pieces and no developer. The try-on is already inside the storefront - you only add the garments.",
  },
];

function Nav(): JSX.Element {
  return (
    <div className={cx(ld.navBar)}>
      <nav className={cx(ld.nav)} aria-label="Primary">
        <a className={cx(ld.brand)} href="/">
          <img src="/logo.png" alt="Latiforge" width={24} height={24} style={{ borderRadius: 4 }} />
          Latiforge
        </a>
        <div className={cx(ld.navLinks)}>
          <a className={cx(ld.navLink)} href="#how-it-works">How it works</a>
          <a className={cx(ld.navLink)} href="#catalogue">Catalogue</a>
          <a className={cx(ld.navLink)} href="#pricing">Pricing</a>
          <a className={cx(ld.navLink)} href="#faq">FAQ</a>
        </div>
        <div className={cx(ld.navCtas)}>
          <a className={cx(ld.navBtn)} href="/login.html">
            Sign in
          </a>
          <a className={cx(ld.navBtnPrimary)} href="/signup.html">
            Request a shop
          </a>
        </div>
      </nav>
    </div>
  );
}

function HowItWorks(): JSX.Element {
  return (
    <section className={cx(ld.section)} id="how-it-works">
      <div>
        <p className={cx(ld.eyebrow)}>How it works</p>
        <h2 className={cx(ld.sectionTitle)}>Four steps from request to order</h2>
        <p className={cx(ld.sectionLead)}>
          No code, no designer, no monthly platform fee per shop.
        </p>
      </div>
      <div className={cx(ld.stepGrid)}>
        {STEPS.map((s) => (
          <article className={cx(ld.card)} key={s.n}>
            <span className={cx(ld.eyebrow)}>{s.n}</span>
            <h3 className={cx(ld.cardTitle)}>{s.title}</h3>
            <p className={cx(ld.cardBody)}>{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Audiences(): JSX.Element {
  return (
    <section className={cx(ld.section)} id="for-who">
      <div>
        <p className={cx(ld.eyebrow)}>Who it is for</p>
        <h2 className={cx(ld.sectionTitle)}>Built for the people who sell the garment</h2>
      </div>
      <div className={cx(ld.grid3)}>
        {AUDIENCES.map((a) => (
          <article className={cx(ld.card)} key={a.title}>
            <h3 className={cx(ld.cardTitle)}>{a.title}</h3>
            <p className={cx(ld.cardBody)}>{a.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Numbers(props: { feed: Feed | null; live: boolean }): JSX.Element {
  const garments = props.feed ? props.feed.items.length : 0;
  return (
    <section className={cx(ld.section)} id="numbers">
      <div>
        <p className={cx(ld.eyebrow)}>The numbers</p>
        <h2 className={cx(ld.sectionTitle)}>What we can count today</h2>
        <p className={cx(ld.sectionLead)}>
          Every number on this page is counted by us. Where we cannot count
          something, we show a dash instead of a guess.
        </p>
      </div>
      <div className={cx(ld.statGrid)}>
        <div className={cx(u.stat)}>
          <p className={cx(u.statLabel)}>Garments in the demo catalogue</p>
          <p className={cx(u.statValue)}>{props.feed ? garments : "—"}</p>
          <p className={cx(u.statLabel)}>
            {props.live ? "read live from the demo shop" : "from our last snapshot"}
          </p>
        </div>
        <div className={cx(u.stat)}>
          <p className={cx(u.statLabel)}>Demo shops you can open</p>
          <p className={cx(u.statValue)}>2</p>
          <p className={cx(u.statLabel)}>both live on latiforge.com</p>
        </div>
        <div className={cx(u.stat)}>
          <p className={cx(u.statLabel)}>Try-ons served so far</p>
          <p className={cx(u.statValue)}>—</p>
          <p className={cx(u.statLabel)}>not published yet — we will not make it up</p>
        </div>
      </div>
    </section>
  );
}

function FinalCta(): JSX.Element {
  return (
    <section className={cx(ld.section)} id="request">
      <div className={cx(ld.band)}>
        <h2 className={cx(ld.bandTitle)}>Your catalogue, wearable. One try-on at a time.</h2>
        <p className={cx(ld.cardBody)}>
          Tell us your email and your WhatsApp number. We approve, you get your
          address, and the first garment is one upload away.
        </p>
        <a className={cx(b.btn, b.btnPrimary, u.btnGrow)} href="/signup.html">
          Request a shop
        </a>
        <p className={cx(ld.note)}>No card. We approve within a working day.</p>
      </div>
    </section>
  );
}

function Footer(): JSX.Element {
  return (
    <footer className={cx(ld.footer)}>
      <span>© 2026 Latiforge · virtual try-on shops on latiforge.com</span>
      <div className={cx(ld.footerLinks)}>
        <a className={cx(ld.footerLink)} href="/signup.html">Request a shop</a>
        <a className={cx(ld.footerLink)} href="/login.html">Sign in</a>
        <a className={cx(ld.footerLink)} href="#pricing">Pricing</a>
        <a
          className={cx(ld.footerLink)}
          href={DEMO.shop}
          target="_blank"
          rel="noreferrer noopener"
        >
          Live demo shop
        </a>
        <a
          className={cx(ld.footerLink)}
          href={DEMO.altShop}
          target="_blank"
          rel="noreferrer noopener"
        >
          Second demo shop
        </a>
        <a className={cx(ld.footerLink)} href="/home.html">Platform console</a>
        <a className={cx(ld.footerLink)} href="/admin.html">Platform admin</a>
      </div>
    </footer>
  );
}

export default function LandingPage(): JSX.Element {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void loadDemoFeed(ac.signal)
      .then((out) => {
        setFeed(out.feed);
        setLive(out.live);
      })
      .catch(() => {
        setLive(false);
        setFailed(true);
      });
    return () => ac.abort();
  }, []);

  return (
    <>
      <Nav />
      <main className={cx(b.reset, ld.page)}>
        <Hero feed={feed} live={live} />
        <TryonFlip />
        <LiveDemo feed={feed} live={live} />
        <Gallery />
        <Catalogue feed={feed} live={live} failed={failed} />
        <HowItWorks />
        <Features />
        <Audiences />
        <Numbers feed={feed} live={live} />
        <Pricing />
        <Faq />
        <FinalCta />
        <Footer />
      </main>
    </>
  );
}

boot();
const root = document.getElementById("root");
if (root) createRoot(root).render(<LandingPage />);
