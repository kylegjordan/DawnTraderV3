# public.system_alerts

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `character varying` | no |  |  |  |
| 3 | `mode` | `trading_mode` | no |  |  |  |
| 4 | `alert_type` | `character varying(50)` | no |  |  |  |
| 5 | `severity` | `character varying(20)` | yes | `'info'::character varying` |  |  |
| 6 | `message` | `text` | no |  |  |  |
| 7 | `metadata` | `jsonb` | yes |  |  |  |
| 8 | `acknowledged` | `boolean` | yes | `false` |  |  |
| 9 | `timestamp` | `timestamp with time zone` | yes | `now()` |  |  |
| 10 | `category` | `character varying(20)` | yes | `'informational'::character varying` |  |  |
| 11 | `action_buttons` | `jsonb` | yes |  |  |  |

## Constraints

- `system_alerts_pkey`: PRIMARY KEY (id)
- `unique_global_alert`: UNIQUE (mode, alert_type, message)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:5770` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:1` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:10` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:22` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:27` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:32` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:37` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:41` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:46` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:50` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:55` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:60` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-11-22-b-alert-orphan-rows-rollback.sql:64` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-22-b-alert-orphan-rows.sql:3` (raw_sql, migration_ddl)
- delete: `drizzle/migrations/2026-11-22-b-alert-orphan-rows.sql:6` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-22-b-alert-orphan-rows.sql:10` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2029` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2546` (raw_sql, migration_ddl)
- read: `server/routes.ts:18640` (drizzle, runtime)
- insert: `server/services/alerts-service.ts:72` (drizzle, runtime)
- read: `server/services/alerts-service.ts:137` (drizzle, runtime)
- read: `server/services/alerts-service.ts:159` (drizzle, runtime)
- update: `server/services/alerts-service.ts:175` (drizzle, runtime)
- update: `server/services/alerts-service.ts:221` (drizzle, runtime)
- update: `server/services/alerts-service.ts:268` (drizzle, runtime)
- update: `server/services/alerts-service.ts:312` (drizzle, runtime)
- read: `server/tests/integration/b-alert-insert-contract-db.test.ts:43` (drizzle, test_only)
- delete: `server/tests/integration/b-alert-insert-contract-db.test.ts:58` (drizzle, test_only)
- read: `server/tests/integration/b-alert-insert-contract-db.test.ts:73` (drizzle, test_only)
- insert: `server/tests/integration/b-alert-insert-contract-db.test.ts:120` (raw_sql, test_only)
- delete: `server/tests/unit/b-db-pool-measure.test.ts:148` (raw_sql, test_only)
