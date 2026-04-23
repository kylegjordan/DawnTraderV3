-- B65.1 ROLLBACK — reverts all 3 B65 migrations
--
-- Only run if B65 deployment fails verification and we need to restore
-- pre-B65 schema state. Must be run in reverse order of the forward migrations.

BEGIN;

-- ── Rollback migration 3: drop module_constants table ──────────────────────
DROP TABLE IF EXISTS module_constants;

-- ── Rollback migration 2: remove base_currency from trades + paper_sim_trades
ALTER TABLE trades         DROP COLUMN IF EXISTS base_currency;
ALTER TABLE paper_sim_trades DROP COLUMN IF EXISTS base_currency;

-- ── Rollback migration 1: remove exchange + asset_class from 4 tables ──────
ALTER TABLE watchlist_pairs  DROP COLUMN IF EXISTS exchange, DROP COLUMN IF EXISTS asset_class;
ALTER TABLE trading_signals  DROP COLUMN IF EXISTS exchange, DROP COLUMN IF EXISTS asset_class;
ALTER TABLE trades           DROP COLUMN IF EXISTS exchange, DROP COLUMN IF EXISTS asset_class;
ALTER TABLE paper_sim_trades DROP COLUMN IF EXISTS exchange, DROP COLUMN IF EXISTS asset_class;

COMMIT;
