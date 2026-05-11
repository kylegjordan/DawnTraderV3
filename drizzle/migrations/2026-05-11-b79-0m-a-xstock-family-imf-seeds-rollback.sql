-- B79.0m.a rollback — remove xstock_spot family-IMF rows + mode=live row.

BEGIN;

DELETE FROM screener_filters
WHERE asset_class='xstock_spot'
  AND last_updated_by IN (
    'b79.0m.a-layer1-starter-cloned-from-crypto',
    'b79.0m.a-layer1-starter-cloned-from-paper-mode'
  );

COMMIT;
