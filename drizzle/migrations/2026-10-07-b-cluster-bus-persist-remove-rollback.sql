-- ROLLBACK for 2026-10-07-b-cluster-bus-persist-remove.sql (B-CLUSTER-BUS-PERSIST-DISPOSITION, #1159).
-- ⛔ RUN THIS FIRST, THEN REVERT THE CODE (Langston Step-2 condition 1). The forward batch REMOVED both the sweep
-- entry and its seed; reverting the code first would put the PLAIN_RETENTION_TABLES entry back while the seed is
-- still gone, and loadConfig() would abort the whole nightly sweep. With this file run first, the seed exists
-- before the entry returns — the only window is an inert orphan constant.
-- The table comes back EMPTY (its rows had no reader); definitions are copied from 2026-04-22-initial-schema.sql
-- (:205-214 the type, :1753-1760 the table, :10370-10371 the key, :13758-13772 the indexes).

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE public.bus_event_topic AS ENUM (
    'task_assigned',
    'task_completed',
    'node_status_change',
    'rebalance_triggered',
    'circuit_breaker',
    'health_alert',
    'learning_delta',
    'model_sync'
);

CREATE TABLE public.cluster_bus_event (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    topic public.bus_event_topic NOT NULL,
    source_node character varying(100),
    payload jsonb NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.cluster_bus_event
    ADD CONSTRAINT cluster_bus_event_pkey PRIMARY KEY (id);

CREATE INDEX cluster_bus_event_created_at_idx ON public.cluster_bus_event USING btree (created_at);
CREATE INDEX cluster_bus_event_source_node_idx ON public.cluster_bus_event USING btree (source_node);
CREATE INDEX cluster_bus_event_topic_idx ON public.cluster_bus_event USING btree (topic);

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by)
VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'cluster_bus_event.hot_retention_days', '30'::jsonb, NOW(), 'b-cluster-bus-persist-disposition-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DELETE FROM _migrations WHERE name = '2026-10-07-b-cluster-bus-persist-remove.sql';

COMMIT;
