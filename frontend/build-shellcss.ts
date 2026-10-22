import esbuild from "esbuild";
import stylexPlugin from "@stylexjs/esbuild-plugin";
import path from "path";
import { fileURLToPath } from "url";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Build-only second pass: compiles src/shellmap.ts on the SAME stylex
 *  pipeline, then imports it (its `mapping` carries the real hashed
 *  class names) to write dist/shell.css - the readable shell classes
 *  mirrored onto the compiled rules, so the static HTML paints styled
 *  before any JS runs (no FOUC, no "styles arrive late"). */
export async function shellcss(cssFile: string): Promise<void> {
  const tmpOut = "dist/_shellmap";
  await esbuild.build({
    entryPoints: ["src/shellmap.ts"],
    bundle: true,
    minify: false,
    target: "es2020",
    format: "esm",
    outdir: tmpOut,
    loader: { ".ts": "ts" },
    plugins: [
      stylexPlugin({
        dev: false,
        generatedCSSFileName: path.resolve(root, "dist/_shellmap.stylex.css"),
        stylexImports: ["@stylexjs/stylex"],
        unstable_moduleResolution: { type: "commonJS", rootDir: root },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    ],
  });
  try {
    const mod = (await import("./" + path.join(tmpOut, "shellmap.js"))) as {
      mapping: Array<{ sel: string; classes: string[] }>;
    };
    const css = await Bun.file(cssFile).text();
    if (process.env.SHELLMAP_DEBUG) {
      console.log("mapping sample:", JSON.stringify(mod.mapping.slice(0, 3)));
      console.log("css has .x1ghz6dp rule:", css.includes(".x1ghz6dp"));
    }
    await Bun.write(path.join(root, "dist", "shell.css"), mirror(css, mod.mapping));
  } finally {
    rmSync(path.join(root, tmpOut), { recursive: true, force: true });
    rmSync(path.join(root, "dist/_shellmap.stylex.css"), { force: true });
  }
}

/** Boolean-css-walker: copies every compiled stylex rule whose selector is
 *  a lone readable class selector (`.hash` / `.hash:not(#\#)`) into a
 *  readable-selector copy, appended in place (same cascade order). Media
 *  wrapping is preserved; pseudo rules (.hash:hover) are skipped - skin()
 *  covers them at boot via the hashed classes it adds. */
export function mirror(
  css: string,
  mapping: Array<{ sel: string; classes: string[] }>,
): string {
  const want = new Map<string, string[]>();
  for (const { sel, classes } of mapping) {
    if (/\s/.test(sel) || sel.includes(":")) continue; // plain class selectors only
    for (const c of classes) {
      const arr = want.get(c) ?? [];
      if (!arr.includes(sel)) arr.push(sel);
      want.set(c, arr);
    }
  }
  let i = 0;
  const out: string[] = [];
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      out.push(css.slice(i, end < 0 ? css.length : end + 2));
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    if (ch === "@") {
      // at-rule: keep everything up to its matching close (or ;)
      let j = i;
      let depth = 0;
      while (j < css.length) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        } else if (css[j] === ";" && depth === 0) {
          j++;
          break;
        }
        j++;
      }
      const block = css.slice(i, j);
      if (/^@(media|supports)\s/i.test(block)) {
        const head = block.slice(0, block.indexOf("{") + 1);
        const inner = block.slice(head.length, block.lastIndexOf("}"));
        out.push(head + mirror(inner, mapping) + "}");
      } else {
        out.push(block);
      }
      i = j;
      continue;
    }
    if (ch === ".") {
      // one rule to the next } at depth 0
      let j = i;
      while (j < css.length && css[j] !== "}") j++;
      j++;
      const rule = css.slice(i, j);
      out.push(rule + readableCopy(rule, want));
      i = j;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** The mirror copy for one compiled rule: matches selectors made purely of
 *  hashed class tokens (`.hash`, `.hash.hash`, plus `:not(#\#)` boosts).
 *  Each hashed token that appears in the map yields a readable-selector
 *  copy with the exact same body, so cascade order per rule is preserved. */
function readableCopy(
  rule: string,
  want: Map<string, string[]>,
): string {
  const m = /([^{]+)\{(.*)\}\s*$/s.exec(rule.trim());
  if (!m) return "";
  const selPart = m[1].trim();
  // pure class tokens + :not boosts only (pseudo rules stay on skin()/hash)
  if (!/^(\.[A-Za-z0-9_-]+)((?:\.+[A-Za-z0-9_-]+)*)(:not\(#[^()]*\))*$/.test(selPart)) return "";
  const hashes = [...selPart.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((x) => x[1]);
  const sels: string[] = [];
  for (const h of hashes) {
    for (const s of want.get(h) ?? []) if (!sels.includes(s)) sels.push(s);
  }
  if (!sels.length) return "";
  return `${sels.map((s) => s + ":not(#\\#)").join(",")}{${m[2]}}`;
}
