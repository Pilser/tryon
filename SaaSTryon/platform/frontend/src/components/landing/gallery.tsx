/* components/landing/gallery.tsx - the baked photo grid.

   The catalogue (S2) is live: it reads the demo shop's feed. This grid
   is the other half - the photos that ship WITH the page, so the
   landing still looks like a shop even when the network is quiet. */
import type { JSX } from "react";
import { cx, ld } from "../../kit";
import { GALLERY, mediaUrl, roleLabel } from "../../media";

export function Gallery(): JSX.Element | null {
  if (GALLERY.length === 0) return null;
  return (
    <section className={cx(ld.section)} id="gallery">
      <div>
        <p className={cx(ld.eyebrow)}>The look</p>
        <h2 className={cx(ld.sectionTitle)}>
          Garments as they arrive, and as they are worn
        </h2>
        <p className={cx(ld.sectionLead)}>
          Every photograph below ships with the site - no live fetch, no
          waiting on someone else's server.
        </p>
      </div>
      <div className={cx(ld.galleryGrid)}>
        {GALLERY.map((s) => (
          <figure className={cx(ld.galleryItem)} key={s.id}>
            <img
              className={cx(ld.galleryImg)}
              src={mediaUrl(s.file)}
              alt={`${s.garment}${s.role ? " - " + roleLabel(s.role) : ""}`}
              loading="lazy"
              decoding="async"
              width={s.w ?? undefined}
              height={s.h ?? undefined}
            />
            <figcaption className={cx(ld.galleryCap)}>
              <span className={cx(ld.galleryName)}>{s.garment}</span>
              {s.role ? (
                <span className={cx(ld.galleryRole)}>{roleLabel(s.role)}</span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
