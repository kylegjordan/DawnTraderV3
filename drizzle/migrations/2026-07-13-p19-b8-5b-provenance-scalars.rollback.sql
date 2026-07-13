-- ROLLBACK for 2026-07-13-p19-b8-5b-provenance-scalars.sql
-- Drops the P19-B8.5b decision-time indicator scalars + settled-window hash from
-- signal_eval_provenance. ⚠ CODE-FIRST REVERT REQUIRED: the deployed archiver maps
-- these columns in its INSERT (PROVENANCE_COLUMNS) — dropping them under live code
-- fails the enqueue. Revert/redeploy the code BEFORE running this file. Otherwise
-- safe: columns are additive/nullable; replay harness treats NULL as absent.
-- NOT registered in MANIFEST.txt (rollback files stay out per convention).
ALTER TABLE signal_eval_provenance
  DROP COLUMN IF EXISTS ind_vwap,
  DROP COLUMN IF EXISTS ind_atr,
  DROP COLUMN IF EXISTS ind_sma,
  DROP COLUMN IF EXISTS ind_high24h,
  DROP COLUMN IF EXISTS ind_low24h,
  DROP COLUMN IF EXISTS ind_current_volume,
  DROP COLUMN IF EXISTS settled_window_hash;
