-- Web Push subscriptions (v3.1). Tickles carry no payload, so p256dh/auth are
-- not used for encryption today — stored anyway so payload pushes stay possible.
-- Apply: wrangler d1 migrations apply thirty-days-en-db --remote
-- Timestamps are unix milliseconds.

CREATE TABLE IF NOT EXISTS push_subs (
  user_id INTEGER NOT NULL,
  endpoint TEXT PRIMARY KEY,             -- push-service URL,一台设备一行
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs(user_id);
