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
import { adminBundles, adminDeleteToken, adminPurgeTokens, adminSetUserToken } from "../../api-admin";
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
  /** The sign-in token the operator is typing for a user. */
  userToken: Record<string, string>;
  /** True when the platform API itself is not answering (a poisoned
      isolate answers 1101 for everything). */
  unreachable: boolean;
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
  const [userToken, setUserToken] = useState<Record<string, string>>({});
  const [unreachable, setUnreachable] = useState(false);

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
        setUnreachable(false);
      } catch (e) {
        // A worker that answers "error 1101" is a POISONED isolate:
        // every request fails until a new script version spawns fresh
        // ones. The console must say so instead of "offline?".
        const raw = e instanceof Error ? e.message : String(e);
        const dead = /1101|error code/i.test(raw);
        setUnreachable(dead);
        setError(
          dead
            ? "The platform worker is not answering (its isolate is poisoned). Redeploy the platform below - a new script version spawns fresh isolates."
            : e instanceof ApiError
              ? e.message
              : "Could not load the platform - offline?",
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
     once, in the row it belongs to. The operator may type the token
     themselves (a readable one the owner can type) - then the platform
     stores that exact value. */
  const approve = useCallback(
    (x: PlatformUser): void => {
      if (!token) return;
      const allowanceNow = Number(allowance[x.id] || x.deploy_allowance || 3);
      const chosen = (userToken[x.id] || "").trim();
      run(async () => {
        const res = await adminApprove(
          token,
          x.id,
          allowanceNow,
          chosen || undefined,
        );
        setIssued((prev) => ({ ...prev, [x.id]: res.token }));
        setUserToken((prev) => ({ ...prev, [x.id]: "" }));
        setNote(
          `Approved ${x.email} - the sign-in token is in the row, copy it to the owner.`,
        );
      });
    },
    [token, allowance, userToken, run],
  );

  /* The admin sets (or rotates) a user's sign-in token by hand. */
  const setUserLoginToken = useCallback(
    (x: PlatformUser): void => {
      if (!token) return;
      const value = (userToken[x.id] || "").trim();
      if (!value) {
        setError("Type the token first (8-64 letters, digits, dash or underscore).");
        return;
      }
      run(async () => {
        const res = await adminSetUserToken(token, x.id, value);
        setIssued((prev) => ({ ...prev, [x.id]: res.token }));
        setUserToken((prev) => ({ ...prev, [x.id]: "" }));
        setNote(`The sign-in token for ${x.email} is now "${res.token}".`);
      });
    },
    [token, userToken, run],
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

  /* Delete many codes at once: the spent, the frozen, or both. */
  const purgeTokens = useCallback(
    (statuses: ("used" | "cancelled")[]): void =>
      run(
        () => adminPurgeTokens(token || "", statuses),
        () => setNote(`Deleted the ${statuses.join(" and ")} codes.`),
      ),
    [token, run],
  );

  const actions: AdminActions = {
    approve,
    reject,
    setAllowance: (id, value) => setAllowance((prev) => ({ ...prev, [id]: value })),
    setUserToken: (id, value) => setUserToken((prev) => ({ ...prev, [id]: value })),
    setUserLoginToken,
    saveAllowance,
    toggleUser,
    creditApprove,
    creditReject,
    cancelToken,
    deleteToken,
    purgeTokens,
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
    userToken,
    unreachable,
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
