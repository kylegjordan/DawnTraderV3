-- ROLLBACK for 2026-09-13-b-geometry-reach-baseline-per-strategy-reach.sql
--
-- That migration seeds ONLY the three `reach_atr_max_unknown_floor` rows — it seeds ZERO per-strategy
-- ceilings (the four derived values were refused on a measured blast radius; see its header). So this
-- rollback removes the three floor rows and nothing else, and it must NOT touch the two pre-existing
-- `reach_atr_max` class-default rows (crypto 4.0 / xStock 4.0), which predate this batch entirely.
--
-- ⚠️ HALF A REVERT BY DESIGN, STATED RATHER THAN LEFT IMPLIED. The CODE change (getPerClassTargetGate
-- resolving reach per-(strategy x class) from a single canonicalization) is reverted by git, not SQL.
--   • SQL first, code still new  → the unknown-TOKEN path now THROWS at the gate instead of resolving
--     a floor. Loud and fail-closed, which is the right direction for a rollback, but it IS a
--     behaviour change: roll the code back in the same window.
--   • Code first, rows still present → the read site hardcodes strategy '*' again and the floor rows
--     become inert. Harmless.
-- The forward migration carries the matching constraint: MIGRATION FIRST, THEN RESTART.
--
-- Scoped by constant_name AND updated_by so a concurrent seed from another batch is never collaterally
-- deleted — the path being right is not the same as the content being yours.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'expectancy_gates'
  AND constant_name = 'reach_atr_max_unknown_floor'
  AND updated_by = 'b-geometry-reach-baseline';

-- Confirm the pre-batch state: the two class defaults survive untouched, no floor rows remain, and
-- no per-strategy ceiling was ever created by this batch to leave behind.
DO $$
DECLARE n_default int; n_strategy int; n_unk int;
BEGIN
  SELECT count(*) INTO n_default FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max' AND strategy = '*';
  SELECT count(*) INTO n_strategy FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max' AND strategy <> '*'
      AND updated_by = 'b-geometry-reach-baseline';
  SELECT count(*) INTO n_unk FROM module_constants
    WHERE module_name = 'expectancy_gates' AND constant_name = 'reach_atr_max_unknown_floor';
  IF n_default <> 2 THEN
    RAISE EXCEPTION 'rollback left % class-default reach_atr_max rows, expected 2 (crypto + xstock)', n_default;
  END IF;
  IF n_unk <> 0 THEN
    RAISE EXCEPTION 'rollback incomplete: % reach_atr_max_unknown_floor rows remain', n_unk;
  END IF;
  IF n_strategy <> 0 THEN
    RAISE EXCEPTION 'unexpected: % per-strategy reach rows attributed to this batch, which seeded none', n_strategy;
  END IF;
END $$;

COMMIT;
