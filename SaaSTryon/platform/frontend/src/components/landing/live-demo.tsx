/* components/landing/live-demo.tsx - the live proof.

   The video and the photos on this page are baked. This section is the
   opposite: the REAL try-on page of a REAL deployed shop, in a frame.
   It is the answer to "is this a mock-up?" - the demo shop is a tenant
   like any other, running the same bundle. */
import type { JSX } from "react";
import { cx, pf, ld } from "../../kit";
import { DEMO, type Feed } from "../../demo";
import { ScaledFrame } from "./scaled-frame";

export function LiveDemo(props: { feed: Feed | null; live: boolean }): JSX.Element {
  const first = props.feed?.items[0];
  const frame =
    props.live && first
      ? `${DEMO.shop}/app/studio.html?id=${encodeURIComponent(first.id)}`
      : DEMO.app;
  return (
    <section className={cx(ld.section)} id="live">
      <div className={cx(ld.demoRow)}>
        <div className={cx(ld.demoFrame)}>
          <ScaledFrame src={frame} title="Live try-on from our demo shop" />
          <p className={cx(ld.caption)}>
            <span>
              {props.live
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
        </div>
        <div>
          <p className={cx(ld.eyebrow)}>Live</p>
          <h2 className={cx(ld.sectionTitle)}>
            It is not a video. It is the shop.
          </h2>
          <p className={cx(ld.sectionLead)}>
            The frame above is a real tenant on latiforge.com, running the
            same bundle your shop would run. The shopper uploads a photo,
            the garment is fitted onto them, and the order comes back to
            the shop on WhatsApp.
          </p>
          <p className={cx(ld.note)}>
            Two demo shops are live today:{" "}
            <a
              className={cx(pf.textLink)}
              href={DEMO.shop}
              target="_blank"
              rel="noreferrer noopener"
            >
              {DEMO.shop.replace("https://", "")}
            </a>{" "}
            and{" "}
            <a
              className={cx(pf.textLink)}
              href={DEMO.altShop}
              target="_blank"
              rel="noreferrer noopener"
            >
              {DEMO.altShop.replace("https://", "")}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
