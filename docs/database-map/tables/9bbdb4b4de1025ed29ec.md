# public.paper_trades

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `symbol` | `character varying(20)` | no |  |  |  |
| 3 | `strategy` | `strategy_type` | no |  |  |  |
| 4 | `status` | `trade_status` | yes | `'open'::trade_status` |  |  |
| 5 | `entry_price` | `numeric(20,8)` | no |  |  |  |
| 6 | `exit_price` | `numeric(20,8)` | yes |  |  |  |
| 7 | `quantity` | `numeric(20,8)` | no |  |  |  |
| 8 | `stop_price` | `numeric(20,8)` | no |  |  |  |
| 9 | `target_price` | `numeric(20,8)` | no |  |  |  |
| 10 | `simulated_order_id` | `character varying` | yes |  |  |  |
| 11 | `entry_fee` | `numeric(10,4)` | yes | `'0'::numeric` |  |  |
| 12 | `exit_fee` | `numeric(10,4)` | yes | `'0'::numeric` |  |  |
| 13 | `entry_slippage` | `numeric(5,2)` | yes | `'0'::numeric` |  |  |
| 14 | `exit_slippage` | `numeric(5,2)` | yes | `'0'::numeric` |  |  |
| 15 | `simulated_latency_ms` | `integer` | yes | `250` |  |  |
| 16 | `risk_amount` | `numeric(10,2)` | no |  |  |  |
| 17 | `realized_pl` | `numeric(10,2)` | yes |  |  |  |
| 18 | `realized_pl_percent` | `numeric(8,4)` | yes |  |  |  |
| 19 | `realized_pl_r` | `numeric(8,4)` | yes |  |  |  |
| 20 | `entry_time` | `timestamp with time zone` | yes | `now()` |  |  |
| 21 | `exit_time` | `timestamp with time zone` | yes |  |  |  |
| 22 | `metadata` | `jsonb` | yes |  |  |  |
| 23 | `mfe` | `numeric(10,2)` | yes |  |  |  |
| 24 | `mae` | `numeric(10,2)` | yes |  |  |  |
| 25 | `ngc` | `numeric(6,4)` | yes |  |  |  |
| 26 | `cwqi` | `numeric(6,4)` | yes |  |  |  |
| 27 | `confidence` | `numeric(6,4)` | yes |  |  |  |
| 28 | `profit_rate` | `numeric(6,4)` | yes |  |  |  |
| 29 | `source_pool` | `text` | yes |  |  |  |
| 30 | `filter_tier` | `text` | yes |  |  |  |

## Constraints

- `paper_trades_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:4762` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:1554` (raw_sql, migration_ddl)
- ddl: `migrations/0001_familiar_pete_wisdom.sql:45` (raw_sql, migration_ddl)
- ddl: `migrations/0001_familiar_pete_wisdom.sql:46` (raw_sql, migration_ddl)
- ddl: `migrations/0001_familiar_pete_wisdom.sql:47` (raw_sql, migration_ddl)
- ddl: `migrations/0001_familiar_pete_wisdom.sql:48` (raw_sql, migration_ddl)
- insert: `server/storage.ts:2438` (drizzle, runtime)
- update: `server/storage.ts:2443` (drizzle, runtime)
- read: `server/storage.ts:2452` (drizzle, runtime)
- read: `server/storage.ts:2460` (drizzle, runtime)
- read: `server/storage.ts:2467` (drizzle, runtime)
- delete: `server/storage.ts:2475` (drizzle, runtime)
