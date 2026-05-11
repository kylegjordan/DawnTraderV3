-- B79.0m.a hotfix rollback — restore (mode, filter_path) unique index.
--
-- DANGEROUS: rolling back requires xstock_spot family rows to be deleted first
-- (rollback the family-imf-seeds migration before this one), otherwise the
-- CREATE UNIQUE INDEX will fail on the (paper, vts_trend) collision.

BEGIN;

DROP INDEX IF EXISTS screener_filters_mode_class_path_idx;

CREATE UNIQUE INDEX IF NOT EXISTS screener_filters_mode_path_idx
  ON screener_filters (mode, filter_path);

COMMIT;
