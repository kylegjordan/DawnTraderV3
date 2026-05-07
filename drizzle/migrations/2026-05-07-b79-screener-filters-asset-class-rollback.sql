-- B79 Migration ROLLBACK — screener_filters asset_class + tunable_status.
-- Removes the xstock_spot row, drops the index, drops the columns.
-- Inverse of 2026-05-07-b79-screener-filters-asset-class.sql.

BEGIN;

DELETE FROM screener_filters WHERE asset_class = 'xstock_spot';

DROP INDEX IF EXISTS idx_screener_filters_asset_class_mode;

ALTER TABLE screener_filters DROP COLUMN IF EXISTS tunable_status;
ALTER TABLE screener_filters DROP COLUMN IF EXISTS asset_class;

COMMIT;
