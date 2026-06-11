-- B-5 Obj-15a audit Finding A2 (2026-06-12) — vts calibration-epoch bump,
-- BOTH classes, paired with the vts-service netPnlPct units fix.
--
-- WHY: the VTS close hook converted realized net P&L to percent as
-- (pnl/notional)*100, but the only caller passes pnl as the realized NET
-- FRACTION of entry price (vts-runner :2451) — realized percent was
-- understated by ~notional (~100x). The B67.4 per-(regime,strategy) outcome
-- EMA accrued that wrong realized side since 2026-05-01, and the B-5 EV-gap
-- input would have been permanently suppressed once its window warmed
-- (realized/predicted ratio ~ 1/notional). The code fix makes
-- netPnlPct = pnl*100; this bump starts a new lineage so the
-- outcome-feedback store's epoch-mismatch Welford reset partitions the
-- polluted streams (store semantics: Welford resets on epoch change, EMA
-- continues — documented limitation).
--
-- COST NOTE: per-(source,class) epochs were bumped by B-4.5 yesterday
-- (fee-model) and B-5 (xstock vts 4) — at most ~1 day of post-bump vts
-- lineage is re-partitioned. Cheapest moment to do this correctly.
--
-- xstock_spot has a class row (seeded by the B-5 migration §9) → UPDATE it.
-- crypto_spot rides the wildcard row → materialize a class row at
-- wildcard+1 (same INSERT-SELECT pattern as B-5 §9); the wildcard row
-- remains any future class's epoch.

-- Idempotent: the updated_by guard makes a re-run a no-op (live state at
-- write time: wildcard vts=3, xstock_spot vts=4, no crypto_spot row).
UPDATE module_constants mc
SET value = to_jsonb((mc.value)::text::numeric + 1), updated_by = 'b5-evgap-units'
WHERE mc.module_name = 'calibration_epoch' AND mc.asset_class = 'xstock_spot'
  AND mc.constant_name = 'vts' AND mc.updated_by <> 'b5-evgap-units';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
SELECT 'calibration_epoch', '*', 'crypto_spot', '*', '*', 'vts', to_jsonb((mc.value)::text::numeric + 1), 'b5-evgap-units'
FROM module_constants mc
WHERE mc.module_name = 'calibration_epoch' AND mc.asset_class = '*' AND mc.constant_name = 'vts'
ON CONFLICT DO NOTHING;

-- ── Audit side-probe (b) resolution: legacy wildcard AGGRESSIVE row ─────────
-- governance_modes */aggressive_mode_confidence_floor (0.80, b72-step3-commit-b
-- 2026-05-05) predates the B-5 per-class AGGRESSIVE contract. The B-5 class
-- rows (0.60, b5-amr) win via most-specific-wins, so this row is inert for
-- crypto_spot/xstock_spot today — but it would silently serve any FUTURE
-- class's read before that class is seeded (the silent-fallback pattern
-- CLAUDE.md §5.15 bans, and a violation of the B-5 contract: class-less
-- AGGRESSIVE access THROWS by design; the 11.7S suite asserts legacy mapping
-- never produces it). Caught by the Obj-15a audit probe; removing it makes
-- the fail-hard behavior real for unseeded classes.
DELETE FROM module_constants
WHERE module_name = 'governance_modes' AND asset_class = '*'
  AND constant_name = 'aggressive_mode_confidence_floor';
