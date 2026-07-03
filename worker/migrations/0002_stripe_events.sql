-- Idempotency ledger for Stripe webhooks. handleStripeWebhook claims each
-- Stripe event id once (INSERT OR IGNORE); a redelivered event finds it already
-- present and skips the additive membership grant, so one payment can never
-- stack membership days more than once.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
