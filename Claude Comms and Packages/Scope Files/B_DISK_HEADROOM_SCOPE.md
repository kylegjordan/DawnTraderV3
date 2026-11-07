# B-DISK-HEADROOM — SCOPE (Step 1)

change-class: non_architecture
owner: Infra Claude · plan: `SPRINT_TO_LIVE_PLAN.md` row 6 ("Months of database headroom") · r1 2026-11-07

## 0. What this batch is, in one paragraph
The database (Supabase, 200 GB plan) rises through each month and drops when whole monthly partitions age out. The one-minute price bars (`xstock_spot_ohlc_1m`, `crypto_spot_ohlc_1m`, `xstock_perp_ohlc_1m`) are kept hot for 365 days, and none of their monthly partitions has ever been archived. **Kyle decided on 2026-09-28 to move them to a 30-day hot window**, executing Langston's 2026-08-17 ruling (C). This batch:
- proves the archive path on ONE month first;
- then flips the three settings from 365 to 30;
- then measures the months of headroom that buy, off the PEAK, not the trough.
No code changes. The B75 sweep reads the setting on every nightly run (`b75-retention-sweep.ts:220-224`), so no deploy is needed.

## 1. Live state, read 2026-11-07 06:22-06:35Z (staging, read-only transactions)
- **Database:** `pg_database_size` = 145,485,679,763 B = **135.49 GiB, 66.2 % of the 200 GiB plan** (`database_monitor.plan_cap_mb` = 204,800 MiB; the monitor's "GB" are GiB).
- **The three tables this batch flips** (all children summed, `pg_total_relation_size`):

  | table | size | children |
  |---|---|---|
  | `xstock_spot_ohlc_1m` | 13.66 GiB | 19, `_2026_04` … `_2027_10` |
  | `crypto_spot_ohlc_1m` | 10.00 GiB | 19 |
  | `xstock_perp_ohlc_1m` | 1.77 GiB | 19 |

  All three are at `hot_retention_days` = 365 (`module_constants`, module `data_lifecycle`, key `* * * *`, set 2026-05-10/18). The fourth, `crypto_perp_ohlc_1m`, is already at 30 days and daily-partitioned (3.08 GiB). It is not touched.
- **Archive history:** `data_archive_manifest` holds 51 `warm/active` rows for `crypto_perp_ohlc_1m` and 1 for `xstock_perp_ohlc_1m`, and **none for `xstock_spot_ohlc_1m` or `crypto_spot_ohlc_1m`**. So the daily bar path has run; the MONTHLY spot path has never run to a drop.
- **The oscillation's driver (Langston's added term), measured:**
  - The database-disk alert history shows a monthly sawtooth: troughs ~130 GiB, peaks 166.4 (07-29), 157.7 (08-18), 168.7 (09-29), and 130.3 again on 10-31.
  - The daily-partitioned tables are at steady state: `signal_eval_archive`, `xstock_spot_ticker_snap`, `crypto_perp_ticker_snap` and `crypto_perp_ohlc_1m` each hold 45 children from `_2026_10_08` (30 days); `xstock_bar_revision_event` holds 8 days.
  - **The rise comes from the MONTHLY-partitioned tables.** A monthly partition becomes eligible only once its whole month is older than the window, so at a 30-day window it holds up to ~61 days, then drops at once (`#688`'s trap). November's partitions so far: `signal_eval_provenance` 1.45 GB, `pair_scan_archive` 1.29, `xstock_spot_ohlc_1m` 0.58, `crypto_spot_ohlc_1m` 0.26, `crypto_spot_ticker_snap` 0.50, `xstock_perp_ticker_snap` 0.40, `xstock_perp_ohlc_1m` 0.04.
  - Since 10-31: 130.3 → 135.5 GiB, ≈ 0.8 GiB/day (two points, a delta, not a trend).
- **The other relief already placed:** `B-DB-SIZE-RELIEF` (CC-A, KD-60, plan order 5c) cuts `signal_eval_archive` 30 → 15 days (~20 GB) and moves `signal_eval_provenance`, `pair_scan_archive` and the two monthly price-snapshot tables onto daily partitions. **The one-minute bars are explicitly NOT in it** (KD-60: "the bars' window is NOT open - Kyle already decided 365 -> 30 days ... queued as Infra Claude's agreed row 6").

## 2. Objectives — each with its verification
**OBJ-1 — headroom, sized off the PEAK, with the driver named.** Before and after the flip:
- the live size;
- the size by table and by partition;
- the monthly peak, predicted from the per-day growth of each monthly-partitioned table and checked against the next measured peak.
- **Months of headroom = (plan cap − predicted peak) / net monthly growth,** stated with its object and population (rule 29).

*Verify:* the before and after figures from the same read-only query, committed. The prediction is pre-registered here before the flip and compared with the next end-of-month peak, read from the database-disk alert and a direct `pg_database_size` read.

**OBJ-2 — the readers, re-checked before anything moves.** Langston's 2026-08-17 ruling (C) found the deepest hot reader of these tables is the dashboard's `rolling_30d`, safe at equality (`STORAGE_POLICY.md` §3).
- Step 2 re-derives that at the graded ref for every reader added since 08-17, repo-wide, tests excluded: who SELECTs from each of the three tables, and with what lookback. Candidates named in the PM decision pack (2026-11-06 §A3): the regime and calibration lookbacks.
- **Any reader that needs more than 30 days hot stops the flip for that table and goes to Kyle** (§2.5: an exception needs its reader named with its lookback).

*Verify:* a census table in the pre-audit, one row per reader with `path:line`, the table, the lookback and the disposition. A positive control: the dashboard's `rolling_30d` must appear in it.

**OBJ-3 — the proof month: the monthly bar path runs to a drop ONCE, on one month, before the flip** (Langston's ruling (C); `#685`, whose DEFECT-1, the wrong timestamp column, was fixed at P19-B-PERPFEED).
- Set ONE table's window so that exactly its oldest non-empty month is eligible, and let the nightly 02:15Z sweep tier it. The value is computed at Step 2 from the sweep's own `isPartitionEligible` (monthly: `rangeStart < cutoffMonthStart`) and checked with a dry evaluation of that function before it is written.
- Read back the result, then restore the window.

*Verify, pre-registered pass:*
1. a `data_archive_manifest` row for that table and month, `tier=warm`, `state=active`, `completeness_basis = source-count-matched`, with its `data_archive_exact_evidence` row;
2. the partition is dropped, with its bytes gone from the size read;
3. `b75-rehydrate` of a day inside that month returns rows whose SHA-256 matches the manifest;
4. no sweep alert for that table;
5. every other table's sweep result is unchanged.

**Fail:** any of 1-5 missing. The flip does not run, and the failure is a finding with its own disposition.

**OBJ-4 — the flip, on the full six-column key, per table, read back.** `data_lifecycle` · `*` · `*` · `*` · `*` · `<table>.hot_retention_days` → 30, for each of the three tables, with `updated_by` naming this batch.
- Read back from `module_constants` after the write.
- The next nightly sweep's result line and the manifest show each table's eligible months tiered, at the proven basis.

*Verify:*
- the three rows read back at 30;
- a manifest row per tiered month;
- no sweep alert;
- the size drop measured against OBJ-1's before figure, expected ≈ 19 GB (Kyle's 09-28 figure; to be re-derived at Step 2 from the per-partition sizes).

**OBJ-5 — governance.** `STORAGE_POLICY.md` §3 row: from "LIVE still 365 until execution" to 30, executed, with the date. The System Impact Map B75 table row and the System Manual only where a fact they state changes. The alert `c0a0b00d` (database disk WARNING, 65.2 %) is resolved only on a measured size under its line, never acked.

## 3. The tripwire (Langston's added term, carried)
If the next database peak is at or above 160 GiB before this batch finishes, it moves ahead of everything still queued. Measured now: 135.5 GiB. At ≈ 0.8 GiB/day it reaches 160 GiB around early December, by straight-line arithmetic only.

## 4. Out of scope, said out loud
- **Daily partitions for the one-minute bars.** Kyle's §2.5 rule says "migrated on a daily basis"; the bars stay monthly here, so at 30 days they still hold up to ~61 days and keep a smaller sawtooth. Changing the partition layout is a retention redesign: new scope, and it goes back to Kyle (Langston's added term).
- **The other tables' windows and partitioning:** `B-DB-SIZE-RELIEF` (CC-A).
- **The database-disk warning line:** not raised (KD-60).
- **`crypto_perp_ohlc_1m`:** already at 30 days.

