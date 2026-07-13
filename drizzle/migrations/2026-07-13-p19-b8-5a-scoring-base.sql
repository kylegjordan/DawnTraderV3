-- P19-B8.5a (OBJ-1, FIX-1) — seed the flat measured pWin base rate that replaces finalScore
-- as decideMakerTaker's signalStrength (de-contamination: finalScore is anti-predictive,
-- r=−0.140, and was tinting chosen_net_ev — the rank key AND both EV gates' number).
--
-- PINNED DERIVATION (re-derivable — CC-A probe, commit 8c5383018; P25_SCORING_STACK_PRESTUDY §4):
--   population = 12,140 closed post-B62 VTS trades (JSON store), win = netProfit > 0, Wilson 95% CIs:
--     POOLED       0.3065 [0.2984, 0.3148]  (w=3,721 / n=12,140)  → the '*' wildcard row (0.307)
--     crypto_spot  0.2955 [0.2819, 0.3094]  (n=4,244)             → 0.295
--     xstock_spot  0.3167 [0.3033, 0.3304]  (n=4,506)             → 0.317
--   (unknown-class legacy rows 0.3068, n=3,390 — in POOLED, not attributable per-class.)
-- CAVEATS (honest, per the pin): a CONSERVATIVE anchor — win is NET-of-friction (under-admits,
-- safe direction); source outcomes carry the known VTS-era contamination (mode-scaled exits +
-- the fake-DI kernel feed). This is a PINNED PLACEHOLDER, not a calibration — the replacement
-- is the Phase-25 calibrated pWin (#399a / 25-4). DB knob per rule 15: recalibration is a SQL
-- UPDATE, never a code edit. Read fail-hard via getCachedNumberRequired('scoring_base', ...);
-- module warmed at startup (b72-warmup PREFETCH_MODULES).
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('scoring_base', 'flat_pwin_base', '0.295'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'p19-b8-5a'),
  ('scoring_base', 'flat_pwin_base', '0.317'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b8-5a'),
  ('scoring_base', 'flat_pwin_base', '0.307'::jsonb, '*',           '*', '*', '*', NOW(), 'p19-b8-5a')
ON CONFLICT DO NOTHING;
