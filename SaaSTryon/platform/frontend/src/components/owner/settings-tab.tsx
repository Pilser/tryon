/* components/owner/settings-tab.tsx - the account of the signed-in
   owner: who they are, what they may deploy and the session they are
   sitting in. The platform has no profile editor yet (the admin keeps
   the account), so the values are read out, not edited here. */
import { useMemo, type JSX } from "react";
import type { MeOut } from "../../api";
import { cx, ui } from "../../kit";
import { CopyCode } from "../shared/copy-code";
import { KV } from "../shared/kv";
import { Panel } from "../shared/panel";
import { StatTile } from "../shared/stat-tile";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";

const n = (x: number): string => new Intl.NumberFormat("en-US").format(x);

export function SettingsTab(props: {
  me: MeOut;
  sessionId: string;
  onSignOut: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: "Sign out",
      run: props.onSignOut,
    }),
    [props.onSignOut],
  );
  usePrimary(props.onPrimary, action);

  const user = props.me.user;
  const left = Math.max(0, props.me.deploy_allowance - props.me.deploy_used);

  return (
    <>
      <Panel title="Your account">
        <KV
          rows={[
            { key: "Name", value: user.shop_name || "not set" },
            { key: "Email", value: user.email },
            { key: "Contact", value: user.contact || "not set" },
            { key: "Status", value: user.status },
            { key: "Member since", value: new Date(user.created_ms).toLocaleDateString() },
          ]}
        />
        <p className={cx(ui.rowSub)}>
          The platform keeps the account: the admin approves it, sets the deploy
          allowance and may suspend it. Ask the platform to change a value.
        </p>
      </Panel>

      <Panel title="What you may deploy">
        <div className={cx(ui.statGrid)}>
          <StatTile label="Deploy allowance" value={n(props.me.deploy_allowance)} />
          <StatTile label="Shops deployed" value={n(props.me.deploy_used)} />
          <StatTile label="Left to deploy" value={n(left)} />
        </div>
      </Panel>

      <Panel title="This session">
        <p className={cx(ui.rowSub)}>
          The session lives in this browser only. Sign out when you are done - the
          token on the approval mail is the way back in.
        </p>
        <CopyCode code={props.sessionId} label="Copy the session" />
      </Panel>
    </>
  );
}
