/* components/landing/pricing.tsx - S7, the pricing.

   The packaging the platform grants (DESIGN.md 2.6). The honest part
   is load-bearing: billing today is manual - a merchant asks for
   credits and the platform approves them - so there is no card form
   and no "start free trial" button here, only "Request a shop". */
import type { JSX } from "react";
import { base as b, cx, pf, ui as u } from "../../kit";
import { ld } from "../../kit";

type Line = { label: string; free: string; studio: string; growth: string };

const LINES: Line[] = [
  { label: "Platform fee", free: "$0", studio: "$19 / month", growth: "$49 / month" },
  { label: "Shops (deploy allowance)", free: "1", studio: "3", growth: "10" },
  {
    label: "Try-ons included / month",
    free: "10 (the current grant)",
    studio: "100",
    growth: "500",
  },
  { label: "Extra try-on", free: "—", studio: "$0.15", growth: "$0.10" },
  { label: "Your own domain", free: "—", studio: "yes", growth: "yes" },
  { label: "Publish your own landing page", free: "—", studio: "yes", growth: "yes" },
  { label: "Studio analytics + lead capture", free: "—", studio: "—", growth: "yes" },
  { label: "Support", free: "community", studio: "email", growth: "priority" },
];

const TIERS = [
  { name: "Free", price: "$0", note: "One shop, to see it work.", on: false },
  { name: "Studio", price: "$19 / month", note: "For a shop with a real catalogue.", on: true },
  { name: "Growth", price: "$49 / month", note: "For several collections at once.", on: false },
];

export function Pricing(): JSX.Element {
  return (
    <section className={cx(ld.section)} id="pricing">
      <div>
        <p className={cx(ld.eyebrow)}>Pricing — one try-on = one credit</p>
        <h2 className={cx(ld.sectionTitle)}>Pay for the try-ons, not the software</h2>
        <p className={cx(ld.sectionLead)}>
          Three tiers. The middle one is the one most shops start on.
        </p>
      </div>

      <div className={cx(ld.grid3)}>
        {TIERS.map((tier) => (
          <article className={cx(ld.tier, tier.on ? ld.tierOn : null)} key={tier.name}>
            <div className={cx(ld.tierHead)}>
              <h3 className={cx(ld.tierName)}>{tier.name}</h3>
              {tier.on ? (
                <span className={cx(pf.chip, pf.chipGood)}>recommended</span>
              ) : null}
            </div>
            <p className={cx(ld.tierPrice)}>{tier.price}</p>
            <p className={cx(ld.cardBody)}>{tier.note}</p>
            <ul className={cx(ld.tierList)}>
              {LINES.map((line) => {
                const value = tier.name === "Free" ? line.free : tier.name === "Studio" ? line.studio : line.growth;
                const yes = value === "yes";
                const no = value === "—";
                return (
                  <li className={cx(ld.tierItem)} key={line.label}>
                    <span className={cx(yes ? ld.tierYes : ld.tierNo)} aria-hidden="true">
                      {yes ? "✓" : no ? "—" : "·"}
                    </span>
                    <span>
                      <span className={cx(ld.noteStrong)}>{line.label}:</span> {value}
                    </span>
                  </li>
                );
              })}
            </ul>
            <a
              className={cx(b.btn, tier.on ? b.btnPrimary : b.btnSecondary, u.btnGrow)}
              href="/signup.html"
            >
              Request a shop
            </a>
          </article>
        ))}
      </div>

      <p className={cx(ld.note)}>
        Credits never expire. One credit is one generation — hosting, the studio
        and your landing page are included in the platform fee. Extra try-ons are
        charged per generation, never per product or per visitor.
      </p>
      <p className={cx(ld.note)}>
        <span className={cx(ld.noteStrong)}>How billing works today:</span>{" "}
        credits are granted by us, not billed by card. You ask for what you need
        from your console, the platform admin approves it, and the try-ons land
        on your shop. There is no automatic subscription on this page — and the
        Free tier's 10 try-ons are the current grant, not an unlimited trial.
      </p>
    </section>
  );
}
