# public.reasoning_trace

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `trace_id` | `character varying(50)` | no |  |  |  |
| 3 | `user_id` | `character varying` | no |  |  |  |
| 4 | `intent_action` | `character varying(100)` | yes |  |  |  |
| 5 | `steps` | `jsonb` | no |  |  |  |
| 6 | `domain_context` | `text[]` | yes | `ARRAY[]::text[]` |  |  |
| 7 | `decision_summary` | `text` | yes |  |  |  |
| 8 | `status` | `character varying(20)` | no | `'in_progress'::character varying` |  |  |
| 9 | `metadata` | `jsonb` | yes |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | no | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | no | `now()` |  |  |

## Constraints

- `reasoning_trace_pkey`: PRIMARY KEY (id)
- `reasoning_trace_trace_id_unique`: UNIQUE (trace_id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:4947` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:1697` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2542` (raw_sql, migration_ddl)
- read: `server/routes.ts:17670` (drizzle, runtime)
- read: `server/routes.ts:17710` (drizzle, runtime)
- read: `server/services/cognitive-tuner.ts:313` (drizzle, runtime)
- read: `server/services/introspection-engine.ts:34` (drizzle, runtime)
- read: `server/services/introspection-engine.ts:45` (drizzle, runtime)
- read: `server/services/introspection-engine.ts:113` (drizzle, runtime)
- read: `server/services/meta-reasoning-engine.ts:49` (drizzle, runtime)
- update: `server/services/meta-reasoning-engine.ts:341` (drizzle, runtime)
- update: `server/services/meta-reasoning-engine.ts:350` (drizzle, runtime)
- insert: `server/services/reasoning-orchestrator.ts:154` (drizzle, runtime)
- update: `server/services/reasoning-orchestrator.ts:349` (drizzle, runtime)
- read: `server/services/reasoning-orchestrator.ts:549` (drizzle, runtime)
- update: `server/services/reasoning-orchestrator.ts:638` (drizzle, runtime)
