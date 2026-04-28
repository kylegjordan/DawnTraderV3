-- B67.3 Rollback — undo per-underlying-cap pair_id_hash + module_constants seeds

BEGIN;

ALTER TABLE paper_sim_trades DROP COLUMN IF EXISTS pair_id_hash;

DELETE FROM module_constants
WHERE module_name = 'per_underlying_cap'
  AND constant_name IN (
    'b67_3_enabled',
    'b67_3_max_concurrent_per_underlying',
    'b67_3_universe_split_active'
  );

COMMIT;
