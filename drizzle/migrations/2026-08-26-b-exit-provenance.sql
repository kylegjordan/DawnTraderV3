-- B-EXIT-PROVENANCE (#741/#743) — 2026-08-26
--
-- FOURTEEN nullable KEEP-AS-DATA provenance columns on closed_trades.
--
-- WHY: `price_source` answers a POLICY question (may the engine act on this price?) and
-- CANNOT answer a PROVENANCE question. A ghost-contaminated book MIDPOINT and a clean
-- ticker PRINT both arrive stamped 'kraken_ws' — that is #741. `*_price_producer` therefore
-- sits ALONGSIDE `*_price_source`, never replacing it: merging the two is what created the
-- defect in the first place.
--
-- ⛔ ALL NULLABLE, NO DEFAULTS, DELIBERATELY. A DEFAULT would make a pre-deploy row
-- indistinguishable from a post-deploy row whose stamp was missed — the #546 distinction
-- this batch exists to preserve. Coverage is enforced by the OBJ-5 fence on POST-DEPLOY
-- rows, never by the column type.
--
-- ⛔ FORWARD-ONLY. This migration cannot fix a single existing trade; every pre-existing
-- row keeps NULL here for ever. Historical repair is F1+F2.
--
-- ROLLBACK: drop the columns (nothing reads them at deploy time). ⚠️ REVERT ORDER MATTERS —
-- pass sites FIRST, columns SECOND. Dropping the columns while the writers remain produces
-- writes to absent columns; the reverse leaves harmless dead arguments.

ALTER TABLE closed_trades
  -- ── EXIT LEG (OBJ-1/2/3) ──
  ADD COLUMN IF NOT EXISTS exit_decision_price   NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS exit_price_producer   VARCHAR(40),
  ADD COLUMN IF NOT EXISTS exit_price_source     VARCHAR(40),
  ADD COLUMN IF NOT EXISTS exit_observed_at_ms   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS exit_tick_cadence_ms  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS exit_book_mid         NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS exit_book_age_ms      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS exit_ticker_bid       NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS exit_ticker_ask       NUMERIC(20,10),
  -- ── ENTRY LEG (OBJ-6/7/9/10) ──
  ADD COLUMN IF NOT EXISTS entry_price_producer  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS entry_price_source    VARCHAR(40),
  ADD COLUMN IF NOT EXISTS entry_decision_price  NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS entry_book_age_ms     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS entry_observed_at_ms  DOUBLE PRECISION;

COMMENT ON COLUMN closed_trades.exit_decision_price IS
  'The value that actually DROVE the exit. NOT always exit_price: a resting maker exit records its limit while currentPrice caused the close. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.exit_price_producer IS
  'WHICH HANDLER produced the exit price. Closed vocabulary (PriceProducer, live-pricing-adapter.ts). A value outside it FAILS the OBJ-5 fence. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.exit_price_source IS
  'POLICY label (may the engine act on this price?). The one non-null guarantee on a POST-DEPLOY row; NULL on pre-deploy rows by design (#546). B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.exit_observed_at_ms IS
  'Venue OBSERVATION time of the exit-driving price. NULL where the leg genuinely has none (crypto direct-REST). NEVER inter-tick cadence — that is exit_tick_cadence_ms. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.exit_tick_cadence_ms IS
  'Engine inter-tick cadence for this symbol. Named honestly: it was priceAgeMs, which never held an age. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.exit_book_mid IS
  'Order-book mid at close — independent cross-check. NULL BY CONSTRUCTION on xStock (no book for that class), not by omission. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.exit_book_age_ms IS
  'Age of the order-book snapshot at close. NULL BY CONSTRUCTION on xStock. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.entry_book_age_ms IS
  'NULL BY CONSTRUCTION on a MAKER-fill row: a maker fill consults no book, its decision instrument is the price tick. A taker row carries a real book age. B-EXIT-PROVENANCE.';
COMMENT ON COLUMN closed_trades.entry_price_producer IS
  'WHICH HANDLER produced the entry price, written AT THE FILL SEAM, never at placement (a maker is INSERTED at placement and OPENS later). B-EXIT-PROVENANCE.';
