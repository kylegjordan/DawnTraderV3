# B-NEW-52 — Retire weekend cron, poll-reconcile as SSOT — CHANGE LIST (Step-4 code review)

**For Langston Step-4 (before push). 2026-06-06.** Design you ACK'd; implements all 3 must-folds. **No gdrive — diff embedded; `ssh staging` for any check.** Uncommitted; I push only after your ACK.

## Verification (green)
- **tsc-baseline gate** (`node scripts/check-tsc-baseline.mjs`): PASS — 493 vs 494, zero new pairs.
- **vitest**: 23/23 on affected/new (`b-new-36-lifecycle-controller`, `b-new-36-poll-reconciliation`, `b-new-52-reconcile-ordering`) + 35/35 cron-infra (`cron-arm-smoke-test`, `cron-fire-evidence-verifier`, `cron-next-fire`, `cron-arm-logger`).
- Diffstat: scanner.ts ±208, session-lifecycle-controller.ts net −150ish, index.ts ±12, 2 tests reworked + 1 new.

## Load-bearing changes (verbatim)

### 1. `session-lifecycle-controller.ts` — remove fragile crons, fold prewarm, kill missed-cron alert
```diff
- this.registerTimers();                         // removed from init()
- private registerTimers(): void { ... cron.schedule(CRON_FRI_8PM_ET ...) cron.schedule(CRON_SUN_8PM_ET ...)
-   cronRegistry.register({weekend_shutdown...}); logCronArm(...); cronRegistry.register({weekend_restart...}); logCronArm(...); }   // method REMOVED entirely (it ONLY registered the 2 weekend crons)
- runWeekendShutdown(...) / runWeekendRestart(...)   // dead cron callbacks REMOVED
- import cron from 'node-cron'; import {cronRegistry}; import {logCronArm};   // dead imports REMOVED
- type TriggerSource = 'cron' | 'poll' | 'boot'
+ type TriggerSource = 'poll' | 'boot'
```
runShutdownFromPoll / runRestartFromPoll (KEPT) — only these two lines changed each:
```diff
-        runPrewarm: false,
+        runPrewarm: true,      // Q2=(b): poll is now primary, keep prewarm (warms 60m+15m snapshots for DBS at Sunday reopen)
-      await this.writeMissedCronAlert('shutdown'/'restart', now);   // removed — poll is the NORMAL path, not a cron-miss
- private async writeMissedCronAlert(...) { ...severity:'warning',category:'breakage'... }   // method REMOVED (else weekly false alarm)
```
**KEPT, logic unchanged:** `runWeekendShutdownCore` (markAllXstockWeekendSuspended + scanner.pause), `runWeekendRestartCore`, `runShutdownFromPoll`/`runRestartFromPoll` (the calls), boot reconciliation (init steps 1–4).

### 2. `xstock_spot/scanner.ts` — extract tick handler for testability (PURE refactor; ordering preserved)
```diff
- this.clockTickHandler = async (tick) => { <reconcile block ABOVE> ...; if (this.isPaused) return; ...runCycle }
+ this.clockTickHandler = (tick) => this.handleTick(tick);
+ private async handleTick(tick): Promise<void> {
+   if (tick.tickNumber % WINDOW_RECONCILE_INTERVAL_TICKS === 0) { await this.reconcileWindowState(...); }  // reconcile STILL first
+   if (this.isPaused) return;                                                                              // early-out STILL after
+   ...runCycle
+ }
+ _setIsPausedForTest / _setIsRunningForTest / _handleTickForTest   // test-only seams (clearly _-prefixed)
```
The reconcile-above-`isPaused` ordering (the Sunday-reopen invariant) is byte-for-byte preserved — moved from the inline closure into `handleTick`, same order. New test locks it.

### 3. CRON-FIRE-VERIFIER — no edit needed
The verifier + smoke-test derive their expected-set dynamically from `cronRegistry.getAll()`; removing the `cronRegistry.register(...)` calls auto-removes weekend_shutdown/restart from both Mode-A and Mode-B checks. No more stale-flagging.

### 4. Tests
NEW `b-new-52-reconcile-ordering.test.ts`: (a) `reconcileWindowState` triggers a RESTART while `isPaused===true` (+ `handleTick` proves reconcile runs above the early-out); (b) idempotency — repeated closed-window ticks don't double-suspend. Reworked b-new-36 tests: assert init registers ZERO crons; assert NO breakage alert on poll path; assert prewarm RUNS (status success) on poll path.

## One behavior note (preserved, not changed)
`handleTick` awaits `reconcileWindowState` before the `if (isPaused) return`, so the same tick that triggers the Friday shutdown sees `isPaused===true` at the early-out and skips `runCycle` — no stale weekend cycle on the shutdown tick. Same as the original ordering.

## Asks
ACK the diff. Then I push → CI → deploy → **Step-8 = the forced-poll deploy-survival test you specified**: induce window-vs-scanner drift to force a real poll-triggered shutdown AND restart, assert `weekend_suspended` counts + no double-suspend across repeated 30s ticks + restart-while-paused, and restart the app mid-test to prove self-recovery. (Prod has never exercised the poll path — counts cron=2/poll=0 — so this is the gate that matters.)
