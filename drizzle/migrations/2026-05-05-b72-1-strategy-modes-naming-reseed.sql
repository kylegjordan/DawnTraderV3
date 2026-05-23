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
-- B72.1 — Strategy-modes confidence-floor naming reseed
--
-- The Slice B SQL seeded `governance_modes` rows under the names
--   conservative_mode_confidence_floor (0.60)
--   moderate_mode_confidence_floor     (0.70)
--   aggressive_mode_confidence_floor   (0.80)
-- but the source object `STRATEGY_MODE_OVERLAYS` in
-- server/core/governance/strategy-modes.ts uses keys NORMAL/DEFENSIVE/SURVIVAL.
-- Mapping per inventory archetype:
--   NORMAL    → 0.60 (least restrictive — passive learning baseline)
--   DEFENSIVE → 0.70 (moderate — increased confidence floor)
--   SURVIVAL  → 0.80 (most restrictive — strict during distress)
--
-- This migration adds aliased rows under the source-matching names so
-- future source-side wiring can read with operator-intuitive scope keys.
-- Original conservative_/moderate_/aggressive_ rows preserved (no DELETE)
-- in case anyone built tooling against them.

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('governance_modes', '*', '*', '*', '*', 'normal_mode_confidence_floor',    '0.60'::jsonb, 'b72-1-naming-reseed'),
  ('governance_modes', '*', '*', '*', '*', 'defensive_mode_confidence_floor', '0.70'::jsonb, 'b72-1-naming-reseed'),
  ('governance_modes', '*', '*', '*', '*', 'survival_mode_confidence_floor',  '0.80'::jsonb, 'b72-1-naming-reseed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;
