/* components/shared/landing-files.ts - the rules of a landing file, the
   same ones the platform enforces (platform/src/landing.rs): the path
   may only hold [A-Za-z0-9.-_/], it is at most 200 characters, it has
   no "..", no "//" and one file is at most 5 MB. A file that breaks a
   rule is rejected BEFORE a byte is uploaded - the preflight is the
   point of the whole flow. */

/** One file of the picked folder, with its place in the dist. */
export interface PickedFile {
  path: string;
  size: number;
  file: File;
}

export const MAX_PATH = 200;
export const MAX_BYTES = 5 * 1024 * 1024;

/** The path inside the dist: the picked folder is the root, not a file. */
export const relativePath = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join("/") : parts[0] || "";
};

/** Why this file may not be uploaded - null when it may. */
export const rejectReason = (path: string, size: number): string | null => {
  if (path.length > MAX_PATH) return `path too long (>${MAX_PATH})`;
  if (path.includes("..")) return '".." not allowed';
  if (path.includes("//")) return '"//" not allowed';
  if (!/^[A-Za-z0-9.\-_/]+$/.test(path)) return "unsupported character";
  if (size > MAX_BYTES) return "larger than 5 MB";
  return null;
};

/** The tree of the picked folder (monospace, indented). */
export const fileTree = (paths: string[]): string => {
  const lines: string[] = [];
  const walk = (prefix: string, rest: string[]): void => {
    const dirs = new Map<string, string[]>();
    const files: string[] = [];
    for (const p of rest) {
      const at = p.indexOf("/");
      if (at < 0) files.push(p);
      else {
        const dir = p.slice(0, at);
        const tail = p.slice(at + 1);
        const list = dirs.get(dir) || [];
        list.push(tail);
        dirs.set(dir, list);
      }
    }
    for (const [dir, list] of [...dirs.entries()].sort()) {
      lines.push(`${prefix}${dir}/`);
      walk(`${prefix}  `, list);
    }
    for (const f of files.sort()) lines.push(`${prefix}${f}`);
  };
  walk("", paths);
  return lines.join("\n");
};
