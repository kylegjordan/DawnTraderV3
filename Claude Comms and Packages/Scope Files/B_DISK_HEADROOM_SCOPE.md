# B-DISK-HEADROOM — SCOPE (Step 1)

change-class: non_architecture
owner: Infra Claude · plan: `SPRINT_TO_LIVE_PLAN.md` row 6 ("Months of database headroom") · r2 2026-11-07 (r1 `2c692f9cc`, Langston SENT BACK, queue id `1568513334167347201`; his C-1..C-5, the record correction and the read-back item folded)

## 0. What this batch is, in one paragraph
The database (Supabase, 200 GiB plan) rises through each month and drops when whole monthly partitions age out. The one-minute price bars (`xstock_spot_ohlc_1m`, `crypto_spot_ohlc_1m`, `xstock_perp_ohlc_1m`) are kept hot for 365 days, and no monthly partition of theirs has ever been archived. **Kyle decided on 2026-09-28 to move them to a 30-day hot window**, executing Langston's 2026-08-17 ruling (C).
This batch:
- proves the archive path first on the two lanes the flip will use: whole-month, then day-sliced;
- flips the three settings from 365 to 30;
- measures the months of headroom that buys, at the monthly PEAK.
There are no code changes: the B75 sweep reads its setting on every nightly run (`b75-retention-sweep.ts:220-224`) and prints the value it read, per table.

## 1. Live state (staging, read-only transactions, 2026-11-07)
**The size instrument is `database_size_logs`** (`size_mb`, `checked_at`; 386,342 samples, 2025-10-02 → 2026-11-06 14:40Z), written by `database-monitor.ts`. ⚠️ r1 sized peaks from the database-disk ALERT history, which is a deduped threshold-crossing record: a lower bound, never a peak (C-1).
- **Sampled monthly peaks / troughs, GiB (`size_mb / 1024`):**

  | month | trough | peak |
  |---|---|---|
  | Jul | 102.14 | **172.18** (07-31) |
  | Aug | 118.22 | 157.75 |
  | Sep | 103.14 | **171.93** (09-30) |
  | Oct | 121.21 | **149.56** (10-30) |
  | Nov to 11-06 | 128.60 (11-01) | 135.98 |

  **High-water 172.18 GiB = 86.1 % of the cap.**
- **Why October's peak was ~22 GiB lower — STRUCTURAL, not a quiet month:**
  - `signal_eval_archive` moved to DAILY partitions at a 2026-09-01 cutover (`daily-partition-cutover.ts:45`, P19-B-PERPFEED OBJ-7b).
  - Its last MONTHLY child (August) aged out on 10-01. The 09-30 → 10-01 drop is 171.93 → 121.95 GiB.
  - Since then the only monthly sawtooth left comes from the tables still in monthly slices: `signal_eval_provenance`, `pair_scan_archive`, `crypto_spot_ticker_snap`, `xstock_perp_ticker_snap` and the three bar tables. Each holds up to ~61 days at a 30-day window and then drops at once (`#688`).
  - October's swing (trough → peak) was 28.35 GiB, against 68.79 in September.
  - The daily tables are at steady state: `signal_eval_archive`, `xstock_spot_ticker_snap`, `crypto_perp_ticker_snap` and `crypto_perp_ohlc_1m` each hold 45 children from `_2026_10_08`, and `xstock_bar_revision_event` holds 8 days.
- **November's slope so far:** 128.60 (11-01) → 135.98 (11-06) = **1.48 GiB/day**, against October's 1.06 (10-04 → 10-30).
- **The three bar tables** (all children summed, `pg_total_relation_size`, read 06:22Z; Langston reconciled every per-partition sum to these totals):

  | table | size | children | `hot_retention_days` |
  |---|---|---|---|
  | `xstock_spot_ohlc_1m` | 13.66 GiB | 19, `_2026_04` … `_2027_10` | 365 |
  | `crypto_spot_ohlc_1m` | 10.00 GiB | 19 | 365 |
  | `xstock_perp_ohlc_1m` | 1.77 GiB | 19 | 365 |

  The settings sit under `module_constants` `data_lifecycle`, key `* * * *`, set 2026-05-10/18.
  - **`_2026_04`** is non-empty on all three: 1,596 / 8,745 / 20,350 rows, 2.19 MB / 7.74 MB / 36.97 MB.
  - **Exactly ONE child exceeds `slice_threshold_hot_bytes` (3,221,225,472 B = 3.00 GiB): `xstock_spot_ohlc_1m_2026_05`, 4.348 GiB.** It takes the day-sliced lane; every other child takes the whole-month lane.
