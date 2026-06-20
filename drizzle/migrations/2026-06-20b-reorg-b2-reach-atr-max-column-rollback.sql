-- ROLLBACK for 2026-06-20b-reorg-b2-reach-atr-max-column.sql (operator-only).
ALTER TABLE screener_filters DROP COLUMN IF EXISTS reach_atr_max;
