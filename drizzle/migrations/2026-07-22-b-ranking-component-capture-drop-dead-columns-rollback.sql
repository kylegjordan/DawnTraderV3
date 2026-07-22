-- ROLLBACK for 2026-07-22-b-ranking-component-capture-drop-dead-columns.sql
-- B-RANKING-COMPONENT-CAPTURE (#555) — 2026-07-22 — CC-A
--
-- Restores the three dropped columns on rtb_signals as NULLABLE decimals, matching their
-- original definitions exactly (precision 5, scale 4, no NOT NULL, no default).
--
-- ⚠️ HONEST LIMIT OF THIS ROLLBACK: it restores the column SHAPE, not data — because there
-- was never any data to restore. Every row was NULL for the columns' entire existence (the
-- insert builder never supplied them). So this is a complete rollback in the only sense that
-- can exist here; nothing is lost that a restore could bring back.
--
-- Rolling back also requires reverting the application code in the same commit (the schema
-- entries and the storage upsert mapping), otherwise the restored columns are once again
-- writer-less and reader-less — i.e. exactly the dead state this batch removed.
--
-- NOTE: this rollback file is deliberately NOT registered in MANIFEST.txt (repo convention —
-- rollbacks stay out of the manifest so they are never auto-applied).

ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS regime_weight decimal(5,4);
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS hybrid_score decimal(5,4);
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS decay_penalty decimal(5,4);
