-- ROLLBACK for 2026-11-14-b-disk-file-tiering-cold-audit.sql (B-DISK-FILE-TIERING amendment 4 / 3c). Applied BY HAND
-- with psql; db:migrate refuses any file named *rollback*, and this file is NOT in MANIFEST.txt.
--
-- ORDER: remove the b75-cold-audit root crontab line and roll the app back FIRST — an app at or after 3c refuses at
-- loadConfig without the nine data_lifecycle rows, and writes both tables. Then run this.
-- It drops the meter history (the growth baseline and the `_proof/` id history) and every read-back record (the
-- coverage clock restarts from the next first run). Read them out first if they matter:
--   SELECT * FROM data_archive_cold_meter ORDER BY run_at DESC LIMIT 30;
--   SELECT manifest_id, max(at) FILTER (WHERE result = 'ok') FROM data_archive_cold_readback GROUP BY 1;
-- Deletes the forward file's _migrations ledger row, so a later db:migrate re-applies it.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS data_archive_cold_readback;
DROP TABLE IF EXISTS data_archive_cold_meter;

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name IN ('cold_meter_warn_bytes', 'cold_meter_tokenwatch_growth_warn_bytes_per_day',
                         'cold_meter_liveness_growth_warn_bytes', 'cold_readback_daily_bytes',
                         'cold_readback_min_interval_days', 'cold_readback_stall_days', 'cold_readback_max_age_days',
                         'cold_readback_max_objects_per_run', 'cold_audit_run_deadline_ms');

DELETE FROM _migrations WHERE name = '2026-11-14-b-disk-file-tiering-cold-audit.sql';

COMMIT;
