-- P19-B-RENAME Wave-3 Bundle B4: paper_sim_trade_logs -> active_trade_logs
-- (OPEN-6 liveness walk: LIVE active-path lifecycle logging — rename, not delete.)
-- FRESH-DB GUARD: a fresh CI database is created from the CURRENT drizzle schema
-- (already the NEW names), so these renames must no-op there — IF EXISTS on every
-- statement; on staging (legacy names) they perform the real rename. Catalog-only renames; drizzle schema + storage methods + callers move in the
-- SAME commit (per-table atomic bundle, Langston condition).

ALTER TABLE IF EXISTS paper_sim_trade_logs RENAME TO active_trade_logs;
ALTER INDEX IF EXISTS paper_sim_trade_logs_timestamp_idx RENAME TO active_trade_logs_timestamp_idx;
ALTER INDEX IF EXISTS paper_sim_trade_logs_trade_id_idx RENAME TO active_trade_logs_trade_id_idx;
ALTER INDEX IF EXISTS paper_sim_trade_logs_event_type_idx RENAME TO active_trade_logs_event_type_idx;
