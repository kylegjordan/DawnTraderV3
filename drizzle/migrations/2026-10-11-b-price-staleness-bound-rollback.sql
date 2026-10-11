-- Rollback of 2026-10-11-b-price-staleness-bound.sql. Removes only the row this batch seeded.
-- Roll the CODE back first: the warm-up refuses to start without this row.
DELETE FROM module_constants
WHERE module_name = 'mark_staleness' AND asset_class = 'xstock_spot' AND constant_name = 'cold_mark_max_ms'
  AND updated_by = 'b-price-staleness-bound';
