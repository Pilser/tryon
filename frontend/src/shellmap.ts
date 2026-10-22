/* shellmap.ts - BUILD-ONLY entry (see build.ts second pass): resolves the
   skin map to real hashed class names on the same compiled pipeline the
   bundle uses, so the build can mirror those rules into dist/shell.css
   under the readable shell selectors. Never imported by the app. */
import * as stylex from "@stylexjs/stylex";
import { MAP } from "./skin";

export interface Mapping {
  sel: string;
  classes: string[];
}

export const mapping: Mapping[] = MAP.map(([sel, styles]) => {
  const joined = styles
    .map((s) => (stylex.props(s) as { className?: string }).className ?? "")
    .join(" ");
  return { sel: String(sel), classes: joined.split(/\s+/).filter(Boolean) };
});
