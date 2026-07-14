-- P19-B8.5 (gate-12, Langston flip-blocker) — seed EXPLICIT strategy_gates rows for
-- crypto_spot. Today the class has ZERO rows and the per-class strategy gate
-- (canonical-regime-strategy-map.ts isStrategyEnabledForAssetClass) treats an absent
-- row as DEFAULT-OPEN — meaning activation would silently run the FULL strategy set.
-- This seed makes today's implicit default EXPLICIT (all 19 canonical strategies
-- enabled=true — the sealed exploration posture: the full set trades in paper for
-- data; the two flagged-for-watch sub-1.0-RR strategies stay ENABLED per roadmap
-- 25-19, deliberately NOT pre-disabled). ZERO behavior change in either mode
-- (mode-blind gate by design; live activation gets its own Phase-21 switchboard
-- review). Companion: the setAssetClassActive gate-12 refusal (fail-loud on an
-- empty class). Keys = the STRATEGY_DISPLAY_NAMES SSOT, 19 strategies.
-- ORB note: orb is xstock-scoped by design but the gate row is seeded true for
-- crypto uniformity — the strategy itself never fires on crypto (its detect is
-- calendar/class-scoped), so the row is inert; explicit > absent.
INSERT INTO module_constants (module_name, constant_name, value, exchange, asset_class, strategy, regime, updated_by)
SELECT 'strategy_gates', 'enabled', 'true'::jsonb, '*', 'crypto_spot', s.name, '*', 'p19-b8-5-gate12-seed'
FROM (VALUES
  ('sma_trend_ride'), ('vwap_pullback'), ('morning_star'), ('pivot_shift'),
  ('mean_reversion'), ('reverse_impulse'), ('defensive_hedge'), ('inside_bar_reversal'),
  ('range_trade'), ('support_bounce'), ('abcd_long'), ('adaptive_flow'),
  ('breakout'), ('vwap_bounce'), ('volatility_edge'), ('dhma'),
  ('liquidity_trap'), ('strong_bull_trend'), ('orb')
) AS s(name)
ON CONFLICT DO NOTHING;
