/* build.ts - `bun run build`: esbuild + StyleX, one hashed bundle per page
   plus the one StyleX stylesheet (content-hashed after the plugin emits
   it), with the static HTML shells in src/ filled in and _headers copied
   to dist. Mirrors the tryon frontend's wiring, per-page instead of a
   single main.ts (PLATFORM.md §7.1.1). */
import esbuild from "esbuild";
import stylexPlugin from "@stylexjs/esbuild-plugin";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const PAGES = ["signup", "login", "home", "admin"];
/* StyleX source lives in tryon's frontend/ too - the plugin's rootDir must
   cover every file it extracts from, so it is the repo root. */
const repoRoot = path.resolve(here, "..", "..", "..");

const result = await esbuild.build({
  entryPoints: PAGES.map((p) => path.join(here, "src", "pages", p + ".tsx")),
  entryNames: "assets/[name]-[hash]",
  chunkNames: "assets/chunk-[hash]",
  outdir: dist,
  bundle: true,
  splitting: true,
  minify: true,
  target: "es2020",
  format: "esm",
  metafile: true,
  plugins: [
    stylexPlugin({
      dev: false,
      generatedCSSFileName: path.join(dist, "assets", "stylex.css"),
      stylexImports: ["@stylexjs/stylex"],
      unstable_moduleResolution: { type: "commonJS", rootDir: repoRoot },
    }) as never,
  ],
});

/* The plugin always writes the fixed stylex.css name; hash its content so
   the shipped name changes whenever the styles change. */
mkdirSync(path.join(dist, "assets"), { recursive: true });
const cssPath = path.join(dist, "assets", "stylex.css");
const css = readFileSync(cssPath, "utf8");
const cssHash = createHash("sha256").update(css).digest("hex").slice(0, 8);
const cssName = `stylex-${cssHash}.css`;
writeFileSync(path.join(dist, "assets", cssName), css);
rmSync(cssPath);

/* Per-page entry outputs straight from the metafile (no name guessing). */
const entryOut: Record<string, string> = {};
for (const [file, out] of Object.entries(result.metafile.outputs)) {
  if (!out.entryPoint) continue;
  const page = out.entryPoint.match(/pages[/\\](\w+)\.tsx$/)?.[1];
  if (page) entryOut[page] = "/" + path.relative(dist, path.resolve(file));
}

for (const page of PAGES) {
  const html = readFileSync(path.join(here, "src", page + ".html"), "utf8")
    .replace("<!--stylex-->", `/assets/${cssName}`)
    .replace("<!--bundle-->", entryOut[page] || `/_missing_${page}.js`);
  writeFileSync(path.join(dist, page + ".html"), html);
}
cpSync(path.join(here, "src", "_headers"), path.join(dist, "_headers"));
console.log(`built dist/: ${PAGES.join(", ")}, css ${cssName}, _headers`);
