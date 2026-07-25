-- B-RETIRED-SCORE-REMOVAL (#558, A1) — 2026-07-25 — CC-A, Langston-reviewed
--
-- Makes rtb_signals.final_score NULLABLE and retires the ranker control-arm selector.
--
-- WHY (Kyle-ruled, "remove everything"): finalScore is the RETIRED ranking metric (measured
-- anti-predictive, r=-0.140). The live ranker is the expected R-multiple (r_multiple). This
-- batch's A1 removes the two column WRITERS (queue-insert `insertData` + the batch-refresh
-- `bulkUpdates`) in ready_to_buy_service.ts and re-points every reader off the column:
--   • the queue tiebreaker now decides on r_multiple (Kyle's ruling), not finalScore;
--   • getQueuedSignals orders by queuedAt (the decision-grade ranking is downstream in
--     getRankedSignals via computeRankKey → r_multiple);
--   • the ranker's `confidence` + `ranking_score` control arms (the last finalScore readers
--     in the ranker) are removed, collapsing to the sole r_multiple arm.
-- Once the writers are gone the column would violate NOT NULL on the next insert, so it must
-- become nullable HERE. The column itself is DROPPED in Phase B (a later slice), after the
-- SQE-input + metadata + telemetry readers are retired.
--
-- active_ranker: with the control arms gone, `getActiveRanker()` and the pluggable-ranker
-- selection are removed from code; the `active_ranker` module_constants row has no reader left,
-- so it is deleted here (§15 — no lingering legacy config).
--
-- ⚠️ DEPLOY ORDERING — LOAD-BEARING: apply this BEFORE (or with) the code that stops writing
-- final_score. This is the OPPOSITE ordering of a DROP COLUMN migration: here the new code
-- omits final_score on insert, so the column must already be nullable when that code serves
-- traffic (a NOT NULL column with no supplied value fails the insert). db-migrate runs as part
-- of the staging deploy, before the restarted engine takes traffic — the safe window.
--
-- Rollback: 2026-07-25-b-retired-score-removal-final-score-nullable-rollback.sql
--   (re-adds NOT NULL — only valid while the OLD writers still exist; restores the active_ranker
--    row to its prior value. Do NOT roll back over code that has stopped writing final_score.)

ALTER TABLE rtb_signals ALTER COLUMN final_score DROP NOT NULL;

DELETE FROM module_constants
 WHERE module_name = 'rtb_ranking'
   AND constant_name = 'active_ranker';
