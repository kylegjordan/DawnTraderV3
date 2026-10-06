-- B-ENGINE-STOP-DURATION-COLUMN (#1067) — drop active_engine_sessions.run_for_ms and .ends_at (rule 18).
--
-- What they were: a requested time limit for a paper session (`run_for_ms`) and its computed end
-- (`ends_at`), specified 2025-10-19 (attached_assets "Dawn Trader Context ... 10.19.25 part 2":
-- a 30-second ends_at check and a boot-time expiry). The enforcer was never built; no caller of
-- startActiveEngine ever passed a limit; nothing read ends_at.
-- What they actually held (staging, 2026-10-06, all 163 rows): ends_at set on 0; run_for_ms set on
-- 158, every one the ELAPSED duration written by the stop path (max |run_for_ms − (stopped_at −
-- started_at)| = 1.7 ms, Langston-measured) — so dropping them loses no information. That wrong-object
-- write overflowed the 32-bit integer at 24.85 days (the 2026-09-20 and 2026-10-06 stop failures).
-- Blast radius (Langston, measured): base table, no dependent views/materialized views, no index on
-- either column, both nullable, no default, not generated. The same commit removes every code reader.
-- NOT touched: paper_sim_sessions_backup_20251023 and paper_sim_sessions_user_archive keep their own copies.
-- Rollback: the matching -rollback.sql re-adds both columns, empty.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE active_engine_sessions
  DROP COLUMN IF EXISTS run_for_ms,
  DROP COLUMN IF EXISTS ends_at;

COMMIT;
