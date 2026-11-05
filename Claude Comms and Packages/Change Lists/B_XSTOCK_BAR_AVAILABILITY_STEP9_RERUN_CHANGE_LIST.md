# B-XSTOCK-BAR-AVAILABILITY — Step 9 re-run fixes: change list for the Step-4 diff review (R1 + R4 + R6a)

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header).
- **(ii) Doc set for that class:** scope `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md` — present; pre-audit `Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md` — present (re-run plan r1-r5 and the R1/R4/R6a build records at its end); completion report — absent (batch open, Step 9); `BATCH_CATALOG` / `PHASE_HISTORY` / System Manual / System Impact Map — owed at Step 10 (they will record R1, R4, R6a and the guard-wait migration).
- **(iii) Step 2:** the pre-audit above; this diff implements re-run plan r5 (R1 PROCEED on code `51cc901bb` + r2 follow-ups `369d66633`; R4 C2 ruled at r3, C3/C8 per r4/r5; R6a per r5; C5 on the no-DROP variant, ruling requested separately).

**Diff range:** `8ff2a691e` (deployed 2026-11-04 21:20:15Z) → the dispatch ref. **Out of this list but inside that range:** B-DB-POOL-GUARD (`#1239`, OLD Claude) and B-DISK-FILE-TIERING commits; their review is theirs, and the deploy is coordinated with OLD Claude.

| file | change | lines (at `bc5a6d8d6`) |
|---|---|---|
| `server/services/passive-archive/xstock-bar-availability.ts` | +203 / −8 | see R1, R4, R6a below |
| `server/services/passive-archive/xstock-bar-timing.ts` | NEW, 140 | R6a part 1 |
| `server/services/passive-archive/xstock-db-snapshot.ts` | NEW, 79 | R6a part 2 (C4) |
| `drizzle/migrations/2026-11-05-b-xstock-bar-availability-guard-wait.sql` + `…-rollback.sql`; `MANIFEST.txt` +1 line (the commit also rewrote its line endings; content change is one line, `db-migrate.ts:92-94` splits on `\r?\n`) | NEW | R6a part 3 (C5) |
| `server/services/system-alerts.ts` | +10 / −2 | R4: actor `xstock-bar-repair` (`:247`); C8: `mergeAlertMetadata` accepts a function patch computed inside `withLock` (`:899`) |
| `server/index.ts` | +15 / −1 | R1: step marker, deadline, `Shutdown error (step=…)` (`:1616`, `:1674-1679`) |
| `server/startup/passive-archive-bootstrap.ts` | +6 / −1 | R1 boot-registration trace; R6a reporter start |
| `server/asset_classes/xstock_spot/book-state-ring-store.ts` | comment only | 3n.q8 FINDING-1 discharged |
| tests | NEW: `…-lifecycle-trace`, `…-cert-autoresolve`, `…-timing`, `…-db-snapshot`; CHANGED: `…-pool-safety` (counts only repair reads), `…-capture` (answers the guard-wait read outside the phase sequence), `b-venue-quiet-alerting-store` (+1 concurrent-increment case) | — |

## R1 — durable trace of a failed lifecycle step
- `recordXstockLifecycleFailure(step, error, { deadlineAt })` (`xstock-bar-availability.ts:454`): one warning `addAlert`, `dedupe_key xstock-bar-writer-lifecycle-failure:<bootId>:<step>`, metadata `{ step, bootId, buildSha, error }`. Raced against `min(6000, deadlineAt − now)`; past the deadline it logs "no time left" and skips; a timeout or throw goes to `console.error`; the losing write gets a `.catch`; the timer is cleared in `finally`.
- `server/index.ts`: `shutdownStep` is `'shutdown-archive-handoff'` until the handoff persists, then `'shutdown-after-handoff'`; `shutdownStartedAt` taken at handler entry; the catch logs `Shutdown error (step=…)`, awaits the trace with `deadlineAt: shutdownStartedAt + SHUTDOWN_BUDGET_MS` (`PM2_KILL_TIMEOUT_MS − 500`), then `process.exit(1)`.
- Boot registration catch → `recordXstockLifecycleFailure('boot-registration', error)`.
- **Reach (binding window criterion, Langston R1 PROCEED):** THROW-shaped failures only; a SIGKILL or an uncaught-error crash writes nothing, so an absent row is not evidence of a clean handoff.

