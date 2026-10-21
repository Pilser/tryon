/* components/shared/drop-zone.tsx - the folder picker of the landing
   flow. Three ways in: the folder input (webkitdirectory), the file
   system picker (showDirectoryPicker, where the browser has it) and a
   drag of a folder (read with webkitGetAsEntry and walked
   recursively). Every way keeps the path of the file inside the dist. */
import { useEffect, useRef, useState, type JSX } from "react";
import { base as b, cx, pf, ui as u } from "../../kit";
import { relativePath, type PickedFile } from "./landing-files";

/* The file system picker is not in every browser (and not in the type
   library of every TypeScript) - it is used when it is there. */
interface FsHandle {
  kind: string;
  name: string;
  values: () => AsyncIterable<FsHandle>;
  getFile: () => Promise<File>;
}

type Picker = () => Promise<FsHandle>;

const picker = (): Picker | null => {
  const w = window as unknown as { showDirectoryPicker?: Picker };
  return typeof w.showDirectoryPicker === "function" ? w.showDirectoryPicker : null;
};

/** One directory of a dropped folder. */
const readDir = async (entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
  const reader = entry.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej),
    );
    if (batch.length === 0) break;
    out.push(...batch);
  }
  return out;
};

/** Walk a dropped entry and collect the files with their paths. */
const walk = async (
  entry: FileSystemEntry,
  prefix: string,
  out: PickedFile[],
): Promise<void> => {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    );
    out.push({ path: relativePath(prefix + entry.name), size: file.size, file });
    return;
  }
  const dir = entry as FileSystemDirectoryEntry;
  for (const child of await readDir(dir)) {
    await walk(child, `${prefix}${entry.name}/`, out);
  }
};

export function DropZone(props: {
  onFiles: (files: PickedFile[]) => void;
  disabled?: boolean;
  hint?: string;
  /** The headline of the drop target (the owner's landing folder and
      the admin's bundle folder say different things). */
  label?: string;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  /* The folder input: the attribute is not in the React types. */
  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "");
    inputRef.current?.setAttribute("directory", "");
  }, []);

  const take = (list: FileList | null): void => {
    if (!list || list.length === 0) return;
    const files: PickedFile[] = [];
    for (const file of Array.from(list)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const path = relativePath(rel && rel.length > 0 ? rel : file.name);
      files.push({ path, size: file.size, file });
    }
    props.onFiles(files);
  };

  const takeHandle = async (handle: FsHandle, prefix: string): Promise<void> => {
    const files: PickedFile[] = [];
    for await (const child of handle.values()) {
      if (child.kind === "file") {
        const file = await child.getFile();
        files.push({
          path: relativePath(`${prefix}${child.name}`),
          size: file.size,
          file,
        });
      } else {
        await takeHandle(child, `${prefix}${child.name}/`);
      }
    }
    if (files.length > 0) props.onFiles(files);
  };

  const choose = async (): Promise<void> => {
    const open = picker();
    if (!open) {
      inputRef.current?.click();
      return;
    }
    try {
      const dir = await open();
      await takeHandle(dir, "");
    } catch {
      /* the owner closed the picker - nothing was chosen */
    }
  };

  return (
    <div
      className={cx(pf.dropzone, over && pf.dropzoneOn)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const items = e.dataTransfer?.items;
        if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
          const entries: FileSystemEntry[] = [];
          for (const item of Array.from(items)) {
            const entry = item.webkitGetAsEntry();
            if (entry) entries.push(entry);
          }
          void (async () => {
            const files: PickedFile[] = [];
            for (const entry of entries) await walk(entry, "", files);
            if (files.length > 0) props.onFiles(files);
          })();
          return;
        }
        take(e.dataTransfer?.files || null);
      }}
    >
      <p className={cx(u.rowTitle)}>
        {props.label || "Drop your built site folder here — or choose a folder"}
      </p>
      <p className={cx(u.rowSub)}>
        {props.hint ||
          "The folder keeps its paths: index.html at the root, assets/ and styles/ with it."}
      </p>
      <div className={cx(u.btnRow)}>
        <button
          className={cx(b.btn, b.btnSecondary)}
          type="button"
          disabled={props.disabled}
          onClick={() => void choose()}
        >
          Choose a folder
        </button>
      </div>
      {/* The folder input is the fallback path of the button above - it
          stays in the DOM, but it is not part of the picture. */}
      <input
        ref={inputRef}
        className={cx(pf.field)}
        type="file"
        multiple
        aria-label="landing folder"
        style={{ display: "none" }}
        disabled={props.disabled}
        onChange={(e) => take(e.currentTarget.files)}
      />
    </div>
  );
}
