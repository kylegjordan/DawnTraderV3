-- P19-B-FEEVIABILITY OBJ-4/OBJ-5 — THE MARK (Langston-approved, both rows together, one window)
-- First per-class crypto_spot rows in either module. The '*' global rows are NOT touched:
-- sma_trend_ride is live on xStock (own xstock_spot min_rr 1.95) and must keep serving 2.0/2.5.
-- Resolver: getCachedNumbersForModule groups by constantName best-per-group, so a partial
-- per-class overlay leaves every other constant resolving from '*' (Langston-verified).
-- Pre-registered post-mark check: sma_trend_ride crypto 'unreachable' share 0% -> ~9%;
-- >15% means the VTS geometry did not transfer and the row is revisited.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by)
VALUES
  ('strategy.volatility_edge', '*', 'crypto_spot', 'volatility_edge', '*', 'target_exit_atr_multiplier', '3.125'::jsonb, NOW(), 'P19-B-FEEVIABILITY OBJ-4'),
  ('strategy.sma_trend_ride',  '*', 'crypto_spot', 'sma_trend_ride',  '*', 'break_target_r_multiple',    '2.5'::jsonb,   NOW(), 'P19-B-FEEVIABILITY OBJ-4')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;
