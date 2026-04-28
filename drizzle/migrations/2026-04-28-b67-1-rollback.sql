-- B67.1 Migration Rollback
--
-- Removes the 11 module_constants seed rows in the 'macro_modifier' module
-- inserted by 2026-04-28-b67-1-macro-modifier.sql.
--
-- Safe to run repeatedly (idempotent).

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'macro_modifier'
  AND constant_name IN (
    'b67_1_enabled',
    'b67_1_btc_dominance_weight',
    'b67_1_funding_weight',
    'b67_1_mcap_momentum_weight',
    'b67_1_modifier_min',
    'b67_1_modifier_max',
    'b67_1_external_feed_cache_seconds',
    'b67_1_external_feed_stale_seconds',
    'b67_1_btc_dominance_zscore_lookback_days',
    'b67_1_funding_zscore_lookback_days',
    'b67_1_zscore_min_sample_count'
  );

COMMIT;
