-- B-CLOSE-WRITER-COSTS (Kyle KD-17) increment 3 — P-12: the restore remedy's record columns on closed_trades.
-- Pre-audit: Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md (P-12 r1, amended (c)).
--
-- A close that cannot resolve its trade record is refused and the position kept (P-2). When the record is MISSING, the
-- operator restores it from the position's own open-time fields through POST /active-engine/positions/:id/restore-record.
-- These columns say a record was restored, when, and who asked (`restored_by_claimed` — the authenticated caller, a
-- CLAIM per #447). The flag's DEFAULT false is the honest value for every existing row: none was restored.
-- Additive only; nothing reads these columns but the restore route and the record display.
-- Rollback: 2026-11-05-b-close-writer-costs-restore-columns-rollback.sql (code first).

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE closed_trades ADD COLUMN record_restored_from_position boolean NOT NULL DEFAULT false;
ALTER TABLE closed_trades ADD COLUMN restored_at timestamptz;
ALTER TABLE closed_trades ADD COLUMN restored_by_claimed text;

COMMIT;
