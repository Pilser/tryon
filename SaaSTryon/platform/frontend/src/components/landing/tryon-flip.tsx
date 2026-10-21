/* components/landing/tryon-flip.tsx - the before/after try-on animation.

   The heart of the page: one garment, two states - the product as it
   arrives and the same garment worn. The divider sweeps on its own
   (so the page moves even when nobody touches it) and the reader can
   grab it and pull it themselves.

   Both images are baked files (see media.ts) - nothing is fetched from
   a third party and nothing depends on a shop being up. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cx, ld } from "../../kit";
import { PAIRS, mediaUrl, type Pair } from "../../media";

/* The sweep: 50 -> 88 -> 12 -> 50, over ten seconds, eased. */
function sweepAt(seconds: number): number {
  const ease = (x: number): number =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  if (seconds < 2) return 50;
  if (seconds < 5) return 50 + (88 - 50) * ease((seconds - 2) / 3);
  if (seconds < 8) return 88 + (12 - 88) * ease((seconds - 5) / 3);
  return 12 + (50 - 12) * ease((seconds - 8) / 2);
}

export function TryonFlip(): JSX.Element | null {
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState(50);
  const [auto, setAuto] = useState(true);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pair: Pair | undefined = PAIRS[idx];

  /* The automatic sweep - it restarts whenever the pair changes. */
  useEffect(() => {
    if (!auto || !pair) return;
    let raf = 0;
    const started = performance.now();
    const tick = (now: number): void => {
      setPos(sweepAt(((now - started) / 1000) % 10));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, pair, idx]);

  /* Dragging: the reader takes over, the sweep waits. */
  const move = useCallback((clientX: number): void => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, next)));
  }, []);

  const down = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      setAuto(false);
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e.clientX);
    },
    [move],
  );

  const drag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (e.buttons === 0 && e.type === "pointermove") return;
      move(e.clientX);
    },
    [move],
  );

  const release = useCallback((): void => {
    /* Give the reader a moment with their own position, then let the
       sweep run again from the middle. */
    window.setTimeout(() => {
      setPos(50);
      setAuto(true);
    }, 2600);
  }, []);

  if (!pair) return null;

  return (
    <section className={cx(ld.section)} id="tryon">
      <div>
        <p className={cx(ld.eyebrow)}>Before and after</p>
        <h2 className={cx(ld.sectionTitle)}>
          The same garment, on a person
        </h2>
        <p className={cx(ld.sectionLead)}>
          Pull the line yourself. Left is the product as it arrives, right
          is the try-on your customer sees.
        </p>
      </div>

      <div
        className={cx(ld.flipBox)}
        ref={boxRef}
        onPointerDown={down}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
        role="img"
        aria-label={`${pair.garment}: the product, then the try-on`}
      >
        <img
          className={cx(ld.flipImg)}
          src={mediaUrl(pair.after)}
          alt={`${pair.garment} worn`}
          loading="lazy"
          decoding="async"
        />
        <div
          className={cx(ld.flipBefore)}
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <img
            className={cx(ld.flipImg)}
            src={mediaUrl(pair.before)}
            alt={`${pair.garment}, the product`}
            loading="lazy"
            decoding="async"
          />
        </div>
        <span className={cx(ld.flipDivider)} style={{ left: `${pos}%` }} />
        <span className={cx(ld.flipTag, ld.flipTagLeft)}>The product</span>
        <span className={cx(ld.flipTag, ld.flipTagRight)}>The try-on</span>
      </div>

      {PAIRS.length > 1 ? (
        <div className={cx(ld.flipTabs)}>
          {PAIRS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={cx(ld.flipTab, i === idx && ld.flipTabOn)}
              onClick={() => {
                setIdx(i);
                setPos(50);
              }}
            >
              {p.garment}
            </button>
          ))}
        </div>
      ) : null}

      <p className={cx(ld.note)}>
        {pair.note ?? "Baked into this page - the photos ship with the site."}
      </p>
    </section>
  );
}
