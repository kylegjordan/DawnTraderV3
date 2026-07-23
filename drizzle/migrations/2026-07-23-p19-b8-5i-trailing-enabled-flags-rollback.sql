-- ROLLBACK for 2026-07-23-p19-b8-5i-trailing-enabled-flags.sql (operator-only).
-- ⚠️ After the B8.5i code ships, resolveTECConfig requireKey() REQUIRES these rows — running
-- this rollback WITHOUT also reverting the code makes the first TEC config resolve HARD-FAIL
-- (by design: no runtime default). Revert the code first, then run this. Deleting these rows
-- before the code lands is safe (nothing reads them yet).
DELETE FROM module_constants
WHERE module_name = 'trailing_exit'
  AND constant_name IN ('trailing_enabled_vts','trailing_enabled_active')
  AND asset_class IN ('crypto_spot','crypto_perp','xstock_spot','xstock_perp');
