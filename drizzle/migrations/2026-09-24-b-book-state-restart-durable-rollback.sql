-- Rollback for 2026-09-24-b-book-state-restart-durable.sql (B-BOOK-STATE-RESTART-DURABLE, 3n.q8, #1066).
-- ⚠️ Revert the CODE first (the store writes this table every 30 s and reads it at boot), then run this.
-- Dropping the table loses only the persisted rings: the guard falls back to today's behaviour, where
-- every first seed after a restart is unjudged. No trade state lives here.
BEGIN;
DROP TABLE IF EXISTS xstock_book_state_rings;
COMMIT;
