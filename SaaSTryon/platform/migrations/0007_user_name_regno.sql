-- SaaSTryon platform schema, rev 0007: the person behind the account.
--
-- A platform user is a PERSON, not an email address: the admin sees
-- their name wherever a user appears, and a registration number tells
-- two users with the same name apart. The owner fills the name in when
-- they sign up (and can change it in their own portal); the platform
-- mints the registration number.
--
-- ALTER TABLE is not idempotent in SQLite, so the migrator tolerates
-- "duplicate column name" and keeps going.
ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN reg_no TEXT NOT NULL DEFAULT '';
