# public.ai_opportunities

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `character varying` | no |  |  |  |
| 3 | `run_id` | `character varying` | yes |  |  |  |
| 4 | `symbol` | `character varying(20)` | no |  |  |  |
| 5 | `type` | `opportunity_type` | no |  |  |  |
| 6 | `entry_zone` | `jsonb` | no |  |  |  |
| 7 | `stop_floor` | `numeric(20,8)` | no |  |  |  |
| 8 | `target_ceiling` | `jsonb` | no |  |  |  |
| 9 | `time_horizon` | `character varying(50)` | yes |  |  |  |
| 10 | `risk_amount_rule` | `jsonb` | yes |  |  |  |
| 11 | `notes` | `text` | yes |  |  |  |
| 12 | `probability_score` | `integer` | yes |  |  |  |
| 13 | `risk_reward_rating` | `numeric(5,2)` | yes |  |  |  |
| 14 | `eligibility_flags` | `jsonb` | yes |  |  |  |
| 15 | `status` | `opportunity_status` | yes | `'new'::opportunity_status` |  |  |
| 16 | `executed_trade_id` | `character varying` | yes |  |  |  |
| 17 | `conversation_id` | `character varying` | yes |  |  |  |
| 18 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 19 | `updated_at` | `timestamp with time zone` | yes | `now()` |  |  |

## Constraints

- `ai_opportunities_conversation_id_ai_conversations_id_fk`: FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
- `ai_opportunities_executed_trade_id_trades_id_fk`: FOREIGN KEY (executed_trade_id) REFERENCES trades(id)
- `ai_opportunities_pkey`: PRIMARY KEY (id)
- `ai_opportunities_run_id_ai_opportunity_runs_id_fk`: FOREIGN KEY (run_id) REFERENCES ai_opportunity_runs(id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:898` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:198` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2491` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2492` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2493` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2494` (raw_sql, migration_ddl)
- read: `server/diagnostics/metrics.ts:173` (raw_sql, runtime)
- insert: `server/storage.ts:2326` (drizzle, runtime)
- update: `server/storage.ts:2331` (drizzle, runtime)
- read: `server/storage.ts:2355` (drizzle, runtime)
- read: `server/storage.ts:2365` (drizzle, runtime)
