/* core/log.ts - one place for well-formed error logs. Every catch in the
   app logs through logErr so a console shows WHAT failed, WHERE and WHEN -
   and the global handlers sweep whatever nobody caught.

   Order matters: the human-readable message goes FIRST (that is the line
   an operator reads), then the stack on its own line for debugging. The
   old order (`stack || message`) printed only frames, which hid the
   reason behind minified function names. */

export function logErr(tag: string, e: unknown): void {
  if (e instanceof Error) {
    console.error(`[tryon] ${tag} @ ${location.pathname} - ${e.message || e.name}`);
    if (e.stack) console.error(e.stack);
    return;
  }
  console.error(`[tryon] ${tag} @ ${location.pathname} - ${String(e)}`);
}

/** Called once from main.ts: sweeps uncaught sync errors + rejections. */
export function installErrorLog(): void {
  window.addEventListener("error", (ev) => {
    logErr("window.error", ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    logErr("unhandled promise", ev.reason);
  });
}
