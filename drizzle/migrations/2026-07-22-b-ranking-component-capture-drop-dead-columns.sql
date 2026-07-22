-- B-RANKING-COMPONENT-CAPTURE (#555) — 2026-07-22 — CC-A, Langston-ruled
--
-- Drops three DEAD columns from rtb_signals: regime_weight, hybrid_score, decay_penalty.
--
-- WHY THEY ARE DEAD (measured 2026-07-22, not inferred):
--   • NULL on 100% of rows for their entire existence. The queue-insert builder
--     (ready_to_buy_service.ts `insertData`) enumerates 26 fields and never included these
--     three, so storage.ts's upsert mapping was fed `undefined` on every write.
--   • Reader census (Langston re-derived independently at 58d8f8f94): exactly ONE genuine
--     reader each — the shadow-pairing selection-quality capture — and this batch re-points
--     all three to `metadata`, which is the established SSOT for these derived components
--     (the same builder already reads meta.atr / meta.sourcePool / meta.rankingScore).
--     ⇒ ZERO readers remain after the code change.
--   • No DB-side dependency: a pg_depend/pg_rewrite query returned NO views or matviews
--     referencing rtb_signals.
--
-- WHY DROP RATHER THAN KEEP: §15 forbids leaving legacy lingering, and a NULL column that
-- looks wired actively misleads — it already nearly produced the wrong disposition once.
-- Keep-as-data does NOT apply here (contrast the `paper_sim` discriminator precedent, which
-- holds real data): these columns contain nothing to preserve.
--
-- ⚠️ DEPLOY ORDERING — LOAD-BEARING: apply this AFTER the application code that stops
-- referencing the columns is deployed. The Drizzle schema entries are removed in the same
-- commit, so new code never selects them; running this migration while OLD code is still
-- live would break that code's SELECT. Code first, then this.
--
-- Rollback: 2026-07-22-b-ranking-component-capture-drop-dead-columns-rollback.sql
--   (restores the columns as nullable — it CANNOT restore data, because there was never
--    any: every row was NULL. Restoring the columns returns the schema to its prior shape,
--    nothing more.)

ALTER TABLE rtb_signals DROP COLUMN IF EXISTS regime_weight;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS hybrid_score;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS decay_penalty;