## 5. Provenance (Step-1 rule 1.b)
**Corpora searched:** `BATCH_CATALOG.md`; `RUNNING_ISSUES.md` (`#685`, `#688`, `#592`); `Batch Completion/B_ARCHIVE_RETENTION_SIZING_COMPLETION_REPORT.md`; `Scope Files/BATCH_75_SCOPE.md`; `STORAGE_POLICY.md` §2.5 and §3; `1-system-manual/pm/DECISIONS.md` (KD-60); `1-system-manual/pm/decisions/2026-11-06_cold-archive-daily-chunk-plan.md`; the System Impact Map's B75 section; `git log -S` (not path-limited) on the three constant names.

**TIER 1 — behaviour this batch changes: the three `*_ohlc_1m.hot_retention_days` constants.**
- **Introduced** at `f4e6a73f6` (2026-05-06, "B75 Step 3 ship: tiered hot/warm/cold storage architecture"), message verbatim: *"Hot retention: 30d ticker / 365d OHLC / 14d ctx-bridge. Warm retention: 365d, then rotated to cold. Cold retention: indefinite. Move-not-delete at every boundary."* The `xstock_*` names arrived by rename at `aca52acdc` (2026-05-10, B79.0e).
- **Why 365, from `BATCH_75_SCOPE.md:130`:** *"OHLC 1m = primary Trend Mining Engine input (Phase 17.6 / 18.5 per SIM §B70 forward-couples). 365d = full annual cycle on disk for low-latency pattern stats; older data accessible from warm tier."*
- **And `:31`:** *"With cold tier guaranteeing indefinite preservation, the hot retention number is now a query-latency-vs-disk-cost tuning knob, not a 'do we keep it' decision."*
- **Today's intent:** Kyle, 2026-09-28 (Desktop, recorded in `B_ARCHIVE_RETENTION_SIZING_COMPLETION_REPORT.md:7`): *"for the one minute bar storage, we'll go with your recommendation"*, executing Langston's 2026-08-17 ruling (C) under Kyle's §2.5 rule: *"Unless there is a specific reason why we need more than thirty days of data, we will only maintain a rolling thirty days of data in the hot tier."*
- **Disposition (2): relevant, needs updating to today's intent** (365 → 30). The Trend Mining Engine reader the 365 was set for is post-launch and reads warm or cold through the manifest (System Impact Map B75 forward-couples), so it does not need the bars hot.

