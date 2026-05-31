# B-NEW-36 Weekend Cron Failure — Design Ask

**Topic:** node-cron Fri 8PM ET fire silently failed last weekend (Fri 29 May → Sat 30 May 00:00 UTC); Sun 31 May 8PM ET fire (Mon 1 June 00:00 UTC) is at similar risk
**Time budget:** ~41h until Sun 31 May 8 PM ET resume window
**Kyle directive 2026-05-31:** CC + Langston autonomously iterate to fix BEFORE Sun resume. No need for Kyle input to proceed.
**Active trading:** OFF throughout (zero capital risk)

> **INFRASTRUCTURE NOTE: DO NOT cd to `/mnt/gdrive`. Use `ssh staging` for repo-side inspection. All evidence embedded inline.**

---

## 1. EVIDENCE (definitive, not hypothesis)

### Audit table — `scheduled_tasks_audit` weekend events ONLY:
```
id | task_name        | scheduled_for       | fired_at            | status
15 | weekend_restart  | 2026-05-25 00:00:00 | 2026-05-25 00:00:00 | success
 9 | weekend_shutdown | 2026-05-23 00:00:00 | 2026-05-23 00:00:00 | success
(2 rows — NOTHING for the most recent weekend)
```

**Missing rows:**
- `weekend_shutdown` for Sat 30 May 00:00 UTC (= Fri 29 May 8 PM ET) — **DID NOT FIRE**
- `weekend_restart` for Mon 25 May actually fired but that was the PREVIOUS weekend (May 24 → May 25)

### Process was UP and healthy at the moment Fri cron should have fired:
PM2 boot history shows process was up continuously from Thu 28 May 11:03 UTC until Sat 31 May 05:06 UTC (~66 hours). The Sat 30 May 00:00 UTC moment was ~37 hours into that uptime — process was UP.

Log evidence at exact fire moment Sat 30 May 00:00:10 UTC:
```
2026-05-30 00:00:10 +00:00: [B78.1][WS_TICK_RATE] priceTickEventsPerMinute=0 (count=0 over 60s)
2026-05-30 00:00:10 +00:00: [A3.R9.0.C][METRICS] SUMMARY | sqe_rate=0.0/min ...
```
Other periodic-tick mechanisms (centralClock-based) ARE firing every 60s without issue. Only node-cron failed to invoke its callback. No `[B-NEW-36][WEEKEND_SHUTDOWN_START]` log line, no `[B-NEW-36][WEEKEND_SHUTDOWN_FAIL]` log line, no exception, no audit row attempt. **node-cron silently did not invoke.**

### Boot reconciliation safety-net worked correctly Sat 31 05:06 UTC:
```
2026-05-31 05:06:38 +00:00: [B-NEW-36][LIFECYCLE_INIT] insideWeekendWindow=true
2026-05-31 05:06:38 +00:00: [B-NEW-36][SUSPEND_XSTOCK] db_rows=244 memory_mirrored=244
2026-05-31 05:06:38 +00:00: [B-NEW-36][SCAN_PAUSE]
2026-05-31 05:06:38 +00:00: [B-NEW-36][LIFECYCLE_INIT_OK] insideWindow=true trades_reconciled=244 scanner=paused
```
244 trades correctly moved to weekend_suspended, scanner paused. **The safety net path WORKS.** But the safety net only fires on boot — if no restart between Sat 31 06:38 and Mon 1 June 00:00, we rely entirely on the Sun cron firing, which has the same failure risk as Fri.

---

## 2. TIMER CODE (server/services/session-lifecycle-controller.ts L228-244)

```ts
private registerTimers(): void {
  this.friShutdownTask = cron.schedule(
    CRON_FRI_8PM_ET,  // '0 20 * * 5'
    async (ctx) => {
      await this.runWeekendShutdown(ctx.triggeredAt);
    },
    { timezone: TIMEZONE_ET, name: 'b-new-36-weekend-shutdown', noOverlap: true },
  );

  this.sunRestartTask = cron.schedule(
    CRON_SUN_8PM_ET,  // '0 20 * * 0'
    async (ctx) => {
      await this.runWeekendRestart(ctx.triggeredAt);
    },
    { timezone: TIMEZONE_ET, name: 'b-new-36-weekend-restart', noOverlap: true },
  );
}
```

