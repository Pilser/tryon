/* components/owner/landing-tab.tsx - the landing dist of one shop.

   Six steps, in this order (DESIGN.md 3.4): pick the shop, pick the
   folder, the preflight (what may go up and what may not, with the
   reason), the staging queue (one file per call, three at a time, a
   byte-weighted bar), the publish (a SEPARATE, explicit call) and the
   verification (the published list is read back from the platform, so
   the panel shows the truth and not the local guess). */
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  ApiError,
  type ShopView,
  applyLanding,
  listLanding,
} from "../../api";
import { base as b, cx, pf, ui as u } from "../../kit";
import { DropZone } from "../shared/drop-zone";
import { EmptyState } from "../shared/empty-state";
import type { PickedFile } from "../shared/landing-files";
import { Panel } from "../shared/panel";
import { usePrimary, type PrimaryAction } from "../shared/primary-action";
import { UploadQueue, type QueueProgress } from "../shared/upload-queue";

const msg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

export function LandingTab(props: {
  shops: ShopView[];
  sessionId: string;
  shopParam: string;
  onShop: (shopId: string) => void;
  onChanged: () => void;
  onPrimary: (action: PrimaryAction | null) => void;
}): JSX.Element {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pick, setPick] = useState(0);
  const [progress, setProgress] = useState<QueueProgress>({
    uploaded: 0,
    failed: 0,
    total: 0,
    bytes: 0,
    totalBytes: 0,
  });
  const [published, setPublished] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);

  const shop = props.shops.find((s) => s.id === props.shopParam) || null;
  const host = shop ? shop.url || `https://${shop.subdomain}.latiforge.com` : "";

  /* The published files are the platform's answer, not the local one. */
  const reload = useCallback(async (): Promise<void> => {
    if (!shop) return;
    try {
      const out = await listLanding(props.sessionId);
      const mine = out.shops.find((s) => s.shop_id === shop.id);
      setPublished(mine ? mine.files : []);
    } catch {
      setPublished(shop.landing_files);
    }
  }, [props.sessionId, shop]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* A different shop means a different dist: the staged files go. */
  useEffect(() => {
    setFiles([]);
    setProgress({ uploaded: 0, failed: 0, total: 0, bytes: 0, totalBytes: 0 });
    setNote("");
    setBad(false);
  }, [props.shopParam]);

  /* The publish call is per shop, so the tab always has one: the first
     shop of the owner when the URL does not name one. */
  useEffect(() => {
    if (!props.shopParam && props.shops.length > 0) props.onShop(props.shops[0].id);
  }, [props.shopParam, props.shops, props.onShop]);

  function publish(): void {
    if (!shop) return;
    setPublishing(true);
    setNote("");
    setBad(false);
    void (async () => {
      try {
        const out = (await applyLanding(props.sessionId, shop.id)) as {
          ok: boolean;
          files: number;
          uploaded?: number;
          url: string;
        };
        setNote(
          `Published ${out.files} file(s) (${out.uploaded ?? 0} newly uploaded) - live at ${
            out.url || host
          }.`,
        );
        await reload();
        props.onChanged();
      } catch (e) {
        setNote(msg(e, "Could not publish the landing page."));
        setBad(true);
      } finally {
        setPublishing(false);
      }
    })();
  }

  const action = useMemo<PrimaryAction | null>(
    () => ({
      label: "Publish landing page",
      run: publish,
      disabled: !shop || progress.uploaded === 0 || publishing,
      busy: publishing,
    }),
    [shop, progress.uploaded, publishing],
  );
  usePrimary(props.onPrimary, action);

  if (props.shops.length === 0) {
    return (
      <Panel title="Your landing page">
        <EmptyState
          title="No shop yet."
          reason="A landing page belongs to a shop. Deploy one first, then upload your built folder here."
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel title="The shop this page belongs to">
        <div className={cx(pf.toolbar)}>
          {props.shops.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cx(pf.chipBtn, s.id === props.shopParam && pf.chipBtnOn)}
              aria-pressed={s.id === props.shopParam}
              onClick={() => props.onShop(s.id)}
            >
              {s.name || s.subdomain}
            </button>
          ))}
        </div>
        {shop ? (
          <p className={cx(u.rowSub)}>
            The publish call carries this shop, so the folder always lands on the
            right one.
          </p>
        ) : (
          <p className={cx(u.rowSub)}>Pick the shop above before you stage a folder.</p>
        )}
      </Panel>

      {shop ? (
        <>
          <Panel title="Your built folder">
            <p className={cx(u.rowSub)}>
              Upload the dist folder of your own landing page. It is served at the root
              of the shop, the studio stays at /app. List your products with the feed:{" "}
              <code>/api/feed</code> returns JSON with a card per product.
            </p>
            <DropZone
              onFiles={(picked) => {
                setFiles(picked);
                setPick((n) => n + 1);
                setNote("");
                setBad(false);
              }}
              disabled={publishing}
            />
          </Panel>

          <UploadQueue
            sessionId={props.sessionId}
            shopId={shop.id}
            files={files}
            pickId={pick}
            onProgress={setProgress}
          />

          <Panel title="Publish">
            <p className={cx(u.rowSub)}>
              Publishing re-registers the shop&apos;s assets; the studio at /app keeps
              working. It is a separate step on purpose: the files are staged until
              you press it.
            </p>
            {progress.uploaded === 0 ? (
              <p className={cx(u.meta)}>
                {files.length > 0
                  ? "The publish button stays disabled until a file has uploaded."
                  : "Pick a folder first - the publish button stays disabled until a file has uploaded."}
              </p>
            ) : null}
            {progress.failed > 0 ? (
              <p className={cx(b.error)}>
                {progress.failed} file(s) failed - retry them before you publish.
              </p>
            ) : null}
            <p className={cx(u.meta)}>
              Press <strong>Publish landing page</strong> in the header to publish what
              is staged.
            </p>
            {note ? <p className={bad ? cx(b.error) : cx(u.inlineNote)}>{note}</p> : null}
          </Panel>

          <Panel title="Verify">
            <p className={cx(u.rowSub)}>
              Check the live page, the feed the page embeds and the studio.
            </p>
            <div className={cx(u.btnRow)}>
              <a className={cx(b.btn, b.btnSecondary)} href={host} target="_blank" rel="noreferrer">
                Open the landing page
              </a>
              <a
                className={cx(b.btn, b.btnSecondary)}
                href={`${host}/api/feed`}
                target="_blank"
                rel="noreferrer"
              >
                Open the feed
              </a>
              <a
                className={cx(b.btn, b.btnSecondary)}
                href={`${host}/app/studio.html?owner=1`}
                target="_blank"
                rel="noreferrer"
              >
                Open the studio
              </a>
            </div>
            {published.length === 0 ? (
              <p className={cx(u.empty)}>
                No landing page published. Upload your built folder, then publish.
              </p>
            ) : (
              <div className={cx(u.rows)}>
                <div className={cx(u.row)}>
                  <div className={cx(u.rowMain)}>
                    <p className={cx(u.rowTitle)}>
                      {published.length} published file(s)
                    </p>
                    <p className={cx(pf.code)}>{published.join("  ")}</p>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}
