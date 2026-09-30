-- Rollback for 2026-09-24-b-book-state-restart-durable.sql (B-BOOK-STATE-RESTART-DURABLE, 3n.q8, #1066).
-- ⚠️ Revert the CODE first (the store writes this table every 30 s and reads it at boot), then run this.
-- ⚠️ For the 10-02 release, the release plan's rollback order governs (pm2 stop → rollbacks → redeploy), which makes "code first" moot: `Change Lists/RELEASE_DEPLOY_2026-10-02_PREP.md` §4.
-- Dropping the table loses only the persisted rings: the guard falls back to today's behaviour, where
-- every first seed after a restart is unjudged. No trade state lives here.
BEGIN;
DROP TABLE IF EXISTS xstock_book_state_rings;
-- Clear the forward file's ledger row so a later redeploy re-applies it (release-plan review, Langston 2026-09-30).
DELETE FROM _migrations WHERE name = '2026-09-24-b-book-state-restart-durable.sql';
COMMIT;