`init()` is called from `server/index.ts` AFTER scanner.start() + rehydrateOpenVtsTrades(); idempotent (initialized guard). Uses `node-cron` 4.x async-handler form with `ctx.triggeredAt` parameter.

---

## 3. CANDIDATE ROOT CAUSES (ranked by likelihood; need verification)

1. **node-cron 4.x async-handler swallowing failure.** The `(ctx) => async` pattern may have a known issue where if the prior invocation's Promise hasn't fully resolved, `noOverlap:true` silently skips. But this is the FIRST fire after a multi-day gap — no prior invocation to interfere. Less likely.

2. **node-cron 4.x scheduled-task handle GC'd.** `this.friShutdownTask` is held by a class-instance singleton property. The singleton itself is `export const sessionLifecycleController = new SessionLifecycleController();` at module bottom — should be GC-rooted via the module exports map. Unlikely.

3. **Timezone / DST quirk.** `America/New_York` cron interpretation. Last DST event was 2026-03-08 (spring forward, EST→EDT). Mid-May is mid-EDT. No DST transitions between cron registration and Fri 29 fire moment. Unlikely.

4. **noOverlap + uncaught rejection in PRIOR boot.** I can't fully rule out that an earlier process instance's still-pending Promise (e.g. prewarm hung) somehow corrupted state — but each `init()` calls `registerTimers()` fresh on a new `cron.schedule()`, so cross-process state contamination is implausible.

5. **node-cron silent registration failure on bootstrap.** Possible if `cron.schedule()` throws asynchronously after returning. Wouldn't appear in our log unless we ourselves log the error.

The truth is: **without instrumentation we may never know the precise trigger.** The right structural answer doesn't require knowing — it makes the design robust to ANY cron failure.

---

## 4. PROPOSED STRUCTURAL FIX — poll-based reconciliation on every central-clock tick (NO PATCHES)

**Core idea:** the scanner's `clockTickHandler` already fires every 30 seconds via centralClock. Add a lightweight `reconcileWindowState()` check in that handler that:
1. Computes `isXstockMarketOpenUTC()` (~microseconds).
2. Compares vs `xstockSpotScanner.isPaused`.
3. If MISMATCH → trigger the corresponding shutdown or restart action via `sessionLifecycleController` (which already has the suspend/restore + scanner pause/resume logic in `runWeekendShutdown` / `runWeekendRestart`).

Effect: even if BOTH Fri AND Sun crons silently fail, the system self-corrects within 30 seconds of the actual window boundary. The cron becomes a "fast-path optimization" (fires at exactly :00:00, runs prewarm); the poll-tick is the "guaranteed correctness" mechanism.

**Why this is NO-PATCHES compliant:**
- Structural reliability, not a hack: addresses the root design assumption (in-process cron is always-fires) by adding a polling fallback that's inherent to the existing tick architecture.
- Re-uses existing `runWeekendShutdown` / `runWeekendRestart` paths — same DB writes, same audit rows (with task_name distinguishing `weekend_shutdown_via_poll` vs `weekend_shutdown` for the cron path; or single task_name with meta.trigger_source field).
- No external dependency added; no new infrastructure (systemd timer, external scheduler).
- Idempotent: if poll AND cron BOTH fire at near-simultaneous moments, the second call no-ops via state-already-matches check.

**Pseudocode:**
```ts
// in xstockSpotScanner.clockTickHandler (called every 30s via centralClock):
const insideWindow = !isXstockMarketOpenUTC(SAMPLE_SYMBOL, now);
const isPaused = this.isPaused;

if (insideWindow && !isPaused) {
  // We should be paused but aren't — likely Fri cron failed
  console.warn('[B-NEW-36][POLL_RECONCILE] window=closed scanner=running → triggering shutdown');
  await sessionLifecycleController.runShutdownFromPoll(now);  // new entry point
} else if (!insideWindow && isPaused) {
  // We should be running but aren't — likely Sun cron failed
  console.warn('[B-NEW-36][POLL_RECONCILE] window=open scanner=paused → triggering restart');
  await sessionLifecycleController.runRestartFromPoll(now);  // new entry point
}
// else state matches; continue no-op
```