## R4 — self-resolving certification alert, and a daily tally that is never resolved by the repair
- `resolveCertificationAlertIfClear()` (`:562`): runs after each repair; gated by `certificationAlertMayBeOpen` (true at boot, set by every raise, cleared after a zero-check; a throw leaves it set). A bounded `SELECT count(*) … WHERE visible_by IS NULL` (Index Only Scan on the partial pending index, 6.5 ms measured); ONLY at exactly 0: `resolveAlertsByDedupeKey(XSTOCK_CERTIFICATION_PENDING_KEY, 'xstock-bar-repair', 'certificate repair check <uuid>: … = 0 at <iso> (#707)', 'engine')`.
- `recordCertificationFailureDay(n)` (`:524`): every raise writes `xstock-bar-availability-certification-failures-day:<UTC date>` (warning). A row that existed before the call (`created_at` < call start) is incremented through `mergeAlertMetadata(id, (current) => …)`, read-and-increment under the store lock (C8). Owner CC-C resolves day rows at the R6b read and window close.

## R6a — the timing line, the snapshot, the guard wait
- `xstock-bar-timing.ts`: per-leg (`admit`, `apply`, `certify`, `guardWait`) samples + fixed-edge buckets (50 … 20,000 ms + overflow) + max + timeout counts; `takeXstockTimingLine(bootId)` builds `{bootId, seq, interval, edges, legs{n,p50,p95,p99,max,buckets}, timeouts}` and RESETS; a 15-minute `unref`'d reporter writes `[B-XSTOCK-BAR-AVAILABILITY][TIMING] <json>` to stderr. **Overflow > 0 means the 20 s bound is not in effect** (a fence).
- `timedLeg(leg, run)` (`:52`) wraps admit, apply and certify: success records the duration; a statement timeout increments the leg's count and fires `void captureXstockDbSnapshot('<leg> statement timeout')`.
- `xstock-db-snapshot.ts`: a fresh `pg.Client` (connect 3 s, statement 2 s, `application_name dawntrader_xstock_snapshot`), one `pg_stat_activity` read (≤ 60 rows), one `[DB_SNAPSHOT] <json>` stderr line, at most one per 60 s, closes in `finally`, never throws.
- Guard wait: the certify function's new body takes `pre_lock` before the singleton `FOR UPDATE` and `PERFORM set_config('xstock_bar.guard_wait_ms', <ms>, true)` after its existing `observed_at`; the writer reads `current_setting(…, true)` in the same transaction (`:637-639`); an absent value is no sample. `CREATE OR REPLACE`, unchanged signature; the body was diffed equal to the live `pg_get_functiondef` and compiled on staging as a `pg_temp` copy.

## Tests
All bar-availability unit files, the writer fence, the p4c guard, the actor allowlist, deploy-actor parity and the venue-quiet store/alerting suites pass locally (latest run 16/16 files); no `tsc` errors in the changed files. CI result to be cited per job at the dispatch ref.

## Judgement calls to attack
1. R1's 6 s ceiling plus deadline against PM2's 10 s `kill_timeout`.
2. R4's "existing row" test (`created_at` before the call) and the flag's lifetime across a restart (true at boot ⇒ one count after each boot).
3. R6a: snapshot rate limit (60 s) versus capturing a second distinct stall inside a minute; the reporter's 15-minute cadence against the 14-day `error__` retention.
4. C5: the no-DROP `set_config` variant against your option (a) column.
