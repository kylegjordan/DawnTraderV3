-- B-NEW-36 sub-batch (b) — ROLLBACK for vts_open_trades.state column.
--
-- Operator-only. NOT applied by the migration runner (rollback files are
-- filtered out per scripts/db-migrate.ts:69). Run manually if the
-- forward migration needs to be reversed.

BEGIN;

ALTER TABLE vts_open_trades
  DROP CONSTRAINT IF EXISTS vts_open_trades_state_consistency;

ALTER TABLE vts_open_trades
  DROP COLUMN IF EXISTS state;

COMMIT;
