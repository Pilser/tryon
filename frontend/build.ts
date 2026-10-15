import esbuild from "esbuild";
import stylexPlugin from "@stylexjs/esbuild-plugin";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  minify: true,
  target: "es2020",
  format: "iife",
  outfile: "dist/bundle.js",
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
console.log("built dist/bundle.js + dist/stylex.css");
