-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.SCORING Migration 1 — SQE per-class promotion (8 new rows)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Per pre-audit §5.1 + Langston Step 2 ACK (APPROVED FOR STEP 3 with 5
-- non-blocking clarifications + R-2 deploy-window revision).
--
-- This is the PROMOTION half of the TWO-STEP sequence Langston pushed back
-- on at Step 1 D-5. The wildcard retirement happens in B79.0n.SCORING.b after
-- a 48h verify-gate confirming the OBJ-4 static-mirror counter stays at zero.
--
-- Rows seeded:
-- (A) 4 rows: crypto_perp + xstock_perp coverage for min_final_score +
--     min_regime_weight (currently only crypto_spot + xstock_spot promoted per
--     B79.0a). Day-1 values match wildcard (0.35 / 0.30).
-- (B) 4 rows: crypto_spot promotion for adx_min, di_min_quant, di_min_pattern,
--     momentum_min (currently CODE-side hardcoded; promoted to DB per
--     CLAUDE.md §11 no-hard-coded-fallback discipline). Values verbatim per
--     Langston D-4 (no value tuning in structural-promotion batch).
--
-- No-touch-fence note (Langston R-4): Migration inserts NEW crypto_spot rows
-- but values are IDENTICAL to in-code hardcoded defaults at promotion time
-- (25/25/10/0.005). Structural promotion only — no value tuning. Any future
-- value change is a separate batch with its own empirical justification.
--
-- Idempotent: ON CONFLICT DO NOTHING + DO-block assertion gates on
-- `updated_by='B79.0n.SCORING'` stamp.
--
-- Rollback: see companion -rollback.sql

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- ─── (A) 4 rows: perp coverage for the 2 already-promoted keys ───
  ('sqe_config', '*', 'crypto_perp', '*', '*', 'min_final_score',   '0.35'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_perp', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'xstock_perp', '*', '*', 'min_final_score',   '0.35'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'xstock_perp', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0n.SCORING'),

  -- ─── (B) 4 rows: crypto_spot numeric-threshold promotion (values verbatim from code) ───
  -- crypto_spot baseline for SQE quant/pattern thresholds. Previously code-side
  -- defaults in signal-orchestrator. Promoted to DB so operator-flip is
  -- per-class via UPSERT without code change.
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'adx_min',         '25'::jsonb,    'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'di_min_quant',    '25'::jsonb,    'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'di_min_pattern',  '10'::jsonb,    'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'momentum_min',    '0.005'::jsonb, 'B79.0n.SCORING')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ── Verification: all 8 rows must be present with updated_by stamp ──
DO $$
DECLARE
  expected_new int := 8;
  actual int;
BEGIN
  SELECT COUNT(*) INTO actual FROM module_constants
   WHERE module_name='sqe_config' AND updated_by='B79.0n.SCORING';
  IF actual != expected_new THEN
    RAISE EXCEPTION 'B79.0n.SCORING Migration 1 assertion failed: expected % new rows, found %. Pre-existing override may exist; manual review required.', expected_new, actual;
  END IF;
END $$;

COMMIT;
