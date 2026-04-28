-- B67.1 Follow-up Rollback — Restores `b67_1_enabled` row (default false)
--
-- Symmetric rollback for 2026-04-29-b67-1-remove-shadow-flag.sql.

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_enabled',
   'false'::jsonb,
   'b67.1-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;
