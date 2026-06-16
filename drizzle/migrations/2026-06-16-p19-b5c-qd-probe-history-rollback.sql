-- Rollback for 2026-06-16-p19-b5c-qd-probe-history.sql (P19-B5c #86 Q-D probe).
-- Drops the new table + removes the 3 seeded module_constants rows.
-- (Rollback files are NEVER listed in MANIFEST.txt — db-migrate auto-skips them.)

BEGIN;

DROP TABLE IF EXISTS xstock_qd_probe_history;

DELETE FROM module_constants
 WHERE updated_by = 'p19-b5c'
   AND (
     (module_name = 'data_lifecycle' AND constant_name = 'xstock_qd_probe_history.hot_retention_days')
     OR (module_name = 'qd_probe' AND constant_name IN ('cadence_minutes', 'freshness_ceiling_ms'))
   );

COMMIT;
