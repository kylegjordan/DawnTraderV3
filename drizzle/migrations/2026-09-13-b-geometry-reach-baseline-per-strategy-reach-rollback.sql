-- ROLLBACK for 2026-09-13-b-geometry-reach-baseline-per-strategy-reach.sql
--
-- Removes the four per-strategy crypto reachability ceilings and all three unknown-token floor rows,
-- returning `reach_atr_max` to its pre-batch state: the two class-default rows (crypto 4.0 / xStock 4.0),
-- which this migration never touched and which this rollback must NOT delete.
--
-- ⚠️ THIS ROLLBACK IS ONLY HALF A REVERT, AND THAT IS DELIBERATE — SAY IT RATHER THAN LEAVE IT IMPLIED.
-- The CODE change (getPerClassTargetGate resolving reach per-(strategy × class)) is reverted by git,
-- not by SQL. Applying this file ALONE is SAFE in both orders, and here is why each direction holds:
--   • SQL first, code still new  → every strategy falls back to the per-class '*' row via
--     most-specific-wins, i.e. exactly the pre-batch 4.0 ceiling. The one live risk is the unknown-TOKEN
--     path: with `reach_atr_max_unknown_floor` deleted, a drifted token would make
--     getCachedNumberRequired THROW at the gate rather than silently pass. That throw is LOUD and
--     fail-closed, which is the correct direction for a rollback, but it is a behaviour change — so if
--     you are rolling back the DB you should roll back the code in the same window.
--   • Code first, rows still present → the read site hardcodes strategy '*' again, so the per-strategy
--     rows become unreachable and inert. Harmless; they are simply ignored, which is precisely the
--     NO-OP state that made this batch necessary in the first place.
--
-- Scoped by constant_name AND updated_by so a concurrent seed from another batch is never collaterally
-- deleted — the path being right is not the same as the content being yours.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'expectancy_gates'
  AND constant_name = 'reach_atr_max'
  AND strategy <> '*'
  AND updated_by = 'b-geometry-reach-baseline';

DELETE FROM module_constants
WHERE module_name = 'expectancy_gates'
  AND constant_name = 'reach_atr_max_unknown_floor'
  AND updated_by = 'b-geometry-reach-baseline';

-- Confirm the pre-batch state is restored: the two class defaults survive, nothing per-strategy remains.
DO $$
DECLARE n_default int; n_strategy int; n_unk int;
BEGIN
  SELECT count(*) INTO n_default FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max' AND strategy = '*';
  SELECT count(*) INTO n_strategy FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max' AND strategy <> '*';
  SELECT count(*) INTO n_unk FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor';
  IF n_default <> 2 THEN
    RAISE EXCEPTION 'rollback left % class-default reach_atr_max rows, expected 2 (crypto + xstock)', n_default;
  END IF;
  IF n_strategy <> 0 OR n_unk <> 0 THEN
    RAISE EXCEPTION 'rollback incomplete: % per-strategy reach rows and % unknown-floor rows remain', n_strategy, n_unk;
  END IF;
END $$;

COMMIT;
