/* components/capture.ts - desktop webcam capture modal. Mobile browsers
   should prefer their native camera sheet (filecam inputs); this covers
   desktop, where capture="" is ignored. Resolves null when unavailable. */
import { skin } from "../skin";

export function capturePhoto(): Promise<File | null> {
  return new Promise((resolve) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      resolve(null);
      return;
    }
    const ov = document.createElement("div");
    ov.className = "cam-ov";
    ov.innerHTML = `<video class="cam-video" playsinline autoplay muted></video>`
      + `<div class="cam-bar"><button type="button" class="cam-snap">Snap photo</button>`
      + `<button type="button" class="cam-cancel">Cancel</button></div>`;
    document.body.appendChild(ov);
    skin(ov);
    const video = ov.querySelector("video") as HTMLVideoElement;
    let stream: MediaStream | null = null;
    const done = (f: File | null): void => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      ov.remove();
      resolve(f);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        return video.play().catch(() => undefined);
      })
      .catch(() => done(null));
    (ov.querySelector(".cam-snap") as HTMLButtonElement).addEventListener("click", () => {
      try {
        const c = document.createElement("canvas");
        c.width = video.videoWidth || 1280;
        c.height = video.videoHeight || 720;
        c.getContext("2d")?.drawImage(video, 0, 0);
        c.toBlob(
          (b) => done(b ? new File([b], "camera.jpg", { type: "image/jpeg" }) : null),
          "image/jpeg",
          0.92
        );
      } catch {
        done(null);
      }
    });
    (ov.querySelector(".cam-cancel") as HTMLButtonElement).addEventListener("click", () => done(null));
  });
}
