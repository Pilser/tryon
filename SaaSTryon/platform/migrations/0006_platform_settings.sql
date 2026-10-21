-- SaaSTryon platform schema, rev 0006: the platform's own settings.
--
-- Some secrets have to be settable WITHOUT a worker deploy: the try-on
-- API (Genlook) key belongs to the operator, who must be able to paste
-- it in the admin console and see the provider balance right away. A
-- Workers secret needs a redeploy (and a fresh isolate); a row in this
-- table is read at request time.
--
-- The values are operator secrets: the API never echoes one back (the
-- admin UI shows only whether it is set and its last four characters).
CREATE TABLE IF NOT EXISTS platform_settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_ms INTEGER NOT NULL DEFAULT 0
);
