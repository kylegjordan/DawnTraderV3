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
   - **O4 — warm-tier headroom (Langston §13, FOLDED as a Step 7 measurement, not a new batch):** before the first run and after it, read what the `dt-archive` bucket holds and whether Supabase Storage meters against the plan cap that alert `c0a0b00d` reports (130.3 GB of 200 GB); the first run moves at most 2 GiB, so the meter's movement is visible.
**Record items taken:** the resume path now re-downloads the object and checks its checksum before deleting the original; a `verified` row whose file is already gone (died between delete and `markActive`) is finished at the start of the next run; leftover `.tiering*.gz` temps are swept at the start of every run; the upload's echoed checksum is no longer compared — the gate is stated as TWO independent legs (download sha256 = local .gz; inflated download = original).

**Part 1: PROCEED (Langston, at `955e671c1`).** Record items (a) the `--trace` line now runs as deploy and (b) the resume refusal names both causes — folded with part 2's commit.

## Numbers
- tsc 329 = baseline at every increment.
- Unit: `b-disk-file-tiering.test.ts` 12/12 (boundary test proved by flipping `>` to `>=`: 1/12 fails); `b-disk-file-tiering-moved-day.test.ts` 5/5; watchdog 14/14 at part 2 r4 (shebang-free copy); actor-allowlist, deploy-actor-parity, venue-quiet store, breaker suites green.
