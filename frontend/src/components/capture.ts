/* components/capture.ts - fullscreen camera via the vendored Ionic PWA
   camera modal (viewfinder + flash + camera switch + shutter +
   accept/cancel + gallery fallback, Shadow DOM so it never clashes
   with shop styles). Resolves a File, or null when unavailable or
   cancelled (caller falls back to the native file sheet). */

interface PwaCameraModal extends HTMLElement {
  facingMode: string;
  present(): Promise<void>;
  dismiss(): Promise<void>;
}

/* Only one camera UI at a time; anything left in the DOM is torn out so
   it can never sit invisibly over the page swallowing taps. */
function forceClose(): void {
  try {
    document
      .querySelectorAll("pwa-camera-modal,pwa-camera-modal-instance")
      .forEach((n) => n.remove());
  } catch {
    /* DOM already gone */
  }
}

function modal(): PwaCameraModal | null {
  try {
    const m = document.createElement("pwa-camera-modal") as PwaCameraModal;
    if (typeof m.present !== "function") return null;
    return m;
  } catch {
    return null;
  }
}

export function capturePhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    forceClose();
    const m = modal();
    if (!m) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (f: File | null): void => {
      if (settled) return;
      settled = true;
      try {
        void m.dismiss().catch(() => undefined);
      } catch {
        /* fall through to DOM removal */
      }
      forceClose();
      resolve(f);
    };
    m.addEventListener("onPhoto", (ev) => {
      const detail = (ev as CustomEvent).detail as Blob | File | string | null;
      if (!detail || (detail instanceof Blob && detail.size === 0)) {
        done(null);
        return;
      }
      if (typeof detail === "string") {
        // Older builds emit a data URL; convert it back to bytes.
        void fetch(detail)
          .then((r) => r.blob())
          .then((b) => done(new File([b], "camera.jpg", { type: "image/jpeg" })))
          .catch(() => done(null));
        return;
      }
      done(
        new File([detail], "camera.jpg", {
          type: detail.type.startsWith("image/") ? detail.type : "image/jpeg",
        })
      );
    });
    m.facingMode = "environment";
    document.body.appendChild(m);
    void m.present().catch(() => done(null));
    // Upgrade watchdog: if the inner camera never boots (missing chunk,
    // blocked stream), fall back instead of hanging with a dead overlay.
    void (async () => {
      const start = Date.now();
      while (!customElements.get("pwa-camera-modal-instance")) {
        if (settled || Date.now() - start > 5000) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!settled && !customElements.get("pwa-camera-modal-instance")) done(null);
    })();
    // Safety net: never leave the modal hanging without a result.
    window.setTimeout(() => {
      if (!settled && !document.body.contains(m)) done(null);
    }, 5000);
  });
}
