-- ROLLBACK for 2026-11-05-b-close-writer-costs-restore-columns.sql (B-CLOSE-WRITER-COSTS P-12). Not in MANIFEST.
-- ORDER: roll back the CODE first (the restore route writes these columns).
-- REFUSES if any record was restored: dropping the columns would erase that it was rebuilt from a position.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM closed_trades WHERE record_restored_from_position) THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-12 rollback refused: restored records exist; dropping the columns would erase that';
  END IF;
END $guard$;

ALTER TABLE closed_trades DROP COLUMN restored_by_claimed;
ALTER TABLE closed_trades DROP COLUMN restored_at;
ALTER TABLE closed_trades DROP COLUMN record_restored_from_position;

DELETE FROM _migrations WHERE name = '2026-11-05-b-close-writer-costs-restore-columns.sql';

COMMIT;
