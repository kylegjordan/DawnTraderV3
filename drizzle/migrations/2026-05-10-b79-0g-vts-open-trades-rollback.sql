-- B79.0g rollback — drops vts_open_trades table. Only safe if vts-runner
-- has been reverted to memory-only writes (commit reverts must precede this).
--
-- DESTRUCTIVE: any rows in this table at rollback time are LOST.
-- Open trades will fall back to in-memory-only behavior (lost on PM2 restart).

BEGIN;
DROP TABLE IF EXISTS vts_open_trades CASCADE;
COMMIT;
