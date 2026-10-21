/* components/shared/url-state.ts - the console state lives in the URL
   (P6): the tab, the selected shop, the search text and the filters
   are all query parameters, so a filtered view is a link. No routing
   library - URLSearchParams and history.replaceState are enough. */
import { useCallback, useEffect, useState } from "react";

const readParam = (name: string, fallback: string): string => {
  try {
    const v = new URLSearchParams(window.location.search).get(name);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
};

/** One query parameter: its value and the setter that keeps the URL. */
export function useUrlParam(
  name: string,
  fallback: string,
): [string, (value: string) => void] {
  const [value, setValue] = useState<string>(() => readParam(name, fallback));

  const set = useCallback(
    (next: string) => {
      setValue(next);
      try {
        const url = new URL(window.location.href);
        if (next && next !== fallback) url.searchParams.set(name, next);
        else url.searchParams.delete(name);
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* no history: the state still lives in the page */
      }
    },
    [name, fallback],
  );

  /* The back button moves between the states the owner visited. */
  useEffect(() => {
    const onPop = (): void => setValue(readParam(name, fallback));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [name, fallback]);

  return [value, set];
}
