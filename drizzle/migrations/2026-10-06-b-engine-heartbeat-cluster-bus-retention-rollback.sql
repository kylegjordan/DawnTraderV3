-- ROLLBACK for 2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql (B-ENGINE-HEARTBEAT-DEAD-PATHS, #1158).
-- Revert the code (the PLAIN_RETENTION_TABLES entry) FIRST or together: with the entry still registered and this
-- row gone, loadConfig() would throw and abort the whole nightly sweep.

BEGIN;
SET LOCAL lock_timeout = '5s';

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name = 'cluster_bus_event.hot_retention_days';

DELETE FROM _migrations WHERE name = '2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql';

COMMIT;
