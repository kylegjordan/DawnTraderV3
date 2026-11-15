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

## 3. ⛔ PRE-REGISTERED CLOSE CRITERION — written 2026-11-15, before any of this data exists. Do not data-mine.

**Window (a set period):** 2026-12-01 through **2027-02-02**. Legs (a)-(c) read by 2027-01-04; leg (d) read on 2027-02-01/02.

**PASS requires all four:**
- **(a) Writes land in dailies.** On 2026-12-02, for each of the six tables, rows with `captured_at >= 2026-12-01` exist only in `…_YYYY_MM_DD` children, and no monthly child `>= 2026_12` exists (the §2 catalog query).
- **(b) The last monthly leaves whole, and verified.** Each table's `…_2026_11` monthly is exported, proven (`completeness_basis = source-count-matched`), verified in warm and dropped by the sweep once it ages past 30 days (expected on or about 2026-12-31/2027-01-01, over however many nights the run-lock allows).
- **(c) The daily trap is gone.** From 2027-01-01 (when `…_2026_12_01` passes 30 days), the nightly sweep drops daily slices of each table, each with a verified, proven manifest row. Read over at least 3 consecutive nights by 2027-01-04.
- **(d) The month-end step shrinks.** At the 2027-01-31 month-end, the database-size log shows no month-end step from these six tables: the day-over-day change across 01-31 → 02-01 is within the range of the preceding 7 ordinary days.

**FAIL is any of:**
- a monthly child `>= 2026_12` is created for any of the six;
- a daily slice older than 30 days is still hot on 2027-01-04 while the sweep ran;
- a hot partition is dropped without a verified, proven manifest row;
- the 2027-01-31 step is outside that range and attributable to these tables.

**Who decides:** CC-A with Langston at conversion. A FAIL is a result: it converts with the failure and a named follow-up, or the batch reopens at Step 9.

## 4. What is unproven, stated as unproven

- Everything in §3. The cutover is in place; how it behaves is not observed.
- **The Data Archive panel under sustained load.** The browser check had the tab open 38 s (one fetch, at most one refetch). The 30 s refetch with no visibility gate, and fold r2's 6 s burn per refetch at 30 days, are **inputs to row 119** (`B-ARCHIVE-WRITER-LIFECYCLE`, NEW Claude), as are the price-liveness main-pool bursts. That row's acceptance no longer carries an "unrun am.5 check" clause (`#1037` am.7).
- **30d after fold r2** was not re-timed. It now carries a deterministic ~6 s burn; the 25 s is a per-statement bound, so this is latency, not failure.
- The estimates rest on the DROP-only premise. If row deletes are ever added to these tables, the labels must be revisited.
- **Placed on this batch, not built** (Langston, fold-r2 attack (a)): an elapsed-ms record on both arms of the non-daily slice ask, with the partition's `reltuples` beside it, so a skip gate could later be sized from at least 3 points. Not a new row.
- The post-12-01 re-time of the endpoint, when provenance turns daily (worst case 18 s → ceiling 24 s): due in window leg (a)'s read.

## 5. Governance files changed so far (Step 10, 2026-11-15)

`STORAGE_POLICY.md` · `SYSTEM_IMPACT_MAP.md` · `SYSTEM_MANUAL.md` · `RUNNING_ISSUES.md` (`#688` closed into this batch; `#1037` amendment 7) · `PRE_LIVE_SPRINT.md` (`B-DAILY-CUTOVER-SWEEP` struck as absorbed) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `CHANGES_AND_FIXES.md` · `SPRINT_TO_LIVE_PLAN.md` (row 5c) · `CC_A_SESSION_TASK_LIST.md` · this report. The full tier ledger is in the Step-10 governance commit message, and is transcribed into the completion report at conversion.
