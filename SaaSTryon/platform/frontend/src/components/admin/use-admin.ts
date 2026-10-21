/* components/admin/use-admin.ts - the state of the admin console: the
   reads (the people, the codes, the credit queue, the tenants, the
   audit feed, the versions) and the writes that the shell owns.

   The tabs that write on their own (the shop panel, the bundle
   upload, the assignment table) call the API themselves and then ask
   for a reload - so every change ends in the same place: the whole
   console is read again. */
import { useCallback, useState } from "react";
import {
  ApiError,
  adminActivity,
  adminAllowance,
  adminApprove,
  adminCancelToken,
  adminCreditApprove,
  adminCreditReject,
  adminCreditRequests,
  adminReject,
  adminShops,
  adminSuspend,
  adminReactivate,
  adminTokens,
  adminUsers,
  type PlatformUser,
} from "../../api";
import { adminBundles, adminDeleteToken } from "../../api-admin";
import type { AdminActions, AdminData } from "./admin-console";

const EMPTY: AdminData = {
  users: [],
  tokens: [],
  credits: [],
  shops: [],
  activity: [],
  bundles: [],
};

export interface AdminState {
  data: AdminData | null;
  busy: boolean;
  error: string;
  note: string;
  /** The sign-in token minted by an approve, shown once. */
  issued: Record<string, string>;
  /** The allowance the operator is typing but has not saved yet. */
  allowance: Record<string, string>;
  actions: AdminActions;
  /** Read the console again (the token is already known - or hand it
      over when it was just pasted). */
  reload: (token?: string) => void;
  /** Forget the token and everything it read. */
  lock: () => void;
}

export function useAdmin(token: string | null): AdminState {
  const [data, setData] = useState<AdminData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [allowance, setAllowance] = useState<Record<string, string>>({});

  /* One read fills the console. */
  const collect = useCallback((tok: string): void => {
    setBusy(true);
    void (async () => {
      try {
        const [u, t, c, s, a, v] = await Promise.all([
          adminUsers(tok),
          adminTokens(tok),
          adminCreditRequests(tok),
          adminShops(tok),
          adminActivity(tok),
          adminBundles(tok),
        ]);
        setData({
          users: u.users,
          tokens: t.tokens,
          credits: c.requests,
          shops: s.shops,
          activity: a.activity,
          bundles: v.bundles,
        });
        setError("");
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "Could not load the platform - offline?",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  /* Any write from the shell: run it, then read the world again. */
  const run = useCallback(
    (fn: () => Promise<unknown>, after?: () => void): void => {
      if (!token) return;
      setError("");
      setBusy(true);
      void (async () => {
        try {
          await fn();
          collect(token);
          after?.();
        } catch (e) {
          setError(
            e instanceof ApiError ? e.message : "That did not go through - offline?",
          );
          setBusy(false);
        }
      })();
    },
    [token, collect],
  );

  /* Approve: the sign-in token of the owner is minted here and shown
     once, in the row it belongs to. */
  const approve = useCallback(
    (x: PlatformUser): void => {
      if (!token) return;
      const allowanceNow = Number(allowance[x.id] || x.deploy_allowance || 3);
      run(async () => {
        const res = await adminApprove(token, x.id, allowanceNow);
        setIssued((prev) => ({ ...prev, [x.id]: res.token }));
        setNote(
          `Approved ${x.email} - the sign-in token is in the row, copy it to the owner.`,
        );
      });
    },
    [token, allowance, run],
  );

  const reject = useCallback(
    (x: PlatformUser): void =>
      run(() => adminReject(token || "", x.id), () => setNote(`Rejected ${x.email}.`)),
    [token, run],
  );

  const saveAllowance = useCallback(
    (x: PlatformUser): void => {
      if (!token) return;
      const value = Number(allowance[x.id] ?? x.deploy_allowance ?? 0);
      run(
        () => adminAllowance(token, x.id, value),
        () => setNote(`Allowance saved for ${x.email}.`),
      );
    },
    [token, allowance, run],
  );

  const toggleUser = useCallback(
    (x: PlatformUser): void => {
      if (!token) return;
      run(
        x.status === "suspended"
          ? () => adminReactivate(token, x.id)
          : () => adminSuspend(token, x.id),
        () =>
          setNote(
            x.status === "suspended" ? `Reactivated ${x.email}.` : `Suspended ${x.email}.`,
          ),
      );
    },
    [token, run],
  );

  /* The billing queue: approve grants the asked amount and closes the
     request, reject stores the reason the tenant is told. */
  const creditApprove = useCallback(
    (id: string): void => {
      if (!token) return;
      run(async () => {
        const out = await adminCreditApprove(token, id);
        setNote(`Granted ${out.granted} credits to shop ${out.shop_id}.`);
      });
    },
    [token, run],
  );

  const creditReject = useCallback(
    (id: string, reason: string): void => {
      if (!token) return;
      run(async () => {
        await adminCreditReject(token, id, reason);
        setNote("Request rejected - the tenant is told the reason.");
      });
    },
    [token, run],
  );

  const cancelToken = useCallback(
    (code: string): void =>
      run(() => adminCancelToken(token || "", code), () =>
        setNote(`Code ${code} is frozen.`),
      ),
    [token, run],
  );

  /* Delete a code for good (a frozen code keeps its row). */
  const deleteToken = useCallback(
    (code: string): void =>
      run(() => adminDeleteToken(token || "", code), () =>
        setNote(`Deleted ${code} for good.`),
      ),
    [token, run],
  );

  const actions: AdminActions = {
    approve,
    reject,
    setAllowance: (id, value) => setAllowance((prev) => ({ ...prev, [id]: value })),
    saveAllowance,
    toggleUser,
    creditApprove,
    creditReject,
    cancelToken,
    deleteToken,
    reloadBundles: () => {
      if (!token) return;
      void (async () => {
        try {
          const v = await adminBundles(token);
          setData((prev) => (prev ? { ...prev, bundles: v.bundles } : prev));
        } catch {
          /* the version list keeps the old answer */
        }
      })();
    },
    changed: () => {
      if (token) collect(token);
    },
  };

  return {
    data,
    busy,
    error,
    note,
    issued,
    allowance,
    actions,
    reload: (tok?: string) => {
      const t = tok || token;
      if (t) collect(t);
    },
    lock: () => {
      setData(null);
      setIssued({});
      setAllowance({});
      setNote("");
      setError("");
    },
  };
}

export { EMPTY };
