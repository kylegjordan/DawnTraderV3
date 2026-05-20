# B-NEW-36 Sub-batch (a) — `_migrations` Ledger Reconciliation Change List

**Author:** Claude Code
**Date:** 2026-05-20
**Type:** DB-only — `_migrations` ledger backfill. No application-code change. No schema change beyond ledger row inserts.
**Reference:** `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` §1 + `B_NEW_36_PRE_AUDIT.md` §3.11.
**Resolves:** RUNNING_ISSUES #119.

---

## §1 Headline

`_migrations` ledger had 17 rows missing for files demonstrably applied to staging DB between 2026-05-08 and 2026-05-17 (16 governance-batch migrations + 1 B-NEW-35 rev6 SQL file applied via bash-per-symbol pattern). All 17 files verified against live DB state via per-file post-state queries; effects are present; ledger rows backfilled this batch. `npm run db:migrate` now reports zero pending. RUNNING_ISSUES #119 closes.

---

## §2 Method

Per scope §1 and pre-audit §3.11 + Langston Step 2 ACK:

1. For each of the 16 pending files, inspect the SQL to identify expected post-state (DDL CREATE, ALTER, INSERT seed, UPDATE row).
2. Query the live staging DB for that artifact (table existence, column existence, row count + value, index presence).
3. If verified applied: INSERT `(name, applied_at=NOW())` into `_migrations`.
4. If NOT verified applied: STOP and escalate.

**Result: all 16 files verified applied.** Plus B-NEW-35 Phase 1 rev6 (the final working SQL via bash-per-symbol pattern) also added to ledger to prevent migration runner from re-attempting.

---

## §3 Per-file verification log

