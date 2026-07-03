-- FRESH-DB GUARD: IF EXISTS on every statement — fresh CI DBs are born with the
-- NEW names from the current drizzle schema; staging performs the real rename.
-- P19-B-RENAME Wave-3 Bundle B2: paper_sim_open_positions -> active_open_positions
-- (Neutral-name test PASSED at Step-2: active-path-only store, no VTS writer.
--  Carries the B7.2c pending-lifecycle columns state/maker_limit_price/maker_deadline
--  unchanged — column names untouched, table name only.)

ALTER TABLE IF EXISTS paper_sim_open_positions RENAME TO active_open_positions;
ALTER INDEX IF EXISTS paper_sim_open_positions_symbol_idx RENAME TO active_open_positions_symbol_idx;
ALTER INDEX IF EXISTS paper_sim_open_positions_strategy_idx RENAME TO active_open_positions_strategy_idx;
