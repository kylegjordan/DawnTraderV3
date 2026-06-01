-- ═════════════════════════════════════════════════════════════════════════════
-- B-XSTOCK-CALIB · F-NOW — calibration_state tag plumbing (VTS-only)
-- ═════════════════════════════════════════════════════════════════════════════
-- Kyle directive 2026-06-01: tag every xStock VTS trade with a calibration era
-- marker so Phase 25 can exclude the pre-calibration cohort from xStock closed-
-- outcome evaluation. VTS-ONLY: the active-paper (paper_sim_open_positions)
-- path is intentionally NOT touched (Phase 19 far off).
--
-- Changes no trading behavior. Pure data plumbing.
--
--   (a) vts_open_trades.calibration_state — literal default. Postgres fast-
--       default auto-backfills all existing rows (1,791 xStock + 2,003 crypto
--       as of 2026-06-01); new umbrella-window trades auto-tag pre-cal with no
--       write-path code. Crypto rows carry the xStock-named tag — harmless, it
--       is never read by the aggregator (exclusion is always asset-class-scoped).
--
--   (b) exit_strategy_alternates.calibration_state — nullable, NO default. The
--       forward value is written by exit-strategy-replay-service.ts persistExits
--       via a correlated sub-select against the parent vts_open_trades row
--       (keyed on originalSignalId, NOT the exit-time-rebuilt trade_id — see
--       B_XSTOCK_CALIB_F_NOW_SCOPE.md §3). Existing xStock rows backfilled below.
--
--   (c) Retroactive backfill of the 17,184 existing xStock VTS alternates rows.
--       Uniform tag (every existing xStock trade is pre-calibration by
--       definition); cannot join to parent because closed vts_open_trades rows
--       are GC'd past data_lifecycle.vts_open_trades.closed_gc_retention_days.
--       Idempotent via IS NULL.
--
-- GENUINE DELTA — runs on staging AND a fresh CI Postgres built from
-- initial-schema.sql. Idempotent (IF NOT EXISTS + IS NULL) → safe to re-run.
-- See Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_F_NOW_SCOPE.md.
--
-- CROSS-REF (Langston A3-1): the tag literal 'pre_calibration_xstock_2026_05'
-- below is duplicated in TS as `PRE_CALIBRATION_XSTOCK_TAG` in
-- server/services/exit-strategy-ablation-aggregator.ts — a .sql file cannot
-- import the const, so this DEFAULT + backfill are the only places the literal
-- is written by hand. If the tag ever changes, change BOTH this file and that
-- const together.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS calibration_state TEXT NOT NULL
  DEFAULT 'pre_calibration_xstock_2026_05';

COMMENT ON COLUMN vts_open_trades.calibration_state IS
  'B-XSTOCK-CALIB F-NOW (2026-06-01): calibration-era marker. Default '
  '''pre_calibration_xstock_2026_05'' tags every trade opened during the xStock '
  'calibration umbrella. Phase 25 excludes this cohort from xStock closed-outcome '
  'evaluation. Propagated to exit_strategy_alternates by the replay writer. The '
  'flip to a post-calibration value is a future action (clean-dataset boundary).';

ALTER TABLE exit_strategy_alternates
  ADD COLUMN IF NOT EXISTS calibration_state TEXT;

COMMENT ON COLUMN exit_strategy_alternates.calibration_state IS
  'B-XSTOCK-CALIB F-NOW (2026-06-01): mirror of the parent vts_open_trades '
  'trade''s calibration_state, written by persistExits via a correlated sub-'
  'select on originalSignalId. NULL for paper-sourced rows (VTS-only) and for '
  'pre-F-NOW crypto rows. The xStocks exit-ablation aggregator excludes '
  '''pre_calibration_xstock_2026_05'' rows when scoped to xstock_spot.';

-- (c) Retroactive backfill — xStock VTS rows only (Kyle: VTS-only).
UPDATE exit_strategy_alternates
   SET calibration_state = 'pre_calibration_xstock_2026_05'
 WHERE asset_class = 'xstock_spot'
   AND trade_source = 'vts'
   AND calibration_state IS NULL;

COMMIT;
