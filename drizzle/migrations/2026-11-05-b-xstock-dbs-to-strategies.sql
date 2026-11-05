-- B-XSTOCK-DBS-TO-STRATEGIES (#1235, pre-sprint stage 00 order 4, Kyle KD-2) — two settings that were literals in code.
-- Scope:     Claude Comms and Packages/Scope Files/B_XSTOCK_DBS_TO_STRATEGIES_SCOPE.md (r4a, Langston PROCEED)
-- Pre-audit: Claude Comms and Packages/Scope Files/B_XSTOCK_DBS_TO_STRATEGIES_PRE_AUDIT.md (P6)
--
-- (1) OBJ-1b: volatility_edge joins the B63 DBS routing-guard group. Its strong-DBS exclusion read a literal 0.35
--     (volatility-edge.ts) while its four siblings read strategy_dbs_routing_guards.dbs_min_threshold. Measured on
--     staging 2026-11-05: the group holds exactly 4 rows (defensive_hedge, morning_star, reverse_impulse,
--     strong_bull_trend), all 0.35 at exchange/asset_class/regime '*'; none for volatility_edge and no strategy '*'
--     row, so the new lookup REQUIRES this row. Same shape as the siblings; same value as the literal it replaces.
-- (2) OBJ-1c: the B63 Item-12 strong-trend geometry override (Variant E) that vts-runner.ts attached as literals
--     { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 } for vwap_pullback in crypto's quant-strong_trend lane.
--     Seeded for crypto_spot ONLY: xStock has no override today, and whether it gets one is an open decision (#1235 F2).
--     Module strategy.vwap_pullback is already warmed at startup (b72-warmup PREFETCH_MODULES).
--
-- Every value equals the literal the code used before this batch, so behaviour is unchanged. No fallback in code:
-- dt-deploy runs db:migrate BETWEEN build and pm2 restart, so these rows exist before the code that reads them.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('strategy_dbs_routing_guards', 'dbs_min_threshold',                       '0.35'::jsonb, '*',           '*', '*', 'volatility_edge', NOW(), 'b-xstock-dbs-to-strategies'),
  ('strategy.vwap_pullback',      'strong_trend_override_stop_atr_mult',     '4.0'::jsonb,  'crypto_spot', '*', '*', 'vwap_pullback',   NOW(), 'b-xstock-dbs-to-strategies'),
  ('strategy.vwap_pullback',      'strong_trend_override_target_r_multiple', '3.0'::jsonb,  'crypto_spot', '*', '*', 'vwap_pullback',   NOW(), 'b-xstock-dbs-to-strategies')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE updated_by = 'b-xstock-dbs-to-strategies';
  IF n <> 3 THEN
    RAISE EXCEPTION 'B-XSTOCK-DBS-TO-STRATEGIES seed incomplete: expected 3 rows, found %', n;
  END IF;
END $$;

COMMIT;
