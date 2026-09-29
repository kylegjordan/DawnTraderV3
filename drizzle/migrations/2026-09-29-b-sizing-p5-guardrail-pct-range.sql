-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-29 — B-SIZING-DEC-RESTORE P5 (#698): bound BOTH sizing percentages
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §13 (P5, F7;
-- Step 2 approved 2026-09-29, a0d58b57a).
--
-- Kyle's corrected PAPER-RESET-3000 holds each paper trade near $140-150 by adjusting
-- max_position_percent_pct BY HAND as the balance moves. Nothing bounded that column or its
-- sibling: 50 typed for 5 saved (trades 10x larger), an emptied UI box saved 0 (the sizer then
-- refuses every open), and 500 saved. The app-level rules RULE_012 / RULE_013 refuse the same
-- values at the API; these CHECKs are the database's own refusal, so no other writer can bypass it.
--
-- ⛔ NOT "p <= e": the sizer is B x e x p (active-position-sizing.ts:225-227), so p above e is
-- coherent (today's live row, p 30 / e 25, sizes 7.5% of balance a trade). PRE_AUDIT §13 F13.
--
-- Existing rows satisfy both (read 2026-09-29: paper 20.00 / 100.00, live 30.00 / 25.00), so the
-- constraints validate immediately. guardrails_v2 has two rows; the lock is brief.
--
-- Rollback: 2026-09-29-b-sizing-p5-guardrail-pct-range-rollback.sql (IN git, beside this file;
-- never listed in MANIFEST.txt).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE guardrails_v2
  ADD CONSTRAINT guardrails_v2_max_position_percent_pct_range
  CHECK (max_position_percent_pct > 0 AND max_position_percent_pct <= 100);

ALTER TABLE guardrails_v2
  ADD CONSTRAINT guardrails_v2_max_total_exposure_pct_range
  CHECK (max_total_exposure_pct > 0 AND max_total_exposure_pct <= 100);

COMMIT;
