/* components/shared/primary-action.ts - the ONE primary action of the
   current tab (P1). The tab registers it, the page header renders it:
   the button therefore always knows the state of the thing it drives
   (disabled, busy) without the page knowing the tab's internals. */
import { useEffect, useRef } from "react";

export interface PrimaryAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  busy?: boolean;
  /* A tab whose panel is open hands the lime button back to the panel
     and keeps a secondary button in the header. */
  tone?: "primary" | "secondary";
}

/**
 * Report the tab's primary action to the page header. The action object
 * must be memoized by the caller - the effect only fires when it really
 * changed, so the header never re-renders in a loop.
 */
export function usePrimary(
  onPrimary: (action: PrimaryAction | null) => void,
  action: PrimaryAction | null,
): void {
  const last = useRef<PrimaryAction | null>(null);
  useEffect(() => {
    if (last.current === action) return;
    last.current = action;
    onPrimary(action);
    return () => {
      last.current = null;
      onPrimary(null);
    };
  }, [action, onPrimary]);
}
