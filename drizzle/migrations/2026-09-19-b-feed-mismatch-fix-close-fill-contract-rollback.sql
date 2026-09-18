-- ROLLBACK for 2026-09-19-b-feed-mismatch-fix-close-fill-contract.sql (not in MANIFEST).
-- Removing the rows makes the resolver fail closed (not-warm closes refused); roll back the code first.
BEGIN;
DELETE FROM module_constants WHERE module_name = 'close_fill_contract';
ALTER TABLE closed_trades DROP COLUMN IF EXISTS exit_fill_arm;
ALTER TABLE closed_trades DROP COLUMN IF EXISTS exit_fill_book_warmth;
COMMIT;
