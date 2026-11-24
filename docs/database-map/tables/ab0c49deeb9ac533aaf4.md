# public.screener_filters

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `mode` | `trading_mode` | no |  |  |  |
| 3 | `min_volume` | `numeric(15,2)` | yes | `1000000.00` |  |  |
| 4 | `min_price` | `numeric(10,8)` | yes | `0.01` |  |  |
| 5 | `max_price` | `numeric(10,2)` | yes | `10000.00` |  |  |
| 6 | `min_market_cap` | `numeric(15,2)` | yes | `100000000.00` |  |  |
| 7 | `max_bid_ask_spread` | `numeric(5,2)` | yes | `1.00` |  |  |
| 8 | `rsi_min` | `integer` | yes | `30` |  |  |
| 9 | `rsi_max` | `integer` | yes | `70` |  |  |
| 10 | `volatility_min` | `numeric(5,2)` | yes | `0.50` |  |  |
| 11 | `volatility_max` | `numeric(5,2)` | yes | `5.00` |  |  |
| 12 | `exclude_stablecoins` | `boolean` | yes | `true` |  |  |
| 13 | `min_liquidity` | `numeric(15,2)` | yes | `500000.00` |  |  |
| 14 | `allow_regulated_only` | `boolean` | yes | `false` |  |  |
| 15 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 16 | `updated_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 17 | `last_updated_by` | `character varying` | yes |  |  |  |
| 18 | `universe_size` | `integer` | yes | `100` |  |  |
| 19 | `quote_currencies` | `jsonb` | yes | `'[]'::jsonb` |  |  |
| 20 | `active_timeframes` | `jsonb` | yes | `'["5m", "15m", "1h"]'::jsonb` |  |  |
| 21 | `confidence_threshold` | `integer` | yes | `60` |  |  |
| 22 | `managed_by_lottie` | `boolean` | no | `true` |  |  |
| 23 | `manual_override_enabled` | `boolean` | no | `false` |  |  |
| 24 | `locked_by_user` | `jsonb` | yes | `'{}'::jsonb` |  |  |
| 25 | `filter_overrides` | `jsonb` | yes | `'{}'::jsonb` |  |  |
| 26 | `min_history_days` | `integer` | yes | `30` |  |  |
| 27 | `final_score_min` | `numeric(5,4)` | yes | `0.35` |  |  |
| 28 | `regime_weight_min` | `numeric(5,4)` | yes | `0.30` |  |  |
| 29 | `filter_path` | `text` | yes |  |  |  |
| 30 | `lq_min` | `numeric(10,4)` | yes |  |  |  |
| 31 | `vn_max` | `numeric(10,4)` | yes |  |  |  |
| 32 | `di_min` | `numeric(10,4)` | yes |  |  |  |
| 33 | `di_max` | `numeric(10,4)` | yes |  |  |  |
| 34 | `volume_24h_min` | `numeric(15,2)` | yes |  |  |  |
| 35 | `strategies` | `jsonb` | yes |  |  |  |
| 36 | `description` | `text` | yes |  |  |  |
| 37 | `enabled` | `boolean` | yes | `true` |  |  |
| 38 | `corr_max` | `numeric(5,4)` | yes | `0.9200` |  |  |
| 39 | `asset_class` | `text` | no | `'crypto_spot'::text` |  |  |
| 40 | `tunable_status` | `text` | no | `'active'::text` |  |  |
| 41 | `min_depth_usd` | `numeric(20,2)` | yes |  |  |  |

## Constraints

- `screener_filters_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:5145` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-04-22-initial-schema.sql:6232` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:589` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:593` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:602` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:603` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:604` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:605` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:606` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:607` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:608` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:609` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:610` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:611` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:612` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:613` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:614` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:615` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:616` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:617` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:618` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:619` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:620` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:621` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:622` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:623` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:624` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:625` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:626` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:627` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:628` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:629` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:630` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:631` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:632` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:633` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:634` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:635` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:636` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:637` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:638` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:639` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:640` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:641` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:642` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:643` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:644` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:645` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:646` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:647` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:648` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:649` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:650` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:651` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:652` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:653` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:654` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:655` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:656` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-04-22b-initial-seed-data.sql:657` (raw_sql, migration_ddl)
- delete: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class-rollback.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class-rollback.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class-rollback.sql:3` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class.sql:3` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class.sql:5` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class.sql:6` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-05-07-b79-screener-filters-asset-class.sql:9` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-11-b79-0m-a-screener-filters-asset-class-index.sql:2` (raw_sql, migration_ddl)
- delete: `drizzle/migrations/2026-05-11-b79-0m-a-xstock-family-imf-seeds-rollback.sql:1` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql:2` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql:26` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql:36` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-05-11-b79-0m-b-xstock-active-quant-row.sql:2` (raw_sql, migration_ddl)
- delete: `drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows-rollback.sql:1` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows-rollback.sql:10` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows.sql:2` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-05-11-b79-0m-b2-xstock-pattern-rows.sql:28` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-12-b-new-1-xstock-global-tighten.sql:2` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-12-b-new-1-xstock-global-tighten.sql:5` (raw_sql, migration_ddl)
- insert: `drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql:2` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql:20` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-05-30-b-1-5-xstock-depth-liquidity.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-30-b-1-5-xstock-depth-liquidity.sql:8` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-30-b-1-5-xstock-depth-liquidity.sql:10` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-05-30-b-1-5-xstock-depth-liquidity.sql:13` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib-rollback.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib-rollback.sql:4` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib-rollback.sql:10` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib-rollback.sql:16` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib.sql:5` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib.sql:9` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-04-b4-foundation-vndi-15m-recalib.sql:12` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-10b-b2-lq-apply-rollback.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-10b-b2-lq-apply-rollback.sql:3` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-10b-b2-lq-apply-rollback.sql:10` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-10b-b2-lq-apply.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-06-10b-b2-lq-apply.sql:4` (raw_sql, migration_ddl)
- ddl: `migrate-19g.js:13` (raw_sql, runtime)
- ddl: `migrate-19g.js:14` (raw_sql, runtime)
- ddl: `migrate-19g.js:15` (raw_sql, runtime)
- ddl: `migrate-19g.js:16` (raw_sql, runtime)
- ddl: `migrate-19g.js:17` (raw_sql, runtime)
- update: `migrate-19g.js:28` (raw_sql, runtime)
- update: `migrate-19g.js:29` (raw_sql, runtime)
- update: `migrate-19g.js:37` (raw_sql, runtime)
- insert: `migrate-19g.js:49` (raw_sql, runtime)
- insert: `migrate-19g.js:76` (raw_sql, runtime)
- insert: `migrate-19g.js:103` (raw_sql, runtime)
- update: `migrate-19g.js:133` (raw_sql, runtime)
- insert: `migrate-19g.js:145` (raw_sql, runtime)
- insert: `migrate-19g.js:172` (raw_sql, runtime)
- insert: `migrate-19g.js:199` (raw_sql, runtime)
- read: `migrate-19g.js:228` (raw_sql, runtime)
- ddl: `migrations/0000_flaky_freak.sql:1782` (raw_sql, migration_ddl)
- read: `scripts/b4-vndi-recalib-study.ts:356` (raw_sql, operator)
- insert: `server/db/seed-family-filters.ts:37` (drizzle, runtime)
- update: `server/db/update-di-thresholds.ts:25` (drizzle, runtime)
- read: `server/exchanges/kraken/kraken-data-documenter.ts:136` (raw_sql, runtime)
- read: `server/scripts/dump-settings-registry.ts:78` (drizzle, runtime)
- read: `server/storage.ts:1024` (drizzle, runtime)
- update: `server/storage.ts:1069` (drizzle, runtime)
- insert: `server/storage.ts:1080` (drizzle, runtime)
