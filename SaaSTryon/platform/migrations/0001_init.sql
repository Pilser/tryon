-- SaaSTryon platform schema, rev 0001 (PLATFORM.md §7.2 draft + token auth).
-- Timestamps are INTEGER milliseconds. All statements are CREATE TABLE IF NOT
-- EXISTS so store::ensure_schema() can re-apply the file on every cold start
-- (it splits on ";\n"; keep the trailing semicolon lines).
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    contact TEXT NOT NULL DEFAULT '',
    shop_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    deploy_allowance INTEGER NOT NULL DEFAULT 0,
    deploy_used INTEGER NOT NULL DEFAULT 0,
    auth_hash TEXT,
    auth_created_ms INTEGER,
    created_ms INTEGER NOT NULL DEFAULT 0,
    approved_by TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_ms INTEGER NOT NULL DEFAULT 0,
    expires_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    subdomain TEXT NOT NULL UNIQUE,
    cluster_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'deploying',
    tier TEXT NOT NULL DEFAULT 'starter',
    depot_version TEXT NOT NULL DEFAULT '',
    created_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hostnames (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    hostname TEXT NOT NULL UNIQUE,
    cf_hostname_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS credits (
    shop_id TEXT NOT NULL,
    product TEXT NOT NULL DEFAULT 'tryon_tokens',
    granted_total INTEGER NOT NULL DEFAULT 0,
    used_total INTEGER NOT NULL DEFAULT 0,
    updated_ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (shop_id, product)
);

CREATE TABLE IF NOT EXISTS credit_requests (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    requested INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT,
    created_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '',
    created_ms INTEGER NOT NULL DEFAULT 0
);
