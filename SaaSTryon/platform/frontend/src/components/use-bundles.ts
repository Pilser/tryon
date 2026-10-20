/* components/use-bundles.ts - the bundle versions that live in the R2
   BUNDLES bucket. Two panels need them (the admin's bundle list and the
   redeploy picker of a shop), so the read lives in one hook instead of
   being written twice. */
import { useCallback, useEffect, useState } from "react";
import { adminBundles } from "../api-admin";

export interface Bundles {
  /** The version labels, newest last (the server sorts them). */
  bundles: string[];
  /** Set when the list could not be read. */
  error: string;
  /** Read the list again (after an upload). */
  reload: () => void;
}

export function useBundles(adminToken: string): Bundles {
  const [bundles, setBundles] = useState<string[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback((): void => {
    void (async () => {
      try {
        const out = await adminBundles(adminToken);
        setBundles(out.bundles);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the bundles.");
      }
    })();
  }, [adminToken]);

  useEffect(() => reload(), [reload]);

  return { bundles, error, reload };
}
