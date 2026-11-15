# B-DB-SIZE-RELIEF — Step 4 change list (Step 3, three increments)

**change-class:** architecture · **Step 2:** `Claude Comms and Packages/Scope Files/B_DB_SIZE_RELIEF_PRE_AUDIT.md` (Langston PROCEED on r4, binding items C-8/C-9/C-10) · **Owner:** CC-A · **Deploy:** HELD at its queue place (stage 00, order 5c), and never between 02:15Z and the sweep's DONE line.

## Doc set for the declared class (architecture)
| document | state |
|---|---|
| scope (`B_DB_SIZE_RELIEF_SCOPE.md` r3) | present, Step-1 PROCEED |
| pre-audit + plan (`B_DB_SIZE_RELIEF_PRE_AUDIT.md`) | present, Step-2 PROCEED |
| this change list | present |
| `STORAGE_POLICY.md`, `SYSTEM_IMPACT_MAP.md` (data-archive `:2255`, SIM #17 `:2262`, registry `:2511`), `SYSTEM_MANUAL.md` (`:12125`, `:12257`), `RUNNING_ISSUES` (`#688` closed into the batch), `PRE_LIVE_SPRINT.md:232` struck, `BATCH_CATALOG`, `PHASE_HISTORY`, `CHANGES_AND_FIXES`, `GOVERNANCE_EXCEPTIONS`, the tier ledger (naming `SPRINT_TO_LIVE_PLAN.md` row 5c) | ABSENT — Step 10 (P7) |
| completion report | ABSENT — Step 11 |

## Objective → commit
| objective | plan item | commit (at `origin/migration/aws-supabase`) |
|---|---|---|
| OBJ-1 (A1: `signal_eval_archive` 30 → 15, seven keys reaffirmed) | P1 | `a2f5cbc6d` |
| OBJ-4 (A2: six tables cut over to daily at 2026-12-01; the held reversal) | P3 + P4 | `a2f5cbc6d` |
| OBJ-2 (the data-archive panel states its hot horizon) | P5 | `a26cfd934` |
| OBJ-3 (the replay script and the fee SQL state what they read) | P6 | `bc85346f3` |
| OBJ-5 | struck in scope r3 | — |
| OBJ-6 (governance) | P7 | Step 10 |

## Increment 1 — `a2f5cbc6d` (8 files, +554)
- **`drizzle/migrations/2026-11-08-b-db-size-relief-retention.sql`:** UPSERT of the seven `data_lifecycle` keys (`signal_eval_archive` 15; `pair_scan_archive`, `signal_eval_provenance`, `exit_decision_archive`, `macro_feed_archive`, `crypto_spot_ticker_snap`, `xstock_perp_ticker_snap` 30). `ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO UPDATE` with the `*` values written, then a DO block asserting exactly seven rows at those values.
- **`…-retention-rollback.sql`:** applied by hand with psql, before any code revert. It UPDATEs `signal_eval_archive` back to 30 and deletes nothing.
- **`…-daily-cutover.sql`:** `BEGIN; SET LOCAL lock_timeout = '5s';`, then one DO block with three passes:
  1. guard every monthly at/after `2026-12-01` (`pg_relation_size = 0` AND `EXISTS (SELECT 1 … LIMIT 1)` false);
  2. DETACH + DROP them, raising if the dropped count differs from the listed count;
  3. `CREATE TABLE IF NOT EXISTS … PARTITION OF …` for 16 dailies.

  Then a postcondition per parent: no monthly at/after the cutover, all 16 dailies present.
- **`drizzle/migrations/held/…-cutover-reversal.sql`** (`git add -f`, NOT in MANIFEST): refuses if `COALESCE(current_setting('b_db_size_relief.as_of', true), CURRENT_DATE) >= 2026-12-01`, or if any daily at/after the cutover holds a heap byte or a row. It drops those dailies, recreates `_2026_12 … _2027_10` with bare-date bounds, then checks a postcondition.
- **`daily-partition-cutover.ts`:** the six APPENDED after the existing six (C-5(i)).
- **`MANIFEST.txt`:** the two forward files.
- **Tests:** `b-db-size-relief-cutover-fences.test.ts` (8) and `server/tests/integration/b-db-size-relief-cutover.test.ts` (6). The integration test **reads the shipped files' bytes** and renames the quoted parents to `dsrt_<name>`, asserting each name appears quoted exactly once (C-9). It covers: forward; an idempotent re-run; a refusal on a non-empty future monthly; the reversal before the cutover; a refusal on/after the cutover; a refusal on a non-empty daily. It skips with no database and THROWS in CI if the database is unreachable. **CI run `42439428063` (4/4): `db:migrate` applied both forward files to CI's real six parents, and all 6 integration tests ran and passed** (job log).

## ⛔ ONE DESIGN CHANGE FROM THE APPROVED PLAN — attack it
**C-8 asked:** "P4 raises on a drop-count mismatch, so a re-run cannot heal [committed-but-unledgered] — name the hand step (insert the ledger row, then re-run)".
**Built instead:** the forward file is IDEMPOTENT. A re-run lists 0 monthlies at/after the cutover, drops 0 (0 = 0, no raise), `CREATE … IF NOT EXISTS` creates nothing, and the postcondition passes, so `dt-deploy <same sha>` re-applies it harmlessly and writes the ledger row. No hand step is needed.
**Tested:** "forward is IDEMPOTENT: a second run (committed but unledgered) passes and changes nothing (C-8)".
**Why I prefer it:** a hand-inserted ledger row is an un-reviewed write to the runner's own bookkeeping. The partition-catalog discriminator in the recovery note is unchanged.

## Increment 2 — `a26cfd934` (3 files, +78/-3)
- `computeDataArchiveStatus`: one `data_lifecycle` read per call (`diagDb`), in its own try.
  - On a LOAD failure (acquire or statement timeout) no line is written. A real fault is folded into the once-per-call summary line, or logged alone if the table reads succeeded.
  - Each row gains `hotHorizonDays` (null when unread or missing — never a default) and `windowPartial` (`windowMs > days × 86,400,000`; null when unknown).
- `analytics.tsx`: the row type gains both fields. A `PARTIAL — hot holds N d` badge (with a tooltip) or `HOT WINDOW UNKNOWN` sits beside QUERY TIMEOUT.
- `b-db-pool-guard-p5.test.ts`: the call count is now 1 horizon read + 5 table reads, all failure rows null; a new test covers `rolling_30d` — a 15-day table is `windowPartial: true`, 30-day tables `false`, a missing key `null`. Mutation (partial forced false) fails it.

## Increment 3 — `bc85346f3` (4 files, +153)
- **New `server/services/data-archive/hot-horizon.ts`** (pure): `HOT_HORIZON_SQL`, `parseHorizonRows`, and `decideEra(eraStartIso, tables, horizons, nowMs)`.
  - The limiting horizon is the MIN across the tables.
  - An era older than now minus that horizon refuses, naming the warm tier, `b75-rehydrate.ts` and the earliest servable era (the next UTC midnight).
  - A missing or invalid key refuses, as does an unparseable era.
- **`scripts/b5-w20c-provenance-replay.ts`:** reads both joined tables' horizons BEFORE the first archive query, prints them and the population, and `process.exit(2)` on a refusal.
- **`scripts/analysis/b_xstock_fee_contract_deploy_baselines.sql`:** a section (0) printing `hot_days` / `hot_from` for `signal_eval_archive` and `switch_on_shadow_evidence`, before section (1).
- **`b-db-size-relief-hot-horizon.test.ts`** (7 at `bc85346f3`; **14** after the folds and increment 4 - gate 3 F4 caught the stale count): the default era refuses (earliest 2026-11-06 at a fixed now), in-horizon passes, the limiting table is reported, an era inside 30 d but outside 15 d refuses (the INNER-join loss), plus the missing-key, unparseable-era and wiring fences. Mutation (longest horizon chosen) fails three.

## Step-4 folds (all disposition 1, on this batch's own increments)
| sha | gate | what |
|---|---|---|
| `8d9866ef9` | 1 | C-11 boot headroom keyed on the measured child · C-12 audible `as_of` override + whole-tree fence · reversal postcondition `>= cutover` · retention any-scope exact-7 · cutover header notes |
| `e32b1a6c1` | pre-2 | the panel uses the shared `HOT_HORIZON_SQL` / `parseHorizonRows` |
| `8ed34497d` | pre-3 | fee SQL section (0): one row per table, `MISSING` when a key is absent |
| `71468a8bf` | 2 | C-1 no PARTIAL beside a timed-out count · C-2 one load predicate (full statement-timeout phrase; four sites) · C-3 "Total rows (hot)" · strictness comment carries the measured direction |
| `bec4c8df1` | pre-3 | the replay re-checks its era at the END of the run (exit 3) |
| `0c9947d77` | 2 r2 | the load-predicate fence pins the fourth site and any quote style |

## Increment 4 — the sweep and the horizon readers share one scope filter and one value test (Langston, gate 2: fold into this batch)
- **`hot-horizon.ts`:** `DATA_LIFECYCLE_SCOPE_SQL` (module + all four scope columns `'*'`) and `parseLifecycleNumber` (a jsonb NUMBER, finite, > 0; a string `"15"` is null). `HOT_HORIZON_SQL` is built from the filter; `parseHorizonRows` uses the value test (it used `Number()` and accepted `"15"`).
- **`server/scripts/b75-retention-sweep.ts` `loadConfig`:** the query is `WHERE ${DATA_LIFECYCLE_SCOPE_SQL}` (it was `module_name` alone, last-row-wins); `reqNum` calls `parseLifecycleNumber` (same predicate as before, now shared).
- **Measured before changing the enforcer (staging, read-only):** 35 `data_lifecycle` rows, 35 at `'*'` on all four scope columns, 35 distinct names, every `.hot_retention_days` a jsonb number. **So the filter changes nothing the sweep reads tonight**; it removes the future case where a narrower row wins the sweep's map unseen, and a string seed now reads UNKNOWN to the readers instead of a confident horizon the sweep would abort on.
- **Tests (hot-horizon):** the value test's truth table; a string-seeded key is UNKNOWN and the era refuses; a source fence that the sweep imports and uses both, and the unscoped read is gone. Mutation (`Number()` coercion restored) fails two.

## Gate-3 revisions (Langston APPROVED-WITH-REVISIONS, msg 1568840535962030222)
- **F1:** the end-of-run refusal goes to STDOUT as well as stderr, so a `> report.txt` capture carries it.
- **F2:** the end-check fence anchors on the LAST archive read (`signal_eval_archive b ON`, the sampling joins), not the first.
- **F3:** a PRESENT-but-malformed key is reported as such ("the key exists"), distinct from an ABSENT key; `parseHorizonRows` maps a malformed value to null instead of dropping it.
- **F4:** the test count above.
- **Attack 3:** fee SQL section (0) RAISEs on a MISSING key (the run uses `ON_ERROR_STOP=1`). Proved on staging: the real block passes; a copy with a control table raised and psql stopped with exit 3.
- **Attack 2 record:** the end-check comment states the stronger reason: the sweep cutoff is monotone in wall-clock and the horizons are re-read, so the check evaluates the run's MAXIMUM cutoff.
- **For the completion report:** at 30/30 the default `ERA_START` 2026-06-08 is 153 days back, so the replay exits 2 on every default invocation. That is the defect being caught, not a regression.

## Gate-4 conditions folded (Langston PROCEED-WITH-CONDITIONS, msg 1568850950503006350)
- **C-1 — the three named enforcing readers use the shared value rule.** `b_disk_headroom_eligibility.ts` now reads only the sanctioned wildcard rows and parses both retention days and the slice threshold with `parseLifecycleNumber`; `guardrail-settings.ts` keeps its `limit(2)` any-scope duplicate refusal and replaces `Number()` with the shared parser; the xStock bar capacity gate reads the sanctioned wildcard row and applies the shared parser. The sweep itself now counts and names every non-wildcard `data_lifecycle` row, raises one deduped warning without stopping tiering, and resolves that warning after a clean shape read. After increment 4 a narrow row is unseen, not out-voted.
- **C-2 — all three named SQL copies are fenced.** The hot-horizon unit file now asserts all five predicate terms (`module_name` plus the four wildcard scope columns) in both fee-SQL copies and the sanctioned retention writer. It also fences all three readers above and both edges of the narrow-row alert.
- **C-3 — stale explanations corrected now; the durable amendment remains Step 10.** The retention writer's WHY block no longer describes last-row-wins or stale line numbers, and `hot-horizon.ts` no longer equates its two callers with every reader. At Step 10 the pre-audit amendment must explicitly dispose of all five reads: (1) headroom eligibility — folded here; (2) money-held retention — folded here without scope-pinning; (3) xStock capacity retention — folded here; (4) `replay-ablation.ts` hard-coded fallback — outside this batch, Kyle placement required; (5) `b5c-verify.cjs` unscoped print-only read — no work.
- **Tests:** the hot-horizon unit file has 17 tests after these folds. The blocking folds do not deploy: the hold beginning at `a2f5cbc6d` remains at stage 00, order 5c.
- **REVIEWER: claim-only · WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THE THREE NAMED READER FOLDS AND NARROW-ROW ALERT? · HIT: three separate B75 jobs still read all scopes into maps; re-derived yes — they consume context-bridge, warm-tier, and disk-file keys outside this batch's seven changed retention keys, so the C-1 claim is narrowed to Langston's three named readers and the hit is carried to Coltrane for ruling.**
- **Coltrane re-check at `cfeb6a067`: CHANGES, one fold.** A deduped alert keeps its first body, so the sweep now logs the current narrow-row count and names before every alert attempt; the source fence proves the log precedes the deduped call. Alert creation and clean resolution remain best-effort as ordered.

## Suite
Full suite after the gate-4 folds: 411 passed, 1 skipped, the same 11 local-only failing files (by file-list diff against the earlier baseline); the two affected unit files pass 79/79; tsc 324 = baseline. The database integration file skips locally and ran in CI.

## Step 9 iterate — the Data Archive panel's counts become labelled estimates (KD-80, 2026-11-14, CC-A)
**Authority.** Kyle, KD-80 (`1-system-manual/pm/DECISIONS.md`, recorded at `2ed52f0a2`): this fix goes into B-DB-SIZE-RELIEF now as a Step-9 iterate, under Langston's conditions. **Kyle chose this over Coltrane's earlier binding ruling** (`5a2a0f10e`: do not widen this batch into the homed time-boxing work; use a separately scoped equivalent). Coltrane has been stopped since the Codex usage stop (2026-11-12 13:16Z), so the one round Langston required (his condition C) could not happen; Langston would not waive his own condition and routed the fork to Kyle. **Coltrane: this is recorded for your return.** Langston's fold ruling: Discord `1571290937857151089` (FOLD GRANTED, conditions A-H). His reason it folds: row 5c (KD-60) already reads "Drift Dashboard 30-day view fixed in the same change".
**Measured (design ask `Langston Design Asks/B_DB_SIZE_RELIEF_archive_panel_counts_r1.md`):** the panel failed at EVERY window, not only 30 days (server 58-76 s; the client aborts at 30 s). `signal_eval_archive` and `signal_eval_provenance` were QUERY TIMEOUT at every window, because their exact counts take 67-69 s and 53 s against the 25 s statement bound. **Correction to r1 (Langston F):** r1 said parallel reads could not help because each signal table alone exceeds the bound. That reason is wrong: each statement is bounded at 25 s on its own, so five concurrent reads finish in about 25 s wall time, not the sum. The sound reasons are that the fifth read fails its 5 s acquire on the 4-slot diagnostic pool, and that concurrency keeps about 50 s of database work per 30 s refetch instead of removing it.
**What changed:**
- NEW `server/services/data-archive/archive-count-estimate.ts`. A pure planner (`planEstimate`) and assembler (`assembleEstimate`) work per partition leaf. A leaf wholly inside the window counts by `reltuples`. A DAILY leaf that is the window's boundary or still open is counted EXACTLY (one day; measured 0.16-4.6 s for a whole open leaf and 0.56 s for a partial boundary leaf). A NON-daily leaf the window cuts is EXCLUDED and named, giving a lower bound "≥ N" with **no proration** (Langston D). A leaf holding data with `reltuples < 0` is excluded and named, never 0 and never -1 (E1). A leaf with no heap pages contributes 0. A window with no contribution is UNAVAILABLE, never 0. A failed exact count excludes its leaf and names it.
- `drift-dashboard-aggregator.ts`: `ESTIMATED_COUNT_TABLES` = the two measured tables, and only those take the estimate path; the other three keep their exact counts. The size and last-write reads stay exact (each under 0.1 s). Each table row gains `rowsInWindowKind`, `totalRowsKind` (`exact | estimate | lower_bound | unavailable`) and `countNote` (the excluded or lagging leaves). The hot-horizon badge, the diagnostic pool and its 25 s bound, QUERY TIMEOUT and `WINDOW_TO_MS` are unchanged.
- `client/src/pages/analytics.tsx`: `fmtArchiveCount` shows "≈ N", "≥ N" or "estimate unavailable", never a bare non-exact number, with the note on hover. A timed-out row shows "—" instead of a bare 0.
**Offline on real inputs, before any deploy:** the leaf SQL ran on staging read-only and parsed every bound. The planner on that data gives: `signal_eval_archive` 24h EXACT (the 11-13 boundary leaf from the window start plus 11-14 whole), 7d and 30d estimates; `signal_eval_provenance` 24h and 7d UNAVAILABLE (the window lies inside the open monthly leaf), 30d "≥ 8,252,792" (excludes part of `_2026_10`; `_2026_11` named as lagging its last analyse).
**Tests:** NEW `b-db-size-relief-archive-count-estimate.test.ts` (15), on fixtures shaped like the measured layouts (30 daily leaves; 2 monthly plus 16 empty future days). `b-db-pool-guard-p5` re-pointed: its success-path mock now answers by query rather than call order; the predicate-site count moves 3 → 5 (both new catch sites use `isDiagPoolLoad`). The panel's eight test files: 115/115. Six mutants, each RED: prorating the monthly boundary; counting unanalysed leaves as they are; dropping UNAVAILABLE; not skipping empty leaves; dropping the ≈ label; estimating `pair_scan_archive` too. tsc baseline 324 = 324.
**Owed before Step 7 (Langston G and E3):** amend `#1037` am.4's standing bar ("a Step-7 check must NOT open the Drift Dashboard on staging") to its real condition, and write the am.2 sampling method down (`pg_stat_activity` on `dawntrader_main`, pre-set abort at 7 of 10, plus the diagnostic pool's in-use count) BEFORE the tab is opened. Then time the endpoint at each window and publish the wall time; acceptance is a MARGIN under the 30 s client abort, not merely under it. **At the governance turn (Langston B):** a `#1037` amendment recording that its "estimating" option was taken here at the deployed sha, and a note on row 119 so its owner does not re-decide it. The row-119 owner (CC-B at the plan row, CC-C in `#1037`'s HOME line) is reconciled with NEW and ANALYST first.

## Step 6-7 — the iterate deployed and timed (2026-11-15, CC-A)
**Deploy.** `dt-deploy f8fc531535541d8e5f47a54d9a45371bb07b7c51 --by cc-a` at 03:09:53Z, restart 704, engine resumed, identity asserted; the one pending migration (B-DISK-FILE-TIERING 3d step 1, `2026-11-14-b-disk-file-tiering-cold-key-step1.sql`) applied in 716 ms. No `--in-window` (NEW's row closed at `89014c9c0`). Every runtime file between the live `7c5b45c67` and this sha is CC-A's and Langston-PROCEEDed (3d step 1 and this iterate).
**Object:** `GET /api/analytics/data-archive-status?window=<w>` via `dt-api` on staging (server side, no browser), wall time from just before the call to just after. **Population:** five calls, 03:10-03:18Z, one after another. Pool use sampled every ~2 s from `pg_stat_activity` (`dawntrader_main` active, `dawntrader_diag` connections) for the duration of each call. Script: a private `/tmp` file on staging, deleted after use; the query is in the re-derivation line below.

| UTC | window | wall | cache state |
|---|---|---|---|
| 03:10:20 | rolling_24h | 16.2 s | first call after the 03:09:53 restart |
| 03:16:52 | rolling_7d | **21.7 s** | first 7d call; today's leaf was auto-analysed at 03:16:57, inside this call |
| 03:17:27 | rolling_30d | 15.7 s | first 30d call |
| 03:17:43 | rolling_24h | 8.1 s | second call (warm) |
| 03:17:52 | rolling_7d | 8.5 s | second call (warm) |

**Worst case 21.7 s: an 8.3 s margin under the 30 s client abort, and OVER the 20 s line Langston set** ⇒ under his condition the bounded `SET LOCAL statement_timeout` on the exact counts ships, as a fold through Step 4 (dispatched separately). **Every window rendered:** no row QUERY TIMEOUT. `signal_eval_archive` 24h EXACT 1,953,747; 7d ≈ 15,220,124; 30d ≈ 32,206,811 (the window starts before the first filled leaf). `signal_eval_provenance` 24h and 7d "estimate unavailable" (the window lies inside the open monthly leaf, as the offline run predicted); 30d ≥ 8,252,792; total ≈ 27,204,452.
**Where the time goes (psql, 03:2xZ, after the calls above, so warm):** `pair_scan_archive` exact block (window + total) **8.56 s**; `exit_decision_archive` 0.15 s; `macro_feed_archive` 0.09 s; the `signal_eval_archive` boundary leaf `_2026_11_08` from the window start 3.06 s; today's open leaf whole 0.60 s; the two `max(captured_at)` reads 0.23 s and 0.05 s. **The largest single cost is now `pair_scan_archive`'s exact count** (9.29 M rows, 8.5 GB, about +1.25 M rows a week), which is not on the estimate list and is bounded only by the pool's 25 s statement bound. Bounding the two daily-leaf asks does not bound it. That is a question for Langston, not a change made here.
**Pool sampling:** the diagnostic pool held at most 2 connections throughout (its 4-slot cap was never reached). `dawntrader_main` active was 0-2 in every sample except two inside the second 24h call: **10 of 10 at 03:17:46 and 6 of 10 at 03:17:48.** The endpoint reads on the diagnostic pool (`computeDataArchiveStatus` takes `diagDb`), so a 10-connection burst on main is NOT shown to be this endpoint's. A baseline with no call running read at most 1 active over 90 s (03:21-03:22Z); a second baseline, 150 samples over 03:22:40-03:28:40Z, read at most 3 active and none at 7 or more. So the 10-of-10 sample is unexplained: it is not this endpoint's pool, and it did not recur in six minutes without a call. ⚠️ **This bears on `#1037` am.5's browser-check abort bar (main at 7 of 10): a burst like this one would trip it whoever caused it.**
**Finding, for Langston (not built): closed daily leaves read low too, not only the open one.** Every one of the 15 closed `signal_eval_archive` leaves was last analysed BEFORE its range ended (21:50-23:55Z on its own day). Their `n_mod_since_analyze` is 7,373 to 212,338 each, **1,257,745 in total against a `reltuples` sum of 31,932,639**: the estimate reads about 3.8% low across those leaves, and about 9.6% low on `_2026_11_11`. The figure is labelled "≈", so this is not a false number, but the error has one direction. It is the same family as the DROP-only premise Langston asked to be written down (data leaves these tables only by `DROP TABLE`). **HYPOTHESIS, not verified:** if these leaves see no UPDATE or DELETE, `n_mod_since_analyze` counts inserts only, so `reltuples + n_mod_since_analyze` would track the true count. That is his call; nothing here uses it.
**Re-derivation:** timing — the `time ... dt-api GET` line in the r1 design ask §5, once per window. Pool — `select now()::time(0), count(*) filter (where application_name='dawntrader_main' and state='active'), count(*) filter (where application_name='dawntrader_diag') from pg_stat_activity`, every 2 s. Leaf lag — `pg_partition_tree('signal_eval_archive')` joined to `pg_class` and `pg_stat_user_tables` (`reltuples`, the TO bound, `greatest(last_analyze, last_autoanalyze)`, `n_mod_since_analyze`).
**Not yet done:** the Claude-in-Chrome check (the am.5 method, rolling_24h first) and Langston's Step-8 pass.

## Step 9 fold — each daily-leaf exact count runs under its own bound (Langston's condition, 2026-11-15, CC-A)
**Why:** the Step-7 worst case was 21.7 s, over the 20 s line in Langston's condition ("if over 20 s, ship a bounded `SET LOCAL statement_timeout` on the exact counts").
**What changed (`drift-dashboard-aggregator.ts`):** NEW `export const ARCHIVE_EXACT_COUNT_TIMEOUT_MS = 6000`. Each of the estimate path's exact counts now runs in its own transaction: `SET LOCAL statement_timeout = 6000`, then the count. `SET LOCAL` ends with the transaction, so the pool's 25 s bound is unchanged for every other statement. A count that hits the bound is LOAD (`isDiagPoolLoad`, so no fault line), and its leaf is excluded and named: the figure becomes "≥ N", never 0 and never QUERY TIMEOUT. **Why 6 s:** it is above every count measured (a whole open leaf 0.16-4.6 s, a boundary leaf from the window start 0.56-3.06 s), so a normal count completes, and the two asks per table add at most 12 s. **What it does NOT bound:** `pair_scan_archive`'s exact count (8.56 s warm), which only the 25 s pool bound holds.
**Tests:** `b-db-pool-guard-p5`: the mock pool gains a `transaction` that routes through the same `execute` mock. NEW test: every exact count is sent directly after its own `SET LOCAL statement_timeout = 6000`, one transaction per count, and a count that times out gives `lower_bound` with the leaf named and no fault line. **Mutant:** with the `SET LOCAL` line removed, that test is RED (1 failed, 11 passed); restored, 12/12. The 11 archive, drift and pool-guard test files: 103/103. tsc baseline 324 = 324. One run straight after restoring the file showed 1 failure that did not reproduce in four later runs (27/27 each time). It was not diagnosed, and it is stated here rather than dropped.
**Step 4 (Langston, Discord `1571372103029227692`, 2026-11-15 ~03:50Z): PROCEED** at `c1fa1e1d3`. He re-read the diff, the driver path (`db.transaction` = one pooled client, so `SET LOCAL` binds), both pool bounds and `isDiagPoolLoad` at the ref. The Step-7 timings, the 8.56 s, the pool samples and the suite counts are **RULED ON REPORTED FACT**. He tagged the trigger only, not the bound. **His five items for the record, none blocking:**
1. **The budget is per table, and it doubles at 2026-12-01.** Two tables × two asks × 6 s = 24 s, not 12 s. It is 12 s today only because provenance is still monthly. The comment is corrected in the carry commit (below). **Owed:** re-time the endpoint after the 12-01 cutover.
2. **This fold does not establish the 20 s line.** 21.7 s was never broken down: the warm sum is about 12.7 s, which leaves about 9 s tied to no statement. The honest claim is "each exact count is bounded", not "the endpoint is under 20 s". **Owed:** a post-deploy re-time at all three windows, cold first call and warm, with the margin stated.
3. **`pair_scan_archive`:** working as designed but unaddressed, a scope decision, NOT this batch. Langston carries it to Kyle with the growth line and re-times it after retention and the cutover land.
4. A timed-out count on the open daily leaf drops a `reltuples` the planner already holds (D/E1 applied consistently). So "≥" renders will be more common with a 6 s bound than with 25 s. This is expected behaviour, not a defect.
5. "A timeout writes no line" has one exception already in the file: a failed ROLLBACK after a cancelled SELECT lands as a fault. It is safe, but the completion report must not state the rule unqualified.
**The two findings recorded outside the gate:**
- (a) `reltuples + n_mod_since_analyze`: **disposition 5, no work.** `n_mod_since_analyze` counts inserts, updates and deletes together, so it stands in for a row count only if the leaves are insert-only. That is asserted, not measured. ⇒ **The premise to measure first, before anyone revisits this, is that these leaves receive no UPDATE or DELETE.**
- (b) The `dawntrader_main` 10-of-10 sample at 03:17:46: **disposition 1, folded into the am.5 work.** The bar stays at 7 of 10, not loosened. The am.5 sampling now also records `query` and `backend_start` for active `dawntrader_main` backends, so the next burst names its caller.
**Carry (comment only, no behaviour change):** the constant's comment is corrected to the per-table budget, the 2026-12-01 doubling and the re-time owed.

## Step 6-7 (2) — the fold deployed jointly, re-timed, and the browser check aborted under am.5 (2026-11-15, CC-A)
**Deploy:** a joint deploy with ANALYST's #1250, both Langston-PROCEEDed. `dt-deploy 3e2504129d2d03983354e9a75a355cf31ef4e77d --by cc-a --in-window B-PRICE-SIDE-BY-JOB` ran at 04:22:48Z (restart 705; no pending migration; CI run 43675326415 4/4 at that sha; NEW cleared the slot 04:08Z; ANALYST had five minutes' notice). It carries this fold (`c1fa1e1d3` + `67ce5ca5b`).
**Re-time (Langston item 2):** same object and method as the first pass, plus `query`/`backend_start` capture for active `dawntrader_main` backends. Six calls, 04:23-04:25Z, one after another, starting 34 s after the restart:

| UTC | window | wall | state |
|---|---|---|---|
| 04:23:1x | rolling_24h | **not captured** (my output filter cut the first block; stated rather than guessed) | first call after the restart |
| 04:23:27 | rolling_7d | 15.0 s | first 7d call |
| 04:23:42 | rolling_30d | 15.0 s | first 30d call |
| 04:23:57 | rolling_24h | 16.8 s | second call |
| 04:24:16 | rolling_7d | 14.9 s | second call |
| 04:24:31 | rolling_30d | 14.3 s | second call |

**Worst captured: 16.8 s, a 13.2 s margin under the 30 s client abort.** This pass has no warm/cold split: every call ran 14-17 s, against 8 s warm at 03:17Z. **HYPOTHESIS, not measured:** the app's own writers were still flushing the backlog from the restart. The sample at 04:24:19 holds six active `dawntrader_main` backends, all of them writers (the `crypto_perp_ohlc_1m`, ticker-snap, `signal_eval_archive` and `pair_scan_archive` inserts, `backend_start` 04:22:42-43, the restart minute) plus one P/L sum. **Every window rendered** with the same kinds as the first pass, and nothing showed QUERY TIMEOUT. **The first-call cold figure after this deploy is NOT established for 24h.** It is owed together with the post-12-01 re-time.
**Browser check (Claude-in-Chrome, am.5 method):** the sampler started 04:25:18Z (main active and diag connections every ~2 s, ABORT at main ≥ 7). The analytics page opened, the Drift Dashboard tab was clicked, and the Data Archive panel rendered at `rolling_24h`:
- `pair_scan_archive` 82,795 / 9,293,769;
- `signal_eval_archive` 1,955,177 / ≈ 32,298,993;
- `exit_decision_archive` 27 / 11,026;
- `macro_feed_archive` 1,441 / 65,072;
- `signal_eval_provenance` "estimate unavailable" / ≈ 27,204,452.
No row showed QUERY TIMEOUT or a bare 0, and the screenshot was saved. **BUT THE SAMPLER LOGGED `ABORT main_active=10` AT 04:25:34Z**, so the tab was closed at once and 7d/30d were NOT checked. The burst was 0 at 04:25:32 and 0 at 04:25:36, so it lasted under 4 s, and the capture query found it already gone (no caller named). **Attribution is OPEN, not cleared:** the diagnostic pool rose at 04:25:57, which is when the Drift tab was opened. But the analytics page itself (its Overview tab) was loaded shortly before that, at a moment I did not timestamp, so a page-load burst on the MAIN pool is neither shown nor excluded. The 03:17:46 burst happened with no browser open at all. ⇒ **Under am.5 this is an aborted check, NOT a pass.** It is retried later with the navigate timestamped and a sub-second capture. Also seen, not chased: the diagnostic-pool count read 5 for about 10 s (04:25:59-04:26:08) against that pool's max of 4. One explanation would be a second process opening connections under the `dawntrader_diag` name. That is a HYPOTHESIS, recorded for the am.5 work.
**Addendum, same sampler, after the tab was closed (~04:26:45Z):** two more trips, **`ABORT main_active=7` at 04:27:43 and `main_active=9` at 04:27:48**, with no browser open and no endpoint call running. The capture at 04:27:43 named two of the backends still active: a `select "id", "symbol", "mode", "exchange", "asset_class", "strategy_name", "side", "quanti…` (`backend_start` 04:22:43, the restart) and an `INSERT INTO xstock_book_state_rings …` (`backend_start` 04:25:46). Diag was 0 throughout. Population: 97 samples, 04:25:18-04:28:44. ⇒ **Brief main-pool bursts of 7-10 happen in the app's own work, with the panel closed.** So am.5's 7-of-10 abort fires on them whether or not the panel is open. The 03:22-03:28Z baseline read max 3, so the bursts may cluster after a restart (HYPOTHESIS). For Langston: the bar is his, and this is evidence on how it behaves. It is not a proposal to loosen it.
**Langston's ruling on the browser check (Discord `1571382670313783487`, ~04:33Z): option (a); the 7-of-10 bar does not move.** The 04:25 run was **not yet am.5**, and that, not the burst, is why its attribution is open. His five retry conditions:
1. Run the 60 s pre-roll and the 120 s post-roll. If the pre-roll itself reaches 7, the tab does NOT open: that is REFUSED, a pool-headroom finding for row 119, not an abort.
2. The predicate is am.5's: in-use = non-idle plus `idle in transaction`, per name, on BOTH pools. My earlier sampler counted only `active` on main and every connection on diag, so the 5-against-4 diag reading was a total, not an in-use count. Capture `pid, state, backend_start, client_addr, query` for both names.
3. "It also trips with the tab closed" does NOT clear the panel (am.4 is a trip that persisted after close and was the panel's). The discriminator is decided at the sample: writers with `backend_start` at the restart minute = app work; the panel's own archive SELECTs = the panel's; nothing named = unattributed, retry.
4. No deploy or restart inside 30 min; the navigate and the tab click timestamped into the log; sub-second sampling; **three attempts with clean pre-rolls at most**. If all three abort before `rolling_24h` renders, stop and report to row 119.
5. Run the harm leg.

7d/30d are not owed: am.5 holds the first check to `rolling_24h`.
**Harm leg (condition 5), run 04:3xZ on `/var/log/dawntrader/error.log`:**
- **Window 04:24:00-04:29:59Z: 0 `slot timeout|rows dropped` lines; the whole of 2026-11-15 so far: 0.**
- Controls: (A) the pattern matches the recorded 09-28 line text from `#1037`. The 09-28 archives themselves are past the 14-file retention; the oldest retained is `error__2026-11-02`. (B) The pattern finds real hits in the retained archives: 11-03 2, 11-05 905, 11-06 2, 11-08 5, 11-11 12, 11-12 39, 11-14 1, 11-15 7, each file holding the day BEFORE its name. (C) The time filter reaches the window: 1,475 lines in it.
- My first grep used an ISO `T` the log does not write, and it returned 0 for the wrong reason. It was caught by control C and redone.
- The 7 lines for 11-14 are `[B74][batch-writer] … TRANSIENT flush failure … rows RETAINED for retry … ohlc-batch-writer: pool slot timeout (5s)` at 01:41, 06:18, 07:06 and 09:01Z. Those are main-pool OHLC writer timeouts with the rows kept, outside every measurement window of mine (row 119's writer side).
**am.5 sampler, rebuilt to the conditions:** one `psql` session, `\watch interval=0.5`, per name in-use = `state <> 'idle'`, plus diag total. When main in-use is 5 or more, every in-use backend on both pools is named (`name/pid/state/backend_start/client_addr/query`). Positive control: with the threshold and the state filter removed, the capture arm named backends in 4 of 5 rows.
**Attempt 1 (am.5, Langston's conditions), 2026-11-15 04:54:36-05:00:06Z: REFUSED at the pre-roll; the tab never opened.** There had been no restart since 04:22:48 (restart count 705). The sampler started at 04:54:36. **The pre-roll reached `dawntrader_main` in-use 10 at 04:54:40.8**, so under condition 1 this is REFUSED, not aborted. **Population: 610 samples at 0.5 s.** Main in-use: 0 in 569, 1 in 14, 2 in 18, 3 in 4, 7 in 2, 9 in 2, 10 in 1. Diag in-use was 0 throughout (no panel). **Every sample at 5 or more names its callers.** Each one is the xStock price-liveness read, the windowed `WITH w AS (SELECT last, captured_at, LAG(last) OVER (ORDER BY captured_at) … FROM xstock_spot_ticker_snap WHERE symbol = …)` at `server/asset_classes/xstock_spot/price-liveness.ts:141-154` (`getRecentLastMoveStats`, the P19-B6.6 fill gate, `2398702e8`):
- 04:54:40.8: 10 in use = 9 liveness reads + 1 `update "active_open_positions"` (`backend_start` 04:22:43);
- 04:54:43.8: 7 = 7 liveness;
- 04:54:52.8: 9 = 9;
- 04:55:09.3: 9 = 9;
- 04:58:42.8: 7 = 7.

The liveness reads came from 15 distinct backend pids, with `backend_start` values from 04:42 to 04:53 (pooled connections, not restart-minute writers). Every burst was sub-second: the neighbouring samples read 0-3. **By condition 3's discriminator these are app reads, attributable, and not the panel's.** **What this establishes:** the main-pool bursts that trip am.5's 7-of-10 bar are concurrent price-liveness reads. **What it does NOT establish:** whether those bursts cause the writer slot timeouts (`ohlc-batch-writer: pool slot timeout (5s)`, the 11-14 lines). That is a HYPOTHESIS for row 119; no correlation was measured. Also from the code: the read is raced against `queryTimeoutMs` with `Promise.race` (`:155-160`, comment `:132-133`, "the orphaned server query is harmless"), so a client-side timeout leaves the server query running. Whether that query keeps its pooled connection until it finishes is NOT RE-READ. The raw sample log was deleted with the private `/tmp` files; the counts and caller lines above are copied from it.
**Langston's ruling (Discord, 05:04:07Z): STOP at attempt 1; no loosening.** "A pre-registered gate that you re-roll until it passes is no longer a gate ... The refusal *is* the measurement." Attribution answers whose reads they are; the pre-roll gates on state. **Recorded in his wording:**
- **OBJ-2 browser leg BLOCKED at the am.5 pre-roll.**
- **Blocker:** a recurrent in-use burst from the named caller (the xStock price-liveness read, `price-liveness.ts:141-154`).
- **Correlation to the 11-14 writer timeouts: NOT measured.**
- **The caller goes to row 119 (`B-ARCHIVE-WRITER-LIFECYCLE`, CC-B at the plan row) as an INPUT, not a diagnosis.** §9.4 disposition: input to an existing item, no new batch, no new slot.
- "Most windows will contain one" is an estimate from two burst clusters in a single 5.5-minute sample. It is NOT a burst rate.
- The 04:25 render stays recorded as an observation that does not count under am.5. The leg is BLOCKED, not unknown.

Langston re-read `price-liveness.ts:129-175` at `0463c8649`. Within the function nothing cancels the query: `Promise.race` abandons only the await, and the `finally` clears the timer, not the query. So the server-side work outlives the client timeout. Whether it holds a pooled slot is a HYPOTHESIS: the deciding line is in the `db` wrapper's pool semantics, which neither of us read, and it is the first thing for row 119's owner to settle. His tags: the sampler figures are RULED ON REPORTED FACT, which does not disqualify a STOP.
**Langston on the close shape (Discord, 05:19:14Z): option (2), close with the browser leg OPEN, carried by ROW 119, not by a one-shot alert. He also amends his own bar.**
- **He re-derived the server leg himself** (05:16-05:17Z, `dt-api`, four windows): 24h 11.942 s, 7d 13.515 s, 30d 11.423 s, `cohort_latest` 10.315 s. HTTP 200 each, `timedOut=false` on 20 of 20 rows. That leg is no longer RULED ON REPORTED FACT.
- **The render half is entailed in code:** `fmtArchiveCount` (`analytics.tsx:2052-2053`) short-circuits on `timedOut`/`unavailable` before any number, and both cells route through it (`:2200`, `:2209`).
- **What the leg still buys** is the 30 s refetch with no visibility gate (`:2055-2058`): sustained pool load, which is row 119's subject.
- **am.5 amendment (his):**
  1. Condition 1's REFUSED applies only to an UNATTRIBUTED burst. A burst whose capture names only non-panel callers is recorded, and the pre-roll continues.
  2. The abort arm is unchanged: main 7 of 10 with the tab open closes it at once. But a close caused by an ATTRIBUTED non-panel burst is a NO-RESULT, not an abort, and does not consume an attempt.
  3. Conditions 2, 4 and 5 stand.

  He invites the check to be run before close under this amendment.
- **Carrier:** row 119, not an alert. A one-shot keyed to another batch's step drops the self-rescheduling clause (`workflow-10-governance` `:65`), `triggers_at` has no event trigger, and it would be a ninth nag with no clearing edge. **The am.5 check at `rolling_24h` becomes a named required deliverable of row 119's acceptance**, with the reopen condition verbatim in the row and in the completion report. The report states the leg OPEN at the top and points at row 119. An optional self-rescheduling alert is allowed only if worded as a question.
- **Two more folds:** (i) when both arms print the same estimate (`rolling_30d` `signal_eval_archive`, `rowsInWindow == totalRows`), the note must say why. That is the total-arm symmetry fold, made concrete. (ii) A Step-10 line saying `rowsInWindow: 0` with `kind: 'unavailable'` is safe only because of the kind, so the kind is load-bearing (#546).
- **Build check (his precondition), done 05:2xZ:** the deploy record `sha=` and `dist/BUILD_SHA` both read `3e2504129d2d03983354e9a75a355cf31ef4e77d`. `git diff 3e2504129 origin/migration/aws-supabase` over `analytics.tsx`, `drift-dashboard-aggregator.ts`, `archive-count-estimate.ts` and `db.ts` is empty. So the drift alert `cdfbb99e` reflects commits that do not touch the panel code, and the live build is the panel code under review.
