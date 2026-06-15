-- ═════════════════════════════════════════════════════════════════════════════
-- P19-B4a (C6 / scope A7) — calibration_state tag on the ACTIVE-PAPER tables
-- ═════════════════════════════════════════════════════════════════════════════
-- Mirrors F-NOW (2026-06-01-f-now-calibration-state.sql), which added the tag to
-- the VTS tables ONLY and intentionally skipped the active-paper path (Phase 19
-- far off then). Phase 19 turns active-paper trading back ON, so the active-paper
-- tables now need the same calibration-era marker so the xStock aggregator can
-- exclude the pre-calibration cohort from xStock closed-outcome evaluation.
--
-- NOT NULL DEFAULT → Postgres fast-default auto-backfills EVERY existing row
-- (crypto + xStock) with the tag, so no row is stranded null ahead of any future
-- NOT-NULL tightening. New rows auto-tag pre-cal with no write-path code. Crypto
-- rows carry the xStock-named tag — harmless, the aggregator's exclusion is always
-- asset-class-scoped. Changes no trading behavior. Pure data plumbing.
--
-- GENUINE DELTA — runs on staging AND a fresh CI Postgres from initial-schema.sql.
-- Idempotent (ADD COLUMN IF NOT EXISTS) → safe to re-run.
--
-- CROSS-REF: the tag literal 'pre_calibration_xstock_2026_05' is the same literal
-- F-NOW used (mirrored in TS as PRE_CALIBRATION_XSTOCK_TAG in
-- server/services/exit-strategy-ablation-aggregator.ts). If it ever changes,
-- change it in ALL of: that const, the F-NOW migration, and this file.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS calibration_state TEXT NOT NULL
  DEFAULT 'pre_calibration_xstock_2026_05';

COMMENT ON COLUMN paper_sim_trades.calibration_state IS
  'P19-B4a C6 (2026-06-14): calibration-era marker for active-paper trades. '
  'Default ''pre_calibration_xstock_2026_05'' tags every trade opened during the '
  'xStock calibration umbrella; the xStocks aggregator excludes this cohort when '
  'scoped to xstock_spot. Mirror of the VTS-side F-NOW column. Flip to a post-'
  'calibration value is a future action (clean-dataset boundary).';

ALTER TABLE paper_sim_open_positions
  ADD COLUMN IF NOT EXISTS calibration_state TEXT NOT NULL
  DEFAULT 'pre_calibration_xstock_2026_05';

COMMENT ON COLUMN paper_sim_open_positions.calibration_state IS
  'P19-B4a C6 (2026-06-14): calibration-era marker for active-paper open positions. '
  'Same semantics + default as paper_sim_trades.calibration_state.';

COMMIT;
