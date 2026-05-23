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
-- ════════════════════════════════════════════════════════════════════════════
-- B-NEW-42b (2026-05-17) — Price-Discontinuity Detector module_constants seed
-- ════════════════════════════════════════════════════════════════════════════
--
-- Seeds the per-asset-class behavioral knobs for `server/services/price-
-- discontinuity-detector.ts`. The detector consults module_constants on each
-- threshold lookup (future Phase E calibration; today the defaults match
-- starting values per scope §2.1).
--
-- Catalogue lives in ADJUSTMENT_FRAMEWORK.md (added in same B-NEW-42b commit).
--
-- ## Idempotency
--
-- ALL inserts use `ON CONFLICT (...) DO NOTHING` so this migration is safe to
-- re-run across staging vs production environments OR when a previous attempt
-- left partial state. Per Langston pre-audit rev1 #4d (risk register).
--
-- ## Wildcard fallback discipline (Langston pre-audit rev1 #3)
--
-- A wildcard row `(*, *, *, *)` exists for every constant so the detector
-- degrades gracefully if a per-asset-class row is missing OR if the migration
-- has not yet run on a given environment. The detector reads via the standard
-- `getModuleConstants` API which already implements wildcard fallback.
--
-- ## Per-class values
--
-- xstock_spot uses production thresholds. crypto_spot also gets explicit rows
-- (with permissive values that effectively disable the detector) so the
-- `hasExplicitAssetClassRow` invariant from B79.TEC is satisfied if we ever
-- extend this module to cross-asset gating.
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Wildcard rows (degrade-gracefully defaults)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
)
VALUES
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'halt_gap_seconds_threshold', '300'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'halt_pct_threshold', '0.5'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'halt_clearing_window_seconds', '30'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'halt_hard_ceiling_seconds', '300'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'corp_action_pct_threshold', '40'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'corp_action_ttl_seconds', '86400'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'ex_div_pre_open_window_hours', '2'::jsonb, 'b-new-42b-wildcard-seed'),
  ('price_discontinuity_detector', '*', '*', '*', '*',
    'symbol_cache_stale_seconds', '86400'::jsonb, 'b-new-42b-wildcard-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- xstock_spot explicit per-class rows (production thresholds)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
)
VALUES
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'halt_gap_seconds_threshold', '300'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'halt_pct_threshold', '0.5'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'halt_clearing_window_seconds', '30'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'halt_hard_ceiling_seconds', '300'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'corp_action_pct_threshold', '40'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'corp_action_ttl_seconds', '86400'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'ex_div_pre_open_window_hours', '2'::jsonb, 'b-new-42b-xstock-seed'),
  ('price_discontinuity_detector', 'kraken', 'xstock_spot', '*', '*',
    'symbol_cache_stale_seconds', '86400'::jsonb, 'b-new-42b-xstock-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- crypto_spot explicit per-class rows (effectively-disable thresholds)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Detector's first check is `XSTOCK_SPOT_SYMBOLS.has(symbol)` — crypto
-- symbols return inactive before any threshold read. These rows exist
-- exclusively for future cross-asset gating compatibility (if a future
-- batch extends detector to crypto flash-crashes, these rows surface so
-- operators can tune them).

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
)
VALUES
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'halt_gap_seconds_threshold', '300'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'halt_pct_threshold', '0.5'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'halt_clearing_window_seconds', '30'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'halt_hard_ceiling_seconds', '300'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'corp_action_pct_threshold', '40'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'corp_action_ttl_seconds', '86400'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'ex_div_pre_open_window_hours', '0'::jsonb, 'b-new-42b-crypto-seed'),
  ('price_discontinuity_detector', 'kraken', 'crypto_spot', '*', '*',
    'symbol_cache_stale_seconds', '86400'::jsonb, 'b-new-42b-crypto-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Verification query (informational; safe to run repeatedly)
-- ─────────────────────────────────────────────────────────────────────────

-- SELECT module_name, exchange, asset_class, constant_name, value
-- FROM module_constants
-- WHERE module_name = 'price_discontinuity_detector'
-- ORDER BY exchange, asset_class, constant_name;

COMMIT;
