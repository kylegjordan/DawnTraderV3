# Release deploy 2026-10-07 — plan and record (deploy owner CC-B)

**Not before 2026-10-07T15:53Z** (`#1154`, Langston's 24 h rule after the 10-06 15:53Z paper reset). **Never 02:00-02:30Z** (the retention sweep runs at 02:15Z).
**Sha:** `0c8ef5da2582e03effd21070fb09b9ad5715ed77` — CI run `37566679783` success on that exact head. Staging is at `3576d39810fa7428501b68ce341ee46533c24935` (deploy B, 2026-10-06T15:45:04Z).
⛔ **Why this sha and not the branch head:** every commit from `b523c86bf` on carries batches still at Step 4 (2a0c cluster-bus, 3a feed-health, 3a1 venue-quiet, 2a0d duplicate scanner). The branch is linear, so the deploy stops one commit before them.

## What rides (runtime commits in `3576d3981..0c8ef5da2`)
| batch | owner | Step-4 approval | Step 7 after deploy |
|---|---|---|---|
| `B-ATR-BAD-PRINT` (row 2a, `#1153`) — `ef4c7c8be`…`66530fc48` | CC-B | Langston, at `66530fc48` | `PATTERN_ATR_DROPS` non-zero, `[PATTERN_EVAL_ERRORS]` 0 on the pool line; resolve `a24e39ed` citing the deployed sha (the drift job's own clear) |
| `B-ENGINE-STOP-DURATION-COLUMN` (row 2a0, `#1067`) — `77ee8cf2b`, `a0bddfea6`, `6546aa9af` | CC-B | Langston, at `6546aa9af` | `run_for_ms`/`ends_at` columns gone; an engine stop completes and clears the flag |
| `B-LIVE-BANNER-ACTIVE-HOTFIX` (row 2a0h, `#1160`) — `e2b5a84a4` | CC-B | Langston (hotfix gate), at `e2b5a84a4` | Claude-in-Chrome: the Live Trading banner reads STOPPED while paper runs; the Paper banner reads ACTIVE |
| `B-ENGINE-HEARTBEAT-DEAD-PATHS` (row 2a0b, `#1158`→`#521`) — `4a17ca8f4`, `cb246ba12`, `635e7132d` | CC-B | Langston r3, at `635e7132d` | ⛔ **HARD GATE:** the next 02:15Z sweep log shows the `cluster_bus_event` line AND every other registered table's line, zero `missing … data_lifecycle` lines — any miss ⇒ revert the registration the same day; zero heartbeat rows after deploy |
| `B-VTS-TELEMETRY-AGGREGATES` (row 4a) — `d4c688b88`, `03fc60c11`, `c8a35d6d9` | CC-C | Langston 01:05Z, at `c8a35d6d9` | CC-C |
| `B-SIZING-DEC-RESTORE` inc3 r9 — `cfc1d9c67`, `9c162aabc` | CC-C | Langston 01:08Z, at `cfc1d9c67` (`9c162aabc` comment-only) | CC-C |
| `B-EXPECTANCY-TUNING-ROWS-RETIRE` (row 4a2, `#1156`) — `2fee017cc` | CC-C | Langston 03:48Z, at `2fee017cc` (its condition `ff5a21d39` lands later: a test assertion + a migration header comment, SQL byte-identical — `db:migrate` keys `_migrations` by name and never compares a checksum) | CC-C; Langston's Step 8 reads count 0 / `roi_gating` 10 / clean boot |
*(Confirmed by ANALYST Claude 2026-10-07 ~05:35Z for the three CC-C rows.)*

## Migrations that apply (MANIFEST diff `3576d3981..0c8ef5da2`), in order
1. `2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql`
2. `2026-10-06-b-engine-stop-drop-time-limit-columns.sql`
3. `2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql`
4. `2026-10-07-b-expectancy-tuning-rows-retire.sql`

## Rollback order (direction-dependent — never by symmetry)
- `B-EXPECTANCY-TUNING-ROWS-RETIRE`: to roll the code back past `d4c688b88`, run `2026-10-07-b-expectancy-tuning-rows-retire-rollback.sql` FIRST, then deploy the older sha (older code prefetches `expectancy_tuning` and refuses boot on 0 rows) — ANALYST Claude.
- `B-ENGINE-HEARTBEAT-DEAD-PATHS`: revert the sweep registration (code) FIRST or together with its rollback SQL (with the entry present and the seed gone, the sweep aborts) — its rollback header.
- The other two follow their own rollback headers.

## Procedure
1. Before: `git merge-base --is-ancestor` each batch's last sha above vs `0c8ef5da2` (exit 0 each); the staging worktree trap — copy the live phase9 file (`#686`) and `reports/` to `/home/deploy/preserved-<ts>` with `SHA256SUMS`, `git stash push -u`, deploy, `git stash pop`, `sha256sum -c`.
2. `dt-deploy 0c8ef5da2582e03effd21070fb09b9ad5715ed77 --by cc-b`.
3. Engine resume check; the boot warm-up lines; the 4 migrations in `_migrations`.
4. Each owner's Step 7 above. Drift rungs `a24e39ed` / `8a33a05c` clear through the drift job's own exit — read their state after, do not resolve by hand unless the job does not.

## Record (filled at deploy)
- **deployed at:** 2026-10-07T15:56:00Z, `dt-deploy 0c8ef5da2582e03effd21070fb09b9ad5715ed77 --by cc-b` → *"OK — live, engine resumed, identity asserted"*; check-failure window 10 s; pm2 restart 630.
- **ancestry exit codes:** `66530fc48` `6546aa9af` `e2b5a84a4` `635e7132d` `c8a35d6d9` `9c162aabc` `cfc1d9c67` `2fee017cc` → **0** each (in); `b523c86bf` (2a0c), `3a549e3a9` (3a) → **1** (correctly out).
- **migrations applied:** all four, `_migrations` 15:55:49.79Z → .97Z, in the planned order.
- **worktree preserved / restored:** `/home/deploy/preserved-20261007T155529Z` (6 files + `SHA256SUMS`); stashed `ccb-predeploy-20261007T155529Z`; popped after; `sha256sum -c` **6/6 OK**.
- ⚠️ **CORRECTION to the table above, row 2a:** *"`PATTERN_ATR_DROPS` non-zero"* was my wording, not the batch's — the counter counts pattern candidates DROPPED for having no valid ATR (the old 2 %-of-price stand-in), so 0 is the healthy reading. The change list's Step 7 (`:175`) asks that the pool line SHOW the counter.

## Step 7 results (CC-B, 2026-10-07 ~16:00Z)
| batch | result |
|---|---|
| 2a `B-ATR-BAD-PRINT` | **PASS** — the counter is on 6 of 6 pattern-pool lines since the restart and on 0 of the 46 in the 26 min before (the code is live); `PATTERN_ATR_DROPS` 0 and `PATTERN_EVAL_ERRORS` 0 on every line; no `invalid_atr` lines. **Still to read:** `atr_at_open` on the first new opens against Kraken's bars. Drift rungs `a24e39ed`/`8a33a05c`: read their state after the drift job's next run. |
| 2a0 `B-ENGINE-STOP-DURATION-COLUMN` | **columns gone** (`run_for_ms`, `ends_at` absent; control `mode`, `started_at` present); the engine resumed through `dt-deploy`. ⏸ **The "an engine stop completes" leg is NOT RUN:** a stop FLATTENS the paper book: `/active-engine/stop` → `stopActiveEngine` (`active-engine-service.ts:943`) → `forceCloseAllOpenPositionsOnStop` (`:1012`; the flatten LOOP lives in `active-portfolio-manager`) → `_flattenOne` → `forceClosePosition` (`aee:1422`, closeType required). *(Corrected: this cell pinned `aee:1436-1443`, which is the close-condition branch inside `forceClosePosition`, not the flatten — Langston.)* **RULED (Langston, 2026-10-07 ~22:40Z): option A — the pre-sprint reset's own stop IS the exercise; no test stop now** (a test stop spends the population the real exercise measures, and books those closes as `manual_stop` instead of `reset`). **Pre-registered procedure for that first act:** (1) `POST /active-engine/stop` with `{reason:'reset'}` — never absent (absent silently means `manual_stop`); (2) `flatten` is `null` on the idempotent already-stopped path — null means NO flatten ran: REFUSE on null, never read `.closed` through it or default it to 0; (3) read N from `GET /active-engine/flatten-precheck` AT THE INSTANT before the call (not carried from an earlier count); PASS = `closed === N` ∧ `leftOpen === 0` ∧ `failed === 0` ∧ N `closed_trades` rows with `close_reason='reset'` — read off the response body, the session row and those rows, never off the 200; (4) the dropped columns: state it as no residual writer and no payload property for `run_for_ms`/`ends_at`, with a census of every `active_engine_sessions` writer (the start path is exercised by the dt-deploy resume; the others' silence proves nothing); (5) a throw is a §9.4 disposition in the same turn, not a report. |
| 2a0h `B-LIVE-BANNER-ACTIVE-HOTFIX` | **PASS** — Claude-in-Chrome, Kyle's session, 15:58Z: Live Trading banner **STOPPED** while paper runs; Paper Trading banner **ACTIVE**; the main Dashboard banner now reads Paper Trading Mode (it read Live Trading Mode — ACTIVE at 07:34Z). |
| 2a0b `B-ENGINE-HEARTBEAT-DEAD-PATHS` | **writer gone:** `cluster_bus_event` rows since the restart **0** (control: `task_completed` 271,009 rows, the last 15:55:35Z — 25 s before the restart). ⛔ **HARD GATE still to read:** the 10-08 02:15Z retention sweep's line for every registered table, zero `missing … data_lifecycle`. |
| CC-C rows 4a, inc3 r9, 4a2 | CC-C's Step 7. |

## Step 7 results — CC-C rows (2026-10-07 16:02-16:20Z, deployed `0c8ef5da2` at 15:56:00Z; new process warm-up 15:55:51Z)
| row | reading | result |
|---|---|---|
| 4a2 `B-EXPECTANCY-TUNING-ROWS-RETIRE` | `module_constants` grouped: `expectancy_tuning` **absent (0 rows)**; control `roi_gating` **10**. Boot: 69 `[B72][warmup]` lines after 15:55 today (`out.log` + `error.log`), **0 name `expectancy_tuning`, 0 refusal/fail lines** (positive control: the same filter lists `roi_gating rows=10`). Migration ran in-chain (`migrate_ran_at=2026-10-07T15:55:49Z`). | **PASS** |
| inc3 r9 (`#698` am. 5, the full-book log) | `[698][paper] BOOK_FULL 20/20 open — promotion paused until a slot frees` at **15:57:24Z** (first loop pass after the restart, book at 20/20 slots); `BOOK_FULL still full 20/20 for 10 min — loop alive` at **16:07:24Z**. The `BOOK_SLOT_FREE` arm is not yet exercised (no close since). | **PASS** (entry + reminder); leave arm pending the next close |
| 4a `B-VTS-TELEMETRY-AGGREGATES` | P2(i) deployment proof (cannot fail once shipped, stated as such): the new process's boot aggregation wrote `regime_performance_2026-10-07_VTS_2241.json` at **15:55:57Z** — 22 cells, **0 stale** by the A2 scan; positive control `regime_performance_2026-10-02_VTS_2061.json` → **6 stale** (C3's n = 6). P2(ii) the named set: of the 6 cells stale on 10-02, **4 are absent** now (no trade in the 7-day window → neutral 0.5: TREND_FRIENDLY_STABLE/reverse_impulse, IMPULSE_EXPANSION/dhma, RANGE_BOUND_STABLE/support_bounce, STRUCTURAL_TRANSITION/defensive_hedge) and **2 are present and fresh** (IMPULSE_EXPANSION/morning_star 1.0, inside_bar_reversal 0.5, `updatedAt` 15:55:57Z — they have trades in the window). The aggregation runs every 6 h (`autonomy-scheduler.ts:573-578`), so the next live replacement is ~21:56Z. ⚠️ Honest limit: the old code ALSO rebuilt the store at boot, so a boot snapshot cannot distinguish old from new eviction; the discriminating read is the ~21:56Z run (a cell present at 15:55 with no trade since must be ABSENT then). | **PASS (deployment proof)**; the eviction itself reads at ~21:56Z |

