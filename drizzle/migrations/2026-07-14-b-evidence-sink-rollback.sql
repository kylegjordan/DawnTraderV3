-- ROLLBACK for 2026-07-14-b-evidence-sink.sql (B-EVIDENCE-SINK).
-- Code-first revert: stop the app writers BEFORE dropping under live code (an enqueue to a dropped
-- table would error the flush — though the batch writer drops-not-throws, so it degrades safely).
-- Dropping the parent cascades to all monthly partitions. Rollback files stay OUT of MANIFEST.txt.

BEGIN;

DROP TABLE IF EXISTS switch_on_shadow_evidence CASCADE;
DROP SEQUENCE IF EXISTS switch_on_shadow_evidence_id_seq;

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name = 'switch_on_shadow_evidence.hot_retention_days';

COMMIT;
