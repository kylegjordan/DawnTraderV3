-- P19-B-RENAME Wave-3 Bundle B4: paper_sim_trade_logs -> active_trade_logs
-- (OPEN-6 liveness walk: LIVE active-path lifecycle logging — rename, not delete.)
-- Catalog-only renames; drizzle schema + storage methods + callers move in the
-- SAME commit (per-table atomic bundle, Langston condition).

ALTER TABLE paper_sim_trade_logs RENAME TO active_trade_logs;
ALTER INDEX paper_sim_trade_logs_timestamp_idx RENAME TO active_trade_logs_timestamp_idx;
ALTER INDEX paper_sim_trade_logs_trade_id_idx RENAME TO active_trade_logs_trade_id_idx;
ALTER INDEX paper_sim_trade_logs_event_type_idx RENAME TO active_trade_logs_event_type_idx;
