/* components/landing/catalogue.tsx - S2, the live catalogue.

   Proof that the product works right now: the cards are the demo
   shop's own products, read from its /api/feed, with the shop's own
   prices and photos. The grid is never empty - when the feed cannot
   be read the committed snapshot is rendered and the section says so
   (DESIGN.md 2.5, 2.8). */
import type { JSX } from "react";
import { cx, pf, ui as u } from "../../kit";
import { DEMO, money, type Feed } from "../../demo";
import { ld } from "../../kit";

export function Catalogue(props: { feed: Feed | null; live: boolean; failed?: boolean }): JSX.Element {
  const items = props.feed ? props.feed.items.slice(0, 8) : [];
  const shopName = props.feed?.shop?.name || "our demo shop";
  return (
    <section className={cx(ld.section)} id="catalogue">
      <div className={cx(ld.sectionHead)}>
        <div>
          <p className={cx(ld.eyebrow)}>Live catalogue</p>
          <h2 className={cx(ld.sectionTitle)}>
            {props.feed
              ? `${items.length} garments from ${shopName}`
              : props.failed
                ? "The demo catalogue could not be loaded"
                : "Loading the demo catalogue…"}
          </h2>
          <p className={cx(ld.sectionLead)}>
            {props.live
              ? "Read live from the shop's own feed. Every card opens the real try-on — the same page your customers get."
              : props.failed
                ? "The live feed and our snapshot are both unreachable right now. The demo shop is still open in a new tab."
                : "The live feed could not be read, so this is our last snapshot of the demo shop's catalogue."}
          </p>
        </div>
        <a
          className={cx(pf.textLink)}
          href={DEMO.shop}
          target="_blank"
          rel="noreferrer noopener"
        >
          open the demo shop →
        </a>
      </div>

      <div className={cx(ld.shopGrid)}>
        {items.map((item) => (
          <article className={cx(ld.product)} key={item.id}>
            <img
              className={cx(ld.productShot)}
              src={item.image}
              alt={item.title}
              loading="lazy"
              width={480}
              height={600}
            />
            <div className={cx(ld.productBody)}>
              <h3 className={cx(ld.productTitle)}>{item.title}</h3>
              <p className={cx(ld.productPrice)}>
                {money(item.price_cents, item.currency)}
              </p>
              <p className={cx(ld.productMeta)}>
                {item.category}
                {item.sizes.length ? ` · ${item.sizes.join(" / ")}` : ""}
              </p>
              <a
                className={cx(ld.productCta)}
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Try on →
              </a>
            </div>
          </article>
        ))}
      </div>

      <p className={cx(ld.note)}>
        Every card runs the real try-on. Prices and photos come from the shop,
        not from us.{" "}
        {props.live ? null : (
          <span className={cx(ld.noteStrong)}>Live feed unavailable — showing our last snapshot.</span>
        )}
      </p>
    </section>
  );
}
