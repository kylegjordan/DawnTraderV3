# public.goals_presets

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `mode` | `trading_mode` | no |  |  |  |
| 3 | `name` | `goals_preset_name` | no |  |  |  |
| 5 | `daily_loss_kill_switch_pct` | `numeric(5,2)` | no |  |  |  |
| 6 | `symbol_cooldown_minutes` | `integer` | no |  |  |  |
| 8 | `trades_per_day_est` | `numeric(5,2)` | no |  |  |  |
| 9 | `target_daily_avg_earning_pct` | `numeric(5,2)` | no |  |  |  |
| 10 | `is_active` | `boolean` | no | `false` |  |  |
| 11 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 13 | `last_adjusted_at` | `timestamp with time zone` | yes |  |  |  |
| 14 | `learning_active` | `boolean` | no | `false` |  |  |

## Constraints

- `goals_presets_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:3436` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-04-22-initial-schema.sql:6244` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-29-b-sizing-inc2a-retire-max-open-positions-rollback.sql:6` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-09-29-b-sizing-inc2a-retire-max-open-positions-rollback.sql:8` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-29-b-sizing-inc2a-retire-max-open-positions-rollback.sql:11` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-09-29-b-sizing-inc2a-retire-max-open-positions-rollback.sql:24` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql:5` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-29-b-sizing-inc2c-retire-portfolio-risk-rollback.sql:8` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-09-29-b-sizing-inc2c-retire-portfolio-risk-rollback.sql:9` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-29-b-sizing-inc2c-retire-portfolio-risk-rollback.sql:18` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-29-b-sizing-inc2c-retire-portfolio-risk.sql:3` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:1094` (raw_sql, migration_ddl)
- read: `server/storage.ts:932` (drizzle, runtime)
- read: `server/storage.ts:949` (drizzle, runtime)
- update: `server/storage.ts:997` (drizzle, runtime)
