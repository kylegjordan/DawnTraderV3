-- B79.0m.a rollback — remove xstock_spot regime classifier asset-class-explicit rows.

BEGIN;

DELETE FROM module_constants
WHERE asset_class='xstock_spot'
  AND updated_by='b79.0m.a-layer1-starter-halved-from-crypto';

COMMIT;
