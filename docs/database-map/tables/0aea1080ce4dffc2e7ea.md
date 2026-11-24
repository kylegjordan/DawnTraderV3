# public.signal_weights

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `character varying` | no |  |  |  |
| 3 | `strategy` | `strategy_type` | no |  |  |  |
| 4 | `mode` | `trading_mode` | no |  |  |  |
| 5 | `signal_name` | `character varying(100)` | no |  |  |  |
| 6 | `weight` | `numeric(8,4)` | yes | `1.0000` |  |  |
| 7 | `correlation_score` | `numeric(8,4)` | yes |  |  |  |
| 8 | `sample_size` | `integer` | yes | `0` |  |  |
| 9 | `last_updated` | `timestamp with time zone` | yes | `now()` |  |  |
| 10 | `metadata` | `jsonb` | yes |  |  |  |

## Constraints

- `signal_weights_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:5517` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:1839` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2545` (raw_sql, migration_ddl)
- read: `server/storage.ts:2492` (drizzle, runtime)
- read: `server/storage.ts:2500` (drizzle, runtime)
- insert: `server/storage.ts:2513` (drizzle, runtime)
- update: `server/storage.ts:2518` (drizzle, runtime)
