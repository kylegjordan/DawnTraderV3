-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-30 — B-SIZING-DEC-RESTORE increment 2e (#698): retire the cap's universe split and the pattern size cap
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §20 (Pe4, Pe5) as ruled in §20.4.
--
-- Kyle, 2026-09-30:
--   * the per-underlying cap's A/B universe split goes OFF for good — the at-most-2-per-coin rule covers every coin.
--     `b67_3_universe_split_active` exempted the "control" half of the symbols (160 of 321 traded) for an experiment that
--     never produced a data point. The code no longer reads the row (per-underlying-cap.ts), so it goes.
--   * the pattern-list size cap goes OFF — "I don't want to forget that it's on later if we increase the max position
--     percent". `pattern_pool_gates.pattern_max_position_pct` (0.0667, both classes) capped a pattern-list trade's share
--     of the exposure budget; the sizer no longer reads it (active-position-sizing.ts). The pattern pool's quality floor
--     (`pattern_final_score_min`) is a different gate and STAYS.
--
-- Rollback: 2026-09-30-b-sizing-inc2e-retire-split-and-pattern-cap-rollback.sql (IN git, beside this file; never listed in
-- MANIFEST.txt). ⚠️ Roll 2e's code back FIRST: the pre-2e code reads these rows fail-hard.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM module_constants
 WHERE (module_name = 'per_underlying_cap' AND constant_name = 'b67_3_universe_split_active')
    OR (module_name = 'pattern_pool_gates' AND constant_name = 'pattern_max_position_pct');

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE (module_name = 'per_underlying_cap' AND constant_name = 'b67_3_universe_split_active')
      OR (module_name = 'pattern_pool_gates' AND constant_name = 'pattern_max_position_pct');
  IF n <> 0 THEN
    RAISE EXCEPTION 'b-sizing-inc2e: % retired row(s) remain after the delete', n;
  END IF;
  -- The cap's two surviving rows must still be there (the code reads them fail-hard).
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'per_underlying_cap' AND constant_name IN ('b67_3_enabled', 'b67_3_max_concurrent_per_underlying');
  IF n <> 2 THEN
    RAISE EXCEPTION 'b-sizing-inc2e: expected the 2 surviving per_underlying_cap rows, found %', n;
  END IF;
END $$;

COMMIT;
