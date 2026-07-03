-- P19-B-RENAME Wave-3 Bundle B2: paper_sim_open_positions -> active_open_positions
-- (Neutral-name test PASSED at Step-2: active-path-only store, no VTS writer.
--  Carries the B7.2c pending-lifecycle columns state/maker_limit_price/maker_deadline
--  unchanged — column names untouched, table name only.)

ALTER TABLE paper_sim_open_positions RENAME TO active_open_positions;
ALTER INDEX paper_sim_open_positions_symbol_idx RENAME TO active_open_positions_symbol_idx;
ALTER INDEX paper_sim_open_positions_strategy_idx RENAME TO active_open_positions_strategy_idx;