**TIER 1 — exercised for the first time on these tables, not changed: the sweep's MONTHLY eligibility and drop path** (`b75-retention-sweep.ts` `listOldPartitions` → `sweep-slicing.ts` `isPartitionEligible`, monthly arm `rangeStart < cutoffMonthStart`, from B-STORAGE-HARDEN Wave D, 2026-07-08).
- The bar entries' timestamp column was wrong until P19-B-PERPFEED (`b75-retention-sweep.ts:113-117`: *"The wrong column made the sweep structurally unable to tier the OHLC family (zero manifest rows for any *_ohlc_1m table, ever — measured 2026-08-17)"*).
- **Disposition (1), still relevant and correct.** OBJ-3 is its first real exercise on a monthly bar table.

**TIER 2 — read or called:**
- `partition-exporter.ts` (snapshot + keyset export), `storage-client.ts` (warm upload), `archive-completeness.ts` and `exact-archive-evidence.ts` (the completeness register, B-B75-EXPORT-COMPLETENESS) — each (1).
- `b75-rehydrate.ts` (the read-back seam) — (1).
- `database-monitor.ts` (the alert that measures the size) — (1).

## 6. Step-2 owes
- The consumer census (OBJ-2).
- The proof table and month, and the exact window value for OBJ-3, from `isPartitionEligible` itself.
- The empty-partition check for the oldest month (`_2026_04` exists; whether it holds rows is unmeasured).
- The ≈19 GB re-derived per partition.
- The per-table growth rates behind OBJ-1's peak prediction.
- The sweep's run time and lock behaviour for a multi-GB monthly export on this box (`xstock_spot_ohlc_1m` May is 4.67 GB).
