# public.system_config

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying(36)` | no | `gen_random_uuid()` |  |  |
| 2 | `system_flags` | `jsonb` | no | `'{}'::jsonb` |  |  |
| 3 | `updated_at` | `timestamp with time zone` | no | `now()` |  |  |
| 4 | `updated_by` | `character varying(100)` | yes |  |  |  |

## Constraints

- `system_config_pkey`: PRIMARY KEY (id)

## Code evidence

- read: `audit/run-phase31h-audit.sh:60` (raw_sql, runtime)
- read: `audit/run-phase31h-audit.sh:110` (raw_sql, runtime)
- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:5789` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2043` (raw_sql, migration_ddl)
- read: `server/services/system-config.ts:55` (drizzle, runtime)
- insert: `server/services/system-config.ts:60` (drizzle, runtime)
- read: `server/services/system-config.ts:102` (drizzle, runtime)
- update: `server/services/system-config.ts:106` (drizzle, runtime)
- insert: `server/services/system-config.ts:115` (drizzle, runtime)
