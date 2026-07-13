-- ROLLBACK for 2026-07-13-p19-b8-5b-provenance-scalars.sql
-- Drops the P19-B8.5b decision-time indicator scalars + settled-window hash from
-- signal_eval_provenance. Safe: columns are additive/nullable; no reader requires them
-- (archiver enqueue maps them ?? null; replay harness treats NULL as absent).
-- NOT registered in MANIFEST.txt (rollback files stay out per convention).
ALTER TABLE signal_eval_provenance
  DROP COLUMN IF EXISTS ind_vwap,
  DROP COLUMN IF EXISTS ind_atr,
  DROP COLUMN IF EXISTS ind_sma,
  DROP COLUMN IF EXISTS ind_high24h,
  DROP COLUMN IF EXISTS ind_low24h,
  DROP COLUMN IF EXISTS ind_current_volume,
  DROP COLUMN IF EXISTS settled_window_hash;
