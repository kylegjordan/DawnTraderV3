# public.closed_trades

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `symbol` | `character varying(20)` | no |  |  |  |
| 3 | `strategy_name` | `strategy_type` | no |  |  |  |
| 4 | `side` | `character varying(10)` | no |  |  |  |
| 5 | `quantity` | `numeric(20,8)` | no |  |  |  |
| 6 | `entry_price` | `numeric(20,8)` | no |  |  |  |
| 7 | `exit_price` | `numeric(20,8)` | yes |  |  |  |
| 8 | `stop_loss` | `numeric(20,8)` | yes |  |  |  |
| 9 | `take_profit` | `numeric(20,8)` | yes |  |  |  |
| 10 | `pnl` | `numeric(20,8)` | yes |  |  |  |
| 11 | `pnl_percent` | `numeric(10,4)` | yes |  |  |  |
| 12 | `fees` | `numeric(20,8)` | yes |  |  |  |
| 13 | `slippage` | `numeric(20,8)` | yes |  |  |  |
| 14 | `opened_at` | `timestamp with time zone` | no |  |  |  |
| 15 | `closed_at` | `timestamp with time zone` | yes |  |  |  |
| 16 | `close_reason` | `character varying(50)` | yes |  |  |  |
| 17 | `confidence` | `numeric(5,2)` | yes |  |  |  |
| 18 | `metadata` | `jsonb` | yes |  |  |  |
| 19 | `entry_fee` | `numeric(20,8)` | yes |  |  |  |
| 20 | `exit_fee` | `numeric(20,8)` | yes |  |  |  |
| 21 | `total_fee` | `numeric(20,8)` | yes |  |  |  |
| 22 | `intended_entry_price` | `numeric(20,8)` | yes |  |  |  |
| 23 | `actual_entry_price` | `numeric(20,8)` | yes |  |  |  |
| 24 | `entry_slippage` | `numeric(20,8)` | yes |  |  |  |
| 25 | `target_exit_price` | `numeric(20,8)` | yes |  |  |  |
| 26 | `actual_exit_price` | `numeric(20,8)` | yes |  |  |  |
| 27 | `exit_slippage` | `numeric(20,8)` | yes |  |  |  |
| 28 | `total_cost` | `numeric(20,8)` | yes |  |  |  |
| 29 | `gross_pnl` | `numeric(20,8)` | yes |  |  |  |
| 30 | `net_pnl` | `numeric(20,8)` | yes |  |  |  |
| 31 | `net_pnl_percent` | `numeric(10,4)` | yes |  |  |  |
| 32 | `signal_type` | `signal_type` | no | `'QUANT'::signal_type` |  |  |
| 33 | `pattern_type` | `pattern_type` | yes |  |  |  |
| 34 | `pattern_strength` | `numeric(4,3)` | yes |  |  |  |
| 35 | `source_pool` | `text` | yes |  |  |  |
| 36 | `filter_tier` | `text` | yes |  |  |  |
| 37 | `exchange` | `text` | no | `'kraken'::text` |  |  |
| 38 | `asset_class` | `text` | no |  |  |  |
| 39 | `base_currency` | `character varying(10)` | no |  |  |  |
| 40 | `trade_mode` | `character varying(20)` | no | `'TARGET'::character varying` |  |  |
| 41 | `ladder_rungs_hit` | `integer` | no | `0` |  |  |
| 42 | `original_stop_price` | `numeric(20,8)` | yes |  |  |  |
| 43 | `latch_trigger_price` | `numeric(20,8)` | yes |  |  |  |
| 44 | `rung_target_history` | `jsonb` | yes |  |  |  |
| 45 | `pair_id_hash` | `smallint` | yes |  |  |  |
| 46 | `regime_confidence_raw` | `real` | yes |  |  |  |
| 47 | `macro_modifier_value` | `real` | yes |  |  |  |
| 48 | `phase` | `text` | yes |  |  |  |
| 49 | `phase_age_seconds` | `integer` | yes |  |  |  |
| 50 | `strategy_phase_weight` | `real` | yes |  |  |  |
| 51 | `regime_confidence_modulated` | `real` | yes |  |  |  |
| 52 | `calibration_state` | `text` | no | `'pre_calibration_xstock_2026_05'::text` |  |  |
| 53 | `chosen_entry_mode` | `character varying(8)` | yes |  |  |  |
| 54 | `entry_fee_rate` | `numeric(10,6)` | yes |  |  |  |
| 55 | `balance_ratio_at_open` | `numeric(12,6)` | yes |  |  |  |
| 56 | `anchor_balance_at_open` | `numeric(20,2)` | yes |  |  |  |
| 57 | `anchor_version_at_open` | `integer` | yes |  |  |  |
| 58 | `exit_fee_mode` | `character varying(8)` | yes |  |  |  |
| 59 | `exit_rest_outcome` | `character varying(8)` | yes |  |  |  |
| 60 | `exit_rested_at_price` | `numeric(20,10)` | yes |  |  |  |
| 61 | `exit_rest_duration_ms` | `integer` | yes |  |  |  |
| 62 | `mode` | `trading_mode` | no |  |  |  |
| 63 | `phantom_fill_suspect` | `boolean` | no | `false` |  |  |
| 64 | `reconstructed_exit_price` | `numeric(20,8)` | yes |  |  |  |
| 65 | `reconstructed_net_pnl` | `numeric(20,8)` | yes |  |  |  |
| 66 | `reconstructed_pnl_percent` | `numeric(20,8)` | yes |  |  |  |
| 67 | `reconstruction_basis` | `character varying(64)` | yes |  |  |  |
| 68 | `exit_decision_price` | `numeric(20,10)` | yes |  |  |  |
| 69 | `exit_price_producer` | `character varying(40)` | yes |  |  |  |
| 70 | `exit_price_source` | `character varying(40)` | yes |  |  |  |
| 71 | `exit_observed_at_ms` | `double precision` | yes |  |  |  |
| 72 | `exit_tick_cadence_ms` | `double precision` | yes |  |  |  |
| 73 | `exit_book_mid` | `numeric(20,10)` | yes |  |  |  |
| 74 | `exit_book_age_ms` | `double precision` | yes |  |  |  |
| 75 | `exit_ticker_bid` | `numeric(20,10)` | yes |  |  |  |
| 76 | `exit_ticker_ask` | `numeric(20,10)` | yes |  |  |  |
| 77 | `entry_price_producer` | `character varying(40)` | yes |  |  |  |
| 78 | `entry_price_source` | `character varying(40)` | yes |  |  |  |
| 79 | `entry_decision_price` | `numeric(20,10)` | yes |  |  |  |
| 80 | `entry_book_age_ms` | `double precision` | yes |  |  |  |
| 81 | `entry_observed_at_ms` | `double precision` | yes |  |  |  |
| 82 | `exit_fill_depth_age_ms` | `double precision` | yes |  |  |  |
| 83 | `exit_book_state` | `character varying(24)` | yes |  |  |  |
| 84 | `exit_book_state_at_fill` | `character varying(24)` | yes |  |  |  |
| 85 | `exit_book_state_basis` | `character varying(32)` | yes |  |  |  |
| 86 | `exit_fill_book_warmth` | `text` | yes |  |  |  |
| 87 | `exit_fill_arm` | `text` | yes |  |  |  |
| 88 | `entry_book_consumption_age_ms` | `double precision` | yes |  |  |  |
| 89 | `entry_fill_policy` | `character varying(20)` | yes |  |  |  |
| 90 | `target_exit_fill_policy` | `character varying(20)` | yes |  |  |  |
| 91 | `exit_ticker_captured_at` | `timestamp with time zone` | yes |  |  |  |
| 92 | `exit_ticker_age_basis` | `text` | yes |  |  |  |
| 93 | `record_restored_from_position` | `boolean` | no | `false` |  |  |
| 94 | `restored_at` | `timestamp with time zone` | yes |  |  |  |
| 95 | `restored_by_claimed` | `text` | yes |  |  |  |