- **Archive history:**
  - `data_archive_manifest`: 51 `warm/active` rows for `crypto_perp_ohlc_1m` (21 at `source-count-matched`) and none for the two spot tables.
  - The single `xstock_perp_ohlc_1m` row (`2f888706…`) is the B-STORAGE-HARDEN Wave D synthetic DAILY-partition proof: `partition_label 2025-01-15`, 2 rows, 65,536 B, `unverified-legacy`. **It is not a monthly bar archive.** So no monthly partition of the bar family has ever been archived, and **0 rows on any of the three carry `source-count-matched`**; OBJ-3's first pass will be the first ever.
  - All three nights in the sweep log ran `mode=whole slices=1` on every partition, so the SLICED lane has never run on this family.
- **The other relief already placed:** `B-DB-SIZE-RELIEF` (CC-A, KD-60, plan order 5c) cuts `signal_eval_archive` 30 → 15 days and moves `signal_eval_provenance`, `pair_scan_archive` and the two monthly price snapshots onto daily partitions. **The bars are explicitly NOT in it** (KD-60: "the bars' window is NOT open - Kyle already decided 365 -> 30 days ... queued as Infra Claude's agreed row 6").

## 2. Objectives — each with its verification
**OBJ-1 — headroom, sized at the PEAK, from `database_size_logs`.**
- Before and after the flip: the size by table and by partition, and the next end-of-month sampled peak.
- **Months of headroom = (plan cap − predicted peak) / net monthly floor growth,** stated with object and population.
- **Pre-registered here, before the flip:**
  - **Without the flip,** November's peak at 11-30 = 128.60 + (29.4 days × 1.06 to 1.48 GiB/day) = **≈ 159.8 to 172.1 GiB.**
  - **With the flip landed before 11-30,** that range less ~20.9 GiB ≈ **139 to 151 GiB.**
- These are straight lines through two slopes, stated as a range.

*Verify:* the November sampled peak read from `database_size_logs`, compared with the range for whichever case happened. A peak outside the range is a finding.

**OBJ-2 — the readers, re-checked before anything moves.** Langston's 2026-08-17 ruling (C) found the deepest hot reader of these tables is the dashboard's `rolling_30d`, safe at equality (`STORAGE_POLICY.md` §3).
- Step 2 re-derives that at the graded ref for every reader added since 08-17, repo-wide, tests excluded: who SELECTs from each of the three tables, and with what lookback. Candidates named in the PM decision pack (2026-11-06 §A3): the regime and calibration lookbacks.
- **Any reader needing more than 30 days hot stops that table's flip and goes to Kyle.**
- **Note the data actually present at a 30-day window on monthly partitions:** a monthly child stays until its whole month is past the window, so hot data reaches back 30 to ~61 days. A reader needing up to 30 days is always served.

*Verify:* a census table in the pre-audit, one row per reader with `path:line`, the table, the lookback and the disposition. Positive control: the dashboard's `rolling_30d` must appear.

**OBJ-3 — the proof, through the PRODUCTION nightly sweep, on both lanes the flip will use.** The mechanism is a setting, not a flag (Langston: accepted as the right design). The thing to prove IS setting → `loadConfig` → eligibility → export → drop.
- **Stage A, the whole-month lane at realistic size:** `crypto_spot_ohlc_1m` with its window set so that **`_2026_04` and `_2026_05` are eligible** (0.007 + 2.736 GiB). Eligibility is monotone, so April comes along.
- **Stage B, the day-sliced lane:** `xstock_spot_ohlc_1m` with its window set so that `_2026_04` and `_2026_05` are eligible. May (4.348 GiB) takes the sliced lane: ~31 day objects; the DROP comes only after every present date verifies; it resumes on the next nightly run (`:1020`). The flip's single largest object is the one that hits this lane, so it is proven deliberately here, not discovered on the flip night.
- **Window value:**
  - It is a BAND with its midpoint taken (condition a). `cutoff = now − N days`, and the monthly rule is `rangeStart < UTC-month-start(cutoff)` (`b75-retention-sweep.ts:1326-1333`, `sweep-slicing.ts:146`).
  - For exactly April + May, `cutoff` must fall in [Jun 1, Jul 1). On a proof night T, N ∈ (T − Jul 1, T − Jun 1] in days. For T = 2026-11-08 02:15Z that is (130.09, 160.09], midpoint **145**.
  - Step 2 recomputes the band for the actual first proof night, and names which months are eligible at both ends before the write.
