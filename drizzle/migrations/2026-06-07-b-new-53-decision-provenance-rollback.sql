-- ROLLBACK for 2026-06-07-b-new-53-decision-provenance.sql
-- Drops the provenance + version tables (incl. all partitions via CASCADE on
-- the partitioned parent), removes the per-class capture flag, reverts the
-- sequence CACHE. Forward-only capture means no data is lost that mattered
-- (provenance is additive telemetry; the base signal_eval_archive is untouched).

DELETE FROM module_constants
 WHERE module_name = 'data_archive'
   AND constant_name = 'b_new_53_provenance_capture_enabled';

ALTER SEQUENCE IF EXISTS signal_eval_archive_id_seq CACHE 1;

DROP TABLE IF EXISTS module_constants_version;

-- Dropping the partitioned parent drops all child partitions.
DROP TABLE IF EXISTS signal_eval_provenance;
