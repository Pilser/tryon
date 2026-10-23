/* components/landing/hero.tsx - S1, the hero.

   What it must answer in the first screen: what is this, who is it
   for, and can I see it working? So the hero carries the headline,
   the one primary action (Request a shop) and the LIVE try-on frame -
   the demo shop's own product page, not a mock-up (DESIGN.md 2.4). */
import type { JSX } from "react";
import { base as b, cx, pf, ui as u } from "../../kit";
import { DEMO, type Feed } from "../../demo";
import { ld } from "../../kit";
import { HERO_VIDEO, mediaUrl } from "../../media";
import { ScaledFrame } from "./scaled-frame";

export function Hero(props: { feed: Feed | null; live: boolean }): JSX.Element {
  const first = props.feed?.items[0];
  /* The frame points at the real try-on page of a real product. When
     the live feed is not readable we still show the shop itself. */
  const frame = props.live && first
    ? `${DEMO.shop}/app/studio.html?id=${encodeURIComponent(first.id)}`
    : DEMO.app;

  return (
    <section className={cx(ld.section, ld.sectionTop)} id="top">
      <div className={cx(ld.hero)}>
        <div>
          <p className={cx(ld.eyebrow)}>Virtual try-on for garment shops</p>
          <h1 className={cx(ld.heroTitle)}>
            Let shoppers try your garments on.
            <br />
            <span className={cx(ld.heroLime)}>Keep the orders.</span>
          </h1>
          <p className={cx(ld.heroLead)}>
            Latiforge deploys a try-on storefront on your own domain, wires it to
            your catalogue, and meters every generation — so you pay for
            try-ons, not for software you do not use.
          </p>
          <div className={cx(ld.ctaRow)}>
            <a className={cx(b.btn, b.btnPrimary, u.btnGrow)} href="/signup.html">
              Request a shop
            </a>
            <a className={cx(b.btn, b.btnSecondary, u.btnGrow)} href="/login.html">
              Sign in
            </a>
            <a
              className={cx(pf.textLink)}
              href={DEMO.shop}
              target="_blank"
              rel="noreferrer noopener"
            >
              See a live shop →
            </a>
          </div>
        </div>

        <div className={cx(ld.demoFrame)}>
          {/* The video is baked with the page: it plays from our own
              origin, with a poster, muted, looping and never blocking
              the layout. */}
          {HERO_VIDEO ? (
            <div className={cx(ld.videoBox)}>
              <video
                className={cx(ld.heroVideo)}
                src={mediaUrl(HERO_VIDEO.file)}
                poster={HERO_VIDEO.poster ? mediaUrl(HERO_VIDEO.poster) : undefined}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="A shopper trying a garment on"
              />
            </div>
          ) : props.feed ? (
            <ScaledFrame src={frame} title="Live try-on from our demo shop" />
          ) : (
            <div className={cx(ld.iframeBox)}>
              <p className={cx(ld.note)}>Loading the live demo…</p>
            </div>
          )}
          <p className={cx(ld.caption)}>
            <span>
              {HERO_VIDEO
                ? "A try-on, baked into the page."
                : props.live
                  ? "A working fitting room, not a mock-up."
                  : "The demo shop's own storefront — the page your customers get."}
            </span>
            <a
              className={cx(pf.textLink)}
              href={DEMO.shop}
              target="_blank"
              rel="noreferrer noopener"
            >
              open the demo shop →
            </a>
          </p>
          <div className={cx(ld.steps)}>
            <p className={cx(ld.stepNote)}>How a try-on runs, end to end:</p>
            <div className={cx(ld.step)}>
              <span className={cx(ld.stepNum)}>1</span>
              <p className={cx(ld.stepText)}>The shopper uploads a photo.</p>
            </div>
            <div className={cx(ld.step)}>
              <span className={cx(ld.stepNum)}>2</span>
              <p className={cx(ld.stepText)}>They see the garment on themselves.</p>
            </div>
            <div className={cx(ld.step)}>
              <span className={cx(ld.stepNum)}>3</span>
              <p className={cx(ld.stepText)}>They confirm the order on WhatsApp.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
