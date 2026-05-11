-- Rollback for 2026-05-11-b79-0m-b2-xstock-pattern-rows.sql
--
-- Removes the 4 xstock_spot pattern-path rows seeded by B79.0m.b2.
-- Targeted by `last_updated_by` tag to avoid touching unrelated rows.

BEGIN;

DELETE FROM screener_filters
WHERE asset_class='xstock_spot'
  AND filter_path IN ('vts_pattern','active_pattern')
  AND last_updated_by = 'b79.0m.b2-pattern-path-cloned-from-crypto';

DO $$
DECLARE
  row_count integer;
BEGIN
  SELECT COUNT(*) INTO row_count
    FROM screener_filters
   WHERE asset_class='xstock_spot'
     AND filter_path IN ('vts_pattern','active_pattern');
  RAISE NOTICE '[B79.0m.b2-rollback] xstock_spot pattern rows remaining: %', row_count;
END $$;

COMMIT;