- **The exposure bound, if a restore were missed:** at N = 145, June becomes eligible once `now − 145 d ≥ 2026-07-01`, i.e. from **2026-11-23T00:00Z**. That is ~16 days of slack from 11-08; a late restore moves one more month, still archived, never deleted.
- **The window stays set until criteria 1-3 pass, however many nights that takes** (condition c; a sliced month resumes across runs). **Stop condition:** if a stage has not completed by its 5th night, or by 11-21 (two days before the June bound), whichever is first, restore the window, and the incomplete stage is a finding with its own disposition.
- **Pre-registered pass, per stage:**
  1. One `data_archive_manifest` row per eligible month (Stage B: per day slice, `deriveModeFromLabels`), `tier=warm`, `state=active`, `completeness_basis = source-count-matched`, each with its `data_archive_exact_evidence` row.
  2. The partition dropped, its bytes gone from the size read.
  3. `b75-rehydrate` of one day inside the month returns rows whose SHA-256 matches the manifest.
  4. **The sweep's own lines, as the positive control** (a zero-alert night alone would be satisfied by a sweep that never ran, C-4). The proof night's log shows:
     - `retentionDays=<proof value>` for the proof table;
     - then `processing partition=` for each eligible child;
     - then `dropped mode=whole` (Stage A) or the sliced lines and `dropped mode=sliced` (Stage B);
     - and the run's `DONE —` line with `failed=0`.
     The carrier was verified alive by Langston: run `d21c0130…`, 2026-11-07T02:15:02Z, `examined=5 dropped=5 failed=0 duration_ms=821487`.
  5. **Every other table did exactly what was pre-registered** (condition b). The pre-audit lists, for EVERY table, the exact child list the sweep will touch that night with expected bytes, from `listOldPartitions` evaluated at the ref, so the criterion discriminates.
- **Fail:** any of 1-5 missing. The flip does not run, and the failure is a finding with its own disposition.

**OBJ-4 — the flip, 365 → 30, on the full six-column key, per table.** `data_lifecycle` · `*` · `*` · `*` · `*` · `<table>.hot_retention_days` = 30, for each of the three, with `updated_by` naming this batch.
- **Read back from `module_constants` after the write, AND after each OBJ-3 restore, asserting exactly ONE row per (`data_lifecycle`, `<constant_name>`).** `loadConfig` keys a Map on `constant_name` alone (`:220-225`), so a write that lands a second tuple instead of updating would resolve last-row-wins (Langston; zero duplicates today).
- At a 30-day window on 2026-11-07, everything through `_2026_09` is eligible: **xstock_spot 11.126 + crypto_spot 8.212 + xstock_perp 1.567 = 20.9 GiB (22.4 GB)**. October's 3.71 GiB follows on 2026-12-01. (r1 said "≈ 19 GB": Kyle's 09-28 figure, re-derived here per partition.)
- **The flip's first night adds ~57 min to ~2 h of sweep time** on top of the existing ~14 min, at last night's measured hot-byte throughput (3.02 to 6.60 MB/s).

*Verify:*
- the three rows read back at 30, one row each;
- a manifest row per tiered month at `source-count-matched`;
- the sweep's own lines as in OBJ-3 criterion 4;
- the size drop measured against OBJ-1's before figure.

