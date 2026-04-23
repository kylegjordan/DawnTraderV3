-- B65.1 Migration 1 of 3 — Add exchange + asset_class columns to pair/signal/trade tables
--
-- Purpose: formalize the 5-dimensional modularization schema per
-- MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md §3.1 + §3.3. These columns make
-- the (exchange, asset_class) dimensions explicit on all pair-level records,
-- which is a precondition for B66's per-(asset_class, regime) formula constant
-- promotion and for any future asset class / exchange expansion (x-stocks,
-- perpetuals, real-equity brokers, FX).
--
-- Default values match current-state behavior: every pair is crypto_spot on kraken.
-- NO behavioral change expected in the trading pipeline.
--
-- Tables affected: watchlist_pairs, trading_signals, trades, paper_sim_trades
-- (pair metadata currently spans these 4 tables).
--
-- Rollback: see 2026-04-23-b65-rollback-exchange-asset-class.sql

BEGIN;

-- ── watchlist_pairs ─────────────────────────────────────────────────────────
ALTER TABLE watchlist_pairs
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

-- ── trading_signals ─────────────────────────────────────────────────────────
ALTER TABLE trading_signals
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

-- ── trades ──────────────────────────────────────────────────────────────────
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

-- ── paper_sim_trades ────────────────────────────────────────────────────────
ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS exchange TEXT NOT NULL DEFAULT 'kraken',
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto_spot';

-- ── Verification ────────────────────────────────────────────────────────────
-- Post-migration, these queries must return 0 rows:
--   SELECT COUNT(*) FROM watchlist_pairs WHERE exchange IS NULL OR asset_class IS NULL;
--   SELECT COUNT(*) FROM trading_signals WHERE exchange IS NULL OR asset_class IS NULL;
--   SELECT COUNT(*) FROM trades WHERE exchange IS NULL OR asset_class IS NULL;
--   SELECT COUNT(*) FROM paper_sim_trades WHERE exchange IS NULL OR asset_class IS NULL;

COMMIT;
