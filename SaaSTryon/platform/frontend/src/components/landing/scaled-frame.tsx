/* components/landing/scaled-frame.tsx - the live demo frame.

   The shop's own UI is a desktop layout (a wide two-column try-on
   page). Dropped into a 500px box it would be cropped, so the frame
   renders the real page at 1000px and scales it down to the width it
   actually has. What the visitor sees is the shop's real screen, just
   smaller - never a mock-up. */
import { useEffect, useRef, useState, type JSX } from "react";
import { cx } from "../../kit";
import { ld } from "../../styles/landing.stylex";

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 625;

export function ScaledFrame(props: { src: string; title: string }): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (): void => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / DESIGN_WIDTH);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={cx(ld.iframeBox)} ref={box}>
      <div
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <iframe
          className={cx(ld.iframe)}
          src={props.src}
          title={props.title}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
