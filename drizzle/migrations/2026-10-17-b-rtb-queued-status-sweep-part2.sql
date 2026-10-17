-- B-RTB-QUEUED-STATUS-SWEEP (#1204, row 59g, CC-B) — part 2 of 2: the CONTRACTION (Langston Step-4 ruling (b),
-- expand/contract).
--
-- WHY: promoted_at, promoted_trade_id and expired_at on rtb_signals have no reachable writer and no reader —
--   promoted_at       — its only writer was removeSignalBySymbol, inside a branch gated on getRtbSignals({status:'queued'}),
--                       which no writer can produce; the function was deleted in part 1's batch;
--   promoted_trade_id — no writer on rtb_signals (the only promotedTradeId write is rtb-shadow-store, its OWN table);
--   expired_at        — no writer, no reader (expiry has been an immediate DELETE since Directive A3.R9.0).
-- Staging 2026-10-17: 0 non-null of 21 whole-table with block_reason 21/21 as the positive control (Langston, Step 8).
--
-- SAFE AGAINST THE BUILD STILL RUNNING WHEN THIS COMMITS: it ships only in a deploy AFTER `07bf5d37b`, whose
-- shared/schema.ts already names none of the three, so the running build's bare select()/returning() never name them.
-- Measured 2026-10-17 on the deployed dist/index.js: the only occurrences of the three names are a schema comment and
-- rtb_shadow_pairings (a different table). Never ship this in a deploy built older than 162ae0537.
-- Rollback: 2026-10-17-b-rtb-queued-status-sweep-part2-rollback.sql.

BEGIN;

ALTER TABLE rtb_signals DROP COLUMN IF EXISTS promoted_at;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS promoted_trade_id;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS expired_at;

COMMIT;
