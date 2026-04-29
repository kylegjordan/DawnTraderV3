-- Rollback for 2026-04-29-b67-1-funding-oi-weights.sql

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'macro_modifier'
  AND constant_name IN (
    'b67_1_funding_btc_weight',
    'b67_1_funding_eth_weight'
  );

COMMIT;
