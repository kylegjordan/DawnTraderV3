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
-- B79.0m.a HOTFIX — extend screener_filters unique index to include asset_class
-- so xstock_spot rows can coexist with crypto_spot rows on the same (mode, filter_path).
--
-- Current index:   screener_filters_mode_path_idx UNIQUE (mode, filter_path)
-- Need:            screener_filters_mode_class_path_idx UNIQUE (mode, asset_class, filter_path)
--
-- Without this fix, the family-IMF seeds INSERT 0 because they conflict with
-- crypto rows on (mode, filter_path) and ON CONFLICT DO NOTHING skips them.
--
-- Pre-Phase-24, asset_class was effectively crypto-only so (mode, filter_path)
-- uniqueness held. B79 introduced asset_class as a first-class scope dimension;
-- this migration completes the index hygiene that B79.0a should have handled.

BEGIN;

ALTER TABLE screener_filters DROP CONSTRAINT IF EXISTS screener_filters_mode_path_idx;
DROP INDEX IF EXISTS screener_filters_mode_path_idx;

CREATE UNIQUE INDEX IF NOT EXISTS screener_filters_mode_class_path_idx
  ON screener_filters (mode, asset_class, filter_path);

COMMIT;
