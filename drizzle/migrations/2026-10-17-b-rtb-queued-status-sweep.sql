-- B-RTB-QUEUED-STATUS-SWEEP (#1204, row 59g, CC-B; Step 2 approved by Langston 2026-10-17).
--
-- WHY: rtb_signals has two live statuses ('active' from the one insert, 'reconfirmed' from the refresh). The column
-- defaulted to 'queued' — a status every reader of it was deleted in this batch, so a row inserted without a status
-- would sit where nothing reads it. Three columns have no reachable writer and no reader:
--   promoted_at       — its only writer was removeSignalBySymbol (ready_to_buy_service.ts), inside a branch gated on
--                       getRtbSignals({status:'queued'}), which no writer can produce; the function is deleted here.
--   promoted_trade_id — no writer on rtb_signals (the only promotedTradeId write is rtb-shadow-store, its own table).
--   expired_at        — no writer, no reader (expiry has been an immediate DELETE since Directive A3.R9.0).
-- Staging 2026-10-17: 24 rows, 0 non-null in any of the three (a population of two days — the proof is the mechanism
-- above, not the count).
--
-- WHAT: drop the status default (an insert must name its status; the insert type requires it at compile time) and the
-- three columns. HAND-WRITTEN on purpose: migrations/meta/0001_snapshot.json still records
-- rtb_signals_symbol_strategy_idx four-wide (with status) while shared/schema.ts and live Postgres have three columns, so a
-- drizzle-kit generated migration would rewrite that unique index. This file does not touch it; #1006 stays open.
-- Rollback: 2026-10-17-b-rtb-queued-status-sweep-rollback.sql.

BEGIN;

ALTER TABLE rtb_signals ALTER COLUMN status DROP DEFAULT;

ALTER TABLE rtb_signals DROP COLUMN IF EXISTS promoted_at;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS promoted_trade_id;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS expired_at;

COMMIT;