| # | File | Type | Verification query | Expected | Observed | Status |
|---|---|---|---|---|---|---|
| 1 | `2026-05-08-b79-tec-per-class-be-rows.sql` | INSERT 4 rows + post-INSERT assertion | `SELECT asset_class, value FROM module_constants WHERE module_name='trailing_exit' AND constant_name='break_even_enabled' AND asset_class IN ('crypto_spot','crypto_perp','xstock_spot','xstock_perp')` | 4 rows (3×false + xstock_spot=true intentional override per b79-0m-b) | `crypto_perp=false, crypto_spot=false, xstock_perp=false, xstock_spot=true` (4 rows) | **VERIFIED** — assertion in file would have failed because xstock_spot was later flipped to true; this is the documented post-condition per pre-audit §3 of scope. |
| 2 | `2026-05-10-b79-0e-rename-equity-to-xstock.sql` | DDL rename (4 parents + ~52 partition children + ~112 indexes + 4 module_constants keys) | `SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'equity_%'; SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'equity_%'; SELECT COUNT(*) FROM pg_tables WHERE tablename IN ('xstock_spot_ohlc_1m','xstock_perp_ohlc_1m')` | 0 equity_*, xstock_* present | `equity_leftover_tables=0`, `equity_leftover_indexes=0`, `xstock_spot_ohlc_1m=1`, `xstock_perp_ohlc_1m=1` | **VERIFIED**. *Additional finding:* 4 `equity_*` keys remain in `module_constants.data_lifecycle` but those were re-inserted on 2026-05-18 20:52 UTC by a `b75-data-lifecycle` seed — separate housekeeping issue, NOT a b79-0e partial-apply. Documented in §5. |
| 3 | `2026-05-10-b79-0g-vts-open-trades.sql` | DDL CREATE TABLE + 3 indexes | `SELECT COUNT(*) FROM pg_tables WHERE tablename='vts_open_trades'; SELECT indexname FROM pg_indexes WHERE tablename='vts_open_trades'` | table + 3 named indexes | table=1; indexes: `vts_open_trades_asset_class_idx`, `vts_open_trades_opened_at_idx`, `vts_open_trades_symbol_idx`, plus PK + `vts_open_trades_open_filter_idx` from b79-0g-tx | **VERIFIED**. |
| 4 | `2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql` | DDL ADD COLUMN + partial index | `SELECT column_name FROM information_schema.columns WHERE table_name='vts_open_trades' AND column_name IN ('closed','closed_at'); SELECT COUNT(*) FROM pg_indexes WHERE indexname='vts_open_trades_open_filter_idx'` | 2 columns + partial index | columns=`closed, closed_at`; `open_filter_idx=1` | **VERIFIED**. |
| 5 | `2026-05-10-b79-0g-tx-data-lifecycle-seed.sql` | INSERT 1 wildcard row | `SELECT asset_class, value FROM module_constants WHERE module_name='data_lifecycle' AND constant_name='vts_open_trades.closed_gc_retention_days'` | 1 row, wildcard, value=90 | `asset_class=*, value=90` | **VERIFIED**. |
| 6 | `2026-05-11-b79-0m-a-screener-filters-asset-class-index.sql` | DROP CONSTRAINT/INDEX old + CREATE new | `SELECT COUNT(*) FROM pg_indexes WHERE indexname='screener_filters_mode_class_path_idx'; SELECT COUNT(*) FROM pg_indexes WHERE indexname='screener_filters_mode_path_idx'` | new_idx=1, old_idx=0 | `new_idx=1, old_idx=0` | **VERIFIED**. |
| 7 | `2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql` | INSERT 10 family-IMF rows (5 paper + 5 live) | `SELECT COUNT(*) FROM screener_filters WHERE asset_class='xstock_spot' AND filter_path IN (...10 paths...)` | 10 | `family_imf_rows=10` | **VERIFIED**. |
| 8 | `2026-05-11-b79-0m-a-xstock-regime-classifier-seeds.sql` | INSERT 3 xstock_spot rows | `SELECT module_name, constant_name, value FROM module_constants WHERE asset_class='xstock_spot' AND regime='TREND_FRIENDLY_STABLE' AND constant_name IN (...)` | 3 rows with specified values | `b67_3_5_tfs_momentum_scale=0.010, b67_3_5_tfs_volatility_scale=0.0125, b68_5_path_b_momentum_min=0.0005` | **VERIFIED**. |
| 9 | `2026-05-11-b79-0m-a-xstock-strategy-gates-seeds.sql` | INSERT 18 strategy_gates rows (9 true + 9 false; ORB pre-seeded by B79) | `SELECT COUNT(*) FROM module_constants WHERE module_name='strategy_gates' AND constant_name='enabled' AND asset_class='xstock_spot'` | 19 total (18 + ORB) | `strategy_gates_xstock_rows=19, enabled_true=9` | **VERIFIED**. *Note:* `enabled_true=9` (not 10) because ORB was later flipped to disabled per B-NEW-34 ("ORB disabled, intraday-bar strategy, revisit Phase D"). The migration ran successfully; subsequent batch evolved ORB's state. |
| 10 | `2026-05-11-b79-0m-b-xstock-active-quant-row.sql` | INSERT 2 active_quant rows (paper + live) | `SELECT mode, last_updated_by FROM screener_filters WHERE asset_class='xstock_spot' AND filter_path='active_quant'` | 2 rows | 2 rows (paper, live); `last_updated_by='b-new-max-price-zero-fractional-ownership-2026-05-12'` (subsequent UPDATE by B-NEW-max-price) | **VERIFIED**. Migration's seed rows are present; updated_by evolved by later UPDATE batch. |
| 11 | `2026-05-11-b79-0m-b-xstock-tec-enable.sql` | UPDATE xstock_spot break_even_enabled to true + INSERT 4 TEC rows | `SELECT value FROM module_constants WHERE module_name='trailing_exit' AND asset_class='xstock_spot' AND constant_name='break_even_enabled'; SELECT constant_name, value FROM ... 4 TEC rows` | be_enabled=true; 4 TEC rows with B79.0m.b values | `xstock_spot_be_enabled=true`; `break_even_trigger_r=1.0, target_lock_r=1.5, trail_distance_atr_multiplier=0.8, rung_floor_slippage_buffer_multiplier=1.0` | **VERIFIED**. |
| 12 | `2026-05-11-b79-0m-b2-xstock-pattern-rows.sql` | INSERT 4 pattern rows | `SELECT mode, filter_path FROM screener_filters WHERE asset_class='xstock_spot' AND filter_path IN ('vts_pattern','active_pattern')` | 4 rows | 4 rows (vts_pattern paper+live, active_pattern paper+live) | **VERIFIED**. |
| 13 | `2026-05-12-b-new-1-xstock-global-tighten.sql` | UPDATE active_quant + vts_pattern thresholds | (B-NEW-1 signature on `last_updated_by` was overwritten by subsequent B-NEW-max-price UPDATE on 2026-05-12) | min_price/min_volume tightening visible | active_quant + vts_pattern rows present; per-row threshold values intact; last_updated_by overwritten by later batch — verified by examining row threshold values against B-NEW-1 spec (min_price 5.00 for active_quant, 2.00 for vts_pattern) | **VERIFIED** by row presence + threshold values. last_updated_by signature lost to subsequent batch is acceptable — B-NEW-1's structural effect (tighter filtering) is in place. |
| 14 | `2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql` | INSERT 24 rows (8 wildcard + 8 xstock + 8 crypto) | `SELECT COUNT(*) FROM module_constants WHERE module_name='price_discontinuity_detector'` | 24 total | `pdd_total=24` (wildcard=8, xstock=8, crypto=8) | **VERIFIED**. |
| 15 | `2026-05-17-b-phase-a2-dbs-backfill-table.sql` | CREATE TABLE + 2 indexes + PK | `SELECT COUNT(*) FROM pg_tables WHERE tablename='xstock_dbs_backfill'; SELECT indexname FROM pg_indexes WHERE tablename='xstock_dbs_backfill'` | table + 3 indexes (2 + PK) | table=1; `idx_xstock_dbs_backfill_sector_ts`, `idx_xstock_dbs_backfill_ts`, `xstock_dbs_backfill_pkey` | **VERIFIED**. |
| 16 | `2026-05-17-b-phase-a2-dbs-xstock-constants.sql` | INSERT/UPSERT 8 dbs_calculation rows for xstock_spot | `SELECT constant_name, value FROM module_constants WHERE module_name='dbs_calculation' AND asset_class='xstock_spot'` | 8 rows with specified values | `min_sample_count=30, sector_coverage_floor=7, slope_weight=0.40, return_weight=0.35, ema_weight=0.25, lookback_period=48, ema_fast_period=12, ema_slow_period=26` | **VERIFIED**. |
| 17 | `2026-05-19-b-new-35-phase1-dedup-xstock-spot-rev6.sql` | (Bash-per-symbol DELETE pattern applied via `/tmp/dedup_per_symbol.sh`; the rev1 SQL is already ledger'd; rev6 added so migration runner doesn't try to re-apply) | Verified via B-NEW-35 closure: zero duplicate `(symbol, interval_begin)` rows in `xstock_spot_ohlc_1m_2026_05` | 0 duplicates | 0 duplicates per Langston independent-verify 2026-05-20 ~07:30 UTC | **VERIFIED**. |

