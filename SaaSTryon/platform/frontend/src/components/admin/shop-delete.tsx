/* components/admin/shop-delete.tsx - the delete of a tenant. It lives
   in the footer of the manage panel only, it is red, and it asks for
   the shop's name to be typed before it fires: the Worker script, the
   per-shop database, the custom domains, the images, the landing files
   and all the rows of the shop are gone, and there is no undo. */
import { useState, type JSX } from "react";
import { ApiError, type ShopView } from "../../api";
import { adminDeleteShop } from "../../api-admin";
import { base as b, cx, ui as u } from "../../kit";
import { ConfirmBox } from "../shared/confirm-box";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

export function DeleteShop(props: {
  shop: ShopView;
  label: string;
  adminToken: string;
  armed: boolean;
  typed: string;
  onArmed: (armed: boolean) => void;
  onTyped: (value: string) => void;
  onChanged: () => void;
  onClose: () => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  function destroy(): void {
    setBusy(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = await adminDeleteShop(props.adminToken, props.shop.id);
        const gone = out.removed.length ? out.removed.join(", ") : "nothing left";
        setNote(`Shop ${props.label} is gone (${gone}).`);
        props.onChanged();
        props.onClose();
      } catch (e) {
        setNote(msg(e, "Could not delete that shop."));
        setBad(true);
      } finally {
        setBusy(false);
      }
    })();
  }

  if (!props.armed) {
    return (
      <div className={cx(u.btnRow)}>
        <button
          className={cx(b.btn, b.btnDanger)}
          type="button"
          disabled={busy}
          onClick={() => props.onArmed(true)}
        >
          Delete shop
        </button>
      </div>
    );
  }

  return (
    <>
      <ConfirmBox
        title={`Delete ${props.label}?`}
        body={
          <>
            Everything of this tenant goes: the Worker script, the database of
            the shop, its custom domains, its images, its landing files and all
            its rows. <strong>There is no undo.</strong>
          </>
        }
        confirmLabel="Delete for good"
        phrase={props.label}
        typed={props.typed}
        onTyped={props.onTyped}
        busy={busy}
        onConfirm={destroy}
        onCancel={() => {
          props.onArmed(false);
          props.onTyped("");
        }}
      />
      {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
    </>
  );
}
