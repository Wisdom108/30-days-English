-- Economy: earned-seconds wallet + ledger + badges + zaizai long-term memories.
-- Apply: wrangler d1 migrations apply thirty-days-en-db --remote
-- Idempotent earns: wallet_ledger.ref carries a unique per-event key, so an
-- INSERT OR IGNORE with changes=0 means "already claimed" — no KV needed.
-- All timestamps are unix milliseconds.

CREATE TABLE IF NOT EXISTS wallet (
  user_id INTEGER PRIMARY KEY,
  balance_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta_seconds INTEGER NOT NULL,        -- 正=赚 负=花
  reason TEXT NOT NULL,                  -- earn:<event> | spend:grok_call
  ref TEXT,                              -- 事件去重键,如 'block:12:listening'
  day TEXT,                              -- 客户端本地日 YYYY-MM-DD(earn 必填;spend/refund 为 NULL)
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_user_ref ON wallet_ledger(user_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_user_reason_day ON wallet_ledger(user_id, reason, day);
CREATE TABLE IF NOT EXISTS badges (
  user_id INTEGER NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                    -- plan|weakness|highlight|quirk|pref
  text TEXT NOT NULL,                    -- ≤200 chars,中文
  weight INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, weight DESC, updated_at DESC);
