# public.strategic_plan_log

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `plan_id` | `character varying(50)` | no |  |  |  |
| 3 | `user_id` | `character varying(50)` | yes |  |  |  |
| 4 | `title` | `character varying(255)` | no |  |  |  |
| 5 | `description` | `text` | yes |  |  |  |
| 6 | `status` | `plan_status` | no | `'draft'::plan_status` |  |  |
| 7 | `phases` | `jsonb` | no |  |  |  |
| 8 | `success_criteria` | `jsonb` | no |  |  |  |
| 9 | `current_progress` | `jsonb` | no | `'{}'::jsonb` |  |  |
| 10 | `linked_experiences` | `text[]` | yes | `ARRAY[]::text[]` |  |  |
| 11 | `alignment_score` | `double precision` | yes | `0` |  |  |
| 12 | `metadata` | `jsonb` | yes |  |  |  |
| 13 | `started_at` | `timestamp with time zone` | yes |  |  |  |
| 14 | `completed_at` | `timestamp with time zone` | yes |  |  |  |
| 15 | `created_at` | `timestamp with time zone` | no | `now()` |  |  |
| 16 | `updated_at` | `timestamp with time zone` | no | `now()` |  |  |

## Constraints

- `strategic_plan_log_pkey`: PRIMARY KEY (id)
- `strategic_plan_log_plan_id_unique`: UNIQUE (plan_id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:5558` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:1882` (raw_sql, migration_ddl)
- insert: `server/services/strategic-planner.ts:77` (drizzle, runtime)
- read: `server/services/strategic-planner.ts:106` (drizzle, runtime)
- update: `server/services/strategic-planner.ts:151` (drizzle, runtime)
- update: `server/services/strategic-planner.ts:190` (drizzle, runtime)
- read: `server/services/strategic-planner.ts:331` (drizzle, runtime)
- read: `server/services/strategic-planner.ts:339` (drizzle, runtime)
- read: `server/services/strategic-planner.ts:349` (drizzle, runtime)
- update: `server/services/strategic-planner.ts:394` (drizzle, runtime)
