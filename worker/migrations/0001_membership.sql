-- Membership schema: accounts + activation codes + cloud progress sync.
-- Apply (after `wrangler d1 create thirty-days-en-db` and uncommenting the
-- binding in wrangler.toml):
--   wrangler d1 migrations apply thirty-days-en-db --remote
-- All timestamps are unix milliseconds.

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass_hash    TEXT NOT NULL,                 -- PBKDF2-SHA256 (20000 iter), hex
  salt         TEXT NOT NULL,                 -- 16 random bytes, hex
  member_until INTEGER,                       -- membership expiry; NULL = free tier
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS codes (
  code       TEXT PRIMARY KEY,                -- e.g. EN30-XXXX-XXXX (scripts/gen-codes.mjs)
  days       INTEGER NOT NULL DEFAULT 365,    -- membership days this code grants
  used_by    INTEGER,                         -- users.id; NULL = unused
  used_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);

CREATE INDEX IF NOT EXISTS idx_codes_used_by ON codes (used_by);

CREATE TABLE IF NOT EXISTS progress (
  user_id    INTEGER PRIMARY KEY,             -- users.id
  data       TEXT NOT NULL,                   -- opaque JSON blob from the app
  updated_at INTEGER NOT NULL
);
