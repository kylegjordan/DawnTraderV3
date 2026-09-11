-- ⛔⛔ SUPERSEDED FOR xSTOCK — READ BEFORE TRUSTING ANYTHING BELOW (B-XSTOCK-FEE-CONTRACT, #1010, 2026-09-11).
-- The two xstock_spot rows this file seeds (0.008 / 0.004) are WRONG and are corrected by
-- 2026-09-11-b-xstock-fee-contract.sql to taker 0.0010 / maker -0.0002 (a rebate) — Kraken's Pro xStocks
-- schedule, account-confirmed 2026-09-06 (1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md §2).
-- Three premises in the header below were measured false:
--   1. "the cross-platform tier is ACCOUNT-WIDE, so crypto_spot == xstock_spot is structurally correct" —
--      the rung is a property of (account, PRODUCT); xStocks has its own two-rung schedule.
--   2. "over-estimating fees only rejects marginal trades" — 8x the taker fee and an inverted maker sign
--      distorted admission, mode choice and RTB ranking, not just marginal trades.
--   3. maker "has ZERO live consumers today" — false since P19-B7.2 (the maker/taker decision and maker-leg booking).
-- This file is left as it ran (it is recorded in _migrations by name and never re-runs); the correction is
-- the later migration, so a fresh database applies this seed and then the fix, and ends correct.
--
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
