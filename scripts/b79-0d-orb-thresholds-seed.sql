-- B79.0d — Opening Range Breakout (ORB) module_constants seed.
--
-- Seeds 7 Layer-1 thresholds for ORB on xstock_spot scope and flips the
-- strategy_gates row from false → true.
--
-- IDEMPOTENT (Langston scope-review concern #4): ON CONFLICT DO UPDATE so
-- re-running on staging doesn't error.
--
-- Schema reference (verified on Supabase):
--   module_constants(module_name, exchange, asset_class, strategy, regime,
--                    constant_name, value::jsonb, updated_at, updated_by).
--   No value_type column. Numbers stored as jsonb numbers, booleans as jsonb booleans.
--
-- Rollback (DB-only — no code revert needed; cached sync API picks up
-- changes on next tick):
--
--   UPDATE module_constants
--   SET value = 'false'::jsonb, updated_at = NOW(), updated_by = 'b79.0d-rollback'
--   WHERE module_name = 'strategy_gates'
--     AND asset_class = 'xstock_spot'
--     AND strategy = 'orb'
--     AND constant_name = 'enabled';

BEGIN;

-- ── Layer-1 thresholds (7 rows) ──────────────────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by, updated_at)
VALUES
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'open_range_minutes',       '30'::jsonb,   'b79.0d-seed', NOW()),
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'breakout_buffer_atr_mult', '0.15'::jsonb, 'b79.0d-seed', NOW()),
  -- NOTE (Langston Step 4 F1): this is target-multiple-of-rangeHeight, NOT realized R:R.
  -- Realized R:R drifts ~1.3:1 because actual risk = entry−rangeLow > rangeHeight
  -- once breakout has cleared. Rename to target_range_multiple queued for B79.x.
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'risk_reward_ratio',        '2.0'::jsonb,  'b79.0d-seed', NOW()),
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'volume_multiple_min',      '1.5'::jsonb,  'b79.0d-seed', NOW()),
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'confidence_base',          '0.65'::jsonb, 'b79.0d-seed', NOW()),
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'range_atr_clamp_max',      '3.0'::jsonb,  'b79.0d-seed', NOW()),
  ('strategy.orb', '*', 'xstock_spot', 'orb', '*', 'active_window_hours',      '2'::jsonb,    'b79.0d-seed', NOW())
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

-- ── Flip strategy gate true ──────────────────────────────────────────────
-- Existing row from B79: (strategy_gates, *, xstock_spot, orb, *, enabled, false).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by, updated_at)
VALUES
  ('strategy_gates', '*', 'xstock_spot', 'orb', '*', 'enabled', 'true'::jsonb, 'b79.0d-seed', NOW())
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;

-- Verification query (run after COMMIT):
SELECT module_name, asset_class, strategy, constant_name, value
FROM module_constants
WHERE (module_name = 'strategy.orb' AND asset_class = 'xstock_spot')
   OR (module_name = 'strategy_gates' AND asset_class = 'xstock_spot' AND strategy = 'orb')
ORDER BY module_name, constant_name;
