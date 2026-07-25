-- ROLLBACK for 2026-07-25-b-retired-score-removal-final-score-nullable.sql
-- B-RETIRED-SCORE-REMOVAL (#558, A1) — CC-A
--
-- ⚠️ ONLY VALID while the OLD final_score WRITERS still exist (i.e. BEFORE the A1 code that
-- stops writing final_score is live). Re-adding NOT NULL will FAIL if any row has a NULL
-- final_score — which every row inserted/refreshed by the no-writer code will have. Roll the
-- CODE back first, then this.
--
-- Restores: (1) rtb_signals.final_score NOT NULL; (2) the active_ranker module_constants row to
-- its P19-B7.1 seed value ('r_multiple', scope '*'/'*'/'*'/'*'). Column shape mirrors the seed
-- migration 2026-06-30-p19-b7-1-ranker-config.sql.

ALTER TABLE rtb_signals ALTER COLUMN final_score SET NOT NULL;

INSERT INTO module_constants
  (module_name, constant_name, value, exchange, asset_class, strategy, regime, updated_at, updated_by)
VALUES
  ('rtb_ranking', 'active_ranker', '"r_multiple"'::jsonb, '*', '*', '*', '*', NOW(), 'b-retired-score-removal-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;
