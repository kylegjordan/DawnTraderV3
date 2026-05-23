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
-- B72 Step 3 — Commit A — DBS Routing Guards Group Migration
--
-- Promotes the SBT_DBS_MIN entry threshold (strong_bull_trend.ts:42) and the
-- 3 parallel mutual-exclusion guards in defensive_hedge / reverse_impulse /
-- morning_star to module_constants. These four call sites form a coupled set
-- enforcing B63's strong-trend mutual-exclusion invariant: when |DBS| >= 0.35,
-- pairs route exclusively to strong_bull_trend; counter-trend strategies
-- (defensive_hedge, reverse_impulse, morning_star) must skip those pairs.
--
-- Schema per Langston cc-inbox #906:
--   module_name       = 'strategy_dbs_routing_guards'
--   strategy          = <strategy_key>      (per-strategy row; allows independent tuning later)
--   constant_name     = 'dbs_min_threshold' (uniform across strategies)
--   value             = 0.35                (current literal)
--
-- Integration test asserts mutual consistency:
--   server/tests/integration/b72-dbs-routing-guards-consistency.test.ts
--
-- Group-migration rationale: a SQL UPDATE that changes one row but not the
-- others would silently break the mutual-exclusion guarantee. The integration
-- test catches that. The four-row layout (instead of one global row) is
-- intentional: future calibration may show one strategy's threshold should
-- shift while the others stay; the test must change in lockstep with such a
-- decision.

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by
) VALUES
  ('strategy_dbs_routing_guards', '*', '*', 'strong_bull_trend', '*', 'dbs_min_threshold', '0.35'::jsonb, 'b72-step3-commit-a'),
  ('strategy_dbs_routing_guards', '*', '*', 'defensive_hedge',   '*', 'dbs_min_threshold', '0.35'::jsonb, 'b72-step3-commit-a'),
  ('strategy_dbs_routing_guards', '*', '*', 'reverse_impulse',   '*', 'dbs_min_threshold', '0.35'::jsonb, 'b72-step3-commit-a'),
  ('strategy_dbs_routing_guards', '*', '*', 'morning_star',      '*', 'dbs_min_threshold', '0.35'::jsonb, 'b72-step3-commit-a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;

-- Verification SELECTs (uncomment to inspect):
-- SELECT * FROM module_constants WHERE module_name = 'strategy_dbs_routing_guards' ORDER BY strategy;
