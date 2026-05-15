-- ════════════════════════════════════════════════════════════════════════════
-- B-NEW-34 — xstock 60-min bar parity + 4-hour pre-fetch
-- ════════════════════════════════════════════════════════════════════════════
--
-- Purpose:
--   1. Insert `min_ohlc_history_bars=24` for xstock_spot (replaces hardcoded
--      `ohlc.length < 60` floor in global-filter + pattern-filter)
--   2. Delete `data_freshness_window_ms` row for xstock_spot (90s ticker
--      freshness gate retired — bar history is the source of truth now)
--   3. Disable ORB strategy for xstock_spot (intrinsic intraday/minute-bar
--      strategy; cannot translate cleanly to 60-min bars without a redesign
--      that's deferred to XSTOCK_CALIBRATION_PLAN.md Phase D)
--
-- Pre-deploy check: defensive_hedge already disabled for xstock_spot in DB
-- (verified 2026-05-15). No action needed on that one despite the pre-flight
-- C finding that flagged the BTC-correlation reference. Phase A of the
-- calibration plan will plumb SPY benchmark when defensive_hedge is re-enabled.
--
-- Sequencing: APPLY THIS MIGRATION BEFORE deploying the B-NEW-34 code. The
-- code falls back to floor=24 if the row is missing (graceful migration race
-- handling) but the ORB strategy will continue firing until this migration
-- updates the strategy_gates row. The freshness-row delete is idempotent.
--
-- Reference: B-NEW-34 Rounds 1-3 design discussions, Langston cc-inbox 2026-05-15
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. INSERT min_ohlc_history_bars=24 ─────────────────────────────────────
-- Wildcard scope (exchange='*' strategy='*' regime='*') — single value
-- consumed by both global-filter and pattern-filter on the xstock side.
-- ON CONFLICT keeps the row idempotent — if it already exists, no change.
INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by
)
VALUES (
  'xstock_spot', '*', 'xstock_spot', '*', '*', 'min_ohlc_history_bars',
  '24'::jsonb,
  'B-NEW-34: replaces hardcoded 60-bar floor (1-min-era) with 24-bar floor (60-min-era). 4-bar BB/SMA(20) headroom + Monday-morning resilience.'
)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

-- ─── 2. DELETE data_freshness_window_ms for xstock_spot ─────────────────────
-- 90s ticker-freshness gate retired. xstock pipeline now gates on OHLC bar
-- history (above) instead of last-tick age. The data_freshness_window_ms
-- helper falls back to Infinity = always-fresh when row is missing, matching
-- crypto's path. Idempotent — no error if row already gone.
DELETE FROM module_constants
WHERE module_name = 'market_data'
  AND asset_class = 'xstock_spot'
  AND constant_name = 'data_freshness_window_ms';

-- ─── 3. Disable ORB strategy for xstock_spot ────────────────────────────────
-- ORB (Opening Range Breakout) builds its opening range from 30 consecutive
-- 1-min bars within a 30-minute window. With 60-min bars, that 30-minute
-- window contains AT MOST one bar — strategy is structurally non-functional.
-- Disable here; XSTOCK_CALIBRATION_PLAN.md Phase D revisits ORB with the
-- proper 5/15/30/60min sweep redesign.
UPDATE module_constants
SET
  value = 'false'::jsonb,
  updated_by = 'B-NEW-34: ORB suspended — requires intraday granularity (Phase D redesign)',
  updated_at = NOW()
WHERE module_name = 'strategy_gates'
  AND asset_class = 'xstock_spot'
  AND strategy = 'orb';

-- ─── Verification ───────────────────────────────────────────────────────────
-- Run these after COMMIT to confirm the migration applied as expected:
--
-- SELECT value FROM module_constants
--   WHERE module_name='xstock_spot' AND constant_name='min_ohlc_history_bars';
-- -- Expected: 24
--
-- SELECT COUNT(*) FROM module_constants
--   WHERE module_name='market_data' AND asset_class='xstock_spot'
--     AND constant_name='data_freshness_window_ms';
-- -- Expected: 0
--
-- SELECT value FROM module_constants
--   WHERE module_name='strategy_gates' AND asset_class='xstock_spot' AND strategy='orb';
-- -- Expected: false

COMMIT;
