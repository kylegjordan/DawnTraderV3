-- B-ATR-BAD-PRINT (#1153) — retire module_constants `atr_fallback_daily_range_frac` (rule 18).
--
-- What it fed: strategy-engine's vwap_pullback geometry and detectBullishReversal took
-- `indicators.atr ?? (high24h − low24h) × atr_fallback_daily_range_frac` — a slice of the 24-hour range
-- substituted for an ATR when one was missing. Langston ruled (B-ATR-BAD-PRINT Step 2, ruling (e)): fail
-- closed — it is a different measurement wearing the `atr` name. The code no longer reads this key (the
-- same commit), so the row has no reader.
-- Origin: literal `* 0.1` in Batch 45 (b6894c00e, 2026-04-01); made DB-tunable by B72.2 (eeabb7147,
-- 2026-05-06-b72-2-quant-lever-sweep.sql:41). Live row on staging 2026-10-06, exactly one:
--   ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'atr_fallback_daily_range_frac', 0.10, 'b72-2-lever-sweep')
-- Rollback: the matching -rollback.sql re-inserts that row.

BEGIN;
SET LOCAL lock_timeout = '5s';

DELETE FROM module_constants
 WHERE module_name   = 'strategy.vwap_pullback'
   AND constant_name = 'atr_fallback_daily_range_frac';

COMMIT;
