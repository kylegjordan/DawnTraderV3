-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B65.4.2 Migration — Add ladder observability columns to paper_sim_trades
--
-- Per Kyle directive 2026-04-28 (B65.4.1 verification report 2026-04-28
-- showed ladder analysis is unreadable on "anomaly" rows because the CSV
-- doesn't expose the latch-trigger price or original-stop-price; analyst has
-- to grep PM2 logs to recover them).
--
-- Adds three observability columns:
--
--   original_stop_price: stop price set at trade open, before any ratcheting.
--     Read from TrailingState.originalStopPrice (captured at
--     initializeTrailingState).
--
--   latch_trigger_price: actual price at which target_lock fired (the rung-1
--     ratchet event). May differ from the strategy's published target when
--     target_lock_r=1.5 interaction means latch fires at +1.5R from entry.
--     Read from TrailingState.latchTriggerPrice (captured when targetLatched
--     flips false→true).
--
--   rung_target_history: jsonb array of rung target prices crossed in order.
--     Index 0 = original target (rung 1, set when targetLatched). Each
--     subsequent entry appended on each ratchet event. Length matches
--     ladderRungsHit at the moment of capture.
--
-- All columns nullable. Backward-compat with rows written before this
-- migration ran AND with trades that never latched (latch_trigger_price and
-- rung_target_history remain null).
--
-- Rollback: 2026-04-28-b65-4-2-rollback.sql

BEGIN;

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS original_stop_price NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS latch_trigger_price NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS rung_target_history JSONB;

COMMIT;
