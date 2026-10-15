-- B-ENTRY-CONSUMPTION-FRESHNESS — durable age at the immediate entry-consumption seam.
--
-- NULLABLE, NO DEFAULT, NO BACKFILL. A NULL means either the trade predates this
-- cutover or the row represents a resting maker placement, which did not consume
-- the captured depth snapshot. `entry_book_age_ms` remains the first-gate reading.

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS entry_book_consumption_age_ms DOUBLE PRECISION;

COMMENT ON COLUMN closed_trades.entry_book_consumption_age_ms IS
  'Conservative age of the SAME depth snapshot immediately before an immediate entry depth walk: source-reported gate age plus process-monotonic elapsed time from a pre-source-read anchor. NULL for pre-cutover rows and pending-maker placement, which does not consume depth. Separate from entry_book_age_ms, the first-gate reading. Crypto and xStock retain their existing class-specific source semantics and must not be pooled. B-ENTRY-CONSUMPTION-FRESHNESS.';
