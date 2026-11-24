# public.strategy_settings

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `mode` | `trading_mode` | no |  |  |  |
| 3 | `strategy` | `strategy_type` | no |  |  |  |
| 4 | `params` | `jsonb` | no |  |  |  |
| 5 | `version` | `integer` | no | `1` |  |  |
| 6 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 8 | `enabled` | `boolean` | no | `true` |  |  |
| 9 | `global_context_id` | `character varying(50)` | no | `'default'::character varying` |  |  |
| 10 | `last_updated_by` | `character varying` | yes |  |  |  |
| 11 | `asset_class` | `character varying(20)` | no |  |  |  |

## Constraints

- `strategy_settings_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `diagnostics/single-tenant-pack/migration-drop-user-id.sql:3` (raw_sql, runtime)
- ddl: `diagnostics/single-tenant-pack/migration-drop-user-id.sql:29` (raw_sql, runtime)
- read: `diagnostics/single-tenant-pack/schema-verification.sql:12` (raw_sql, runtime)
- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:5745` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-24-b79-0n-strategy-per-class-rollback.sql:7` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-24-b79-0n-strategy-per-class.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-24-b79-0n-strategy-per-class.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-24-b79-0n-strategy-per-class.sql:3` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2004` (raw_sql, migration_ddl)
- read: `server/scripts/phase2f_sql_traces.ts:21` (raw_sql, runtime)
- read: `server/scripts/phase2f_sql_traces.ts:24` (raw_sql, runtime)
- read: `server/services/memory-lifecycle.ts:57` (drizzle, runtime)
- read: `server/storage.ts:1314` (drizzle, runtime)
- read: `server/storage.ts:1337` (drizzle, runtime)
- insert: `server/storage.ts:1345` (drizzle, runtime)
