# public.asset_capabilities

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `symbol` | `character varying(20)` | no |  |  |  |
| 3 | `asset_type` | `character varying(20)` | no |  |  |  |
| 4 | `allows_fractional` | `boolean` | no | `true` |  |  |
| 5 | `lot_size` | `numeric(20,8)` | no |  |  |  |
| 6 | `tick_size` | `numeric(20,8)` | no |  |  |  |
| 7 | `min_notional` | `numeric(10,2)` | no |  |  |  |
| 8 | `fees_model` | `character varying(50)` | yes | `'maker_taker'::character varying` |  |  |
| 9 | `venue` | `character varying(50)` | no |  |  |  |
| 10 | `last_synced` | `timestamp with time zone` | yes | `now()` |  |  |
| 11 | `metadata` | `jsonb` | yes |  |  |  |

## Constraints

- `asset_capabilities_pkey`: PRIMARY KEY (id)
- `asset_capabilities_symbol_unique`: UNIQUE (symbol)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:1144` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:299` (raw_sql, migration_ddl)
- read: `server/storage.ts:3024` (drizzle, runtime)
- read: `server/storage.ts:3032` (drizzle, runtime)
- insert: `server/storage.ts:3036` (drizzle, runtime)
- update: `server/storage.ts:3041` (drizzle, runtime)
