/* components/owner/account-tab.tsx - the owner's own details.

   The owner fills in their name when they sign up and can correct it
   (and the email, the WhatsApp number, the shop name) here. The
   platform keeps the rest: the id, the status, the deploy allowance
   and the sign-in token are not the owner's to change. */
import { useEffect, useMemo, useState, type JSX } from "react";
import { ApiError, updateAccount, type MeOut } from "../../api";
import { base as b, cx, pf, ui } from "../../kit";
import { KV } from "../shared/kv";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

export function AccountTab(props: {
  me: MeOut;
  sessionId: string;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const user = props.me.user;
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [contact, setContact] = useState(user.contact || "");
  const [shopName, setShopName] = useState(user.shop_name || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  /* The row is the truth: a reload moves the fields with it. */
  useEffect(() => {
    setName(user.name || "");
    setEmail(user.email || "");
    setContact(user.contact || "");
    setShopName(user.shop_name || "");
  }, [user.name, user.email, user.contact, user.shop_name]);

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: busy ? "Saving…" : "Save my details",
      tone: "primary",
      busy,
      disabled: busy,
      run: save,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, name, email, contact, shopName, props.sessionId],
  );
  usePrimary(props.onPrimary, action);

  function save(): void {
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        await updateAccount(props.sessionId, {
          name: name.trim(),
          email: email.trim(),
          contact: contact.trim(),
          shop_name: shopName.trim(),
        });
        setNote("Saved. The platform sees the new details.");
        props.onChanged();
      } catch (e) {
        setBad(true);
        setNote(msg(e, "Could not save your details."));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <>
      <Panel title="Your details">
        <p className={cx(ui.rowSub)}>
          The name is what the platform shows next to your shops; the
          registration number is yours alone - it tells two owners with the
          same name apart.
        </p>
        <div className={cx(pf.fieldRow)}>
          <input
            className={cx(pf.field)}
            value={name}
            placeholder="your name"
            aria-label="your name"
            autoComplete="name"
            disabled={busy}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <input
            className={cx(pf.field)}
            value={email}
            placeholder="your email"
            aria-label="your email"
            autoComplete="email"
            disabled={busy}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
        </div>
        <div className={cx(pf.fieldRow)}>
          <input
            className={cx(pf.field)}
            value={contact}
            placeholder="your WhatsApp number"
            aria-label="your WhatsApp number"
            autoComplete="tel"
            disabled={busy}
            onChange={(e) => setContact(e.currentTarget.value)}
          />
          <input
            className={cx(pf.field)}
            value={shopName}
            placeholder="the name of your shop"
            aria-label="your shop name"
            autoComplete="organization"
            disabled={busy}
            onChange={(e) => setShopName(e.currentTarget.value)}
          />
        </div>
        {note ? <p className={cx(bad ? b.error : ui.inlineNote)}>{note}</p> : null}
      </Panel>

      <Panel title="What the platform keeps">
        <KV
          rows={[
            { key: "Registration number", value: user.reg_no || "not set yet" },
            { key: "Status", value: user.status },
            {
              key: "Deploy allowance",
              value: `${props.me.deploy_allowance} (${props.me.deploy_used} used)`,
            },
            { key: "Member since", value: new Date(user.created_ms).toLocaleDateString() },
          ]}
        />
        <p className={cx(ui.rowSub)}>
          The status, the allowance and the sign-in token are the
          platform&apos;s decisions - ask the admin to change them.
        </p>
      </Panel>
    </>
  );
}
