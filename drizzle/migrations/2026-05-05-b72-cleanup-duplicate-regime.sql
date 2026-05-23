-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B72 Slice 4 cleanup — remove duplicate market_regime rows
--
-- The 5 TFS regime classifier fields (tfs_desat_min/max, tfs_momentum_scale,
-- tfs_volatility_scale, tfs_dbs_scale) were ALREADY DB-migrated under
-- module_name='regime_classifier' with constant_name='b67_3_5_*' during
-- B67.3.5 (pre-B72). MCE's assembleRegimeConfig() reads from there.
--
-- The B72 lever-sweep migration accidentally added duplicate rows under
-- module_name='market_regime' which are unused dead data. This cleanup
-- removes them so the inventory matches the live runtime resolution.
--
-- Inventory follow-up: B72-CORE-031 reclassified ALREADY_MIGRATED (was PROMOTE).

DELETE FROM module_constants
 WHERE module_name = 'market_regime'
   AND constant_name IN (
     'tfs_desat_min',
     'tfs_desat_max',
     'tfs_momentum_scale',
     'tfs_volatility_scale',
     'tfs_dbs_scale'
   )
   AND updated_by = 'b72-step3-commit-b';
