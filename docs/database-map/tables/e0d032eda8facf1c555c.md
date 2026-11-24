# public.latti_baseline_history

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `trading_mode` | `character varying(20)` | no |  |  |  |
| 3 | `timestamp` | `timestamp with time zone` | yes | `now()` |  |  |
| 4 | `trigger_reason` | `text` | no |  |  |  |
| 5 | `trades_since_anchor` | `integer` | yes |  |  |  |
| 6 | `win_rate_before` | `numeric(8,4)` | yes |  |  |  |
| 7 | `win_rate_after` | `numeric(8,4)` | yes |  |  |  |
| 8 | `profit_factor_before` | `numeric(8,4)` | yes |  |  |  |
| 9 | `profit_factor_after` | `numeric(8,4)` | yes |  |  |  |
| 10 | `drawdown_before` | `numeric(8,4)` | yes |  |  |  |
| 11 | `drawdown_after` | `numeric(8,4)` | yes |  |  |  |
| 12 | `risk_per_trade_before` | `numeric(8,4)` | yes |  |  |  |
| 13 | `risk_per_trade_after` | `numeric(8,4)` | yes |  |  |  |
| 14 | `trades_per_day_before` | `numeric(8,2)` | yes |  |  |  |
| 15 | `trades_per_day_after` | `numeric(8,2)` | yes |  |  |  |
| 16 | `expected_profit_per_trade_before` | `numeric(10,2)` | yes |  |  |  |
| 17 | `expected_profit_per_trade_after` | `numeric(10,2)` | yes |  |  |  |
| 18 | `metadata` | `jsonb` | yes | `'{}'::jsonb` |  |  |
| 19 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |

## Constraints

- `latti_baseline_history_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:3700` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:1281` (raw_sql, migration_ddl)
