-- ROLLBACK for 2026-11-13-b-close-writer-costs-drop-defaults.sql (B-CLOSE-WRITER-COSTS P-14b). Applied BY HAND with
-- psql; db:migrate refuses any file named *rollback*, and this file is NOT in MANIFEST.txt.
--
-- ⛔ ORDER (Langston, P-14b C-4): run THIS FIRST, then roll the app back. asset_class and mode are NOT NULL, so an app
-- older than d01da3d86 inserts without them and fails until these defaults are back. (Forward was the opposite: code
-- first, then the drop.)
--
-- Restores the 16 defaults to the values measured on staging 2026-11-13 before the drop. Rows written while the
-- defaults were absent keep the NULLs they were written with (open records' exit-side money); nothing is backfilled.
-- Deletes the forward file's _migrations ledger row, so a later db:migrate re-applies it.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE closed_trades ALTER COLUMN fees            SET DEFAULT '0'::numeric;
ALTER TABLE closed_trades ALTER COLUMN slippage        SET DEFAULT '0'::numeric;
ALTER TABLE closed_trades ALTER COLUMN entry_fee       SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN exit_fee        SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN total_fee       SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN entry_slippage  SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN exit_slippage   SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN total_cost      SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN gross_pnl       SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN net_pnl         SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN net_pnl_percent SET DEFAULT 0;
ALTER TABLE closed_trades ALTER COLUMN asset_class     SET DEFAULT 'crypto_spot';
ALTER TABLE active_open_positions ALTER COLUMN entry_fee      SET DEFAULT 0;
ALTER TABLE active_open_positions ALTER COLUMN entry_slippage SET DEFAULT 0;
ALTER TABLE active_open_positions ALTER COLUMN asset_class    SET DEFAULT 'crypto_spot';
ALTER TABLE active_open_positions ALTER COLUMN mode           SET DEFAULT 'paper';

DELETE FROM _migrations WHERE name = '2026-11-13-b-close-writer-costs-drop-defaults.sql';

COMMIT;
