-- P19-B7.1 (OBJ-4) — shadow-layer decision-time ranker outputs for the Phase-25 selection-IC.
--
-- The reorg-B4 shadow layer already captures the decision-time score inputs + the realized
-- r_multiple at close. B7.1 adds the NEW ranker's decision-time outputs so Phase-25 can measure
-- whether the predicted R-multiple actually orders the realized R-multiple (the selection-IC
-- GO/NO-GO that proves the ranker beats friction), and segment that measurement honestly:
--
--   predicted_r_multiple   — the rank-time R = netEV ÷ risk_price the ranker assigned at decision
--                            (the predicted quality; realized r_multiple is the existing outcome col).
--   pwin_floored           — pWin was floor-defaulted (NULL dbsScore on a strong-trend path), NOT
--                            real-DI-derived → a floored-pWin candidate is NOT cross-class comparable
--                            to a real-DI crypto candidate until Phase-25 calibration (segments the IC).
--   cross_class_promotion  — this cycle's rank-0 winner is a different asset class than the rank-1
--                            runner-up → the cross-class selection the floored-pWin limitation bears
--                            on; tagged so the limitation is auditable, not just stated (Langston Q2).
--
-- Added to BOTH grains: rtb_shadow_pairings (trade-entity) + rtb_shadow_pool_members (per-cycle event).
-- All telemetry-only (no learning consumer reads them); DORMANT until paper-active trading is on.

BEGIN;

ALTER TABLE rtb_shadow_pairings
  ADD COLUMN IF NOT EXISTS predicted_r_multiple   numeric(10,4),
  ADD COLUMN IF NOT EXISTS pwin_floored           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_class_promotion  boolean NOT NULL DEFAULT false;

ALTER TABLE rtb_shadow_pool_members
  ADD COLUMN IF NOT EXISTS predicted_r_multiple   numeric(10,4),
  ADD COLUMN IF NOT EXISTS pwin_floored           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_class_promotion  boolean NOT NULL DEFAULT false;

-- Verify all 6 columns landed (3 per table) — fail loudly if incomplete.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name IN ('rtb_shadow_pairings', 'rtb_shadow_pool_members')
     AND column_name IN ('predicted_r_multiple', 'pwin_floored', 'cross_class_promotion');
  IF n < 6 THEN
    RAISE EXCEPTION 'P19-B7.1 shadow-r-multiple incomplete: expected 6 columns, found %', n;
  END IF;
END $$;

COMMIT;
