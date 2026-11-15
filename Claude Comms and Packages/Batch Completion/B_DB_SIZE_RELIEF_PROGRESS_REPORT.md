# OPEN — B-DB-SIZE-RELIEF waits on the 2026-12-01 daily cutover and the month-ends after it

**Batch:** `B-DB-SIZE-RELIEF` · **Owner:** OLD Claude (CC-A) · **Reviewer:** Langston · **change-class:** architecture
**Authority:** Kyle KD-60 (2026-11-06; A1 + A2), KD-80 (2026-11-14; the Data Archive estimates, chosen over Coltrane's earlier ruling while Coltrane was stopped — recorded for his return). Sprint plan `SPRINT_TO_LIVE_PLAN.md` stage 00, row 5c.
**State:** Steps 1-9 done; Langston Step 8 CONFIRMED (2026-11-15 06:39Z). This report is the batch's record while it waits. It converts to `B_DB_SIZE_RELIEF_COMPLETION_REPORT.md` when the observation below is in **and** a decision has been taken on it.
**Delivery board:** `Observation`.

## 1. What the batch is for, and what shipped

Database headroom without a money decision, and a Data Archive panel that tells the truth.

| objective | what shipped | where |
|---|---|---|
| **OBJ-1** `signal_eval_archive` hot window 30 → 15 days; the seven touched `data_lifecycle` keys reaffirmed by migration | migration + rollback in git | `a2f5cbc6d`, deployed `957b13fde` 2026-11-11 |
| **OBJ-2** the Data Archive panel states its hot horizon and marks a window past it as partial; then (Step 9, KD-80) labelled estimates for the two tables whose exact counts took 53-69 s | `drift-dashboard-aggregator.ts`, `archive-count-estimate.ts`, `analytics.tsx` | `a26cfd934`; `f8fc53153`, `c1fa1e1d3`, `7bce81c0b` (+ text carries `67ce5ca5b`, `d37751b0c`); live at `84eeb168e` 2026-11-15 11:05Z |
| **OBJ-3** the provenance-replay script and the fee-baseline SQL print the hot horizon they read; the script refuses an era older than it | `b5-w20c-provenance-replay.ts`, `b_xstock_fee_contract_deploy_baselines.sql` | `bc85346f3`, deployed `957b13fde` |
| **OBJ-4** six monthly tables onto DAILY partitions at 2026-12-01 (`signal_eval_provenance`, `pair_scan_archive`, `crypto_spot_ticker_snap`, `xstock_perp_ticker_snap`, `macro_feed_archive`, `exit_decision_archive`); absorbs `#688` | six `DAILY_PARTITION_CUTOVERS` entries + the cutover migration (drops empty future monthlies under a heap-0 + `LIMIT 1` guard) | `a2f5cbc6d`, deployed `957b13fde` |
| OBJ-5 | struck in scope r3 (Infra Claude's row 6) | — |
| **OBJ-6** governance | see §5 | Step 10 |

## 2. Steps completed, with evidence

- **Steps 1-2:** scope r3 Step-1 PROCEED (`3bbc6b57e`); pre-audit + plan Step-2 PROCEED. `Scope Files/B_DB_SIZE_RELIEF_SCOPE.md`, `B_DB_SIZE_RELIEF_PRE_AUDIT.md`.
- **Steps 3-6 (increments 1-4):** each increment had a Langston Step-4 ruling, and the folds are recorded in `Change Lists/B_DB_SIZE_RELIEF_CHANGE_LIST.md`. Deployed `957b13fde` 2026-11-11 (restart 688).
  - The first post-deploy daily creator passed (six forward partitions, zero self-heals).
  - The first sweeps passed.
  - Alert `c0a0b00d` was resolved on a measured database size (evidence `5c5bfa516`).
  - The live hot horizon reads 15 for `signal_eval_archive`.
- **Step 7 (OBJ-2):** the first signed-in check failed: the panel took 58-76 s at every window, against the client's 30 s abort. The fix went in as a Step-9 iterate (KD-80). After it:
  - server side, every window, 10-17 s and no QUERY TIMEOUT;
  - the browser check at `rolling_24h` **PASSED** under `#1037` am.5 as Langston amended it (attempt 2, 2026-11-15 05:47-05:53Z, every marker timestamped);
  - provenance 24h reads EXACT live (93,505) since fold r2.

  Langston's ruling is recorded too: the harm-leg zero in that check is **not evidence**, because the window held under one expected occurrence.
- **Step 8:** Langston CONFIRMED OBJ-2's browser leg at `rolling_24h`. He re-derived the main-pool entailment (the panel reads only the diagnostic pool), the build, and his own render.
- **Step 9:** three folds, each Step-4 PROCEED: the estimates; the 6 s per-count bound (the worst case was 21.7 s, over his 20 s line); and fold r2 (the non-daily boundary slice counted exactly, the DROP-only premise written into the code, total-arm symmetry, the equal-arms note).
- **OBJ-4 so far (catalog read 2026-11-15, positive-controlled):** each of the six tables holds daily children `…_2026_12_01` to `…_2026_12_16` and **no** monthly child at or after `2026_12`. The control: the same filter at `>= 2026_11` returns `signal_eval_provenance_2026_11`.

## 3. ⛔ PRE-REGISTERED CLOSE CRITERION — written 2026-11-15, amended the same day on Langston's Step-10 ruling (Discord, 11:32Z), before any of this data exists. Do not data-mine. No change after 2026-11-29.

**Window (a set period):** 2026-11-29 through **2027-02-03**. Read dates, each carried by its own self-rescheduling-style timer alert (per-fire dedupe key `b-db-size-relief-observation:<date>`): **11-29 · 12-02 · 12-30 · 01-04 · 01-30 · 02-02.** Minted 2026-11-15, each at 06:00Z, `verification`/`info`, owner CC-A, never ack (resolve with the read's commit): `6f8a0705` (11-29) · `d2fd4dce` (12-02) · `365e6ef5` (12-30) · `ede55d8b` (01-04) · `08425f0c` (01-30) · `64255b7f` (02-02). Each body carries the three reads (per-table roll-up, the no-monthly-after-December check with its control, the manifest drops) and points here for the criterion.
**Per-table instrument:** `database_size_logs` is whole-database only and is the only size history in `public`, so it cannot attribute. Every read therefore records a `pg_total_relation_size` roll-up for each of the six parents (the timer body carries the SQL). Each leg is a per-table claim measured per table.

**(b0) PRE-REGISTERED PREDICTION — the October control (Langston measured 2026-11-15).** The six `_2026_10` monthlies are closed, hot and cannot grow:

| table | `_2026_10` size |
|---|---|
| `signal_eval_provenance` | 6,346.3 MB |
| `pair_scan_archive` | 6,231.3 MB |
| `crypto_spot_ticker_snap` | 3,000.8 MB |
| `xstock_perp_ticker_snap` | 1,882.8 MB |
| `macro_feed_archive` | 20.2 MB |
| `exit_decision_archive` | 12.8 MB |
| **total** | **17,494 MB** |

They go eligible at 30 days on 2026-11-30. **Prediction:** at the 11-30/12-01 sweep each table's roll-up falls by its `_2026_10` size, within the size of the dailies it gained in the same interval. Each drop has a verified, proven manifest row. Read on 11-29 (baseline) and 12-02.

**PASS requires (b0) and all four of:**
- **(a) Writes land in dailies.** On 2026-12-02, for each of the six tables, rows with `captured_at >= 2026-12-01` exist only in `…_YYYY_MM_DD` children, and no monthly child `>= 2026_12` exists.
- **(b) The last monthly leaves whole, and verified.** Each table's `…_2026_11` monthly is exported, proven (`completeness_basis = source-count-matched`), verified in warm and dropped once past 30 days (expected about 2026-12-31/2027-01-01, over however many nights the run-lock allows). Its roll-up falls by that monthly's size (read 12-30 baseline, 01-04).
- **(c) The daily trap is gone.** From 2027-01-01 the nightly sweep drops daily slices of each table, each with a verified, proven manifest row, on at least 3 consecutive nights by 2027-01-04.
- **(d) No month-end step from these six.** Read the **maximum absolute day-over-day excursion of each table's roll-up over 2027-01-29 → 02-03**, not one delta (the step lands a day either side of the boundary: 08-31, then 10-01, then 10-31 in the instrument's own history). PASS if, for every table, it is within the range of that table's **ordinary** days in the preceding 7. **Ordinary is pre-registered now:** a day with no staging deploy (the deploy record) and no other batch's drop or move on these tables (the sweep and tiering logs). If fewer than 5 ordinary days survive, reach back to 14 days rather than widen the range. The whole-database series is read beside it, as context only.

**FAIL is any of:**
- (b0) a table's roll-up does not fall by its October monthly, or a drop has no verified, proven row;
- a monthly child `>= 2026_12` is created for any of the six;
- a daily slice older than 30 days is still hot on 2027-01-04 while the sweep ran;
- any hot partition is dropped without a verified, proven manifest row;
- (d) any table's excursion over 01-29 → 02-03 is outside its ordinary range.

**Who decides:** CC-A with Langston at conversion. A FAIL is a result: it converts with the failure and a named follow-up, or the batch reopens at Step 9.

## 4. What is unproven, stated as unproven

- Everything in §3. The cutover is in place; how it behaves is not observed.
- **The Data Archive panel under sustained load.** The browser check had the tab open 38 s (one fetch, at most one refetch). The 30 s refetch with no visibility gate, and fold r2's 6 s burn per refetch at 30 days, are **inputs to row 119** (`B-ARCHIVE-WRITER-LIFECYCLE`, NEW Claude), as are the price-liveness main-pool bursts. That row's acceptance no longer carries an "unrun am.5 check" clause (`#1037` am.7).
- **30d after fold r2** was not re-timed. It now carries a deterministic ~6 s burn; the 25 s is a per-statement bound, so this is latency, not failure.
- The estimates rest on the DROP-only premise. If row deletes are ever added to these tables, the labels must be revisited.
- **Placed on this batch, not built** (Langston, fold-r2 attack (a)): an elapsed-ms record on both arms of the non-daily slice ask, with the partition's `reltuples` beside it, so a skip gate could later be sized from at least 3 points. Not a new row.
- **Input recorded, criterion unchanged (NEW Claude, Discord `1571674926539345951`, KD-84 r7 `c2362762e`):** the RTB pool fix (row 9j, after B-ENTRY-GATE closes) brings back the `rtb_shadow_pool_members` write rate inside this window, at one row per member per cycle. That table is not one of the six, and every PASS/FAIL leg is per table. It affects only the whole-database series, which §3 reads as context only.
- The post-12-01 re-time of the endpoint, when provenance turns daily (worst case 18 s → ceiling 24 s): due in window leg (a)'s read.

## 5. Governance files changed so far (Step 10, 2026-11-15)

`STORAGE_POLICY.md` · `SYSTEM_IMPACT_MAP.md` · `SYSTEM_MANUAL.md` · `RUNNING_ISSUES.md` (`#688` closed into this batch; `#1037` amendment 7) · `PRE_LIVE_SPRINT.md` (`B-DAILY-CUTOVER-SWEEP` struck as absorbed) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `CHANGES_AND_FIXES.md` · `SPRINT_TO_LIVE_PLAN.md` (row 5c) · `CC_A_SESSION_TASK_LIST.md` · this report. The full tier ledger is in the Step-10 governance commit message (`e25e75dcb`), and is transcribed into the completion report at conversion. **Correction to that ledger (Langston, Step-10 ruling):** its `GOVERNANCE_EXCEPTIONS.md` row said `N/A`. It was REQUIRED this turn: the line-36 `open` row's body was stale (it still read Step 7 of 11). It is amended in the next commit; the verdict is ✅, "row 36 body re-stated to the observation state, window end 2027-02-03". Also amended there: plan row 5c's item cell, whose carried figure was stale (the two named tables measure 12,577 MB today and the six 17,494 MB).
