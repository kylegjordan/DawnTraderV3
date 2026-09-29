-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-29 — B-SIZING-DEC-RESTORE increment 2b (G1, #698): the position % gets a FLOOR OF 1
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §15.1 G1 and Langston's
-- ruling §15.4 (at 129d1c4c3). Runs AFTER 2026-09-29-b-sizing-p5-guardrail-pct-range.sql (increment 1),
-- which creates the constraint this replaces, and after 2a, which retires max_open_positions.
--
-- WHY: since 2a the number of positions that can be open is DERIVED, floor(100 / max_position_percent_pct),
-- and 2a drops the old [1, 20] CHECK on max_open_positions — the database's only hard bound on concurrency.
-- Increment 1's CHECK allows 0 < p <= 100, so a decimal slip to 0.5 would derive 200 positions.
--
-- WHAT THE FLOOR IS FOR, AND WHAT IT IS NOT (Langston, §15.4):
--   * headroom — p = 1 still holds a $145 trade up to a ~$14,950 balance, well past the $3,000 reset;
--   * refusing a decimal slip below 1.
--   * It is NOT a micro-position guard: at $3,000 and 100% exposure, p = 1 is 100 slots of ~$29.10. The size
--     band alert (increment 3) is the only instrument that sees DOLLARS, on both sides (low and high).
--   * The ceiling stays 100. An upper typo (50 for 5) is not refused by any bound without refusing live's
--     legitimate 30; the paper band alert catches it on the next close or start. ⛔ A LIVE upper typo has NO
--     detector — the band alert reads paper only. Phase 21's; recorded so this ceiling is never cited as live cover.
-- max_total_exposure_pct keeps increment 1's 0 < e <= 100: an e typo is loud (the budget collapses and the
-- band alert fires), so it needs no floor of its own.
--
-- Existing rows, enumerated on staging 2026-09-29 (ALL rows, not paper + live): 2 rows — live 30.00, paper 20.00.
-- The pre-check below refuses with a count rather than letting ADD CONSTRAINT fail on an unnamed row.
--
-- Rollback: 2026-09-29-b-sizing-inc2b-position-pct-floor-rollback.sql (IN git, beside this file; never listed
-- in MANIFEST.txt). It restores increment 1's 0 < p <= 100 form and is independent of 2a's rollback.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM guardrails_v2
   WHERE max_position_percent_pct < 1 OR max_position_percent_pct > 100;
  IF bad > 0 THEN
    RAISE EXCEPTION 'b-sizing-inc2b: % guardrails_v2 row(s) hold max_position_percent_pct outside [1, 100]; fix them before this migration', bad;
  END IF;
END $$;

ALTER TABLE guardrails_v2 DROP CONSTRAINT guardrails_v2_max_position_percent_pct_range;

ALTER TABLE guardrails_v2
  ADD CONSTRAINT guardrails_v2_max_position_percent_pct_range
  CHECK (max_position_percent_pct >= 1 AND max_position_percent_pct <= 100);

COMMIT;
