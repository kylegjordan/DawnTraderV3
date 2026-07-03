-- B79.0f — Asset-class collision BACKFILL (one-shot, NOT idempotent because
-- it operates on a snapshot of mis-tagged rows that should converge to zero
-- after first run + resolver fix deploy).
--
-- Audit (b79-0f-collision-audit.sql) on staging 2026-05-10 found 4862 rows
-- in signal_eval_archive incorrectly tagged asset_class='xstock_spot' for
-- collision-set symbols (DASH/USD, MET/USD, OPEN/USD, SUI/USD). All
-- timestamps post-2026-05-07 21:51 UTC, exactly when B79 deploy populated
-- XSTOCK_SPOT_SYMBOLS and the resolver started preferring xstock_spot for
-- collision tickers on regular kraken path.
--
-- Per-symbol counts pre-fix (signal_eval_archive only — other tables clean):
--   DASH/USD : 337
--   MET/USD  : 1598
--   OPEN/USD : 44
--   SUI/USD  : 2883
--   TOTAL    : 4862
--
-- This script flips them back to crypto_spot. Other tables (trading_signals,
-- regime_factor_alternates, exit_strategy_alternates, closed_trades) had
-- 0 mis-tagged rows so are not touched.

BEGIN;

UPDATE signal_eval_archive
SET asset_class = 'crypto_spot'
WHERE asset_class = 'xstock_spot'
  AND symbol IN ('DASH/USD','MET/USD','OPEN/USD','SUI/USD');

-- Verification: should return zero
SELECT 'signal_eval_archive remaining mis-tagged' AS check, COUNT(*)
FROM signal_eval_archive
WHERE asset_class = 'xstock_spot'
  AND symbol IN ('BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
                 'BDX/EUR','CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR');

COMMIT;
