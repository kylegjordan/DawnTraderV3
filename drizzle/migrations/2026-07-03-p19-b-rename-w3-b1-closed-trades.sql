-- P19-B-RENAME Wave-3 Bundle B1 (LAST, own deploy + full soak): paper_sim_trades -> closed_trades
-- Kyle-consensus name: this is the CLOSED-TRADE SINK for BOTH systems — the VTS
-- close-migration writes into it AND the active path does (CC-A's B79.0g Q5 catch;
-- "active_trades" would have misnamed the VTS rows exactly as "paper_sim" misnamed
-- the active rows). Existing source/mode columns distinguish origin. Catalog-only.
-- FRESH-DB GUARD: IF EXISTS on every statement — fresh CI DBs are born with the
-- NEW names from the current drizzle schema; staging performs the real rename.

ALTER TABLE IF EXISTS paper_sim_trades RENAME TO closed_trades;
ALTER INDEX IF EXISTS paper_sim_trades_symbol_idx RENAME TO closed_trades_symbol_idx;
ALTER INDEX IF EXISTS paper_sim_trades_strategy_idx RENAME TO closed_trades_strategy_idx;
ALTER INDEX IF EXISTS paper_sim_trades_opened_at_idx RENAME TO closed_trades_opened_at_idx;
ALTER INDEX IF EXISTS paper_sim_trades_closed_at_idx RENAME TO closed_trades_closed_at_idx;
