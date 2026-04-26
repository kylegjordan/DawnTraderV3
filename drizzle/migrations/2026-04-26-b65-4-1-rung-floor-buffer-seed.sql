-- B65.4.1 Hotfix Migration — Add rung_floor_slippage_buffer_multiplier seed
--
-- Per Kyle directive 2026-04-26 (B65.4 ladder counterfactual analysis):
--
-- The original B65.4 ladder formula set rung floors via
-- `target * (1 - totalCost / 2)` — a "breakeven-after-costs" floor BELOW the
-- just-hit target. Live data over the first 5 closed laddered trades showed
-- the ladder LOST $11 in absolute terms vs the just-take-target counterfactual
-- because reversals off target were exiting BELOW the original target.
--
-- B65.4.1 hotfix changes the formula to:
--   floor = target * (1 + slippage * slippageBufferMultiplier)
--
-- This places the floor ABOVE the target by exactly enough to absorb the
-- typical stop-trigger slippage on a reversal — actual fill on a stop-out is
-- at-or-above the original target. Multi-rung ratcheting still works as
-- before (the design's payoff scenario is preserved).
--
-- The multiplier is exposed as a module_constants entry so it can be tuned
-- per (asset_class, exchange, regime, strategy) without code redeploy.
--
-- Seed value 1.0 = exactly the per-pair slippage estimate.
-- Higher values widen the buffer (more trigger sensitivity, larger gain locked
-- but stop fires less easily on whipsaw). Lower values tighten the buffer
-- (less protection from slippage but stop fires earlier).
--
-- Rollback: 2026-04-26-b65-4-1-rollback.sql

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('trailing_exit', '*', '*', '*', '*', 'rung_floor_slippage_buffer_multiplier',
   '1.0'::jsonb,
   'b65.4.1-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;
