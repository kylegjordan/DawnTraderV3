# public.rtb_shadow_pairings

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no |  |  |  |
| 2 | `cycle_key` | `character varying(80)` | no |  |  |  |
| 3 | `mode` | `character varying(16)` | no |  |  |  |
| 4 | `asset_class` | `character varying(32)` | no |  |  |  |
| 5 | `regime` | `character varying(50)` | yes |  |  |  |
| 6 | `promotion_rank` | `integer` | yes |  |  |  |
| 7 | `promoted` | `boolean` | no | `false` |  |  |
| 8 | `promoted_trade_id` | `character varying` | yes |  |  |  |
| 9 | `signal_id` | `character varying` | yes |  |  |  |
| 10 | `symbol` | `character varying(20)` | no |  |  |  |
| 11 | `strategy` | `character varying(50)` | no |  |  |  |
| 12 | `entry_price` | `numeric(20,8)` | yes |  |  |  |
| 13 | `stop_price` | `numeric(20,8)` | yes |  |  |  |
| 14 | `target_price` | `numeric(20,8)` | yes |  |  |  |
| 15 | `final_score` | `numeric(10,6)` | yes |  |  |  |
| 16 | `hybrid_score` | `numeric(10,6)` | yes |  |  |  |
| 17 | `confidence` | `numeric(10,6)` | yes |  |  |  |
| 18 | `regime_weight` | `numeric(10,6)` | yes |  |  |  |
| 19 | `decay_penalty` | `numeric(10,6)` | yes |  |  |  |
| 20 | `ranking_score` | `numeric(10,6)` | yes |  |  |  |
| 21 | `source_pool` | `character varying(32)` | yes |  |  |  |
| 22 | `di_at_queue` | `numeric(8,4)` | yes |  |  |  |
| 23 | `dbs_score_at_queue` | `numeric(8,4)` | yes |  |  |  |
| 24 | `sqe_verdict` | `character varying(32)` | yes |  |  |  |
| 25 | `sqe_reject_reason` | `character varying(64)` | yes |  |  |  |
| 26 | `gross_pnl` | `numeric(20,8)` | yes |  |  |  |
| 27 | `net_pnl` | `numeric(20,8)` | yes |  |  |  |
| 28 | `r_multiple` | `numeric(10,4)` | yes |  |  |  |
| 29 | `close_reason` | `character varying(40)` | yes |  |  |  |
| 30 | `exit_price` | `numeric(20,8)` | yes |  |  |  |
| 31 | `holding_ms` | `integer` | yes |  |  |  |
| 32 | `closed` | `boolean` | no | `false` |  |  |
| 33 | `opened_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 34 | `closed_at` | `timestamp with time zone` | yes |  |  |  |
| 35 | `created_at` | `timestamp with time zone` | yes | `now()` |  |  |
| 36 | `predicted_r_multiple` | `numeric(10,4)` | yes |  |  |  |
| 37 | `pwin_floored` | `boolean` | no | `false` |  |  |
| 38 | `cross_class_promotion` | `boolean` | no | `false` |  |  |
| 39 | `exit_booking_arm` | `character varying(16)` | yes |  |  |  |

## Constraints

- `rtb_shadow_pairings_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-06-30-p19-b7-1-shadow-r-multiple.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-02-b-vts-no-decision-valve-shadow-arm-rollback.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-02-b-vts-no-decision-valve-shadow-arm.sql:1` (raw_sql, migration_ddl)
- read: `scripts/analysis/b_vts_no_decision_valve_step7.sql:4` (raw_sql, operator)
- read: `scripts/analysis/b_vts_no_decision_valve_step7.sql:12` (raw_sql, operator)
- read: `scripts/analysis/b_vts_no_decision_valve_step7.sql:17` (raw_sql, operator)
- read: `scripts/analysis/b_vts_no_decision_valve_step7.sql:19` (raw_sql, operator)
- read: `scripts/analysis/b_vts_no_decision_valve_step7.sql:31` (raw_sql, operator)
- read: `scripts/analysis/b_vts_valve_persistence.sql:2` (raw_sql, operator)
- read: `scripts/analysis/b_vts_valve_persistence.sql:17` (raw_sql, operator)
- read: `scripts/analysis/b_vts_valve_persistence.sql:22` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql:21` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql:52` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql:69` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql:72` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql:83` (raw_sql, operator)
- read: `server/routes.ts:2729` (raw_sql, runtime)
- read: `server/routes.ts:2776` (raw_sql, runtime)
- read: `server/routes.ts:2790` (raw_sql, runtime)
- read: `server/routes.ts:2808` (raw_sql, runtime)
- insert: `server/services/rtb-shadow-store.ts:117` (raw_sql, runtime)
- update: `server/services/rtb-shadow-store.ts:180` (raw_sql, runtime)
