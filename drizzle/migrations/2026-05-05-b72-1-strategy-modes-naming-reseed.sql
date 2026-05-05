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