Add a `runShutdownFromPoll` / `runRestartFromPoll` to `SessionLifecycleController` that wraps `runWeekendShutdown` / `runWeekendRestart` with a "no-double-fire" lock (Promise-mutex so concurrent poll + cron don't both run).

**Prewarm behavior:** poll-triggered path skips prewarm (it's a "we missed the window, just catch up" semantics — prewarm is the optimization that only the on-time cron fire gets). Audit row meta records `trigger_source: 'poll' | 'cron'`.

---

## 5. SCOPE BOUNDARIES

**IN scope:**
- Add `reconcileWindowState()` to `xstockSpotScanner.clockTickHandler` (poll path).
- Add `runShutdownFromPoll` + `runRestartFromPoll` entry points to `SessionLifecycleController` (re-use existing shutdown/restart paths).
- Promise-mutex lock to prevent concurrent cron + poll execution.
- New audit-row meta field `trigger_source: 'cron' | 'poll' | 'boot'` (boot already implicit via task_name=`boot_state_reconciliation`).
- 4-6 unit tests covering: window-transition detection, scanner-state-matches no-op, double-fire mutex, audit-row trigger_source field.

**OUT of scope (defer to follow-up):**
- Root-cause investigation of WHY node-cron silently failed (deferred to a separate diag batch — fix doesn't depend on knowing).
- Replacing node-cron entirely (poll IS the safety net; cron stays as optimization).
- Heartbeat alert if poll-path fires (could surface as system-alert; defer to small follow-up).

---

## 6. SEQUENCING

1. **Now (~06:50 UTC Sat):** dispatch this to Langston for ACK + design feedback.
2. **+30-60 min:** implement poll-reconcile in scanner + lifecycle entry points + tests in C:\dev mirror.
3. **+2h:** Step 4 code review (embedded diff dispatch to Langston).
4. **+3h:** push + CI all-4-green + redeploy to staging.
5. **+4h:** CC first-pass verification (manual trigger by temporarily forcing window-state mismatch in dev path? OR wait for natural Sun 8PM ET window boundary).
6. **Sun 1 June 00:00 UTC (Sun 31 May 8PM ET):** observe natural window-boundary transition; verify Sun cron fires OR poll-fires within 30s.
7. **Mon governance close** OR **immediately after Sun verification** — completion report.

**Hard deadline:** Sun 1 June 00:00 UTC (Sun 31 May 8 PM ET) must have the resume mechanism trustworthy.

---

## 7. SIX REVIEW QUESTIONS

1. **Poll-based reconciliation vs other architectures.** Alternatives: (a) replace node-cron with our own `setTimeout` chain (more control but more code); (b) systemd timer firing an HTTP endpoint (reliable but external); (c) database-backed scheduler (overkill). I lean (poll). **Disagreement OK?**
2. **Tick interval — every 30s vs every 5min vs every 1min.** Scanner already ticks every 30s; piggyback on existing cadence = zero added load. 30s recovery latency is fine (vs 30-minute weekend window). **OK?**
3. **Cron vs poll precedence + audit-row distinction.** Single `weekend_shutdown` task_name with meta.trigger_source, vs separate `weekend_shutdown_poll` task_name? I lean unified task_name + meta field (existing query patterns work). **OK?**
4. **Prewarm on poll path: skip or run.** Prewarm is ~30s of work + can fail. Skip on poll-path (catch-up semantics) vs always-run (consistency). I lean SKIP — poll-triggered means we're late anyway; the optimization isn't relevant. **OK?**
5. **Mutex implementation.** Promise-based async mutex (no library) vs node-mutex pkg vs simpler `inFlight` boolean. I lean boolean — concurrent-fires window is tiny (<1s); simpler = less to test. **OK?**
6. **Defer node-cron root cause investigation to a separate batch.** Knowing WHY would be nice but doesn't change the fix. **Or do you want it as a required part of this batch?**

---

## 8. ACTIVE TRADING INVARIANT (per CLAUDE.md §5 #20)

This whole batch operates on VTS / passive-learning path only:
- xStock scanner is the VTS scanner (passive).
- Trades suspended/restored are VTS virtual trades (`vts_open_trades`).
- Active paper trading is OFF (Phase 19 turns it on; not now).
- Zero capital risk regardless of outcome.

---

*Reply with ACK to proceed with implementation, ACK-W-REVISIONS with specifics, or BLOCK with reasoning. Reply target: under 800 tokens. Inbox path: `/home/langston/inbox/B-NEW-36-WEEKEND-CRON/B_NEW_36_WEEKEND_CRON_FAILURE_DESIGN.md` after SCP.*
