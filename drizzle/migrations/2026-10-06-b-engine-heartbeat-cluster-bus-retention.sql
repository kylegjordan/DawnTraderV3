-- B-ENGINE-HEARTBEAT-DEAD-PATHS (#1158, merged into #521) — seed the retention constant for cluster_bus_event.
--
-- The same commit registers cluster_bus_event in server/scripts/b75-retention-sweep.ts PLAIN_RETENTION_TABLES
-- (delete-only lane, timestamp column created_at). loadConfig() reads every registered constant with reqNum()
-- BEFORE sweeping any table, so this seed MUST land in the same deploy or the whole nightly sweep aborts
-- (Langston, Step 2 Ask 3). 30 days matches every sibling telemetry constant (the four *_ticker_snap, the four
-- B70 archives). The table is a write-only audit log after this batch (zero programmatic readers); its ~268k
-- heartbeat rows leave through the sweep's own first run (Langston, Ask 4 — no second deletion path), and the
-- 16 non-heartbeat rows (newest 2025-10-21) go with them.
-- Rollback: the matching -rollback.sql deletes the row — revert the sweep registration first or together.

BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by)
VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'cluster_bus_event.hot_retention_days', '30'::jsonb, NOW(), 'b-engine-heartbeat-dead-paths')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
