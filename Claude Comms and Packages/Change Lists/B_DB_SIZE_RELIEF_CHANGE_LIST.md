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