**OBJ-5 — governance.**
- `STORAGE_POLICY.md` §3 row: from "LIVE still 365 until execution" to 30, executed, with the date.
- The System Impact Map's B75 table and the System Manual change only where a fact they state changes.
- Alert `c0a0b00d` (database disk WARNING, routed to this batch's OBJ-5 by Langston) is resolved only on a measured `pg_database_size` under its line, never acked.

## 3. The lock scope, stated (C-5)
`dropPartition` is a bare `DROP TABLE IF EXISTS` (`:504-505`), and the sweep sets no `lock_timeout` or `statement_timeout`. Dropping a partition takes ACCESS EXCLUSIVE on the PARENT, so the drop queues behind any open read on `crypto_spot_ohlc_1m` / `xstock_spot_ohlc_1m`, and later reads queue behind the drop.
- **Precedented, not new:** the same lane drops `crypto_perp_ohlc_1m` children nightly (51 deep). A DROP's lock is a catalog operation, largely size-independent.
- **What IS new:** the two SPOT bar parents, which the live spot active path reads, come under the nightly drop.
- **The check:** on each proof night and on the flip night, the active engine's PM2 log and the `pg_stat_activity` wait events across the sweep's drop window are read, looking for bar-read errors or lock waits.
- **Fallback if a drop stalls the active path:** restore the window (the next night does nothing for that table), and the stall becomes a finding whose fix is a `lock_timeout` on the drop, which is code and a new item.

## 4. The tripwire, re-set so it discriminates (C-2)
The plan row's 160 GiB was exceeded at the sampled peak in 3 of the last 4 months, so it predicts nothing; this row is in flight anyway.
**The line that discriminates:** if any sampled reading reaches **155 GiB** before OBJ-4 lands (October's peak 149.56 plus the bars' ~4 GiB/month floor rise, ≈ 154), the relief that brought October down has not held. I then bring Langston and PM Claude the choice of flipping without finishing Stage B, rather than waiting on a proof.

## 5. Out of scope, said out loud
- **Daily partitions for the one-minute bars.** Kyle's §2.5 rule says "migrated on a daily basis"; at 30 days on monthly partitions the bars keep a smaller sawtooth (≈ 4 GiB/month). Changing the layout is a retention redesign: new scope, and it goes back to Kyle (Langston's added term).
- **The other tables:** `B-DB-SIZE-RELIEF` (CC-A).
- **The warning line:** not raised (KD-60).
- **`crypto_perp_ohlc_1m`:** already at 30 days.
- **A `lock_timeout` on the drop:** only on a measured stall (§3).

## 6. Provenance (Step-1 rule 1.b)
**Corpora searched:** `BATCH_CATALOG.md`; `RUNNING_ISSUES.md` (`#685`, `#688`, `#592`); `Batch Completion/B_ARCHIVE_RETENTION_SIZING_COMPLETION_REPORT.md`; `Scope Files/BATCH_75_SCOPE.md`; `STORAGE_POLICY.md` §2.5 and §3; `1-system-manual/pm/DECISIONS.md` (KD-60); `1-system-manual/pm/decisions/2026-11-06_cold-archive-daily-chunk-plan.md`; the System Impact Map's B75 section; `daily-partition-cutover.ts`; `git log -S` (not path-limited) on the three constant names.

**TIER 1 — behaviour this batch changes: the three `*_ohlc_1m.hot_retention_days` constants.**
- **Introduced** at `f4e6a73f6` (2026-05-06, "B75 Step 3 ship: tiered hot/warm/cold storage architecture"), message verbatim: *"Hot retention: 30d ticker / 365d OHLC / 14d ctx-bridge. Warm retention: 365d, then rotated to cold. Cold retention: indefinite. Move-not-delete at every boundary."* The `xstock_*` names arrived by rename at `aca52acdc` (2026-05-10, B79.0e).
- **Why 365, from `BATCH_75_SCOPE.md:130`:** *"OHLC 1m = primary Trend Mining Engine input (Phase 17.6 / 18.5 per SIM §B70 forward-couples). 365d = full annual cycle on disk for low-latency pattern stats; older data accessible from warm tier."*
- **And `:31`:** *"With cold tier guaranteeing indefinite preservation, the hot retention number is now a query-latency-vs-disk-cost tuning knob, not a 'do we keep it' decision."*
- **Today's intent:** Kyle, 2026-09-28 (Desktop, recorded in `B_ARCHIVE_RETENTION_SIZING_COMPLETION_REPORT.md:7`): *"for the one minute bar storage, we'll go with your recommendation"*, executing Langston's 2026-08-17 ruling (C) under Kyle's §2.5 rule: *"Unless there is a specific reason why we need more than thirty days of data, we will only maintain a rolling thirty days of data in the hot tier."*
- **Disposition (2): relevant, needs updating to today's intent** (365 → 30). The Trend Mining Engine reader the 365 was set for is post-launch and reads warm or cold through the manifest (System Impact Map B75 forward-couples).

