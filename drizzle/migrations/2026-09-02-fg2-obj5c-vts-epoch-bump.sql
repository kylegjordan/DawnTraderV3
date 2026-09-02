-- F-G-2 / B-EXIT-TRANSACTABLE-SIDE — OBJ-5c: ONE calibration-epoch bump for source 'vts'
-- (2026-09-02, CC-C; Kyle: "mark the period where the change was made").
--
-- WHY: OBJ-5a (VTS books the OBSERVED exit mark on crypto rows instead of TEC's clamp) and
-- OBJ-5b (maker-entered VTS trades pay the MAKER entry fee at all three write paths) both
-- change what VTS records as netPnl. Learning aggregates reset (Welford) on epoch mismatch,
-- so pre- and post-change outcomes are never silently blended (calibration-epoch.ts v0).
--
-- WHICH ROWS: the CLASS-SCOPED 'vts' rows — NOT the wildcard. Measured live 2026-09-02:
--   vts/*           = 3  (b47-chunkA-regime-epoch-bump)   ← superseded, never resolved
--   vts/crypto_spot = 4  (b5-evgap-units)
--   vts/xstock_spot = 5  (b5-evgap-units)
-- The service resolves most-specific-wins, so a wildcard bump would have marked NOTHING
-- (pre-audit P14 said "wildcard row" — corrected here at the object). Both classes bump:
-- the fee change touches VTS rows of both, and the exit-booking seam holds xStock ROWS at the
-- clamp while their twins' fees still re-price.
--
-- BUMP-SCOPE RULE (Langston amendment 1): a change scoped to ONE source bumps THAT source only —
-- paper_sim and live are untouched. MECHANICS (amendment 3): the module_constants write path,
-- same form as 2026-06-12a-b5-evgap-units-epoch.sql. Idempotent via the updated_by guard.
-- Rollback: UPDATE ... SET value = to_jsonb((value)::text::numeric - 1) WHERE updated_by = 'fg2-obj5c-vts-cost-truth'.

UPDATE module_constants mc
SET value = to_jsonb((mc.value)::text::numeric + 1), updated_by = 'fg2-obj5c-vts-cost-truth'
WHERE mc.module_name = 'calibration_epoch'
  AND mc.constant_name = 'vts'
  AND mc.exchange = '*' AND mc.strategy = '*' AND mc.regime = '*'
  AND mc.asset_class IN ('crypto_spot', 'xstock_spot')
  AND mc.updated_by <> 'fg2-obj5c-vts-cost-truth';
