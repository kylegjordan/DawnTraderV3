# B-DISK-FILE-TIERING — Step 4 change list (code review at the graded ref)

**i. DECLARED CHANGE-CLASS:** `architecture` (scope header, `B_DISK_FILE_TIERING_SCOPE.md` r5).
**ii. THE CLASS'S DOC SET (`config.mjs:137`), row by row:**
| doc | state |
|---|---|
| scope | present — `Claude Comms and Packages/Scope Files/B_DISK_FILE_TIERING_SCOPE.md` (r5, approved) |
| pre_audit | present — `Claude Comms and Packages/Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md` (r5, approved at `6211d28ff` + conditions folded at `81f561a4f`) |
| completion_report | absent — Step 11 |
| batch_catalog | absent — Step 10 |
| phase_history | absent — Step 10 |
| system_manual | absent — Step 10 (REQUIRED: the Drift Dashboard chapter, Layer 1 + Layer 2, per pre-audit P11) |
| sim | absent — Step 10 (the job, data-aggregator, pm2 rotation, the trace's removal, the manifest's `disk_file.*` family, the watchdog's disk checks + clear edge) |
Plus, not in the class matrix but owed: STORAGE_POLICY (incl. the `:100`/`:191` corrections), DELETED_COMPONENTS_LOG (**present**, landed with 1c), CHANGES_AND_FIXES, RUNNING_ISSUES, the task-list row.
**iii. STEP 2:** `Claude Comms and Packages/Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md` at `81f561a4f`.

**Not in this review:** P9 (rotation and compression through the system logrotate) is gated by F9 to after 2026-11-18 02:00Z and to ANALYST Claude's readers; it gets its own Step-4 diff. P10 (the first real cold payload) is a measurement at Step 7.

## The commits (each on `migration/aws-supabase`)
| increment | sha | plan items | files |
|---|---|---|---|
| 1a | `8f59fce0d` | P1, P2, P3, P4, P7 (archival-health) | `drizzle/migrations/2026-11-04-b-disk-file-tiering.sql` + `-rollback.sql`, `MANIFEST.txt`, `server/services/data-archive/disk-file-tiering.ts` (new), `server/scripts/b-disk-file-tiering.ts` (new), `server/scripts/b-storage-archival-health.ts`, `server/tests/unit/b-disk-file-tiering.test.ts` (new) |
| 1b | `fefd41e51`, revised through Step 4 part 2 r2-r4 (graded head `3be1433ce`; Langston PROCEED on part 2 at that ref) | P7 (watchdog disk checks, clear edge, honest dedupe log, category) | `server/scripts/staging-liveness-watchdog.mjs`, `scripts/system-alerts.ts` (`resolve-key`), `server/services/system-alerts.ts` (actor), `server/tests/unit/b-staging-liveness-watch.test.ts` |
| 1c | `a846b0d08` | P5 writer removal | `server/services/context-bridge.ts`, `DELETED_COMPONENTS_LOG.md`, `_archive/deleted-code/context-bridge.phase-41F-L-trace-writer.20261104-B-DISK-FILE-TIERING.ts.removed` |
| 1d | `065863526` | P8 | `server/scripts/b75-rehydrate.ts` |
| 1e | `8495b8768` | P6 | `server/services/data-archive/moved-day-check.ts` (new), `server/services/drift-dashboard-aggregator.ts`, `server/services/system-alerts.ts` (actor), `server/tests/unit/b-disk-file-tiering-moved-day.test.ts` (new) |

## Judgement calls I want attacked
1. **The round-trip proof (1a, `moveOne`).** The original is deleted only after: the download's sha256 equals the local `.gz`'s AND the upload's; the inflated download's sha256, newline count and byte count equal the original's; then evidence row → manifest stamp in one transaction. The manifest row is inserted directly as `verified` (not `pending → uploaded → verified` as the sweep does), and moves to `active` after the delete — so the rotator (which selects `active`) can only ever see a row whose local file is gone. Is skipping `pending`/`uploaded` sound for a single-file object, given the insert happens only after the verified download?
2. **Resume (1a).** If the run dies between the commit and the delete, the next run finds the `verified` row and reproduces the gzip (level 6, Node's header carries no name or time) to compare with the stored object checksum before deleting. A zlib change between runs would refuse, not delete. Acceptable?
3. **`row_count` = newline count, `cursor_contract 'disk-file-lines-v1'`** — the evidence row's three counts are all the newline count (source = exported = the original's; downloaded = the inflated download's). The stronger proof (byte-identical sha256) is checked by the job but is not stored except as the object checksum. Enough?
4. **The moved-day key is per WINDOW** (`…:phase15b_dbs_telemetry:<window>`), not per folder or folder+day as your r1 P5 offered — so a clean `rolling_30d` check cannot resolve a `cohort_latest` alert and flap. And the in-app check resolves its own row under a new machine actor `drift-dashboard-moved-day`, transport `engine`.
5. **The watchdog's disk thresholds are environment-overridable** (only for the forced arming run, C1). Its CHECK entries for disk carry their own `dedupeKey`, `category`, `severity`, a dynamic body and a `reading`.
6. **Windows test note:** `b-staging-liveness-watch.test.ts` fails to LOAD on Windows with or without this change (control on the unchanged code: SyntaxError at the `.mjs` import, the shebang); the new tests passed against a shebang-free copy (14 tests in the file at part 2 r4: 5 original, 9 added by this batch). CI on Linux is the graded run.

## Part 1 round 2 (Langston CHANGES on 1a; the data path approved as written) — increment 1a-r2
1. **The lock** moved out of `/tmp` to deploy's home (`~/.b-disk-file-tiering.lock`, env-overridable), and a lock that cannot be reclaimed now THROWS instead of looping into a permanent quiet skip.
2. **A skipped or crashed run reads as a failure:** the lock-held path logs `DONE moved=0 failed=1 lock_held=1`, and any fatal error logs `DONE moved=0 failed=1 fatal=1`, so archival-health's latest-DONE read can never find an older green line instead. The general tail-60 narrowing in archival-health is homed on `#744` (B-GATE-GUARD), owner CC-A, beside the unbuilt checker legs (Langston's home, recorded at Step 10).
3. **OBLIGATIONS BEFORE CLOSE (tracked here and in the completion report, not only in a code comment):**
   - **O1 — flip archival-health's `disk-file-tiering` entry from `onMissing: 'skip'` to `'alert'`.** Trigger: the first `DONE moved=N failed=0` line in `/var/log/dawntrader/disk-file-tiering.log` on staging. Done as a Step 9 increment, reviewed, deployed.
   - **O2 — install the root crontab line** (`45 2 * * *`, the header of `server/scripts/b-disk-file-tiering.ts`) at Step 6; without it nothing runs and, until O1, nothing pages.
   - **O3 — the forced arming run of the watchdog's disk checks** (Langston C1) at Step 7, with the `df /` reading quoted. Forced rows share the REAL dedupe keys, so a genuine crossing inside a forced window dedupes into the `[FORCED TEST]` row until the next unforced tick clears it; keep the forced window to the minimum two ticks and read every disk row in that window by its metadata, not its title (Langston part 2 r2, record 4).
   - **O5 — exercise both new DONE lines at Step 7 (Langston part 1 ruling (c)), expected output stated first:** pre-create the lock file, run the job, expect exactly `DONE moved=0 failed=1 lock_held=1`, then read back an ACTIVE `archival-health-disk-file-tiering-failed` row after archival-health runs; neither line has ever been emitted, so no log silence is evidence that a skip pages. (Note for reading run one: `/` is under the 15 GiB backlog line, so the first run stops with `stopped_by=run-cap` after about 2 GiB of originals — by design, and still a valid O1 trigger.)
   - **O6 — the moved-day alert path is fence-verified by tests only (Langston part 3):** `runCheck`'s mint, body and self-resolve are driven by the three mocked tests added at part 3 r2; on staging it cannot fire for about 35 days of uptime, so no Step-7 silence may be cited for it.
   - **O4 — warm-tier headroom (Langston §13, FOLDED as a Step 7 measurement, not a new batch):** before the first run and after it, read what the `dt-archive` bucket holds and whether Supabase Storage meters against the plan cap that alert `c0a0b00d` reports (130.3 GB of 200 GB); the first run moves at most 2 GiB, so the meter's movement is visible.
**Record items taken:** the resume path now re-downloads the object and checks its checksum before deleting the original; a `verified` row whose file is already gone (died between delete and `markActive`) is finished at the start of the next run; leftover `.tiering*.gz` temps are swept at the start of every run; the upload's echoed checksum is no longer compared — the gate is stated as TWO independent legs (download sha256 = local .gz; inflated download = original).

**Part 1: PROCEED (Langston, at `955e671c1`).** Record items (a) the `--trace` line now runs as deploy and (b) the resume refusal names both causes — folded with part 2's commit.

**Part 3: Langston ruled at `20dbf37cc` — 1c APPROVED; CHANGES 1-3 do not block the staging deploy. CHANGE 1 (the sidecar) and the test count were already folded at part 3 r2 (`03d28c4bd`); CHANGE 3 (the alert body names a scratch folder and says the window's numbers will not change) at part 3 r3. Step-10 items: `RUNNING_ISSUES.md:11409` (the trace is no longer appended once deployed) and the deletion log's deferred sha.**

## Numbers
- tsc 329 = baseline at every increment.
- Unit: `b-disk-file-tiering.test.ts` 12/12 (boundary test proved by flipping `>` to `>=`: 1/12 fails); `b-disk-file-tiering-moved-day.test.ts` 8/8 at part 3 r2 (the 1e commit said 5; it had 4 — Langston part 3 CHANGE 2); watchdog 14/14 at part 2 r4 (shebang-free copy); actor-allowlist, deploy-actor-parity, venue-quiet store, breaker suites green.

## Step 6-7 record (2026-11-04)
- **Deploys:** 1a-1e r1 went live with ANALYST Claude's deploy of `20dbf37cc` at 19:35Z (migration applied 19:35:52Z: `format_chk` carries `file.gz`, the four `disk_file_*` constants present). The Phase 41F-L trace stopped growing at 19:35. **CC-A deployed `e985810766f74980aa2e22971985403bd205184e` at 20:47:07Z** (dt-deploy OK, engine resumed; runtime range from `20dbf37cc` = only this batch's commits) — carrying the dotenv fix `ad3948ff8`, CHANGE 4 `33a3c5173`, and part-3 r2/r3. Stopped before `3d0b8166f` (ANALYST's R5d, sent back by Langston). NOT yet deployed: `423d84208` (CHANGE 4's one-lstat condition; the hand-run restore tool) and `d45f5e707` (the boot-contract test).
- **Step 7 finding:** the job did not load `.env` (O5's first run, as cron runs it, exited at once); cron line paused, fixed in `ad3948ff8`, Langston PROCEED, deployed.
- **O2 DONE:** root crontab line `45 2 * * *` installed (backup `/root/crontab.pre-disk-file-tiering.20261104T195351Z`), paused during the fix, re-enabled 20:47Z.
- **O5 PASS (20:47:18Z):** lock pre-created, the job appended exactly `DONE moved=0 failed=1 lock_held=1` to `/var/log/dawntrader/disk-file-tiering.log`; `b-storage-archival-health.ts` then minted `archival-health-disk-file-tiering-failed` (`afd2ab68-e4d8-4256-8501-9ff6d0fbb14a`); resolved by cc-a as the test row so it cannot block a real failure.
- **O3 PASS (20:47:51-53Z), `df /` 84 % (60G of 75G, 12G free):** `WATCHDOG_DISK_WARN_PCT=1` with a private state file — tick 1 `FAIL (streak 1/2)`, tick 2 `FAIL (streak 2/2)` + minted `9c9061de-ad31-47de-bceb-fdc3ad94d760` titled `[FORCED TEST] …`, `metadata.forced=true`; tick 3 with `WARN_PCT=99` `recovered` + `resolved` — `resolved_by_claimed=staging-liveness-watchdog`, transport `cli`.
- **O4 baseline (before the first run):** warm bucket `dt-archive` 745 objects, 49,500,110,851 B; database 144,939,494,547 B (135 GB; alert `c0a0b00d` reads 65.2 % of the 200 GB plan cap). The after-reading follows the first run.
- **UI:** no page renders this batch; its only surface is the alert queue, read above.
- **Still owed:** O1 (flip `onMissing` after the first `DONE … failed=0`), O4 after-reading, O6 (fence-only), the folded debug-log trim (`#1240`, Kyle D-2) as a scope amendment, P9 (after 2026-11-18), P10.

- **2026-11-04 ~21:30Z, Langston PROCEED on `423d84208` (twice: the redeploy ruling at `17b47d32f`, and the gate at the sha), with folds landed:** CHANGE 1 (the boot-contract catch-all also matches an import of the app pool; 6 of 8 to 8 of 8) and CHANGE 2 (`replay-ablation.ts` added) in `c13ee2d4d`; and two comment items in the next commit. **Limit of the `--out` guard, stated:** it checks `--out` ITSELF. `mkdirSync` creates through a symlinked PARENT, so a link one level up still redirects the restore (the leaf stays 0700, so the bytes stay private); ownership (uid) is not compared. **UNEXERCISED by any test** (the test file does not cover the four arms): one manual run against a symlinked `--out` on staging before close discharges it. The same shared-`/tmp` class in `b70-b62-relabel-runner.ts:13` is homed by Langston on `B-SHARED-TMP-ISOLATION` (`#979`, plan row 2.6).
- **`--out` guard EXERCISED on staging, 2026-11-04 ~21:40Z, at the deployed `8ff2a691e` (ANALYST deployed it 21:20:15Z; it carries `423d84208`), as `deploy`, in a private `mktemp -d` folder removed in the same command:** a symlink, a dangling symlink, a regular file and a mode-755 folder each exit 1 with their own refusal line; a new path is created mode `700` and the run continues to the manifest read (exit 0, no rows for a 2030 date). All four arms plus the create arm now have a run behind them, not only an inspection.

## Increment 4 — OBJ-10: the per-tick price-feed debug lines (`#1240`, Kyle KD-2; scope r7, Langston PROCEED with four conditions, folded)
- **Removed:** `[I7-WS-RAW]` (`server/exchanges/kraken/kraken-websocket-adapter.ts:811`); `[I7-WS-D][BROADCAST_THROTTLED]`, `[I7-WS-D][CACHE_WRITE]`, `[8.8.3-I5][CACHE_UPDATE]`, `[I7-WS-A][CACHE_UPDATE]` (`server/services/live-pricing-adapter.ts:1093`, `:1253`, `:1264`, `:1267`); the `[34.A][BROADCAST]` payload line and its `payloadStr` (`server/services/context-bridge.ts:171-172`). One comment at each site names the removal. Nothing else in those functions changes: `rawStr` is still parsed; the throttle still returns.
- **Deleted with the cut (Langston C3):** `scripts/analysis/b_price_age_truth_reserve_age_split.{py,sh}`, `scripts/analysis/b_price_side_obj7_step7_reads.sh`; archived as `.removed` under `1-system-manual/_archive/deleted-code/`; `DELETED_COMPONENTS_LOG.md` entry.
- **Census after the edit:** `git grep` finds no emitter of any of the six pairs in `server/`; it finds `[I7-WS-D][BROADCAST_SEND]` (`live-pricing-adapter.ts:1107`), which stays (control). No test references any of the six. `tsc`: no errors in the three files.
- **Step 7 PASS (scope r7):** the first full rotated `out__` file after deploy, awk tally by tag PAIR, holds none of the six pairs and covers about 7.7 h per 1.07 GB file.
- **Langston Step 4 on increment 4: PROCEED** (at `cdc3e4c60`, files byte-identical at head). Non-repo readers: none in `/usr/local/bin`, `/etc/systemd/system`, `/etc/cron.d`, `/home/deploy/harvest`, `/opt` (his census as `deploy`, control: five live log-tag greppers found); I covered his named blind spot as root (`/root`, `/usr/local/bin`, `/etc/cron.d`, `/etc/systemd/system`, `.md` excluded): no reader of the six tags; control `VENUE_PAUSE|XS_FRAME` returns `/usr/local/bin/rawcap.cjs`. Step-10 record items: deletion-log sha filled; the Step-7 PASS is a log tally, never a source grep (the removal comments name the tags). ⚠️ In the completion report, keep the app-server disk (84%) and the DATABASE plan cap (`c0a0b00d`, 65.2% of 200 GB) apart.

- **Step 6-7 for increment 4 (OBJ-10):** deployed with `93cead7f2` at 23:13:58Z (CI `41931666034` 4/4; the OBJ-10-only sha `cdc3e4c60` had its CI cancelled three times by other pushes, so it rode the next approved build). **First read, `out.log` 23:14:30-23:14:44Z, 4,051 lines:** all six tag pairs 0; controls `[I7-WS-D][BROADCAST_SEND]` 112 and `[ContextBridge] Broadcasting` 159 (the kept count line). About 290 lines/s against about 800/s in the 18:02-20:56Z file. **The pre-registered PASS still owed:** the first full rotated `out__` file after deploy, awk tally by tag pair, none of the six, about 7.7 h per 1.07 GB.

## First nightly run — 2026-11-05 02:45-03:03Z (cron `45 2 * * *`, build `93cead7f2`)
- **DONE line** (`/var/log/dawntrader/disk-file-tiering.log`): `DONE moved=1709 failed=0 freed_bytes=2097381777 free_after=15256727552 stopped_by=run-cap hot_days=35`. It stopped at the 2 GiB run cap, as designed while free space is under the 15 GiB backlog threshold.
- **Manifest, measured:** 1,709 `disk_file.%` rows (vts_eval_history 62, data_aggregates 63, data_aggregates.hourly 1,490, phase15b_dbs_telemetry 47, consumer_sites 47), every one `tier=warm`, `state=active`, `completeness_basis=source-count-matched`, 0 without a checksum. Original bytes sum to 2,097,381,777, exactly `freed_bytes`. Compressed bytes added to warm: 252,231,501 (the O4 after-reading for the bucket; the DATABASE is unaffected by this batch's file moves).
- **Originals gone:** 5 random moved files absent from disk; control: `logs/vts_eval_history/2026-11-04.json` (inside the 35-day window) present, 5,207,214 B.
- **Restore proof:** `b75-rehydrate --table disk_file.vts_eval_history --disk-file --from 2026-04-10 --to 2026-04-10` into a private 0700 folder: `checksum=OK rows_proven=167962 rows_unproven=0 rows_checksum_mismatch=0`, restored 4,106,909 B. Folder removed in the same command.
- `df /` after: 81% (15.18 GB free), from 84% before the run.

## Increment 5 — O1: the job's never-ran page goes live
- `server/scripts/b-storage-archival-health.ts`: the `disk-file-tiering` check's `onMissing` flipped `skip` → `alert` now that the first good run is recorded (comment cites it). Scope of the change, stated: `onMissing` only governs a MISSING log file; stale (26 h — superseded: 20 h in r2 below) and failed runs already paged whenever the log exists. No logrotate entry touches this log.
- Test (+1, `b-disk-file-tiering.test.ts`): the check's block (control: it names `disk-file-tiering.log`) has `onMissing: 'alert'`. 23/23.

## Increment 5 r2 — O1 re-landed with Langston's two CHANGES (Discord `1567762650446823505`, ruled at `7d8832518`)
- **Re-land:** the code half of `7d8832518` was held out of the joint deploy at `10df95fb0` (unreviewed); it comes back here with the changes.
- **CHANGE-1 — grace 26 h → 20 h** for `disk-file-tiering`. A daily job checked once a day (~05:00Z) can only be caught after ONE missed night if the grace is under 24 h: with 26 h a missed night reads 25h56m at the next check and passes. 20 h: healthy ~2 h, one miss ~26 h.
- **CHANGE-2 — the test is a fence now:** the block is cut at its own close (`\n  },`), not at the array's `];`, with a control that the slice holds exactly one check. Mutations RUN: (A) this check back to `'skip'` + a later block appended with `'alert'` (Langston's case) — fails; (B) grace back to 26 h — fails. 25/25 otherwise.
- **Homed (Langston's record items), all on THIS batch, owner CC-A, after O1:**
  - **H-1** a lock-held no-op tick books `DONE moved=0 failed=1 lock_held=1`, which `donePattern` reads as a failure — benign today (a later good DONE wins the reverse scan; a daily cron cannot overlap itself), live the moment a second invocation path exists. Outcome (2): decide whether a lock-held tick books `failed`.
  - **H-2** no watchman for the watchman: `archival-health` is a root crontab job with no fire-evidence (0 `scheduled_tasks_audit` rows for it; control 91,104 rows over 9 in-app tasks), so tiering's only page sits behind a cron nothing checks.
  - **H-3** cadence-aware grace for every daily check in `archival-health` (the `cron-fire-evidence-verifier.ts:181` form, B-NEW-51) — `b75-retention` carries the same 26 h literal and catches one miss only by ~31 min today.
- **Recorded, no work:** the tiering log is unrotated by design, ~231 KB per capped run (~84 MB/yr); `onMissing: 'alert'` is safe because nothing rotates it — a future rotate entry needs `create`. Dedupe key `archival-health-disk-file-tiering-missing`: resolve, never ack.

## Increment 5 r3 — Langston PROCEED on r2 (`dc766f721`, Discord `1567785061938372619`) with one in-commit condition
- **Re-land:** the code half was reverted out of staging deploys twice (`10df95fb0`, `863604025`) while unreviewed; it comes back here exactly as reviewed at `dc766f721`, plus the condition.
- **Condition (his mutation C):** `disk-file-tiering` is the LAST element of `CHECKS`, so dropping its trailing comma made the slice bound return -1 and every assertion still passed. The control now asserts the bound exists (`src.indexOf('
  },', start) > start`). **Mutation C run:** comma dropped → the control fails; restored → 25/25.
- **H-3, sharpened:** `b75-retention` does catch one missed night, by ~31 min today; the margin is set by that sweep's own runtime, which nothing bounds, so it is one slow run away from H-3's live case.
- **#661 leg 3 (stated, not cited as proof):** the `missing` arm has never fired for ANY check in this watchdog — all 3 `archival-health-*` rows ever are `-failed` (2 `b75-retention`, 1 the O5 test row). `fire()` is proven by those; the `statSync` throw branch is not. Log silence is not evidence the never-ran page works.

## O1 Step 6 + Step 7 (2026-11-05)
- **Deploy:** `c0214c9736ee86d7523fd33319ad4c935a929b80` at 08:08:30Z (with B-DB-POOL-GUARD increment 2 r4), CI `41991032493` attempt 2, 4/4 per job (attempt 1 was cancelled by later pushes and not counted). Rollback `863604025`.
- **Deployed settings read on staging:** `disk-file-tiering` block `graceMs: 20 * HOUR_MS`, `onMissing: 'alert'`; cron `0 5 * * *` unchanged.
- **The `missing` arm, exercised for the first time (Langston #661 leg 3):** `disk-file-tiering.log` moved aside, `archival-health` run by hand → `ALERT disk-file-tiering/missing` and row `eefabc37-c594-41a6-a62e-bc2b054c2414` ("Archival cron MISSING: Disk-file tiering …"); log moved back, **byte-identical** (sha256 prefix `64997356f41cf032` before and after, mtime 03:03:49.863 unchanged); the test row resolved with that evidence. The other checks in the same run: daily-runway rows all OK.
- **No UI surface:** the watchdog's output is an alert row; the alert itself is the surface.
- **Still owed for close:** OBJ-10 rotated-file PASS, Step 8, H-1..H-3, P9/P10, governance.

## OBJ-10 Step 7 — the rotated-file PASS (scope r7 C2), read 2026-11-05 ~10:15Z
- **Object:** `/var/log/dawntrader/out__2026-11-05_08-01-39.log`, the first rotated app log written ENTIRELY after the OBJ-10 deploy (`93cead7f2`, 23:13:58Z): first line 2026-11-05 00:00:03Z, last 08:01:42Z; 1,073,956,664 B by `stat`, 1,072,223,294 characters / 9,270,942 lines by awk.
- **The six tag pairs: all 0** — `[I7-WS-RAW]` 0, `[8.8.3-I5][CACHE_UPDATE]` 0, `[I7-WS-D][CACHE_WRITE]` 0, `[I7-WS-A][CACHE_UPDATE]` 0, `[I7-WS-D][BROADCAST_THROTTLED]` 0, `[34.A][BROADCAST]` 0. **Controls in the same pass:** `[I7-WS-D][BROADCAST_SEND]` 568,936 and `[ContextBridge] Broadcasting` 773,687 (the kept lines), so the instrument can speak.
- **Coverage:** 8.03 h per 1.07 GB file, against 2.90 h before the cut (`out__2026-11-04_20-56-08.log`, 18:02:08→20:56:08Z) and the predicted ~7.7 h (2.9 h ÷ (1 − 0.6219)). **PASS.**
- Largest remaining tags in that file, for the record (no work implied): `[DIAG_PATTERN]` 78.1 MB, `[ContextBridge]` 71.3 MB, `[8.8.3-I6-FIX][Pricing-WS]` 68.7 MB, `[I7-WS-A][BROADCAST]` 62.9 MB, untagged 64.4 MB.


## OBJ-5 / P5 — the Phase 41F-L trace moved to WARM, 2026-11-05 10:15:57-10:17:37Z (CC-A)
- **Run:** `su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/time -v /usr/bin/npx tsx server/scripts/b-disk-file-tiering.ts --trace diagnostic-reports/phase-41F-L-trace.ndjson"` at the deployed `0abfd7102` (the script is unchanged since `93cead7f2`). Output to `/home/deploy/disk-file-tiering-trace-20261105.log`, **deliberately NOT the job log**: archival-health reads the latest `DONE` there, and a midday trace `DONE` would let a missed 02:45Z run pass the 20 h grace at the next 05:00Z check.
- **Result:** `moved disk_file.diagnostic_reports/phase-41F-L-trace.ndjson bytes=5375150604 gz=170761082 newlines=3758081` · `DONE moved=1 failed=0 freed_bytes=5375150604 free_after=23661752320` · exit 0. Ratio 31.5:1 (the scope's sample predicted 31.1:1, ~173 MB). The job's own verify ran before the delete: the downloaded object's checksum equals the local `.gz`, and its inflated sha256 and newline count equal the original's (`b-disk-file-tiering.ts` header, order of operations).
- **Resources (`/usr/bin/time -v`, the whole `npx tsx` process tree's largest member):** wall 1:41.69, max RSS 171,440 KB, CPU 76 %. `df /` 77 % → 70 % (18.29 GB → 23.66 GB free).
- **Manifest:** one row `43825287-ed13-44c9-a953-b4f72a4be96d`, `disk_file.diagnostic_reports` / `phase-41F-L-trace.ndjson`, `tier=warm`, `state=active`, `row_count=3758081` (= the file's newline count), `bytes_compressed=170761082`, checksum present, `supabase://dt-archive/warm/disk-files/disk_file.diagnostic_reports/phase-41F-L-trace.ndjson.gz`. The original is absent (`ls`: no such file).
- **Warm disk-file tier after it (all `disk_file.%`, `tier=warm`, `state=active`):** 1,710 rows, the trace the largest object (170,761,082 B; next largest 12,520,245 B, a `phase15b_dbs_telemetry` day) — so it is P10's object.
- **OBJ-5 verify column:** the line is gone (`a846b0d08`, deployed 2026-11-04 19:35Z); the file stopped growing at 19:35 (mtime 2026-11-04 19:35); the warm object verified by download and hash inside the job. An independent re-download is P10's first step (the rotator re-reads the warm object and checks it against the manifest checksum).

## P10 / OBJ-3 — the cold proof, PRE-REGISTERED before the run (2026-11-05 ~10:30Z, CC-A)
- **Method (the scope's own OBJ-3 verify column: "a back-dated row rotates and verifies"):** back-date manifest row `43825287-ed13-44c9-a953-b4f72a4be96d` (the trace, 170,761,082 B) `created_at` from **2026-11-05T10:17:35.826Z** (recorded here, the true archive time) to 2025-10-01T00:00:00Z, in one transaction that also checks exactly ONE `warm`/`active` row is then older than 365 days; then the real rotator, `b75-cold-rotator.ts --limit 1`, as deploy, under `/usr/bin/time -v`, output to its own log (not the monthly cron log), with `MemAvailable` sampled every second beside it. Then a restore FROM COLD with `b75-rehydrate --disk-file` into a private 0700 folder, removed in the same command.
- **PASS:** the rotator logs `rotated=1 failed=0`; a `cold`/`active` row with `verified_at` set and the warm row `migrated`; the restore reports `checksum=OK` and `rows_proven=3758081`. **Memory, the pre-registered line: UNSAFE if the rotator's max RSS exceeds 1 GiB OR `MemAvailable` falls under 512 MiB at any sample** — then the streaming cold upload becomes a named objective in this batch (OBJ-3).
- ⚠️ **FINDING before the run — OBJ-3's premise is wrong:** it calls the trace "the largest object the rotator will buffer". Measured (`data_archive_manifest`, `tier=warm`, `state=active`, 2,458 rows): **114 warm objects are larger than the trace; the largest is 535,409,768 B** (`crypto_spot_ticker_snap` 2026-06, created 2026-07-31), followed by four `xstock_spot_ticker_snap` days of 514-527 MB. They are B75 table partitions, not disk files, and reach the 365-day window from 2026-07-31 + 365 d. The trace run measures the rotator's memory at 171 MB; whether that licenses the 535 MB case, or the largest object must be proved itself, goes to Langston with the measured numbers (§9.4 disposition: folded into this batch's P10).

## P10 / OBJ-3 — the cold proof, RESULT (2026-11-05 10:21:59-10:22:11Z): UNSAFE by the pre-registered line, and the cold read-back blocked
- **Back-date:** row `43825287-…` `created_at` read exactly as `2026-11-05 10:17:35.82634+00` (a first attempt matching the millisecond form updated 0 rows and rolled back), set to 2025-10-01 in a transaction that confirmed exactly 1 eligible row; committed.
- **Rotator** (`b75-cold-rotator.ts --limit 1`, as deploy, `/usr/bin/time -v`, log `/home/deploy/p10-rotator-20261105.log`): `candidates=1` — the trace, `170761082` bytes. Warm download + checksum passed; the cold upload ran; **the cold read-back failed: `B2 download failed: 403 — download_cap_exceeded` ("download bandwidth or transaction (Class B) cap exceeded")**. `DONE candidates=1 rotated=0 failed=1`, exit 1, 11.9 s.
- **Memory: max RSS 1,110,300 KB (1.06 GiB) — OVER the pre-registered 1 GiB line (1,048,576 KB), for a 171 MB object, and the run stopped BEFORE its second whole-object buffer (the cold re-download), so the full-path peak is higher still.** `MemAvailable` (12 one-second samples, `/home/deploy/p10-memavail-20261105.log`): min 1,673,988 KB at 10:22:04, max 2,621,776 KB at the start — that arm (512 MiB) did not fire. **≈6.5× the object size (HYPOTHESIS for the mechanism: several whole-object copies along `downloadWarm` → `uploadCold`; not yet read at the lines).** At that ratio the largest warm object (535,409,768 B) would need ~3.4 GiB on a 3.8 GB box running the app.
- **Restored:** `created_at` set back to `2026-11-05 10:17:35.82634+00` in a transaction confirming 0 rows are now eligible; no cold manifest row exists for the trace; the warm row is untouched (`active`). **One orphan:** the uploaded-but-unverified cold object `dt-archive-cold/disk_file.diagnostic_reports/phase-41F-L-trace.ndjson.jsonl.gz` (no manifest row; cold is never deleted; a later rotation writes the same path).
- **Consequences, per the pre-registration:** (1) the **streaming cold path becomes a named objective in this batch** (OBJ-3: "if that peak is not safe beside the app, a streaming cold upload becomes a named objective in this batch, not a later one") — it must cover the read-back too, which buffers the whole object again; (2) ⛔ **the B2 download cap is a DECISION FOR KYLE** (an account spending setting): while it is exhausted, NOTHING can be read back from cold — not the rotator's verify, not a `b75-rehydrate` restore. What used the allowance today is not visible from the server logs (no other download-cap error in `/var/log/dawntrader/*.log`; the only cold readers in code are the liveness check, the rotator, `b75-rehydrate` and `context-bridge-log-ttl.ts:241`).

## Increment 6 — amendment 1 AP-1/AP-2/AP-3 (H-1, H-3, H-2), Langston's CHANGES on the amendment folded (Discord `1567866671425658892`)
| dispatch header | |
|---|---|
| (i) class | `architecture` (scope header) |
| (ii) doc set | scope present; pre-audit present (amendment 1 + r2); change list — this file; System Manual / SIM / STORAGE_POLICY / BATCH_CATALOG / PHASE_HISTORY / CHANGES_AND_FIXES / RUNNING_ISSUES / task list — owed at Step 10 (SIM gains the watchdog's new check and `archival-cadence.ts`; `:2405` corrected with OBJ-3b) |
| (iii) Step 2 | `Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md`, AMENDMENT 1 (ruled CHANGES; C-1..C-3 folded here, as Langston directed: "fold into the AP-1/AP-2/AP-3 diff and re-dispatch") |
- **AP-1 / H-1 (C-3):** no behaviour change; the EXISTING comment at the held-lock DONE (`b-disk-file-tiering.ts`, before `lock_held=1`) gains the 12 h self-break clause — no second copy.
- **AP-2 / H-3 (C-2, (b), (c)):** new `server/services/archival-cadence.ts` — `cadenceVerdict(schedule, mtime, now)`: ok when the log was written at/after `computePrevFire(schedule, UTC, now − 15 min)`, stale when before, **`misconfigured` when the schedule does not parse (never ok, never a throw)**. `b-storage-archival-health.ts`: every `graceMs` replaced by `schedule` (`15 2 * * *`, `0 3 1 * *`, `0 4 * * 1`, `45 2 * * *`), the stranded 20 h grace justification swept with it; new fire reasons `misconfigured` and `errored`; each check in `main()` wrapped so one throw cannot end the run. The settle is stated INERT today in the module header, with the condition that makes it load-bearing; the fence's reach (a typo only; the one silent direction — a code schedule looser than the box's) stated at `CheckSpec.schedule`.
- **AP-3 / H-2 (C-1):** `staging-liveness-watchdog.mjs` gains `archival-health-ran` (key `archival-health-not-run`, `health_check`/warning, 2-tick debounce, clears via the existing `resolveKey`). It reads the log's CONTENT: the LAST `started at <ISO>` must be at/after the due 05:00Z (at now − 30 min) and a `DONE — all_ok=` must follow it — so a start-only line, a `fatal:`, a hang and a logrotate `create` all page. A missing log returns `false` (pages), never `null` (skip). Plain arithmetic for the daily fire — the watchdog imports nothing from the app or its packages by design. Log path overridable (`WATCHDOG_ARCHIVAL_HEALTH_LOG`) for the Step-7 controlled test.
- **Tests:** new `server/tests/unit/b-disk-file-tiering-amendment1.test.ts` (16): cadence cases (a missed daily night caught at the next 05:00Z; a missed monthly caught on the 1st; the settle; an unparseable schedule → misconfigured); the source fences (no `graceMs`; each schedule equals its subject script's header Cron line; `misconfigured`/`errored` go through `fire()`); the watchdog's content read (started+finished ok; yesterday only; started then `fatal:` with an older DONE above; empty; before 05:30Z; its 05:00 equals archival-health's header; missing → false). `b-disk-file-tiering.test.ts`'s grace assertion replaced by the schedule. **Mutations run, each failing exactly one test, each restored:** (1) the watchdog accepts an old start; (2) it accepts a start with no DONE; (3) a null fire reads as ok; (4) the rotator's schedule drifts from its header (monthly → daily). 3 files 55/55; `tsc` baseline 329 = 329.
- **Record (Langston):** the crash path AP-3 guards is UNEXERCISED in production — 0 `fatal` lines in 121 runs (control: `DONE — all_ok=` 121) — so no live silence may be cited for it; Step 7 exercises it with a planted log. Langston's AP-4 cite corrections noted (`:684` body, `:674` the 5 GB comment, `uploadCold` `:647-695`). ⚠️ A `.mjs` with a shebang checked out with CRLF fails to load under vitest ("Invalid or unexpected token"); the blob is LF and production runs it with node — the working copy was normalized to LF for the test run.
- 🟥 **For Kyle (Langston (c), surfaced, not placed):** a root cron line that snapshots `crontab -l` to a world-readable file would let both deploy-run watchers check their schedules against the box daily; needs root.

## Increment 6 — Step 4: Langston PROCEED on `e43cae96e` with one in-commit condition (Discord `1567895376227205141`)
- **Condition folded:** the two marker strings are now a fenced cross-file contract — the test asserts the producer source writes `[archival-health] started at ${…}` and `[archival-health] DONE — all_ok=${…}` and the watcher source holds the matching patterns. **Mutations run:** producer reworded (`DONE:`) → the fence fails; watcher pattern reworded (`begun at`) → 3 tests fail; both restored → 17/17.
- **Attacks answered:** `started at` is the first write in `main()` — sound; `errored` keeps its own key (different condition, different fix; sharing lets one resolve discharge both, #982).
- **FINDING → AMENDMENT 2 (this batch):** the stale-DONE shape one function below, in `runCheck` — see the pre-audit.

## Amendment 2 — AP-7 implementation (Step 3; Langston PROCEED on plan r4, Discord `1570880172901671046`, one binding Step-4 condition)
| dispatch header | |
|---|---|
| (i) class | `architecture` (scope header) |
| (ii) doc set | scope present; pre-audit present (amendment 2 r1-r4); change list — this file; System Manual / SIM / STORAGE_POLICY / BATCH_CATALOG / PHASE_HISTORY / CHANGES_AND_FIXES / RUNNING_ISSUES / task list — owed at Step 10 (SIM: the archival watchdog's new reasons and its crontab read) |
| (iii) Step 2 | `Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md`, "Amendment 2 — Step 2 audit and plan r1" through "plan r4" |
- **NEW `server/services/archival-run-check.ts`** (pure): `evaluateRun` — the last start (live, then `.1`) must be at/after `dueMs` (tolerance 0), a DONE after it (same file after the start, then live), failures from that DONE; `tailText` (one-pass bounded tail, partial first line dropped); `selectCrontabLine` (comments skipped, the active line appending to the exact log file; one / none / many); `normaliseSchedule`; `unverifiedStreak` (runs split on archival-health's own start line, the current run excluded, `.1` read too — C-r4-1, the live-then-`.1` arm).
- **`b-storage-archival-health.ts`:** `CheckSpec.startPattern` (ISO in group 1) on the three subjects; `runCheck` grades on `effectiveSchedule` (the crontab's expression when it disagrees — `schedule_drift`; no active line — `not_scheduled`; several, or the box's unparseable — `schedule_drift`, graded on the repo's), then cadence, then `evaluateRun` over the last 32 MiB of `<log>` and `<log>.1` — `not_started` / `incomplete` / `failed`, each quoting the log's last line. `main()` reads the crontab once (`sudo -n crontab -l`, 10 s timeout); unreadable → a `schedule_unverified` line every run and one run-level page (`archival-health-crontab-schedule_unverified`) on the 3rd consecutive. The old uncapped `readFileSync` + 60-line `tail()` removed; the false "crontab is unreadable" comment rewritten; the header's reason list updated.
- **`b-disk-file-tiering.ts`:** the two comments at the pre-start exits rewritten (N1); the DONE lines unchanged.
- **Tests — NEW `b-disk-file-tiering-amendment2.test.ts` (29),** fixtures copied from the real staging logs and crontab: clean; failures summed after the last start; crash after start; refusal before start; tiering `lock_held`; retention day-2 hung holder; 1 ms before the fire; a 3,500-line run; no start; both rotation placements; the monthly rotator across a skipped rotation; the quote fallback; the bounded tail; the selector (one / commented / two / prefix); normalisation; the unverified streak (counts, reset, across `.1`); fences on every start / DONE literal and on the checker's patterns. **Mutations:** dropping the due-time leg fails 5; untying the DONE from the start fails 1; both restored, 29/29. Existing: `b-disk-file-tiering.test.ts` 25/25; amendment-1 17/17 with the watchdog `.mjs` normalised to LF (its CRLF working copy fails to load under vitest locally — known, unchanged file, restored). `tsc` 324 = baseline.
- **Carried (Langston on r4, (2)):** archival-health now has ten reasons per check on a minter with no resolve path. The key split stops one reason masking another; it does not stop a second, different drift on the same check being suppressed by the first standing row, whose body is its mint-time snapshot. **Hand-resolve is the only clearing instrument** (pre-existing for the old six reasons).
- **Not pushed until after the 2026-11-13 joint deploy** (P-14b + `1251fb8e4` + inc B), so it cannot ride that deploy unreviewed.

## Amendment 2 — Step 4: Langston PROCEED on `823f638fb` (Discord, read at `d47d114bb`; he ran the real functions on the live crontab and logs), no correctness defect; four notes folded
- **F1 (folded):** `readCrontab` now carries sudo's own reason from `stderr` ("sudo: a password is required") beside the command line, so the `schedule_unverified` page names what broke.
- **F2 (folded — the choice stated):** the retention `donePattern` now requires and sums the third counter, `snapshot_failed=`, beside `failed=` and `plain_failed=` (`b75-retention-sweep.ts:2140`). A snapshot-lane-only failure now grades `failed` here as well as on its own `b75-snapshot:<table>:failure` key; a DONE line that drops the token reads `incomplete`. Test added (30); the literal fence covers `snapshot_failed=${`.
- **F3 → Step 7 plant:** flip one in-repo schedule, assert the page names the box's expression AND that the run is graded on it (the `effectiveSchedule` composition is module-private; its one high-consequence arm is the `return sel.schedule`).
- **F4/F5 — bounds, stated so they are not read as defects later:** until amendment 3's stanza lands no `.1` exists, so the 32 MiB tail is the only bound (`disk-file-tiering.log` ~81 KB/day → ~400 days); past it a start falls out of the tail and pages `not_started` (loud, not silent). `incomplete` also fires on a subject still running at 05:00Z — the 2026-11-06 tiering run took 42 min, so a healthy run longer than 2 h 15 min pages; the body says "crashed or is still hung".
- **Attacks answered (Langston):** `all_ok` is read only by `staging-liveness-watchdog.mjs:321` as a key; deploy holds `(ALL) NOPASSWD: ALL` and `sudo -n` works tty-less, a later tightening degrades to the 3-run page; a non-parsing start capture reads `not_started`.
- **§13 → amendment 3's crontab/logrotate turn:** the root crontab's `DISABLED` comment (about the absent B70 retention sweep) sits directly above the active B70 partition-creator line and reads as its header; rewrite it to name what it governs.
- **Override delta (Step-7 plants) — Langston PROCEED on r2 `9eaafb78e`:** `--plant` gate, `DRY-ALERT`, plant-run banner. His note folded as a header comment and into the Step-7 procedure: **a plant run's stdout goes to the terminal or a plant file, never appended to the production `archival-health.log`** (it prints the `started at` / `DONE — all_ok=` lines the watchdog's `archivalHealthRan` reads). Not over-read: the 33-test fence is source-text only; the plant run itself is the behavioural proof.

## Amendment 4 — increment 3a (= amendment 1's AP-4 + the attestation), Step 3 (Langston PROCEED on plan r2; held LOCAL until the 2026-11-14 01:40Z joint deploy is live so it cannot ride it unreviewed)
| dispatch header | |
|---|---|
| (i) class | `architecture` (scope header) |
| (ii) doc set | scope present; pre-audit present (amendment 1 AP-4/5/6; amendment 4 r1, r2, PROCEED notes); change list — this file; System Manual / SIM / STORAGE_POLICY / BATCH_CATALOG / PHASE_HISTORY / CHANGES_AND_FIXES / RUNNING_ISSUES / task list — owed at Step 10 (SIM `:2405`'s 1× rotator model corrected; STORAGE_POLICY cold verification = attestation) |
| (iii) Step 2 | pre-audit "AMENDMENT 4" r1 → r2 → PROCEED notes; amendment 1 AP-4 / AP-5 / AP-6 |
- **`storage-client.ts`:** NEW `uploadColdFile(bucket, path, localPath)` — one streamed read for SHA-256 + SHA-1 (`hashFileSha256Sha1`), body streamed from the file with backpressure through `postFileStream` (node:https `request` + `stream.pipeline`, `Content-Length` set; as shipped after Step 9 — the first form used `fetch` with a `duplex: 'half'` stream body, which held the whole object, see the Step-7 section), the upload response PARSED and checked (Coltrane 1: action, bucket, name, SHA-1, length, file id), then `b2_get_file_info` by the returned file id and the same check (Coltrane 2); any mismatch or a transaction-cap refusal throws. NEW `downloadColdFile` (streamed, by name; by id is 3b), `b2GetFileInfo`, `deleteColdVersion(fileName, fileId)` (usable only until 3d step 5). `assertB2Version` exported for tests. The Buffer forms stay for the liveness canary.
- **Rotator:** `rotateColdCandidate` refuses before any I/O unless free space covers 2 × the object + `data_lifecycle.disk_file_free_floor_bytes` (the tiering job's own floor — same disk; a missing floor refuses rather than skips, because `free < NaN` is false); `downloadWarmFile` into a private `0700` temp folder (removed whatever happens); `uploadColdFile` — **no re-download**; the cold manifest row writes `provider_file_id`, `provider_sha1`, `provider_bytes` and `verification_method = 'b2-sha1-attested'`; warm deleted only after. `Pick` narrowed to `downloadWarmFile | uploadColdFile | deleteWarm` (N1). The Phase-2 step list and the exact-evidence basis comment cite the attestation (L-2).
- **`b75-rehydrate.ts`:** the cold restore streams to the file (`downloadColdFile`) — AP-4 C-2's reason: a streaming rotator with a buffered restore sends to cold what cannot come back.
- **`context-bridge-log-ttl.ts`:** the warm pair (`uploadWarmFile` + a streamed read-back to a `.verify` file, removed after) and the 413 cold fallback (`uploadColdFile`, attested, the manifest UPDATE writing the provider columns) — `#169`'s subject; the now-unused `readFile` dependency removed (rule 18). Its export is still built in memory by its exporter (AP-4's recorded limit).
- **Migration** `2026-11-13-b-disk-file-tiering-cold-attestation.sql` (+ MANIFEST) and its by-hand rollback: the four columns, a CHECK on the two method values, existing verified cold rows labelled `sha256-roundtrip` (4 on staging), a postcondition. Rollback order: app first, then the script (it drops recorded file ids — read them out first).
- **NEW `server/scripts/b75-cold-proof.ts`** — the 3a memory proof (Langston C-2): warm → temp → `uploadColdFile` under `_proof/` → delete that version by id → temp removed; never writes the manifest, never deletes warm; reports peak RSS and min `MemAvailable` (sampled every 250 ms) as one JSON line. Run once per size; PASS = AP-5's flatness.
- **Tests — NEW `b-disk-file-tiering-3a.test.ts` (15):** a 128 MiB upload through a fake B2 that reads the body stream, Buffer memory held under 64 MiB (streamed measured 32.0-36.9 MiB over 8 runs — spent chunks before GC; 6/6 pass); **mutation — the whole file read and wrapped as a stream: 3/3 fail**; the hashes; four tampered responses each refused; the proof harness (proof path, delete by id, temp removed, drift stops before upload, no manifest / deleteWarm in its source); every caller free of buffered calls; the narrowed `Pick`; the manifest columns; the migration and MANIFEST. Updated: the rotator state-machine tests (attested order, no read-back, the free-space refusal incl. a missing floor), the context-bridge 413 test (file forms, attested, provider columns in the UPDATE), the snapshot-retention rotation + restore, the completeness test's INSERT-list regex. 208/208 across the six affected files; `tsc` 324 = baseline.

### 3a Step 4 — Langston PROCEED at `712db5584` (code `fe9c14450`; CI `43542577809` 4/4), 2026-11-14 ~02:00Z
- **Folded now (comments + one dead line, no behaviour change):** the rotator's floor-guard comment now says production already fails at `loadConfig`'s `reqNum` and the per-candidate refusal binds hand-built configs; the context bridge comments why `exportRes.checksum` is NOT passed to `uploadWarmFile` (keeps the comparison real); the dead `upload = cold;` in the cold branch removed.
- **CONDITION (binds 3b's close):** if any 3a proof run reports `proof_deleted:false`, its (name, fileId) joins 3b's delete list in writing before 3b closes; 3b's listing step states that the `_proof/` prefix keeps such a survivor out of any by-name collision with a real cold object.
- **Carried to 3b (3b does not close without it):** the attestation columns have no app reader at this ref — 3b's by-id reads are the reader, and must notice a cold row arriving with `verification_method` NULL.
- **Carried to 3b:** the context bridge's warm read-back writes a second full copy (`.verify`) beside the export with no free-space check on that path — give it the rotator's floor check.
- **Carried to Step 10 (SIM):** the rotator's free-space read (`statfs` of the home folder) and the tiering job's (`statfs` of `/`) are one disk on staging (`/dev/sda1`, device 2049) — measured by Langston; a box with a separate `/home` breaks that silently.
- **Fence note (no change):** if the 64 MiB memory fence ever goes red on a correct build, raise the constant toward the 128 MiB object size — do not delete it. It is in-process Buffer memory against a fake B2, not RSS, and cannot stand in for AP-5.
- **No unattended first contact:** 0 cold candidates until ~2027-05 (365-day warm retention, oldest active warm row 2026-05-06), so AP-5's function arm cannot be discharged by a scheduled run — it stays with the Step-7 proof runs.

## Amendment 2 (AP-7) — Step 7 plant runs on the deployed build `9591ba8c2`, 2026-11-14 02:06:51-02:07:01Z — 9/9 as expected
Procedure: copies (`cp -p`, mtimes kept) of the four real logs and the real root crontab into a private `0700` folder `/home/deploy/.ap7plant/<scenario>`; every run `su - deploy` with `--plant` and `ARCHIVAL_HEALTH_DRY=1`; each run's stdout appended to its scenario's OWN `archival-health.log`. Expected outputs were written into the script header before any run. Folder deleted after. **Production log untouched:** `/var/log/dawntrader/archival-health.log` still 69,489 B, mtime 2026-11-13T05:00:02, 0 `PLANT RUN` lines (control: 129 `DONE — all_ok` lines).
| scenario | plant | result |
|---|---|---|
| base | real copies | 4/4 OK, `all_ok=true` |
| notstarted | last tiering run removed | `disk-file-tiering/not_started` — last start 2026-11-12T02:45:03 < due 2026-11-13T02:45 |
| incomplete | retention DONE removed | `b75-retention/incomplete` — start 2026-11-13T02:15:03 with no DONE after it |
| failed | tiering DONE `failed=2` | `disk-file-tiering/failed`, quotes the DONE line |
| drift (F3) | box crontab `50 1 * * *` | `schedule_drift` names `"50 1 * * *"` AND the run is graded on it: `stale` against due 2026-11-14T01:50 citing cron `"50 1 * * *"` (on the repo's `45 2` the same log is OK) |
| notsched | tiering line commented | `not_scheduled`, then graded on `"45 2 * * *"` → OK |
| rotate | REAL `logrotate -f` (rotate 1, create, notifempty, no dateext, no compress; private state file) | live empty, `.1` 732,866 B → OK — the run is found in `.1` |
| rotatemid | start in `.1`, DONE alone in live | OK |
| unverified | crontab file missing, 3 runs | runs 1-2 print the marker only; run 3 `DRY-ALERT crontab/schedule_unverified: 3 consecutive runs` |
- Note, no work: a run whose only page is a schedule page (`not_scheduled`, `schedule_unverified`) still ends `all_ok=true`. The value has no reader — the watchdog reads only that a `DONE — all_ok=` line exists (`staging-liveness-watchdog.mjs:321`); the pages are the signal.
- **Step 7 production leg — the first production run on this build, 2026-11-14 05:00:02Z: PASS as expected.** `/var/log/dawntrader/archival-health.log` lines 1122-1139 (70,770 B, mtime 05:00:03):
  - `b75-retention: OK (age 2.5h)`, `b75-cold-rotator: OK (age 314.0h)`, `b75-cold-liveness: OK (age 121.0h)`, `disk-file-tiering: OK (age 2.2h)`. Daily-runway: 6 OK (14 days ahead), 6 pre-cutover skips. Ends `DONE — all_ok=true checks=5`.
  - No `schedule_unverified`, `schedule_drift` or `not_scheduled` line, each counted separately over the whole file: 0, 0, 0 (corrected at Step 8: the first version cited one `grep -c "schedule_"`, which cannot match `not_scheduled`). The marker is `[archival-health] schedule_unverified` (`archival-run-check.ts:122`) and it prints on EVERY unreadable run (`b-storage-archival-health.ts:498`), not only the paging 3rd; the plant `unverified` row above is its positive control. Direct read: `sudo -u deploy sudo -n crontab -l` succeeds.
  - So the crontab was read and the box's four schedules match the repo's.

## Amendment 2 (AP-7) — Step 8: Langston PROCEED on the production leg (Discord `1571029624664752149`); plant re-run r2 kept for him, 2026-11-14 05:11:57-05:12:14Z
Langston ruled the r1 plant rows `RULED ON REPORTED FACT` (the folder had been deleted), so no PROCEED on that leg. r2 re-runs the same nine scenarios on the same build and **keeps** `/home/deploy/.ap7plant` (deploy-owned, `0700`) for him to read; it is deleted after his ruling. Expected results were re-registered in the script header before the run, because "now" was after today's 02:15/02:45 runs:
- `drift` plants `"50 4 * * *"`, not r1's `"50 1"` (which would grade OK against today's 02:45 run).
- `notstarted` drops today's tiering run.

| scenario | r2 result (each scenario's own `archival-health.log`) |
|---|---|
| base | 4/4 OK, `all_ok=true` |
| notstarted | `disk-file-tiering/not_started` — last start 2026-11-13T02:45:02 < due 2026-11-14T02:45 |
| incomplete | `b75-retention/incomplete` — start 2026-11-14T02:15:02 with no completion line |
| failed | `disk-file-tiering/failed`, quoting `DONE moved=28 failed=2` |
| drift (F3) | `schedule_drift` names `"50 4 * * *"`, then `stale` against due 2026-11-14T04:50 citing cron `"50 4 * * *"` |
| notsched | `not_scheduled`, then graded on `"45 2 * * *"` → OK |
| rotate | real `logrotate -f`: live 0 B, `.1` 737,127 B → OK |
| rotatemid | OK |
| unverified | runs 1-2 print the `schedule_unverified` marker only; run 3 `DRY-ALERT crontab/schedule_unverified: 3 consecutive runs` |

Production log after r2: 70,770 B (unchanged), 0 `PLANT` lines. Record correction from Langston folded above (the separate per-reason zeros). His no-work observation: `archival-health.log.1` does not exist on the box, so the rotated arm of `unverifiedStreak` reads a missing file every run (guarded). Not a defect.

## Amendment 4, increment 3a — Step 6 deploy + Step 7: memory proof FAILS flatness; the upload half is the cause; Step 9 iterate
**Step 6:** `415b3051f92f8fa315bacaf930b48c0a3b71ca0f` live 2026-11-14T06:18:45Z (restart 700, engine resumed, identity asserted); CI `43565391281` 4/4 on that exact sha. Migration applied in 855 ms. Its rollback was dry-run first in ONE transaction ending `ROLLBACK`:
- before: 0 attestation columns, 0 constraint;
- after forward: 4 columns, 1 constraint, cold 4 rows `sha256-roundtrip`, warm 6,417 rows NULL;
- after the rollback file: 0 and 0;
- after the transaction rollback: 0 and 0.

Infra Claude cleared the deploy against its live memory run (capped unit).

**Step 7 — AP-5 proof, `b75-cold-proof.ts` on the deployed build:**
| object (manifest id) | bytes | peak RSS | min MemAvailable | proof version deleted |
|---|---|---|---|---|
| `43825287-…` `disk_file.diagnostic_reports/phase-41F-L-trace.ndjson` | 170,761,082 | 258,556 kB (252.5 MiB) | 2,095,712 kB | yes |
| `0dfe1e0e-…` `crypto_spot_ticker_snap/2026-06` (largest warm object) | 535,409,768 | 619,044 kB (604.5 MiB) | 1,971,996 kB | yes |

Against AP-5, verbatim: each run is under 1 GiB RSS (yes) with MemAvailable ≥ 512 MiB (yes), **but the two peaks must sit within 64 MiB of each other — they are 352 MiB apart. FAIL.** Peak memory grew roughly one-for-one with the object: +347.7 MiB of object for +352 MiB of RSS. Both proof versions and the probe version were deleted by file id. `data_archive_manifest` and the warm objects were untouched.

**Where, measured per phase, one process each, same 535 MB object, deployed `storage-client.ts`:**
- `downloadWarmFile`: 119,312 kB.
- `hashFileSha256Sha1`: 107,160 kB.
- `uploadColdFile` (to `_proof/probe3a/`, then deleted by id): **613,784 kB**.

So the upload holds the object.

**Why, reproduced without B2:** a local HTTP sink reading at ~25 MB/s (B2's measured rate), same 535 MB file.
- Node 20.20.0 `fetch` with the exact `uploadColdFile` body (`Readable.toWeb(fs.createReadStream)`, `duplex: 'half'`, `Content-Length`): peak **632,304 kB**.
- `node:http` request + `stream.pipeline` at the same rate: peak **110,844 kB**.

A second control isolates the wrapper. `Readable.toWeb` read by a slow consumer, no network: 106,728 kB. So the wrapper applies backpressure, and the memory is held inside Node's `fetch` request-body path. ⚠ **Corrected at Step 9: it does NOT read the file ahead.** Measured with the Step-9 fence on Node 20.20.0, the body stream's `bytesRead` ran only 7.4 MB ahead of the receiver. What happens is that fetch keeps the chunks it has already SENT live until the request ends: 95.9 MiB live after forced collections on a 96 MiB upload. Where inside fetch they are held is not established.

**Exposure today: none.** The scheduled rotator has 0 cold candidates until ~2027-05 (365-day warm retention). `uploadColdFile`'s `duplex` body is the only streamed-`fetch` upload in `server/` and `scripts/` (`git grep` at the ref).

**Proposed fix (Step 9, to Langston):** `uploadColdFile` sends the body with `node:https` `request` + `stream.pipeline` — the same headers, the same response checks, `b2_get_file_info` unchanged.
- **Fence:** a slow local sink plus a counting source. Assert the sender's read-ahead (bytes read minus bytes received, at its maximum) stays under a stated bound.
- **Mutation:** put `fetch` back. The fence must fail.

Then CI, deploy, and re-run the proof at both sizes.

### 3a Step 9 — the fix (for Langston's Step 4)
`uploadColdFile` now sends the body through a new `postFileStream` (node:https `request` + `stream.pipeline`, a 300 s idle-socket timeout, https only except http to loopback), in `server/services/data-archive/storage-client.ts`. The headers, the `assertB2Version` checks on the response and the `b2_get_file_info` read-back are unchanged.

**The old AP-6 fence could not see the defect.** It stubbed `fetch` and consumed the body itself, so the real sender never ran.

**The new fence** (`b-disk-file-tiering-3a.test.ts`): the upload goes to a real local HTTP receiver. Every 8 MiB received, it forces a collection (`--expose-gc` set at runtime) and records the ArrayBuffer memory still live. Bound: < 40 MiB on a 96 MiB file.

| runtime | this sender | the mutation (deployed 3a `fetch` body restored) |
|---|---|---|
| Node 20.20.0 (staging; CI and Docker are `node-version: 20` / `node:20-slim`) | 4.4–16.1 MiB over 6 runs | **95.9 MiB → FAILS** |
| Node 22.18.0 (laptop) | 14.4 MiB | **101.6 MiB → FAILS** |

The first fence form, read-ahead (`bytesRead` minus received), did NOT fail the mutation: 7.4 MB on Node 20. That is how the mechanism correction above was found.

Checks: the 3a file passes 16/16, and the `tsc` baseline gate stays at 324 = 324. The Node 20 runs used a private mirror at `/home/deploy/.m3a` (deleted after); the deploy clone was untouched.

### 3a Step 9 r2 — Langston CHANGES-NEEDED at `301684a42` (Discord `1571054015536439297`), folded
- **FINDING-1 (early-response leak), fixed:** `postFileStream`'s `done()` now destroys the request when its body has not ended (`if (!req.writableEnded) req.destroy()`). The pipeline then destroys the file read stream. Without it, a receiver that answered on the headers and kept the socket open left the request and the read stream alive, pinning the temp file's inode after the rotator unlinked it.
  - **New fence:** a raw `net` receiver answers 400 on the headers and keeps draining. Asserts the caller gets `{400, "nope"}` and that the body read stream and the socket are destroyed within 2 s.
  - **Mutation (the destroy line removed):** FAILS on Node 20.20.0 and on Node 22.18.0.
- **(a) loopback carve-out:** additionally gated to the test runner (`VITEST === 'true'` or `NODE_ENV === 'test'`). Production accepts https only.
- **(b) gc hygiene:** `--no-expose-gc` is set right after `gc` is captured; a comment states the per-file-isolation assumption.
- **(c) timeout:** the doc comment now says the 300 s socket-idle timer also times the send phase, and that redirects are not followed.

**Node 20.20.0 private-mirror runs, r2:**
- This sender: retention fence 7.3 MiB, early-refusal fence passes.
- Destroy removed: early-refusal fence FAILS.
- Deployed `fetch` body restored: retention fence 93.2 MiB, FAILS.
- The mirror's 5 other failures are the caller-census tests, which read source files the mirror did not copy. All 17 pass in the repo.

**Langston's three record items:**
1. Line 186 now describes `uploadColdFile` as shipped.
2. `GOVERNANCE_EXCEPTIONS.md` row 44 item (2) is refreshed to the measured Step-7 FAIL and this fix.
3. The sha the proof loaded: the two proof runs (06:19:39Z and 06:20:26Z by their B2 upload timestamps) and the per-phase probe ran `npx tsx` from `/home/deploy/dawntrader`, whose checkout was `415b3051f`, deployed at 06:18:45Z. The drift row's "deployed `9591ba8c2`" was stamped AS AT 06:17:01Z, before that deploy.

**#661 leg 3 (Langston):** the `https` arm has never executed in a test — every fence drives http to loopback. Its first exercise is the `b75-cold-proof` re-run against real B2, so no green fence is cited for it. The 40 MiB bound is not scale-invariant; AP-5 flatness is proven only by the proof harness.

### 3a Step 6 r2 + Step 7 r2 — the fix deployed; AP-5 proof PASSES
**Step 4:** Langston PROCEED on `b0b7b6193` (Discord `1571057707790635061`). He re-derived FINDING-1 himself on Node 20.20.0 and Node 22.22.1, by fd count on the unlinked file: 0 with the fix, 1 without.

**Step 6:** `65132e2eb5f86a3098bb0997a7bbbb91a47ae0dc` live 2026-11-14T07:06:44Z (restart 701, pm2 start 07:06:34.639Z, pid 3644971); CI `43569188607` 4/4 on that exact sha; no migration.
- Carried: `301684a42` + `b0b7b6193` (this fix) and Infra's `55beb44c1` + `80ad52922`.
- Infra confirmed both have Langston's PROCEED and CI, and touch the token-watch tools only.
- NEW Claude cleared the restart: B-ENTRY-GATE loses only its in-progress hourly count; the deploy had to land before 20:30Z.

**Step 7 — `b75-cold-proof.ts`, run from `/home/deploy/dawntrader` at `65132e2eb` (`git rev-parse HEAD` checked first):**
| object | bytes | peak RSS | min MemAvailable | proof version deleted |
|---|---|---|---|---|
| `43825287-…` trace | 170,761,082 | 121,948 kB (119.1 MiB) | 2,225,000 kB | yes (`…m070710…`) |
| `0dfe1e0e-…` `crypto_spot_ticker_snap/2026-06` | 535,409,768 | 132,804 kB (129.7 MiB) | 1,976,868 kB | yes (`…m070731…`) |

Against AP-5, verbatim:
- each run is under 1 GiB RSS: yes;
- MemAvailable stays ≥ 512 MiB: yes;
- the two peaks sit within 64 MiB of each other: **10.6 MiB apart → PASS.**

Before the fix, the same two objects peaked at 252.5 and 604.5 MiB. SHA-256 and SHA-1 are identical to the pre-fix runs, so the same bytes went up.

**First exercise of the `https` arm (#661 leg 3):** both uploads went through `postFileStream` to real B2 over https. B2 accepted each body against `X-Bz-Content-Sha1`, `assertB2Version` passed on the upload response and on `b2_get_file_info` (the proof would have thrown otherwise), and both proof versions were deleted by file id. `data_archive_manifest` and the warm objects were untouched.

**UI surface: none.** The cold path is a scheduled script with no page, and nothing in the app reads the attestation columns yet (that reader is 3b's).

### 3a Step 8 — Langston PROCEED on AP-5 (Discord `1571061632950345749`)
Langston re-derived the deploy at four read-sites and the CI from the Actions API. He then re-ran the proof at both sizes with a gap-free instrument, `/usr/bin/time -v` (the kernel's `getrusage` high-water mark):
- 171 MB object: 132,580 kB (129.5 MiB);
- 535 MB object: 133,880 kB (130.7 MiB);
- **1.27 MiB apart**, against my sampler's 10.6 and his sampler's 13.68. All three PASS.

The script's 250 ms sampler under-read the 171 MB peak by 12.7 MB. The gap-free figure is the one to cite.

Further checks:
- His run shas equal the manifest rows' `checksum` and `bytes_compressed`.
- `b2_list_file_versions` on `_proof/` returns 0 versions; unprefixed, the control returns 115.
- Containment: 4 cold rows, 6,417 warm rows. **At Step 10 say it as a state split: 6,414 `active` + 3 `migrated`.**
- The https arm is exercised. His first 535 MB attempt got a real B2 `500 internal_error` and failed closed: it threw at `:766`, with no manifest write, no `deleteWarm`, and the temp file removed.

**Findings, with dispositions:**
- **FINDING-1 — `uploadColdFile` does not retry a B2 5xx** (B2's contract: a fresh upload URL, then retry; `b2_get_upload_url` and `b2Authorize` are unretried too). It fails closed, so a monthly rotator abandons that candidate on a transient. Outcome (2). DISPOSITION: under KD-34 a technical choice inside agreed work, settled by CC-A + Langston, not Kyle (`PM_CLAUDE_RULES.md:18`, `:23`; PM Claude confirmed 2026-11-14). Folded into 3b, owner CC-A, as agreed below ("3b item — bounded B2 retry").
- **FINDING-2 — a second residue version:** `context_bridge_log/2026-01.jsonl.gz` has two `upload` versions (13,901,237 B each, 2026-07-07, 5 m 34 s apart) against one manifest row. The mechanism is a HYPOTHESIS. DISPOSITION: added to 3b's existing listing/cleanup step (delete by id before 3d step 5), owner CC-A, alongside the P10 orphan and any `proof_deleted:false` survivors.

**Unchanged carries:**
- No app reader of the attestation columns yet (3b).
- The context bridge's `.verify` copy has no free-space check (3b).
- AP-5's **function arm** belongs to 3b; this gate discharged the **flatness arm** only.

**3a (AP-4 + the attestation + AP-5 flatness) is verified.** The batch continues with 3b, 3c and 3d, then amendment 3, P9 (after 2026-11-18) and Steps 10-11.

### 3b item — bounded B2 retry (FINDING-1), agreed CC-A + Langston under KD-34 (Langston AMEND → PROCEED on recording, Discord `1571064181191614507`)
**Base, accepted:** at most 3 attempts per call, with backoff of 1 s then 4 s plus jitter. Each upload attempt discards the upload URL and fetches a fresh one. The full attestation runs on every attempt. Fail-closed is unchanged: a final throw means no manifest row and no `deleteWarm`. A `400` or `cap_exceeded` throws as today.

**Langston's amendments — all part of this item:**
1. **`b2GetFileInfo` is in the retry set.** It is an idempotent metadata read, and a 503 there after an attested upload must not throw that upload away or manufacture an orphan. Fence: `b2_get_file_info` 503 then 200 → one success, no second upload.
2. **`b2_list_buckets` is on the live path.** A fresh auth sets `bucketId` null; the auth expires at 23 h. Either retry it, or read and state that `B2_BUCKET_ID` is set in the staging env. Do not infer it.
3. **Classify on the pair (HTTP status, B2 `code`), never on the status alone.** `postFileStream` returns `{status, text}`, so parse `code`. A 401 `expired_auth_token` and a 401 `unauthorized` diverge. An unparseable body is non-retryable, except on 500 or 503.
4. **A 429 `too_many_requests` retries**, honouring `Retry-After` capped at the backoff ceiling.
5. **A 401 `expired_auth_token` on `b2_upload_file` itself** re-authorizes and fetches a fresh upload URL, inside the same 3 attempts.
6. **Any rejection from `postFileStream` is retryable and may have left an orphan.** That covers a request error, the 300 s idle destroy, a pipeline failure and a response error, all of which reject with no status. "Before any response" is not knowable, so it is dropped.
7. **Worst-case wall clock, stated at Step 2:** 3 full re-streams of the largest object, each under its own 300 s idle ceiling, plus about 5 s of backoff. Check it against the rotator's overlap guard and against the B2 download and transaction caps (`RUNNING_ISSUES.md:10799`, issue `#1132`: the 2026-11-04 off-box run ended on `download_cap_exceeded`).
8. **An attestation failure never retries.** A 200 that fails `assertB2Version` is a correctness failure against a server that is answering; it throws at once.
9. This section corrects the FINDING-1 disposition line above: it no longer waits on Kyle.

**The orphan leg (Langston), part of this item:**
- **Retry succeeded:** the orphan is a superseded version of the same name. Whether a `daysFromHidingToDeleting` lifecycle rule reaches a version superseded without an explicit hide is a **HYPOTHESIS**. Confirm it against B2's lifecycle documentation and `prove_cold_key.py`'s measured capability before building on it. If it holds, the rule is set with the WIDE key at KD-54 step 2, before the narrowing — an addition to that agreed step, not a new slot.
- **All attempts failed:** the orphan is the current version of a name with no manifest row. No lifecycle rule can reach it safely, and `deleteColdVersion` loses its right at 3d step 5. ⇒ **(a)** On a final throw, the caller records the attempted `(bucket, path, sha1, bytes, attempt timestamps)` durably and raises a page. **(b) 3d step 5 and CC-INFRA's orphan removal** (issue `#1132`, record at `RUNNING_ISSUES.md:10799`; OBJ-6 in `B_TOKEN_WATCH_FOLLOWUP_MEMORY_SCOPE.md:62`; `SPRINT_TO_LIVE_PLAN` §0a Infra order 5). *Corrected 2026-11-14 (Langston): this first cited `#10799`, which is a line number — a grep for it returns a clean false zero.* The gate is narrower than first stated. OBJ-6's census is read-only by its own scope, so it is not blocked; only its removal step needs a right. That removal may need no delete right at all: `b2_hide_file` plus a `daysFromHidingToDeleting` rule does it, and `prove_cold_key.py:99` measured hide as permitted on a key with the identical capability set (`listFiles, readFiles, writeFiles`) — an adjacent key instance, not the narrow `dt-archive-cold` key. ⇒ **KD-54 step 4 adds one call:** after the narrow key is minted and before step 5 deletes the wide key, `b2_hide_file` on a throwaway `_liveness/` object with the narrow key. If it is permitted, 3d step 5 is unblocked outright, and residue is hidden explicitly rather than relying on a lifecycle rule to reach unhidden superseded versions. If it is refused, the order is settled with CC-INFRA before step 5.
- FINDING-2's duplicate `context_bridge_log/2026-01` version is this class already in the bucket. The durable record, not a one-off listing, is the instrument going forward.

**Fences:**
- 429 → retried.
- 401 `unauthorized` → no retry; 401 `expired_auth_token` → one re-auth and a fresh URL.
- 503, 503, then 200 → one success, three upload URLs, one failed-attempt record per discarded attempt.
- 200 with a bad `contentSha1` → throws, no retry.
- `b2_get_file_info` 503 then 200 → one success, no second upload.
- 500 three times → throws and writes the durable record.
- 400 → no retry.

**Mutations:**
- Retry removed → the 503/503/200 case goes red.
- **The classifier made to retry on 400 → the 400 fence goes red** (a classifier that retries everything must not pass).

### 3b item 1 — Step 4 PROCEED (r3, Discord `1571085406219542619`), Step 6 deploy, Step 7 first pass
**Step 6:** `cc1a1c2df5180617dda4f55681d3d9410610fde5` live 2026-11-14T09:00:58Z (restart 702, pm2 start 09:00:47.821Z, pid 3719895); CI `43578056970` 4/4 on that exact sha. Migration `2026-11-14-b-disk-file-tiering-cold-retry.sql` applied in 712 ms. Its rollback was dry-run first, in one transaction ending `ROLLBACK`:
- table count 0 → 1 → 0 → 0;
- the four limit rows 0 → 4 → 0 → 0.

NEW Claude cleared the restart (no B-ENTRY-GATE activity since 07:06Z). The deploy carried only the three 3b commits.

**Step 7 (staging, all read-only except the proof's own `_proof/` version, deleted by id):**
1. `data_archive_cold_upload_failure` exists, 0 rows. The four `data_lifecycle` rows read 60000 / 1048576 / 6000 / 72000000. `_migrations` holds the forward file.
2. **The rotator, run by hand once** — safe because there are 0 candidates: oldest warm active row 2026-05-06, 0 older than 365 days, no per-table overrides. Output went to the terminal, not the production log.
   - `loadConfig` read the four new rows without refusing.
   - `DONE candidates=0 rotated=0 failed=0 bytes_moved=0 deferred=0`, exit 0.
   - `~/.b75-cold-rotator.lock` is absent afterwards (taken and released).
   - `b75-cold-rotator.log` still ends at the 2026-11-01 run.
3. **`b75-cold-proof.ts` on the 171 MB object through the new upload path:** limits from `loadColdLimits`, no retry lines (first-try success), `proof_deleted: true`. Kernel `Maximum resident set size` 131,836 kB (128.7 MiB), matching Langston's 129.5 MiB.
4. **archival-health, plant run** against copies of the four logs (DRY, private 0700 folder, deleted after):
   - `cold-rotator deferred: OK (last run deferred 0; runs read 4)`;
   - `cold-upload-failures: OK (0 unresolved)`;
   - `DONE — all_ok=true checks=6`.

   The production `archival-health.log` is unchanged at 70,770 B.

**Fence-only, stated in these words:** the retry on a failure, the lock refusal and takeover, the deferral page and the failure page have not fired live. No live silence from any of them is evidence that it fires (#661 leg 3). Their evidence is the fences and mutations recorded at Step 3/4.

**UI surface: none** — scheduled scripts and a table that no page reads.

- **3b item 1 Step 8: Langston PROCEED** (Discord `1571091106735726724`). He re-derived every claim himself: the table (12 columns, 4 constraints, 3 indexes); the four rows on the full six-column key; candidates = 0 from the query; a hand rotator run (`deferred=0`, lock absent before and after); and the proof via the new path (kernel max RSS 125,804 kB, the third point in the band). Note: "no retry lines" holds because `b2AttemptLog` suppresses a first-try success by design (`storage-client.ts:648`). Item 1 is verified, except its fence-only legs (the retry on failure, the lock refusal and takeover, the two pages), which have not fired live.

- **3b item 2 Step 4: Langston PROCEED on the fold** (Discord `1571098846455664641`). He re-derived the `/proc` accuracy himself: `CLK_TCK` = 100; the own-pid delta of 637.6 ms is 617.6 ms of `btime` second-truncation, signed toward HELD, so 5 s is about 5x the worst case. 152/152 pids are readable, so the `null` arm is fence-only. CI at the graded ref `24ed6ea87`: 4/4. **New finding, not blocking:** the takeover write is a plain `writeFileSync`, not `wx`, so two same-host runs that both judge the holder dead both believe they hold the lock. Langston homed it on 3c; **folded instead into 3b item 3** (`wx` takeover plus a read-back of our own pid), because it is cheap and the rotator is already open.

### 3b item 3 — Step 3: bind the 4 pre-3a cold rows; the bucket inventory; the exclusive takeover
- **NEW `storage-client.listColdFileVersions(bucket, prefix, setupMs?)`:** `b2_list_file_versions`, paged until there is no next marker. Each page goes through `withB2Retry`, and a page that keeps failing throws, so a partial listing is never returned (C-2).
- **NEW `server/scripts/b75-cold-bind.ts`:** report by default; `--apply` writes. `planColdBindings` decides each unbound cold row:
  - one version of the manifest's size → bind it;
  - several versions with one SHA-1 → bind the newest, the rest are residue;
  - differing SHA-1s → download each by id under a bound, the SHA-256 decides, and only with `--apply`;
  - no version, or a size mismatch → refused.
  - Before writing, `b2_get_file_info` and `assertB2Version` check the chosen version; the UPDATE is guarded `provider_file_id IS NULL`.
- **Orphans are scoped to DawnTrader's own namespaces.** Only a first segment that is a manifest `source_table` (or `_proof`) can be an orphan; every other version is counted as another owner's and never listed. **Found at Step 3:** the first report listed 108 `token-watch/` objects (CC-INFRA's cold archive, which shares the bucket) as orphans, and item 4 deletes orphans. Fence: token-watch and `_liveness/` are never orphans.
- ~~Lock takeover is exclusive: remove the dead file, create with `wx`, read back our own pid.~~ **WITHDRAWN at Step 4 (Langston, item 3 C-1, measured):** `wx` alone was NOT exclusive. A loser's `rm` could unlink the winner's fresh file, and the loser's own `wx` then won — both returned `taken_over`. The earlier fence mocked only the half `wx` already prevents. **Replaced in item 3 r2:** an O_EXCL directory gate (`mkdirSync`) serialises the takeover, the holder is re-read inside the gate, and a stale gate (over 10 min) is cleared. Fence: two runs interleaved in the window (after re-read, before remove) give exactly one `taken_over`. Mutation (gate removed) → both `taken_over`, red.
- **Report run on staging** (read-only, from a private copy, no deploy), the bucket listed in 1 page, 115 versions:
  - other owner: `token-watch/` 109;
  - ORPHAN: `disk_file.diagnostic_reports/phase-41F-L-trace.ndjson.jsonl.gz` (the P10 orphan, 170,761,082 B);
  - bind: `context_bridge_log/2025-12`, `2026-02` and `exit_decision_archive/2026-05`, one version each;
  - `context_bridge_log/2026-01`: two byte-identical versions (one SHA-1, 13,901,237 B), bind the newest (2026-07-07T22:58:09Z) — the older (22:52:35Z) is RESIDUE (FINDING-2);
  - `failures=0`, and no download needed.
- **`--apply` runs after deploy** (the script must be on the box). No staging deploy before NEW's 21:04Z read.
Tests: 3b 60/60; 3a, harness and amendment2 93/93; tsc 324 = 324.
- **Item 3 r2, folded (Langston CHANGES at `0f7960de7`, Discord `1571103174138400800`):**
  - C-1: the takeover gate, as above.
  - C-2: CI is re-run on the new head.
  - `assertB2Version` takes the LISTING's bucket id; comparing the info response's bucket id to itself was a tautology.
  - `_liveness/` is labelled ours and not manifest-tracked, never an orphan.
  - Owner counts cover stored versions only: token-watch is 108 versions plus 1 hide marker.
  - The `needs_download` arm reports its wrong-size siblings and the candidates that lose the SHA-256 comparison as residue.
  - A SHA-1 of `none` or null is not a fingerprint.
  - (a) The report prints the row's `created_at` against the chosen version's upload time (2026-01: 22:58:12.185Z vs 22:58:09.251Z).
  - (b) `COLD_NON_ARCHIVE_PREFIXES` = {`token-watch`: other owner, `_liveness`: ours untracked}. `ownColdPrefixes` REFUSES if a `source_table` collides with one. Both live in the binder module, where item 4 will read them.
  - Re-run report on staging: unchanged bindings, `failures=0`.
