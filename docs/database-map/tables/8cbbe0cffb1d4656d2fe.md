# public.walter_actions

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `character varying` | no |  |  |  |
| 3 | `mode` | `trading_mode` | no |  |  |  |
| 4 | `action_type` | `walter_action_type` | no |  |  |  |
| 5 | `category` | `walter_action_category` | no |  |  |  |
| 6 | `status` | `walter_action_status` | no | `'pending'::walter_action_status` |  |  |
| 7 | `impact_score` | `numeric(5,2)` | no |  |  |  |
| 8 | `affected_component` | `text` | no |  |  |  |
| 9 | `detected_anomaly` | `text` | no |  |  |  |
| 10 | `context_data` | `jsonb` | yes |  |  |  |
| 11 | `suggested_fix` | `text` | no |  |  |  |
| 12 | `executed_action` | `text` | yes |  |  |  |
| 13 | `resolution_status` | `character varying(50)` | yes |  |  |  |
| 14 | `resolution_notes` | `text` | yes |  |  |  |
| 15 | `confidence_score` | `numeric(3,2)` | yes |  |  |  |
| 16 | `incident_key` | `character varying(255)` | no |  |  |  |
| 17 | `retry_count` | `integer` | no | `0` |  |  |
| 18 | `last_attempt_at` | `timestamp with time zone` | yes |  |  |  |
| 19 | `cooldown_until` | `timestamp with time zone` | yes |  |  |  |
| 20 | `parent_action_id` | `character varying` | yes |  |  |  |
| 21 | `trading_paused` | `boolean` | no | `false` |  |  |
| 22 | `detected_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 23 | `action_at` | `timestamp with time zone` | yes |  |  |  |
| 24 | `resolved_at` | `timestamp with time zone` | yes |  |  |  |
| 25 | `acknowledged_at` | `timestamp with time zone` | yes |  |  |  |
| 26 | `requires_approval` | `boolean` | no | `false` |  |  |
| 27 | `escalated` | `boolean` | no | `false` |  |  |
| 28 | `suppress_reason` | `text` | yes |  |  |  |
| 29 | `user_feedback` | `text` | yes |  |  |  |
| 30 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 31 | `updated_at` | `timestamp with time zone` | yes | `now()` |  |  |

## Constraints

- `walter_actions_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:6371` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2315` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2553` (raw_sql, migration_ddl)
