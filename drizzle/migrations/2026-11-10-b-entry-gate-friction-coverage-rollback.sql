-- ROLLBACK for 2026-11-10-b-entry-gate-friction-coverage.sql (not in MANIFEST).
-- Roll back the CODE first: the deployed reader is fail-hard when these rows are absent.
BEGIN;
DELETE FROM module_constants
WHERE module_name = 'entry_gate'
  AND constant_name = 'entry_friction_coverage_k'
  AND asset_class IN ('crypto_spot', 'xstock_spot');
COMMIT;