**TIER 1 — exercised on these tables for the first time, not changed: the sweep's MONTHLY eligibility, whole-month and SLICED lanes** (`b75-retention-sweep.ts` `listOldPartitions` → `sweep-slicing.ts` `isPartitionEligible`, monthly arm `rangeStart < cutoffMonthStart`, from B-STORAGE-HARDEN Wave D, 2026-07-08; the sliced lane from B-NEW-47).
- The bar entries' timestamp column was wrong until P19-B-PERPFEED (`b75-retention-sweep.ts:113-117`: *"The wrong column made the sweep structurally unable to tier the OHLC family (zero manifest rows for any *_ohlc_1m table, ever — measured 2026-08-17)"*).
- **Disposition (1), still relevant and correct.** OBJ-3 Stage A and Stage B are their first real exercise on a monthly bar table.
- **Deployed copy:** the sweep runs from the deploy clone (`/home/deploy/dawntrader`, root cron `15 2 * * *`). Langston measured `b75-retention-sweep.ts` (`46765364b8b0b9db…`) and `sweep-slicing.ts` (`5b0150ebfa24d584…`) byte-identical to `2c692f9cc` while staging drift rows stand. **Re-checked immediately before each proof night**, since a deploy in between changes it.

**TIER 2 — read or called:**
- `partition-exporter.ts`, `storage-client.ts`, `archive-completeness.ts`, `exact-archive-evidence.ts` (the completeness register) — each (1).
- `b75-rehydrate.ts` — (1).
- `database-monitor.ts`, which writes `database_size_logs` (OBJ-1's instrument) and mints the disk alert — (1).

## 7. Step-2 owes
- The consumer census (OBJ-2).
- The exact window value and its band for each stage's first night, and the months eligible at both ends.
- **The pre-registered child list, with expected bytes, for EVERY table on each proof night**, from `listOldPartitions` at the ref.
- The per-table monthly growth behind OBJ-1's range.
- The deployed-copy hash check, written as a command to run before each proof night.

## 8. Step 1 APPROVED (Langston, queue id `1568516282892947507`, at `12e9bf09d`) — four conditions, all for Step 2
He re-derived every §1 figure, every byte, the constants on the six-column key, the manifest correction, the band, the carrier run and the deployed-copy hashes himself; all matched.
1. ⛔ **OBJ-3 criterion 4's first bullet is INVERTED as written.** `retentionDays=` is printed ONLY on the no-eligible-partitions path (`b75-retention-sweep.ts:1338-1345`); the eligible path (`:1347`) prints `processing partition=` with no echo. So on a successful proof night that line cannot appear for the proof table. **Rewrite at Step 2:**
   - the proof table's evidence that the setting was read is its ELIGIBLE SET: `processing partition=2026-04` and `2026-05`, and NO `2026-06`, which only N ∈ (130.09, 160.09] produces;
   - the `retentionDays=` echo stays a control on the OTHER tables (criterion 5).
   **No proof night until this is in writing.**
2. **The plan cap's unit and provenance, before any headroom figure.** `plan_cap_mb = 204800` is divided into MiB, so the instrument's cap is 200 GiB = 214.75 GB decimal, while its comment and alert title say "200 GB" (`database-monitor.ts:15`, `:84`).
   - If Supabase's disk is 200 GB decimal (186.26 GiB), the high-water is 92.4 %, not 86.1 %, and headroom loses ~14.5 GiB ≈ 3.6 months.
   - Also state that `pg_database_size` is logical size, not provisioned disk.
3. **What "sampled peak" costs.** `database-monitor.ts:30/168` is an in-process 24 h `setInterval` with an immediate check at startup, so samples run 2.6-5.5/day. The steady 23:13Z series stopped after 2026-11-03.
   - A sampled peak understates the true peak by up to one interval × slope (≤ ~1.5 GiB).
   - OBJ-1's verify states the expected sample count in 11-25 → 11-30 and that bound.
4. **Citations:**
   - the multi-night resume is implemented by `deriveModeFromLabels` + `listOldPartitions` revisiting non-active rows, not `:1020` (an alert-body string);
   - the monthly arm is `sweep-slicing.ts:152`;
   - October's slope named: 1.06 off 10-04's high, 1.09 off 10-04's low, which moves OBJ-1's lower bound 159.8 → 160.7.
**In his favour, recorded:** the proof window (145 d) is strictly looser than the flip's (30 d), so OBJ-3 removes a subset of what OBJ-2 gates. The lock precedent is stronger than §3 says: `xstock_spot_ticker_snap` and `crypto_spot_ticker_snap` are active-path reads dropped nightly too.
