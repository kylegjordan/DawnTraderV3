-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-29 — F-G-1 reopen (OBJ-9 ②, #1031): the OHLC bar ARRIVAL stamp
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/F_G_1_REOPEN_PRE_AUDIT.md (Step 2 cleared, r3, P3)
--
-- One nullable column, `arrived_at timestamptz`, on each of the four OHLC parents.
-- `ohlc-batch-writer.ts` stamps it at `bufferOhlcBar` (the one chokepoint) and its
-- upsert only overwrites when `arrived_at IS NULL OR arrived_at <= EXCLUDED.arrived_at`,
-- so an earlier arrival can never overwrite a later one — including across the two
-- processes a deploy overlaps. `captured_at` keeps its meaning (database write time).
--
-- METADATA-ONLY: a nullable column with no default rewrites no rows. It propagates to
-- every partition (99 across the family at the Step-2 read).
-- ⛔ LOCK TIMEOUT (Langston condition 4): ADD COLUMN takes ACCESS EXCLUSIVE on the parent
-- and its partitions, on a family written every 5 s. It must fail fast rather than queue
-- behind a flush while every later writer queues behind IT. A timeout aborts this file,
-- `db:migrate` exits non-zero and `dt-deploy` stops before the restart; re-run the deploy.
--
-- Cost (r3, basis named): ≈ 8 bytes a row ⇒ ≈ 1.31 GB at the live retention config
-- (365/365/365/30 days), ≈ 166 MB if the STORAGE_POLICY §3 30-day ruling executes.
--
-- Rollback: 2026-09-29-f-g-1-ohlc-arrived-at-rollback.sql (IN git, beside this file;
-- never listed in MANIFEST.txt).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE crypto_spot_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE xstock_spot_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE xstock_perp_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE crypto_perp_ohlc_1m ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

COMMENT ON COLUMN crypto_spot_ohlc_1m.arrived_at IS
  'F-G-1 reopen P3 (#1031): when this process received the bar, stamped at bufferOhlcBar. The batch writer upsert never lets an earlier arrival overwrite a later one. NULL = written before 2026-09-29.';
COMMENT ON COLUMN xstock_spot_ohlc_1m.arrived_at IS
  'F-G-1 reopen P3 (#1031): when this process received the bar, stamped at bufferOhlcBar. The batch writer upsert never lets an earlier arrival overwrite a later one. NULL = written before 2026-09-29.';
COMMENT ON COLUMN xstock_perp_ohlc_1m.arrived_at IS
  'F-G-1 reopen P3 (#1031): when this process received the bar, stamped at bufferOhlcBar. The batch writer upsert never lets an earlier arrival overwrite a later one. NULL = written before 2026-09-29.';
COMMENT ON COLUMN crypto_perp_ohlc_1m.arrived_at IS
  'F-G-1 reopen P3 (#1031): when this process received the bar, stamped at bufferOhlcBar. The batch writer upsert never lets an earlier arrival overwrite a later one. NULL = written before 2026-09-29.';

COMMIT;
