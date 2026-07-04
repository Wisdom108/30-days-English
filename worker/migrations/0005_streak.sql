-- Streak freezes (补签卡): consumable tokens that patch one missed day in the
-- learner's streak. Count lives on the wallet row; every grant/consume is
-- audited in wallet_ledger with delta_seconds 0 (reason 'grant:freeze' /
-- 'freeze:consume') so the unique ref index keeps both idempotent.
-- Apply: wrangler d1 migrations apply thirty-days-en-db --remote

ALTER TABLE wallet ADD COLUMN freezes INTEGER NOT NULL DEFAULT 0;
