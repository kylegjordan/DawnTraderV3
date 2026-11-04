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
| 1b | `fefd41e51` | P7 (watchdog disk checks, clear edge, honest dedupe log, category) | `server/scripts/staging-liveness-watchdog.mjs`, `scripts/system-alerts.ts` (`resolve-key`), `server/services/system-alerts.ts` (actor), `server/tests/unit/b-staging-liveness-watch.test.ts` |
| 1c | `a846b0d08` | P5 writer removal | `server/services/context-bridge.ts`, `DELETED_COMPONENTS_LOG.md`, `_archive/deleted-code/context-bridge.phase-41F-L-trace-writer.20261104-B-DISK-FILE-TIERING.ts.removed` |
| 1d | `065863526` | P8 | `server/scripts/b75-rehydrate.ts` |
| 1e | `8495b8768` | P6 | `server/services/data-archive/moved-day-check.ts` (new), `server/services/drift-dashboard-aggregator.ts`, `server/services/system-alerts.ts` (actor), `server/tests/unit/b-disk-file-tiering-moved-day.test.ts` (new) |

## Judgement calls I want attacked
1. **The round-trip proof (1a, `moveOne`).** The original is deleted only after: the download's sha256 equals the local `.gz`'s AND the upload's; the inflated download's sha256, newline count and byte count equal the original's; then evidence row → manifest stamp in one transaction. The manifest row is inserted directly as `verified` (not `pending → uploaded → verified` as the sweep does), and moves to `active` after the delete — so the rotator (which selects `active`) can only ever see a row whose local file is gone. Is skipping `pending`/`uploaded` sound for a single-file object, given the insert happens only after the verified download?
2. **Resume (1a).** If the run dies between the commit and the delete, the next run finds the `verified` row and reproduces the gzip (level 6, Node's header carries no name or time) to compare with the stored object checksum before deleting. A zlib change between runs would refuse, not delete. Acceptable?
3. **`row_count` = newline count, `cursor_contract 'disk-file-lines-v1'`** — the evidence row's three counts are all the newline count (source = exported = the original's; downloaded = the inflated download's). The stronger proof (byte-identical sha256) is checked by the job but is not stored except as the object checksum. Enough?
4. **The moved-day key is per WINDOW** (`…:phase15b_dbs_telemetry:<window>`), not per folder or folder+day as your r1 P5 offered — so a clean `rolling_30d` check cannot resolve a `cohort_latest` alert and flap. And the in-app check resolves its own row under a new machine actor `drift-dashboard-moved-day`, transport `engine`.
5. **The watchdog's disk thresholds are environment-overridable** (only for the forced arming run, C1). Its CHECK entries for disk carry their own `dedupeKey`, `category`, `severity`, a dynamic body and a `reading`.
6. **Windows test note:** `b-staging-liveness-watch.test.ts` fails to LOAD on Windows with or without this change (control on the unchanged code: SyntaxError at the `.mjs` import, the shebang); the new tests passed 10/10 against a shebang-free copy. CI on Linux is the graded run.

## Numbers
- tsc 329 = baseline at every increment.
- Unit: `b-disk-file-tiering.test.ts` 12/12 (boundary test proved by flipping `>` to `>=`: 1/12 fails); `b-disk-file-tiering-moved-day.test.ts` 5/5; watchdog 10/10 (shebang-free copy); actor-allowlist, deploy-actor-parity, venue-quiet store, breaker suites green.
