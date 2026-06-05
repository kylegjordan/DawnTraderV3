-- B.5 W2.1 — unify max-holding on an explicit MILLISECONDS key (`max_holding_ms`).
--
-- THE DEFECT being fixed (scope B_5_PRE_AUDIT.md §2): "maximum holding time" was
-- expressed in THREE different units across the code/DB —
--   * vwap_pullback: bar-count (`max_holding_period_bars_default` = 24)
--   * breakout:      hours      (`max_holding_hours` = 12)
--   * paper enforcer read the bar-count 24 as 24 HOURS
--   * historic backtest hardcoded a 24-bar loop (= 24h @60m, but only 6h @15m)
-- At 60-min bars 24 bars ≈ 24h so the paths coincidentally agreed; the 60→15-min
-- xStock bar switch turned that into a 4x sim-vs-live divergence. This migration
-- replaces the ambiguous duration keys with ONE unit-explicit key carrying the
-- SAME intended wall-clock duration, so live behavior is preserved exactly.
--
-- CONVERSIONS (behavior-preserving — staging-verified current values 2026-06-06):
--   strategy.vwap_pullback / max_holding_period_bars_default = 24
--       intended duration = 24 bars × 60 min/bar (set in the 60-min era)
--       -> max_holding_ms = 24 × 60 × 60 × 1000 = 86_400_000  (24h)
--   strategy.breakout / max_holding_hours = 12
--       -> max_holding_ms = 12 × 3_600_000 = 43_200_000  (12h)
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING for inserts (never clobber a tuned value on
-- re-run); guarded deletes only remove the two specific legacy keys.
--
-- Schema reference (verified on Supabase):
--   module_constants(module_name, exchange, asset_class, strategy, regime,
--                    constant_name, value::jsonb, updated_at, updated_by).
--   PK / conflict target: (module_name, exchange, asset_class, strategy, regime, constant_name).
--   Values are jsonb numbers (resolver keeps only numeric rows).

BEGIN;

-- ── (a) Insert max_holding_ms at the SAME keys as the existing live rows ──────
-- These two `*` wildcard rows preserve CRYPTO behavior (and every other class
-- that falls through to `*`). DO NOTHING so a re-run never overwrites a value
-- that may have been tuned after this migration first ran.
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by, updated_at)
VALUES
  -- vwap_pullback: 24 bars @60m = 24h -> 86_400_000 ms (preserve status quo)
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'max_holding_ms', '86400000'::jsonb, 'b5-w21-max-holding-ms', NOW()),
  -- breakout: 12h -> 43_200_000 ms (preserve status quo)
  ('strategy.breakout',      '*', '*', 'breakout',      '*', 'max_holding_ms', '43200000'::jsonb, 'b5-w21-max-holding-ms', NOW())
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ── (b) NO per-class xstock_spot hold rows seeded here (deliberate). ──────────
-- W2.1 is a PURE preserve-behavior unit fix. Condition-5 ("every emitted signal
-- carries metadata.maxHoldingMs") is satisfied by the central stamp
-- (stampMaxHoldingMs) ALONE: it resolves `max_holding_ms` most-specific-wins, so
-- a strategy with no per-class row inherits the `*` wildcard above (e.g. breakout
-- xStock keeps its 12h), and a strategy with NO hold row at all falls back to the
-- documented DEFAULT_MAX_HOLDING_MS (24h) in code. Seeding uniform 24h xstock_spot
-- rows here would silently change breakout-xStock 12h→24h with NO evidence — that
-- is per-class trade-construction TUNING, which belongs in W2.2 (evidence-driven),
-- not in a correctness fix. Per-class xStock holds are therefore DEFERRED to W2.2.

-- ── (c) Delete the old ambiguous duration keys ───────────────────────────────
-- Guarded to the two specific legacy keys only. After this, `max_holding_ms` is
-- the single source of truth for per-strategy hold duration.
DELETE FROM module_constants
  WHERE constant_name = 'max_holding_period_bars_default';
DELETE FROM module_constants
  WHERE constant_name = 'max_holding_hours';

COMMIT;

-- Verification query (run after COMMIT):
SELECT module_name, exchange, asset_class, strategy, regime, constant_name, value
FROM module_constants
WHERE constant_name = 'max_holding_ms'
   OR constant_name IN ('max_holding_period_bars_default', 'max_holding_hours')
ORDER BY asset_class, module_name;
