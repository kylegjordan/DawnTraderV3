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
-- B65.1 Migration 2 of 3 — Add baseCurrency to trades + paper_sim_trades
--
-- Purpose: the `trades` and `paper_sim_trades` tables track positions but do not
-- currently carry the `base_currency` column that `watchlist_pairs` and
-- `trading_signals` do. For B66 per-underlying position limits to work without
-- requiring a JOIN per lookup, we backfill the column on these tables.
--
-- Per Langston review 2026-04-23: use COALESCE(SPLIT_PART(symbol, '/', 1), symbol)
-- to handle legacy or malformed symbols that don't contain '/'. If the symbol has
-- no '/' separator, SPLIT_PART returns empty string (''); COALESCE then falls back
-- to the full symbol. This is safer than a bare SPLIT_PART that could insert empty
-- values.
--
-- Stablecoin pairs (USDT/USD, DAI/USD, USDC/EUR etc.) are NOT special-cased per
-- Langston confirmation — left side is still the underlying being traded.
--
-- Rollback: see 2026-04-23-b65-rollback-base-currency-to-trades.sql

BEGIN;

-- ── Phase 1: Add as nullable, backfill, then enforce NOT NULL ───────────────
-- Two-step to avoid migration failure if any existing row can't derive cleanly.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS base_currency VARCHAR(10);

UPDATE trades
SET base_currency = COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol)
WHERE base_currency IS NULL;

-- Verification: any row still null is an error, abort the transaction
DO $$
DECLARE null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM trades WHERE base_currency IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'B65 migration: % trades rows still have NULL base_currency after backfill', null_count;
  END IF;
END $$;

ALTER TABLE trades
  ALTER COLUMN base_currency SET NOT NULL;

-- ── Same pattern for paper_sim_trades ───────────────────────────────────────

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS base_currency VARCHAR(10);

UPDATE paper_sim_trades
SET base_currency = COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol)
WHERE base_currency IS NULL;

DO $$
DECLARE null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM paper_sim_trades WHERE base_currency IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'B65 migration: % paper_sim_trades rows still have NULL base_currency after backfill', null_count;
  END IF;
END $$;

ALTER TABLE paper_sim_trades
  ALTER COLUMN base_currency SET NOT NULL;

-- ── Verification (manual post-migration) ────────────────────────────────────
-- Sample check:
--   SELECT symbol, base_currency FROM trades LIMIT 20;
-- Expect: ETH/USD → ETH, BTC/EUR → BTC, SOL/USDT → SOL.

COMMIT;