## Step 8 — Langston on the CC-C rows (2026-10-07 22:52Z), each re-derived by him
- **4a2 CONFIRMED, PASS.** His control is stronger: 99 modules / 1,022 rows, and `ILIKE '%expectancy%'` still finds `expectancy_kernel` + `expectancy_gates`. ⚠️ The 69 warm-up lines have ROTATED out of `out.log` into `out__2026-10-07_17-19-54.log` (rotation 19:53:58Z); a later grep of `out.log` + `error.log` reads 0/0 — a rotation false-zero, not a refutation.
- **inc3 r9 CONFIRMED; all three arms exercised.** `BOOK_SLOT_FREE 1 slot(s) free after 259 min full` at 20:15:55Z and `after 96 min full` at 21:52:25Z; promotion resumed both times (REGN/USD + MRNA/USD 20:16:26-27, DELL/USD 21:54:56) and `BOOK_FULL` re-armed. The "leave arm pending" note above is DISCHARGED.
- **4a CONFIRMED AS DEPLOYMENT PROOF ONLY.** MISTAKE: wrong-object [B-VTS-TELEMETRY-AGGREGATES] — my Step-7 discriminating criterion ("a cell present at 15:55 with no trade since must be ABSENT at ~21:56Z") tested the inter-run gap, not the 7-day window eviction is defined on. His read of `…_VTS_2336.json` (21:55:57Z): 22 → 22 cells, 0 evictions, 9 cells byte-identical, no `tradeCount` decrease — correct behaviour, because none of those cells' trades aged out of the window. Also: the stale scan needs a stated TOLERANCE (2241's stamps span 0.001 s; an exact-max test reads a false 16). **Re-registered criterion (§9.4 disposition 1, this record): the eviction arm is exercised by the first snapshot in which a cell present in `_VTS_2336` goes ABSENT, or any cell's `tradeCount` DECREASES; until then 4a may not be written up as eviction evidence.** Eviction is reachable (TREND_FRIENDLY_STABLE/reverse_impulse, tc 2, present 10-02, absent 10-07).