---

## §4 Ledger backfill SQL

Applied via `psql -f /tmp/ledger_backfill.sql` on 2026-05-20 at staging:

```sql
INSERT INTO _migrations (name, applied_at) VALUES
  ('2026-05-08-b79-tec-per-class-be-rows.sql',                           NOW()),
  ('2026-05-10-b79-0e-rename-equity-to-xstock.sql',                      NOW()),
  ('2026-05-10-b79-0g-vts-open-trades.sql',                              NOW()),
  ('2026-05-10-b79-0g-tx-vts-open-trades-soft-delete.sql',               NOW()),
  ('2026-05-10-b79-0g-tx-data-lifecycle-seed.sql',                       NOW()),
  ('2026-05-11-b79-0m-a-screener-filters-asset-class-index.sql',         NOW()),
  ('2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql',                    NOW()),
  ('2026-05-11-b79-0m-a-xstock-regime-classifier-seeds.sql',             NOW()),
  ('2026-05-11-b79-0m-a-xstock-strategy-gates-seeds.sql',                NOW()),
  ('2026-05-11-b79-0m-b-xstock-active-quant-row.sql',                    NOW()),
  ('2026-05-11-b79-0m-b-xstock-tec-enable.sql',                          NOW()),
  ('2026-05-11-b79-0m-b2-xstock-pattern-rows.sql',                       NOW()),
  ('2026-05-12-b-new-1-xstock-global-tighten.sql',                       NOW()),
  ('2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql',    NOW()),
  ('2026-05-17-b-phase-a2-dbs-backfill-table.sql',                       NOW()),
  ('2026-05-17-b-phase-a2-dbs-xstock-constants.sql',                     NOW()),
  ('2026-05-19-b-new-35-phase1-dedup-xstock-spot-rev6.sql',              NOW())
ON CONFLICT (name) DO NOTHING;
```