## Constraints

- `paper_sim_trades_phase_check`: CHECK (phase IS NULL OR (phase = ANY (ARRAY['EARLY'::text, 'PRIME'::text, 'LATE'::text])))
- `paper_sim_trades_pkey`: PRIMARY KEY (id)
- `paper_sim_trades_trade_mode_chk`: CHECK (trade_mode::text = ANY (ARRAY['TARGET'::character varying, 'TRAILING_TAKE'::character varying]::text[]))

## Code evidence

- ddl: `drizzle/migrations/2026-07-05-p19-b8-2-balance-policy.rollback.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-05-p19-b8-2-balance-policy.rollback.sql:3` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-05-p19-b8-2-balance-policy.rollback.sql:4` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-05-p19-b8-2-balance-policy.sql:39` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-05-p19-b8-2-balance-policy.sql:40` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-05-p19-b8-2-balance-policy.sql:42` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-07-15-p19-b8-5-phantom-exit-annotation.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-15-p19-b8-6-maker-target-exits.sql:5` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-15-p19-b8-6-maker-target-exits.sql:6` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-15-p19-b8-6-maker-target-exits.sql:6` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-07-15-p19-b8-6-maker-target-exits.sql:7` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-08-21-b-balance-truth-closed-trades-mode.sql:1` (raw_sql, migration_ddl)
- update: `drizzle/migrations/2026-08-21-b-balance-truth-closed-trades-mode.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-08-21-b-balance-truth-closed-trades-mode.sql:4` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-08-23-b-phantom-fill-reconstruct.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-08-26-b-exit-provenance.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-08-30-b-exit-book-age-stamp.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-03-b-xstock-feed-sanity.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-19-b-feed-mismatch-fix-close-fill-contract-rollback.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-19-b-feed-mismatch-fix-close-fill-contract-rollback.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-09-19-b-feed-mismatch-fix-close-fill-contract.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-15-b-class-leg-fill-mode-rollback.sql:16` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-15-b-class-leg-fill-mode.sql:9` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-15-b-entry-consumption-freshness-rollback.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-15-b-entry-consumption-freshness.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-crypto-feed-watchdog-rollback.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-crypto-feed-watchdog-rollback.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-crypto-feed-watchdog.sql:1` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns-rollback.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns-rollback.sql:3` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns-rollback.sql:10` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns-rollback.sql:11` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-05-b-close-writer-costs-restore-columns.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:1` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:2` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:3` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:4` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:5` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:5` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:8` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:8` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:9` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:9` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:10` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql:15` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:26` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:26` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:27` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:28` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:28` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:30` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:30` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:31` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:32` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:32` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:33` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:39` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql:69` (raw_sql, migration_ddl)
- read: `scripts/analysis/b1250_exit_book_age.sql:4` (raw_sql, operator)
- read: `scripts/analysis/b1250_exit_book_age.sql:11` (raw_sql, operator)
- read: `scripts/analysis/b1250_step7_five_session.sql:45` (raw_sql, operator)
- read: `scripts/analysis/b1250_step7_five_session.sql:53` (raw_sql, operator)
- read: `scripts/analysis/b1250_step7_five_session.sql:60` (raw_sql, operator)
- read: `scripts/analysis/b1250_step7_five_session.sql:63` (raw_sql, operator)
- read: `scripts/analysis/b1250_step7_five_session.sql:67` (raw_sql, operator)
- read: `scripts/analysis/b1250_step7_five_session.sql:69` (raw_sql, operator)
- read: `scripts/analysis/b1250_step9_reread.sql:29` (raw_sql, operator)
- read: `scripts/analysis/b1250_step9_reread.sql:38` (raw_sql, operator)
- read: `scripts/analysis/b_book_truncate_cadence.sql:1` (raw_sql, operator)
- read: `scripts/analysis/b_book_truncate_quote_reach.sql:2` (raw_sql, operator)
- read: `scripts/analysis/b_book_truncate_reset_gate_read.sql:4` (raw_sql, operator)
- read: `scripts/analysis/b_price_age_truth_terminal_read.sql:2` (raw_sql, operator)
- read: `scripts/analysis/b_price_age_truth_terminal_read.sql:9` (raw_sql, operator)
- read: `scripts/analysis/b_price_age_truth_terminal_read.sql:32` (raw_sql, operator)
- read: `scripts/analysis/b_price_side_8c_rescore.sql:7` (raw_sql, operator)
- read: `scripts/analysis/b_price_side_p7f_entry_age_rung.sql:2` (raw_sql, operator)
- read: `scripts/analysis/b_price_side_p7f_entry_age_rung.sql:11` (raw_sql, operator)
- read: `scripts/analysis/b_price_side_p7h_limiter_class_census.sh:2` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_verify.sql:7` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_verify.sql:16` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_verify.sql:34` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_verify.sql:50` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_verify.sql:74` (raw_sql, operator)
- read: `scripts/analysis/b_xstock_fee_contract_verify.sql:90` (raw_sql, operator)
- read: `scripts/analysis/obj_pa_pb.cjs:31` (raw_sql, operator)
- read: `scripts/analysis/xstock-refusal-holds.py:37` (raw_sql, operator)
- read: `scripts/analysis/xstock-wide-book-stop-vs-next-open.py:8` (raw_sql, operator)
- read: `scripts/analysis/xstock-wide-book-stop-vs-next-open.py:34` (raw_sql, operator)
- read: `scripts/b-crypto-feed-watchdog-witness-backfill.ts:28` (raw_sql, operator)
- update: `scripts/b-crypto-feed-watchdog-witness-backfill.ts:71` (raw_sql, operator)
- read: `scripts/b79-0f-collision-audit.sql:52` (raw_sql, operator)
- read: `scripts/batch-verify/b-venue-quiet-alerting/exit_leg_sector_ccb.sql:31` (raw_sql, operator)
- read: `scripts/batch-verify/b-venue-quiet-alerting/exit_leg_v2_ccb.sql:18` (raw_sql, operator)
- read: `scripts/batch-verify/b-venue-quiet-alerting/exit_leg_v3_ccb.sql:22` (raw_sql, operator)
- read: `scripts/batch-verify/b-venue-quiet-alerting/open_times_ccb.sql:14` (raw_sql, operator)
- read: `scripts/batch-verify/b-venue-quiet-alerting/zero_character_ccb.sql:20` (raw_sql, operator)
- read: `scripts/codex-export/export-data.sql:18` (raw_sql, operator)
- read: `scripts/codex-export/export-data.sql:34` (raw_sql, operator)
- read: `scripts/xstock-hollow-recut.ts:81` (raw_sql, operator)
- update: `scripts/xstock-hollow-recut.ts:141` (raw_sql, operator)
- read: `server/core/rtb/ready_to_buy_service.ts:2378` (raw_sql, runtime)
- read: `server/scripts/paper-reset-3000.ts:203` (raw_sql, runtime)
- read: `server/scripts/paper-reset-3000.ts:208` (raw_sql, runtime)
- read: `server/scripts/paper-reset-3000.ts:244` (raw_sql, runtime)
- read: `server/scripts/paper-reset-3000.ts:247` (raw_sql, runtime)
- read: `server/scripts/paper-reset-3000.ts:318` (raw_sql, runtime)
- read: `server/scripts/paper-reset-3000.ts:320` (raw_sql, runtime)
- read: `server/services/execution/exploration-lane.ts:94` (raw_sql, runtime)
- read: `server/services/execution/exploration-lane.ts:131` (raw_sql, runtime)
- read: `server/services/reserve-row-tripwire.ts:135` (raw_sql, runtime)
- update: `server/storage.ts:732` (drizzle, runtime)
- insert: `server/storage.ts:3164` (drizzle, runtime)
- update: `server/storage.ts:3169` (drizzle, runtime)
- update: `server/storage.ts:3179` (drizzle, runtime)
- read: `server/storage.ts:3187` (drizzle, runtime)
- read: `server/storage.ts:3264` (drizzle, runtime)
- read: `server/storage.ts:3273` (drizzle, runtime)
- read: `server/storage.ts:3330` (drizzle, runtime)
- read: `server/storage.ts:3355` (drizzle, runtime)
- read: `server/storage.ts:3426` (drizzle, runtime)
- read: `server/storage.ts:3502` (raw_sql, runtime)
- read: `server/storage.ts:3557` (raw_sql, runtime)
- read: `server/storage.ts:3588` (drizzle, runtime)
- read: `server/storage.ts:3619` (drizzle, runtime)
- read: `server/storage.ts:3642` (drizzle, runtime)
- read: `server/storage.ts:3674` (drizzle, runtime)
- insert: `server/storage.ts:3684` (drizzle, runtime)
- read: `server/storage.ts:3692` (drizzle, runtime)
- read: `server/storage.ts:3763` (drizzle, runtime)
- read: `server/storage.ts:3777` (drizzle, runtime)
- read: `server/storage.ts:3873` (drizzle, runtime)
- read: `server/storage.ts:3877` (drizzle, runtime)
- delete: `server/storage.ts:3971` (drizzle, runtime)
- delete: `server/storage.ts:3984` (drizzle, runtime)
- read: `server/storage.ts:4039` (drizzle, runtime)
- read: `server/tests/integration/b-balance-truth-ghost-redundancy-fence.test.ts:120` (raw_sql, test_only)
- delete: `server/tests/integration/b-balance-truth-mode-partition-fence.test.ts:68` (raw_sql, test_only)
- insert: `server/tests/integration/b-balance-truth-mode-partition-fence.test.ts:119` (raw_sql, test_only)
- read: `server/tests/integration/b-balance-truth-pnl-basis-fence.test.ts:105` (raw_sql, test_only)
- insert: `server/tests/integration/b-killswitch-window.test.ts:150` (drizzle, test_only)
- insert: `server/tests/integration/b-killswitch-window.test.ts:155` (drizzle, test_only)
- insert: `server/tests/integration/b-killswitch-window.test.ts:171` (drizzle, test_only)
- insert: `server/tests/integration/b-killswitch-window.test.ts:179` (drizzle, test_only)
- delete: `server/tests/integration/b-killswitch-window.test.ts:184` (drizzle, test_only)
- insert: `server/tests/integration/b-loss-window-operator-closes-db.test.ts:92` (drizzle, test_only)
- read: `server/tests/integration/b-loss-window-operator-closes-db.test.ts:97` (raw_sql, test_only)
- read: `server/tests/integration/b-loss-window-operator-closes-db.test.ts:104` (raw_sql, test_only)
- read: `server/tests/integration/b-phantom-fill-reconstruct-fence.test.ts:138` (raw_sql, test_only)
- read: `server/tests/integration/b-phantom-fill-reconstruct-fence.test.ts:162` (raw_sql, test_only)
- insert: `server/tests/integration/b-sizing-inc2b-cooldown-db.test.ts:37` (raw_sql, test_only)
- delete: `server/tests/integration/b-sizing-inc2b-cooldown-db.test.ts:56` (raw_sql, test_only)
- insert: `server/tests/integration/b-sizing-inc2b-cooldown-db.test.ts:64` (raw_sql, test_only)
- delete: `server/tests/integration/b-sizing-inc2b-cooldown-db.test.ts:73` (raw_sql, test_only)
- read: `server/tests/unit/b-db-pool-measure.test.ts:139` (raw_sql, test_only)
- read: `server/tests/unit/b-db-pool-measure.test.ts:139` (raw_sql, test_only)
- read: `server/tests/unit/b-db-pool-measure.test.ts:144` (raw_sql, test_only)
- read: `server/tests/unit/b-db-pool-measure.test.ts:177` (raw_sql, test_only)
- update: `server/tests/unit/b-xstock-feed-sanity-fence.test.ts:139` (raw_sql, test_only)
