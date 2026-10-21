/* components/shared/copy-code.tsx - a code with its copy button. The
   codes are shown once (a minted platform code) and a URL is worth a
   click, so both get a copy button. */
import { useState, type JSX } from "react";
import { base as b, cx, pf } from "../../kit";

export function CopyCode(props: { code: string; label?: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <span className={cx(pf.codeBox)}>
      <span className={cx(pf.code)}>{props.code}</span>
      <button
        className={cx(b.btn, b.btnSecondary)}
        type="button"
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(props.code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              window.prompt("Copy it by hand:", props.code);
            }
          })();
        }}
      >
        {copied ? "Copied" : props.label || "Copy"}
      </button>
    </span>
  );
}