Result: `INSERT 0 17` (17 new rows; 0 conflicts). Ledger total `46 → 63` as expected.

`applied_at=NOW()` is intentional: these timestamps record WHEN the backfill happened, not when the original effects were applied (which is unrecorded). The forensic audit trail of when each migration actually ran lives in this change list + the BATCH_CATALOG entries + git history for the originating batches.

---

## §5 Acceptance criteria (per scope §1)

- ✅ `SELECT COUNT(*) FROM _migrations WHERE name >= '2026-05-08'` returns 24 (the 16 reconciled + the 2 already-recorded May-8 b79-0a files + B-NEW-34b + 4 B-NEW-35 phase1/phase2 + rev6).
- ✅ `npm run db:migrate` on staging exits 0 with `[db-migrate] No pending migrations. Database is up to date.`
- ✅ All 16 verification queries documented above with PASS confirmation.

---

## §6 Additional findings (non-blocking, surfaced for future cleanup)

**6.1 Stale `equity_*` keys in `module_constants.data_lifecycle`.**

Despite `b79-0e-rename-equity-to-xstock.sql` performing a UPDATE-REPLACE of `equity_*` constant names to `xstock_*`, the live DB shows 4 stale rows still present:

```
data_lifecycle | equity_perp_ohlc_1m.hot_retention_days     | * | 365 | 2026-05-18 20:52:31 | b75-data-lifecycle
data_lifecycle | equity_perp_ticker_snap.hot_retention_days | * | 30  | 2026-05-18 20:52:31 | b75-data-lifecycle
data_lifecycle | equity_spot_ohlc_1m.hot_retention_days     | * | 365 | 2026-05-18 20:52:31 | b75-data-lifecycle
data_lifecycle | equity_spot_ticker_snap.hot_retention_days | * | 30  | 2026-05-18 20:52:31 | b75-data-lifecycle
```

Diagnosis: `updated_by='b75-data-lifecycle'` + `updated_at=2026-05-18 20:52:31` matches the same migration-runner pass that recorded `2026-05-08-b79-0a-data-freshness-window.sql` and `2026-05-08-b79-0a-sqe-wildcard-promotion.sql` ledger rows. A separate b75-tagged seed migration re-inserted these `equity_*` keys AFTER b79-0e renamed the original keys. These keys reference table names that no longer exist (the tables are now `xstock_*` per b79-0e). Effects:

- The retention-sweep code that reads these keys looks up rows for non-existent tables. Behavior is benign-by-accident: the lookup falls back to wildcard / fails silently, and the actual xstock_* table retention is governed elsewhere.
- This is NOT a b79-0e partial-application; b79-0e DID run cleanly (no equity_* tables/indexes remain in the schema). The b75 seed is the second-order issue.

**Recommendation:** file a small cleanup batch to either (a) UPDATE the 4 rows' constant_name from `equity_*` to `xstock_*`, or (b) DELETE them entirely if they're truly unused. Not in scope for B-NEW-36 sub-batch (a); flag for future hygiene pass.

---

## §7 Step 4 Pass 1 ask

Per scope §4 (sequencing R3 ACK):

- **Verify:** the 17 INSERT rows landed without conflict (`INSERT 0 17` output confirms).
- **Verify:** `npm run db:migrate` reports 0 pending.
- **Verify:** none of the 16 files are listed as pending by the runner.

Once Pass 1 ACK'd, sub-batch (a) closes and sub-batch (c) (universe-split cleanup) begins.

— Claude Code, 2026-05-20
