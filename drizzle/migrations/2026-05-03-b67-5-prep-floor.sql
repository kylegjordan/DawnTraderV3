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
-- B67.5-prep — Post-composition floor as module_constant
--
-- Per Langston cc-inbox #885 O.1 / Kyle approval 2026-05-03: raise the
-- post-composition floor from hardcoded 0.4 to 0.45 in preparation for
-- B68.1 (7th modulator). Compound penalty stack worst-case after B68.1
-- is ~0.43 — at the historical 0.4 floor edge. 0.45 floor prevents
-- extreme compounding while preserving meaningful differentiation across
-- the lower confidence range.
--
-- Goes into the existing `regime_classifier` module alongside B67.3.5's
-- 5 TFS desat constants. NOT a new module — small enough to fold in.
--
-- Three clamp sites currently using hardcoded 0.4 will be migrated to
-- read this constant via `RegimeConfig.b67_5PostCompositionFloor`:
--   - market-regime.ts:249 (calculatePairRegime terminal clamp)
--   - vts-runner.ts:1639 (VTS emit hook chain clamp)
--   - signal-orchestrator.ts:902 (orchestrator emit hook chain clamp)

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_classifier', '*', '*', '*', '*', 'b67_5_post_composition_floor', '0.45'::jsonb, 'b67.5-prep-floor')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;
