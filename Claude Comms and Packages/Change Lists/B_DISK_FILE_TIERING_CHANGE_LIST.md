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
