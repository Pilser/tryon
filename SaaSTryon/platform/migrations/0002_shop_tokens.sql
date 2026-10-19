-- SaaSTryon platform schema, rev 0002: shop tokens (Phase E).
-- 4-digit codes minted by the platform admin, redeemed by a shop to top up
-- its tryon_tokens credit balance. Lifecycle: active -> used | cancelled.
-- All timestamps are INTEGER milliseconds. Every statement is CREATE TABLE
-- IF NOT EXISTS so store::ensure_schema() can re-apply the file on every
-- cold start (it splits on ";\n"; keep the trailing semicolon lines).
CREATE TABLE IF NOT EXISTS shop_tokens (
    code TEXT PRIMARY KEY,
    shop_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_ms INTEGER NOT NULL DEFAULT 0,
    redeemed_ms INTEGER,
    redeemed_by TEXT,
    cancelled_ms INTEGER,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_shop_tokens_shop
    ON shop_tokens (shop_id, status);
;
