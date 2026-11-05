-- ROLLBACK for 2026-11-05-b-xstock-correlation-collect.sql (not in MANIFEST).
-- Roll back the CODE first: with the code still deployed, removing b68_3_apply_factor makes the per-class pair
-- correlation load throw (market-context-engine.ts refreshPairCorrelationConfig requires the key).
-- Restores xStock compute to OFF exactly as the B79.0n seed left it.
BEGIN;
DELETE FROM module_constants
 WHERE module_name = 'pair_correlation' AND constant_name = 'b68_3_apply_factor'
   AND updated_by = 'b-xstock-correlation-collect';
UPDATE module_constants
   SET value = 'false'::jsonb, updated_at = NOW(), updated_by = 'b79.0n.confidence-chain-seed_xstock_off_v1'
 WHERE module_name = 'pair_correlation' AND constant_name = 'b68_3_compute_correlation_enabled'
   AND asset_class = 'xstock_spot' AND exchange = '*' AND strategy = '*' AND regime = '*';
COMMIT;
