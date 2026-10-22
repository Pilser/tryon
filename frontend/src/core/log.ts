/* core/log.ts - one place for well-formed error logs. Every catch in the
   app logs through logErr so a console shows WHAT failed, WHERE and WHEN -
   and the global handlers sweep whatever nobody caught. */

export function logErr(tag: string, e: unknown): void {
  const msg = e instanceof Error ? (e.stack || e.message) : String(e);
  // One line per event, greppable: [tryon] tag - page - message
  console.error(`[tryon] ${tag} @ ${location.pathname} - ${msg}`);
}

/** Called once from main.ts: sweeps uncaught sync errors + rejections. */
export function installErrorLog(): void {
  window.addEventListener("error", (ev) => {
    logErr("window.error", ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    logErr("unhandled promise", ev.reason instanceof Error ? ev.reason.message : ev.reason);
  });
}
