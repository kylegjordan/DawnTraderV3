-- P19-B-RENAME Wave-3 Bundle B3: paper_sim_sessions -> active_engine_sessions
-- (Neutral-name test PASSED at Step-2: active-path-only store, no VTS writer.)

ALTER TABLE paper_sim_sessions RENAME TO active_engine_sessions;
ALTER INDEX paper_sim_sessions_status_idx RENAME TO active_engine_sessions_status_idx;
ALTER INDEX paper_sim_sessions_session_id_idx RENAME TO active_engine_sessions_session_id_idx;
ALTER INDEX paper_sim_sessions_started_at_idx RENAME TO active_engine_sessions_started_at_idx;
