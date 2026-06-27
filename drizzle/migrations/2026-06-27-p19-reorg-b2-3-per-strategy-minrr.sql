-- P19-reorg-B2.3 — per-(strategy × asset_class) minRR floors (replaces the flat global min_rr=2.5).
--
-- The single global expectancy_gates.min_rr=2.5 over-suppressed the strategy suite (most strategies are
-- structurally ~2.0 RR by design, so a 2.5 floor dropped them wholesale). This migration seeds a
-- data-derived per-strategy floor for each strategy that has >=200 guard-eval samples in its OWN asset
-- class (the live 48h+ guard-eval tracker), set a notch below that strategy's own measured mean RR:
--   spread strategy (rrMin != rrMax)  → floor = max(1.0, round(mean × 0.90, 2))
--   fixed-RR strategy (rrMin ≈ rrMax) → floor = max(1.0, round(mean − 0.05, 2))
-- Thin strategies (<200 samples) get NO per-strategy row → they inherit the per-class '*' DEFAULT (2.0,
-- the conservative replacement for the old flat 2.5). xStock floors derive from xStock's OWN data, never
-- a crypto borrow (Kyle 2026-06-23). morning_star/support_bounce/volatility_edge clamp to the 1.0 absolute
-- floor (sub-1.0 mean); Kyle decision (D) 2026-06-27 = KEEP ACTIVE, trade-vs-shelve deferred to Phase-25
-- 25-20 (judged on win-rate × RR − friction, not reward size) — this batch changes zero of those floors.
--
-- min_rr_unknown_floor = the FAIL-CLOSED substitution for an unrecognized strategy token at the gate
-- (reorg-B2.3 OBJ-5): the MAX per-class floor (crypto 2.88 / xStock 2.16) so a drifted token gets the
-- STRICTEST gate in its class, never the permissive '*' default; the global '*' row (2.88) is the
-- fallback when the asset_class itself is unresolved. DB-governed, not a TS literal (Kyle no-hardcoded).
--
-- Per-(strategy×class) (§11). exchange/regime = wildcard. Idempotent UPSERT (DO UPDATE) so re-apply
-- corrects values — including lowering the existing crypto/xstock '*' rows from 2.5 → 2.0.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  -- per-class min_rr DEFAULT (the '*' strategy) — lowered 2.5 → 2.0 (conservative default for thin/unseeded)
  ('expectancy_gates', 'min_rr', '2.0'::jsonb,  'crypto_spot', '*', '*', '*',                 NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '2.0'::jsonb,  'xstock_spot', '*', '*', '*',                 NOW(), 'reorg-b2-3'),
  -- crypto_spot per-strategy floors (data-derived, reorg-B2.3 §2)
  ('expectancy_gates', 'min_rr', '2.88'::jsonb, 'crypto_spot', '*', '*', 'mean_reversion',    NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '2.44'::jsonb, 'crypto_spot', '*', '*', 'vwap_pullback',     NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.95'::jsonb, 'crypto_spot', '*', '*', 'strong_bull_trend', NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.71'::jsonb, 'crypto_spot', '*', '*', 'range_trade',       NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '2.40'::jsonb, 'crypto_spot', '*', '*', 'reverse_impulse',   NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.39'::jsonb, 'crypto_spot', '*', '*', 'morning_star',      NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.0'::jsonb,  'crypto_spot', '*', '*', 'support_bounce',    NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.0'::jsonb,  'crypto_spot', '*', '*', 'volatility_edge',   NOW(), 'reorg-b2-3'),
  -- xstock_spot per-strategy floors (data-derived from xStock's OWN tracker data)
  ('expectancy_gates', 'min_rr', '1.96'::jsonb, 'xstock_spot', '*', '*', 'vwap_pullback',     NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.95'::jsonb, 'xstock_spot', '*', '*', 'sma_trend_ride',    NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '2.16'::jsonb, 'xstock_spot', '*', '*', 'pivot_shift',       NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.95'::jsonb, 'xstock_spot', '*', '*', 'vwap_bounce',       NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr', '1.0'::jsonb,  'xstock_spot', '*', '*', 'morning_star',      NOW(), 'reorg-b2-3'),
  -- unknown-token fail-closed floor (max-per-class) + global fallback (unresolved asset_class)
  ('expectancy_gates', 'min_rr_unknown_floor', '2.88'::jsonb, 'crypto_spot', '*', '*', '*',   NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr_unknown_floor', '2.16'::jsonb, 'xstock_spot', '*', '*', '*',   NOW(), 'reorg-b2-3'),
  ('expectancy_gates', 'min_rr_unknown_floor', '2.88'::jsonb, '*',           '*', '*', '*',   NOW(), 'reorg-b2-3')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by;

-- Verify the seed is complete (fail the migration loudly if incomplete).
DO $$
DECLARE n_minrr int; n_unk int;
BEGIN
  SELECT count(*) INTO n_minrr FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'min_rr';
  IF n_minrr < 15 THEN
    RAISE EXCEPTION 'reorg-B2.3 seed incomplete: expected >=15 expectancy_gates.min_rr rows (2 class-default + 13 per-strategy), found %', n_minrr;
  END IF;
  SELECT count(*) INTO n_unk FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'min_rr_unknown_floor';
  IF n_unk < 3 THEN
    RAISE EXCEPTION 'reorg-B2.3 seed incomplete: expected 3 min_rr_unknown_floor rows (crypto/xstock/global), found %', n_unk;
  END IF;
END $$;

COMMIT;
