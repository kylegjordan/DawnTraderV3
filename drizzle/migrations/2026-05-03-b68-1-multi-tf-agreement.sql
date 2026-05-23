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
-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-05-03 — B68.1 Multi-Timeframe Agreement
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a 7th chain modulator: per-pair higher-TF (240-min / 4h) regime
-- AGREEMENT score on top of the active 1h regime classification.
--
--   raw × macro × phase × freshness × outcome × volume_regime
--     × pair_correlation × multi_tf_agreement → clamp [0.45, 1.0]
--
-- Three-state classification:
--   - CONFIRMED  (labels match)            → factor 1.05
--   - COMPATIBLE (same family, ST-tolerant) → factor 1.00
--   - CONFLICTED (cross-family conflict)   → factor 0.95
--
-- All seeds wildcarded across exchange × asset_class × strategy × regime —
-- this is a cross-cutting chain modulator, not regime- or strategy-specific.
-- The 3 *_score constants exist primarily for ablation experimentation.
--
-- Reference: BATCH_68_1_SCOPE.md (Langston-approved cc-inbox #887, refinement
-- D.1 incorporated — explicit zero higher_tf_dbs_score / higher_tf_dbs_slope
-- in ablation metadata) + BATCH_68_1_PRE_AUDIT.md (Langston-approved cc-inbox
-- #888).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_higher_tf_interval_minutes', '240'::jsonb,  'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_min_higher_tf_samples',      '30'::jsonb,   'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_factor_min',                 '0.92'::jsonb, 'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_factor_max',                 '1.05'::jsonb, 'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_sensitivity',                '0.05'::jsonb, 'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_compatible_score',           '0.5'::jsonb,  'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_confirmed_score',            '1.0'::jsonb,  'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_conflicted_score',           '0.0'::jsonb,  'b68.1-multi-tf-agreement')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;
