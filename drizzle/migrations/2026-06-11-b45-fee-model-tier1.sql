-- B-4.5 (2026-06-11) — DB-governed fee model, Kraken cross-platform Tier 1.
-- Foundation: Cross-Session Briefs/KRAKEN_TIERED_FEE_CHANGE_ANALYSIS_2026-06-08.md
-- (tier table verified from Kyle's PDF; account standing CONFIRMED Tier 1 —
-- ~$835 AoP, negligible 30-day volume → 0.80% taker / 0.40% maker under the
-- July-2026 cross-platform schedule).
--
-- Storage convention: DECIMAL (0.008 = 0.80%), matching the friction modules'
-- type contract (AssetClassFrictionModel rates are decimals) and the existing
-- module_constants numeric rows (B-4.5 pre-audit Q2, Langston-settled).
--
-- Per-class rows deliberately carry IDENTICAL spot values: the cross-platform
-- tier is ACCOUNT-WIDE, so crypto_spot == xstock_spot is structurally correct.
-- The asset_class dimension exists because future *_perp classes have
-- genuinely different (futures) fee columns.
--
-- Seeded NOW (pre-July-9) per Langston scope-ACK Q1: over-estimating fees only
-- rejects marginal trades (asymmetric failure mode); the OLD schedule is also
-- under-modeled at this account size; the calibration-epoch bump at deploy
-- documents the shift regardless of calendar.
--
-- Maker rate stored for completeness + the future Phase-19 maker-entry flip
-- (STRATEGIC_DIRECTIONS_AND_AI_EDGE.md §1 direction B); it has ZERO live
-- consumers today — the engine takes liquidity, the model prices taker both
-- legs (B_4_5_PRE_AUDIT.md §0 decision rule).
--
-- Consumers: getFrictionForAssetClass merge (cost-model.ts) via the warmed B72
-- cache ('fee_model' in PREFETCH_MODULES); missing row = hard-fail at boot
-- (warmup assertion) AND at read (no silent fallback).
--
-- Tier automation: DEFERRED to Phase-21 prep (scope objective 4) — until live
-- trading exists the account is durably Tier 1; manual DB update under
-- ADJUSTMENT_FRAMEWORK governance is the correct mechanism.
--
-- Rollback: 2026-06-11-b45-fee-model-tier1-rollback.sql (operator-only).

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by
) VALUES
  ('fee_model', '*', 'crypto_spot', '*', '*', 'spot_taker_fee', '0.008'::jsonb, 'b45-tier1-seed'),
  ('fee_model', '*', 'crypto_spot', '*', '*', 'spot_maker_fee', '0.004'::jsonb, 'b45-tier1-seed'),
  ('fee_model', '*', 'xstock_spot', '*', '*', 'spot_taker_fee', '0.008'::jsonb, 'b45-tier1-seed'),
  ('fee_model', '*', 'xstock_spot', '*', '*', 'spot_maker_fee', '0.004'::jsonb, 'b45-tier1-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;
