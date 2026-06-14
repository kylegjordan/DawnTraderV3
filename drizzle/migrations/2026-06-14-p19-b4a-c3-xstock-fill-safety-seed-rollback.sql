-- ROLLBACK for 2026-06-14-p19-b4a-c3-xstock-fill-safety-seed.sql
-- Removes the xStock active-fill safety knobs. NOT in MANIFEST.txt (db-migrate
-- auto-skips *rollback* files). Run manually only.
BEGIN;
DELETE FROM module_constants
WHERE module_name = 'xstock_fill_safety'
  AND asset_class = 'xstock_spot'
  AND constant_name IN (
    'active_fill_max_age_ms',
    'liquid_fill_window_open_min_et',
    'liquid_fill_window_close_min_et',
    'stall_reconnect_ms_rth',
    'stall_reconnect_ms_offrth'
  );
COMMIT;
