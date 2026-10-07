-- B-CLUSTER-BUS-PERSIST-DISPOSITION (#1159, SPRINT_TO_LIVE_PLAN row 2a0c) — remove the cluster bus's persistence half.
--
-- The `cluster_bus_event` table is a write-only audit log with ZERO readers (its only reader, the auto-test harness,
-- was deleted by B-ENGINE-HEARTBEAT-DEAD-PATHS); ~99.99 % of its rows were the engine heartbeat's, which that batch
-- also removed. Langston Step 1: REMOVE (bug-taxonomy outcome 3). The same commit removes the persist branch from
-- ClusterBus.publish (the in-memory emit is unchanged), the table and its enum from shared/schema.ts, and the
-- PLAIN_RETENTION_TABLES entry from b75-retention-sweep.ts.
--
-- ORDER WITHIN THE DEPLOY (Langston C1): dt-deploy checks out the code (entry gone) BEFORE it migrates, so between
-- the two the constant below is an inert orphan — never "entry present, seed absent", which would abort the whole
-- nightly sweep (loadConfig reqNum()s every entry first). The sweep runs at 02:15 UTC from source: do not deploy
-- this between 02:00 and 02:30 UTC.
-- `bus_event_topic` is used by exactly one column (cluster_bus_event.topic, measured on staging 2026-10-07), so it
-- drops with the table. DROP TYPE has NO CASCADE on purpose: if anything else ever uses the type, this fails loud.
-- Rollback: the matching -rollback.sql — run IT FIRST, then revert the code (this batch removes entry and seed, so
-- reverting the code first would restore the entry while the seed is still gone).

BEGIN;
SET LOCAL lock_timeout = '5s';

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name = 'cluster_bus_event.hot_retention_days';

DROP TABLE IF EXISTS cluster_bus_event;
DROP TYPE IF EXISTS bus_event_topic;

COMMIT;
