/* components/landing/faq.tsx - S8, the remaining objections.

   Six questions, six paragraph answers. The answers say what the
   platform actually does today - manual credit approval included -
   because a landing page that over-promises costs the shop a
   conversation later (DESIGN.md P7, P8). */
import type { JSX } from "react";
import { cx } from "../../kit";
import { ld } from "../../kit";

const QA: Array<{ q: string; a: string }> = [
  {
    q: "Do I need to write code?",
    a: "No. You send the photos, prices and sizes of the garments you want to sell; we deploy the storefront and wire the try-on to your catalogue. If you already have a site, you can publish that yourself instead.",
  },
  {
    q: "Whose domain is it?",
    a: "Yours. We attach your own domain with a CNAME record, and until you do, your shop answers at {sub}.latiforge.com. The studio, the product feed and your credits move with you - only the address changes.",
  },
  {
    q: "What happens to my photos?",
    a: "They live in your own shop's storage and are served from your own address. We do not put them in our catalogue, we do not show them to another shop, and removing your shop removes them with it.",
  },
  {
    q: "How do I get more try-ons?",
    a: "Credits are metered - one generation spends one credit, and your console shows granted, used and left. Credits never expire. When you run low you request more from the console and the platform admin approves it; there is no card form and nothing charges itself.",
  },
  {
    q: "Can I bring my own landing page?",
    a: "Yes. Upload your built folder in the console, check the preflight, and publish: your site is served at the root of the shop and the try-on studio keeps working at /app. The product feed stays at /api/feed for any page that wants it.",
  },
  {
    q: "How long until my shop is live?",
    a: "You request a shop, we approve it - normally within a working day - and you add your catalogue. A shop can be live the same day: the storefront, the feed and the try-on are ready as soon as the first garment is in.",
  },
];

export function Faq(): JSX.Element {
  return (
    <section className={cx(ld.section)} id="faq">
      <div>
        <p className={cx(ld.eyebrow)}>Questions</p>
        <h2 className={cx(ld.sectionTitle)}>The things people ask first</h2>
      </div>
      <div className={cx(ld.faq)}>
        {QA.map((item) => (
          <div className={cx(ld.faqItem)} key={item.q}>
            <h3 className={cx(ld.faqQ)}>{item.q}</h3>
            <p className={cx(ld.faqA)}>{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
