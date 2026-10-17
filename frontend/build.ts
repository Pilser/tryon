import esbuild from "esbuild";
import stylexPlugin from "@stylexjs/esbuild-plugin";
import path from "path";
import { fileURLToPath } from "url";
import { cpSync, mkdirSync } from "node:fs";

const root = path.dirname(fileURLToPath(import.meta.url));

// Vendor the Ionic PWA camera UI (fullscreen viewfinder + shutter +
// accept/cancel) so shells load it same-origin with no CDN dependency.
mkdirSync(path.join(root, "pwa"), { recursive: true });
cpSync(path.join(root, "node_modules/@ionic/pwa-elements/dist/esm"), path.join(root, "pwa"), {
  recursive: true,
});

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  splitting: true,
  minify: true,
  target: "es2020",
  format: "esm",
  outdir: "dist",
  loader: { ".ts": "ts" },
  plugins: [
    stylexPlugin({
      dev: false,
      generatedCSSFileName: path.resolve(root, "dist/stylex.css"),
      stylexImports: ["@stylexjs/stylex"],
      unstable_moduleResolution: { type: "commonJS", rootDir: root },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  ],
});
console.log("built dist/main.js + dist/stylex.css");
