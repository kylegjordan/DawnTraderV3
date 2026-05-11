-- B79.0m.a rollback — remove xstock_spot strategy_gates rows (preserves orb row from B79).

BEGIN;

DELETE FROM module_constants
WHERE module_name='strategy_gates'
  AND asset_class='xstock_spot'
  AND updated_by='b79.0m.a';

COMMIT;
