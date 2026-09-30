-- B-PRICE-SIDE-BY-JOB row 8a-P4c, increment 3 (plan §C3, CC-C, 2026-09-30) — the VTS xStock exit guard's spread ceiling,
-- and ONE calibration-epoch step per VTS class for the whole increment.
--
-- (1) vts_xstock_touch.exit_max_spread_fraction (xstock_spot) = 0.0107. The risk-derived spread ceiling of A4's formula,
--     spread <= 2·D·(1+f), D = the p10 stop distance of VTS xStock trades opened in the 14 days to the build, f = 0.10:
--     measured 2026-09-30 ~04:40Z over 3,983 trades opened 2026-09-16 → 2026-09-30: p10 0.4882% ⇒ 2 × 0.004882 × 1.10 =
--     1.074% (PREVIOUSLY STATED 1.11% at A4, 2,805 trades to 2026-09-22 — re-derived at build, as A4 required).
--     The ONE standard VTS carries that paper does not (paper judges a quote with the stateful book-state guard); the age
--     ceiling is paper's own (mark_staleness.*), so VTS owns no age knob. A missing row ⇒ no xStock VTS exit decision
--     (getCachedNumberRequired throws; the guard fails closed).
-- (2) calibration_epoch vts: crypto_spot 6 → 7 and xstock_spot 8 → 9. Increment 3 moves what VTS records in both classes:
--     xStock exits trigger and book on the guarded bid (P8a/P8b), and booked friction becomes per-leg (P14, #1118 — crypto
--     VTS exits have paid their exit half-spread twice since 2026-09-15). The epoch is resolved at CLOSE and friction is
--     recomposed at close, so every close after the deploy carries one rule (Langston BLOCKER-1, §C3.4). Class-scoped rows
--     (most-specific wins); paper_sim and live untouched (the bump-scope rule). Idempotent via the updated_by guard.
-- Rollback: 2026-09-30-b-price-side-8a-p4c-inc3-rollback.sql.

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('vts_xstock_touch', '*', 'xstock_spot', '*', '*', 'exit_max_spread_fraction', '0.0107'::jsonb, 'b-price-side-8a-p4c-inc3')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

UPDATE module_constants mc
SET value = to_jsonb((mc.value)::text::numeric + 1), updated_by = 'b-price-side-8a-p4c-inc3', updated_at = NOW()
WHERE mc.module_name = 'calibration_epoch'
  AND mc.constant_name = 'vts'
  AND mc.exchange = '*' AND mc.strategy = '*' AND mc.regime = '*'
  AND mc.asset_class IN ('crypto_spot', 'xstock_spot')
  AND mc.updated_by <> 'b-price-side-8a-p4c-inc3';

COMMIT;
