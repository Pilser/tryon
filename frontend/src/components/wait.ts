/* components/wait.ts - feedback for the two slow paths of this app.

  genWait(prog, photo):  the TRY-ON wait. A spinner ring + a real seconds
  counter lives on top of the user photo; past 10s the line relaxes to
  "took longer than usual - please wait" and keeps ticking, so the user
  never wonders whether anything is happening.

  busyBtn(btn, label):   the OWNER SAVE wait. The pressed button becomes
  disabled, shows a spinner + "Saving..." until the request answers - a
  click is visibly registered, and double submits are impossible. */

import * as stylex from "@stylexjs/stylex";
import { wait } from "../styles/ui.stylex";

export interface GenWait {
  /** Changes the leading label without losing the seconds ("Uploading photo"...). */
  phase(label: string): void;
  /** Stops the timer, removes the pulse, clears the line. */
  stop(): void;
}

/** The seconds after which the message admits the wait. */
const SLOW_AT = 10;

const cls = (st: unknown): string =>
  (stylex.props(st as never) as { className?: string }).className ?? "";

export function genWait(prog: HTMLElement, photo?: HTMLElement | null): GenWait {
  let elapsed = 0;
  let slow = false;
  let label = "Generating";

  prog.innerHTML = "";
  prog.classList.add(cls(wait.waitLine));
  const ring = document.createElement("span");
  ring.className = cls(wait.spinner);
  prog.appendChild(ring);
  const line = document.createElement("span");
  prog.appendChild(line);
  if (photo) photo.classList.add(cls(wait.photoPulse));

  const drop = (): string =>
    slow ? ` - please wait (${elapsed}s)` : ` (${elapsed}s)`;

  const paint = (): void => {
    line.textContent =
      slow ? `${label} took longer than usual${drop()}` : `${label}${drop()}`;
    prog.classList.toggle(cls(wait.waitSlow), slow);
  };

  const timer = window.setInterval(() => {
    elapsed += 1;
    if (!slow && elapsed >= SLOW_AT) slow = true;
    paint();
  }, 1000);
  paint();

  return {
    phase(next: string): void {
      label = next;
      paint();
    },
    stop(): void {
      window.clearInterval(timer);
      if (photo) photo.classList.remove(cls(wait.photoPulse));
      prog.classList.remove(cls(wait.waitLine), cls(wait.waitSlow));
      prog.innerHTML = "";
    },
  };
}

/** The pressed button waits: disabled + spinner + label, restored on resolve. */
export function busyBtn(btn: HTMLButtonElement | null, label: string): () => void {
  if (!btn || btn.disabled) return () => undefined;
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="${cls(wait.spinner)}"></span>${label}`;
  return (): void => {
    btn.disabled = false;
    btn.innerHTML = orig;
  };
}
