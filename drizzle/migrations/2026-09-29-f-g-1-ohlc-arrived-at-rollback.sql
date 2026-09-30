-- Rollback for 2026-09-29-f-g-1-ohlc-arrived-at.sql (F-G-1 reopen P3, #1031).
-- ⚠️ Revert the CODE first: the batch writer inserts `arrived_at` on every flush and its upsert
-- guard reads it, so dropping the column under the running code fails every OHLC flush — and a
-- missing column is classified PERMANENT, so those rows are DROPPED (the #704 shape).
-- Dropping the column loses only the arrival stamps; no bar data lives in it.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE crypto_spot_ohlc_1m DROP COLUMN IF EXISTS arrived_at;
ALTER TABLE xstock_spot_ohlc_1m DROP COLUMN IF EXISTS arrived_at;
ALTER TABLE xstock_perp_ohlc_1m DROP COLUMN IF EXISTS arrived_at;
ALTER TABLE crypto_perp_ohlc_1m DROP COLUMN IF EXISTS arrived_at;
-- Clear the forward file's ledger row so a later redeploy re-applies it (release-plan review, Langston 2026-09-30).
DELETE FROM _migrations WHERE name = '2026-09-29-f-g-1-ohlc-arrived-at.sql';
COMMIT;
