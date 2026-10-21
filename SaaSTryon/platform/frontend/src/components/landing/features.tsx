/* components/landing/features.tsx - S4, what you get.

   Four capabilities, each with a real screenshot of the running
   product (never an illustration) and one wide card that says the
   thing that matters to a shop owner: the customers are theirs
   (DESIGN.md 2.5). */
import type { JSX } from "react";
import { cx, pf } from "../../kit";
import { DEMO } from "../../demo";
import { ld } from "../../kit";

type Feature = {
  title: string;
  body: string;
  shot: string;
  alt: string;
  link?: { label: string; href: string };
};

const FEATURES: Feature[] = [
  {
    title: "Try-on built in",
    body: "The shopper uploads a photo, sees the garment on themselves, then orders on WhatsApp. No app to install, no size guessing.",
    shot: "/assets/shots/tryon-product.webp",
    alt: "A shop product page: the garment on the left, the shopper's photo on the right, sizes and the try-on button below.",
    link: { label: "try it yourself →", href: DEMO.app },
  },
  {
    title: "Your domain, your catalogue",
    body: "Your photos, your prices, your sizes. The storefront answers at your own domain, or at {sub}.latiforge.com until you attach one.",
    shot: "/assets/shots/studio.webp",
    alt: "The shop studio: a category ribbon of the garments, the product with its sizes, and the try-on panel.",
    link: { label: "open the studio →", href: DEMO.studio },
  },
  {
    title: "Pay per try-on",
    body: "One generation, one credit. We meter every try-on and show you granted, used and left — so a quiet month costs a quiet month.",
    shot: "/assets/shots/credits-ledger.webp",
    alt: "The owner's shop panel: try-on credits left, credits granted, credits used and platform codes redeemed.",
    link: { label: "see the ledger →", href: "/home.html?tab=credits" },
  },
  {
    title: "Published by you",
    body: "Upload your own built site and we publish it at the root of your shop. The try-on studio keeps working at /app.",
    shot: "/assets/shots/landing-publisher.webp",
    alt: "The landing publisher in the platform console: a folder picker and a separate Publish landing page button.",
    link: { label: "publish a landing page →", href: "/home.html?tab=landing" },
  },
];

export function Features(): JSX.Element {
  return (
    <section className={cx(ld.section)} id="features">
      <div>
        <p className={cx(ld.eyebrow)}>What you get</p>
        <h2 className={cx(ld.sectionTitle)}>Four things, done for you</h2>
        <p className={cx(ld.sectionLead)}>
          Every screenshot below is the running product, taken from a live shop.
        </p>
      </div>
      <div className={cx(ld.grid2)}>
        {FEATURES.map((f) => (
          <article className={cx(ld.card, ld.shotCard)} key={f.title}>
            <img className={cx(ld.shot)} src={f.shot} alt={f.alt} loading="lazy" />
            <div className={cx(ld.shotBody)}>
              <h3 className={cx(ld.cardTitle)}>{f.title}</h3>
              <p className={cx(ld.cardBody)}>{f.body}</p>
              {f.link ? (
                <a
                  className={cx(pf.textLink)}
                  href={f.link.href}
                  target={f.link.href.startsWith("http") ? "_blank" : undefined}
                  rel={f.link.href.startsWith("http") ? "noreferrer noopener" : undefined}
                >
                  {f.link.label}
                </a>
              ) : null}
            </div>
          </article>
        ))}
        <article className={cx(ld.wideCard)}>
          <h3 className={cx(ld.cardTitle)}>Your customers, not ours</h3>
          <p className={cx(ld.cardBody)}>
            We never sell your catalogue and never take your shoppers. Your shop
            is your own address, your own product feed and your own orders —
            we run the storefront and the metering, nothing else.
          </p>
        </article>
      </div>
    </section>
  );
}
