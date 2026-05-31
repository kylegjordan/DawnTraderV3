# B-NEW-36 Weekend Cron Failure Fix — Step 4 Code Review

**Batch:** B-NEW-36 poll-reconcile (2026-05-31)
**Time budget:** ~40h until Sun 31 May 8PM ET resume
**Status:** Implementation complete + local verification green. Awaiting Step 4 ACK to push.

> **INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. Use ssh staging for repo-side inspection. All diffs embedded inline.**

---

## 1. Your three structural revisions — addressed

1. **SSOT for window state.** Verified in code: `scanner.isPaused` IS the canonical signal. All three paths (cron, poll, boot) pair pause/resume with the trade-state mutation via the shared `runWeekendShutdownCore` / `runWeekendRestartCore`. The reconcile checks `scanner.isPaused` as the drift indicator; on drift, it invokes the shared core which re-runs BOTH the trade mutation AND the scanner pause/resume (idempotently). Comment block in `scanner.ts.reconcileWindowState()` documents the SSOT invariant explicitly.

2. **"Cron fired but poll arrived first" no-op test.** Added as test #9. Simulates cron-completed-before-poll by setting `scannerIsPaused=true` BEFORE invoking `runShutdownFromPoll`. Asserts: no new audit row written, no system-alert written. Passing.

3. **System-alert on poll-fire is a HARD REQUIREMENT of this batch.** Implemented in `writeMissedCronAlert()`. Severity=warning, category=breakage, title="B-NEW-36 weekend cron silently missed {shutdown|restart} fire — poll-path caught up". Wired into both `runShutdownFromPoll` + `runRestartFromPoll`. Failure-safe (try/catch around addAlert, never blocks reconcile). Test #1 + #2 assert the alert is written with correct shape.

Plus your minor asks:
- **Q4 (skip-prewarm log breadcrumb):** `console.log('[B-NEW-36][POLL_SKIP_PREWARM] reason=catchup')` added at both poll-fire sites.
- **Q5 (mutex finally + throw test):** mutex IS cleared in `finally`. Test #8 throws inside the wrapped call and asserts (a) `_getInFlightForTest()` returns false post-throw, (b) a subsequent call DOES proceed (proving the mutex is not stuck).

---

## 2. Changes summary

| File | Status | Purpose |
|---|---|---|
| `server/services/session-lifecycle-controller.ts` | MODIFIED | Add inFlight mutex; refactor cron handlers to use shared core; add `runShutdownFromPoll` + `runRestartFromPoll` public entries; add `writeMissedCronAlert`. |
| `server/asset_classes/xstock_spot/scanner.ts` | MODIFIED | Add `WINDOW_RECONCILE_INTERVAL_TICKS=30` const + `reconcileWindowState()` method; hook into `clockTickHandler` BEFORE the `isPaused` early-return. |
| `server/tests/unit/b-new-36-poll-reconciliation.test.ts` | NEW | 9 tests covering all your revisions. |

---

## 3. Embedded diff — `server/services/session-lifecycle-controller.ts` (most important review block)

### 3.a NEW import + TriggerSource type (top of file)

```ts
import { addAlert } from './system-alerts.js';

export type TriggerSource = 'cron' | 'poll' | 'boot';
```

### 3.b AuditMeta extended with `trigger_source`

```ts
interface AuditMeta {
  insideWeekendWindow?: boolean;
  scannerAction?: 'paused' | 'resumed' | 'none';
  tradesAffected?: number;
  prewarmStatus?: 'success' | 'error' | 'skipped';
  prewarmError?: string;
  prewarmSymbolErrors?: number;
  prewarmTotalUpserts?: number;
  notes?: string;
  trigger_source?: TriggerSource;  // NEW
}
```

### 3.c Class state — inFlight mutex + test helpers

```ts
class SessionLifecycleController {
  private friShutdownTask: cron.ScheduledTask | null = null;
  private sunRestartTask: cron.ScheduledTask | null = null;
  private initialized = false;
  // B-NEW-36 poll-reconcile (2026-05-31): mutex preventing concurrent
  // cron + poll execution at the same window boundary. MUST be cleared in
  // a finally block — leaking inFlight permanently disables the safety net.
  private inFlight = false;

  _getInFlightForTest(): boolean { return this.inFlight; }
  _resetInFlightForTest(): void { this.inFlight = false; }
```

### 3.d Cron handlers — now wrap the shared core with mutex

```ts
private async runWeekendShutdown(scheduledFor: Date): Promise<void> {
  if (this.inFlight) {
    console.log('[B-NEW-36][WEEKEND_SHUTDOWN_SKIP] inFlight=true (poll or prior cron holding mutex)');
    return;
  }
  this.inFlight = true;
  try {
    await this.runWeekendShutdownCore({
      scheduledFor, triggerSource: 'cron', runPrewarm: true,
    });
  } finally {
    this.inFlight = false;
  }
}
// (runWeekendRestart is the mirror)
```

### 3.e NEW — runShutdownFromPoll (mirror exists for runRestartFromPoll)

```ts
/**
 * B-NEW-36 poll-reconcile (2026-05-31): poll-triggered shutdown entry. Skips
 * prewarm (catch-up semantics). Writes system-alert so we notice when cron
 * regresses. Mutex protects against cron+poll concurrent fires.
 */
async runShutdownFromPoll(now: Date): Promise<void> {
  // ATOMIC check+set: no awaits between guard and assignment.
  if (this.inFlight) {
    console.log('[B-NEW-36][POLL_SHUTDOWN_SKIP] inFlight=true');
    return;
  }
  this.inFlight = true;
  try {
    // Post-mutex state recheck — cron may have fired between drift detection
    // and entry. State-already-matches → no-op, no audit/alert.
    const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
    if (xstockSpotScanner.getIsPaused()) {
      console.log('[B-NEW-36][POLL_SHUTDOWN_NOOP] scanner already paused');
      return;
    }
    console.warn('[B-NEW-36][POLL_SHUTDOWN_FIRE] poll-path catching up missed cron');
    console.log('[B-NEW-36][POLL_SKIP_PREWARM] reason=catchup');
    await this.runWeekendShutdownCore({
      scheduledFor: now, triggerSource: 'poll', runPrewarm: false,
    });
    await this.writeMissedCronAlert('shutdown', now);
  } finally {
    this.inFlight = false;
  }
}
```

### 3.f NEW — shared core (factored out of cron handlers)

```ts
private async runWeekendShutdownCore(opts: {
  scheduledFor: Date;
  triggerSource: TriggerSource;
  runPrewarm: boolean;
}): Promise<void> {
  const firedAt = new Date();
  const meta: AuditMeta = { insideWeekendWindow: true, trigger_source: opts.triggerSource };
  // ... prewarm IF opts.runPrewarm, else meta.prewarmStatus = 'skipped'
  // ... markAllXstockWeekendSuspended + xstockSpotScanner.pause()
  // ... writeAuditRow with meta carrying trigger_source
}
```

(Same shape for `runWeekendRestartCore`. Both factored to avoid duplication.)

### 3.g NEW — system-alert writer

```ts
private async writeMissedCronAlert(kind: 'shutdown' | 'restart', firedAt: Date): Promise<void> {
  try {
    await addAlert({
      triggers_at: firedAt,
      category: 'breakage',
      severity: 'warning',
      title: `B-NEW-36 weekend cron silently missed ${kind} fire — poll-path caught up`,
      body: '... full diagnostic body with audit table pointer ...',
      metadata: { batch: 'B-NEW-36-poll-reconcile', kind, fired_at_iso: firedAt.toISOString() },
    });
  } catch (err) {
    console.error(`[B-NEW-36][ALERT_WRITE_FAIL] ${kind}: ${err}`);
    // Don't rethrow — alert-write failure must not block reconcile.
  }
}
```

---

## 4. Embedded diff — `server/asset_classes/xstock_spot/scanner.ts`

### 4.a New consts

```ts
const SCAN_INTERVAL_SECONDS = 30;

// B-NEW-36 poll-reconcile (2026-05-31)
const WINDOW_RECONCILE_INTERVAL_TICKS = 30;
const SAMPLE_SYMBOL_FOR_WINDOW_CHECK = 'AAPL/USD';
```

### 4.b clockTickHandler — reconcile hook (BEFORE isPaused check)

```ts
this.clockTickHandler = async (tick: ClockTick) => {
  this.diag.lastTickAt = tick.timestamp;

  // B-NEW-36 poll-reconcile (2026-05-31): drift check runs REGARDLESS of
  // isPaused — must execute on Sun 8PM ET boundary when scanner is paused
  // but should be running.
  if (tick.tickNumber > 0 && tick.tickNumber % WINDOW_RECONCILE_INTERVAL_TICKS === 0) {
    await this.reconcileWindowState(new Date(tick.timestamp)).catch((err) => {
      console.error(`[B-NEW-36][POLL_RECONCILE_FAIL] tick=${tick.tickNumber}: ${err}`);
    });
  }

  if (this.isPaused) { /* ... unchanged ... */ }
  // ... rest unchanged
};
```

### 4.c NEW method — reconcileWindowState

```ts
/**
 * SSOT note: scanner.isPaused is the canonical signal. All three paths
 * (cron, boot-reconcile, poll-reconcile) pair pause/resume with trade-state
 * mutation via session-lifecycle-controller's shared core, so independent
 * drift between scanner state and trade state is closed.
 */
async reconcileWindowState(now: Date): Promise<void> {
  const insideWindow = !isXstockMarketOpenUTC(SAMPLE_SYMBOL_FOR_WINDOW_CHECK, now);
  const isPaused = this.isPaused;

  if (insideWindow && !isPaused) {
    console.warn('[B-NEW-36][POLL_RECONCILE_DRIFT] window=closed scanner=running → triggering shutdown');
    const { sessionLifecycleController } = await import('../../services/session-lifecycle-controller.js');
    await sessionLifecycleController.runShutdownFromPoll(now);
  } else if (!insideWindow && isPaused) {
    console.warn('[B-NEW-36][POLL_RECONCILE_DRIFT] window=open scanner=paused → triggering restart');
    const { sessionLifecycleController } = await import('../../services/session-lifecycle-controller.js');
    await sessionLifecycleController.runRestartFromPoll(now);
  }
}
```

---

## 5. Test suite (9 tests, all green locally)

```
✓ runShutdownFromPoll: window=closed + scanner=running → pauses, suspends, writes alert
✓ runRestartFromPoll: window=open + scanner=paused → resumes, restores, writes alert
✓ runShutdownFromPoll: scanner already paused → NO-OP (no alert, no audit)
✓ runRestartFromPoll: scanner already running → NO-OP (no alert, no audit)
✓ poll path SKIPS prewarm (catch-up semantics)
✓ audit row meta.trigger_source = "poll"
✓ inFlight mutex: concurrent runShutdownFromPoll invocations — second skips
✓ inFlight mutex MUST clear in finally even if inner work throws (Langston Q5)
✓ cron at HH:00:00 + poll at HH:00:30 — state-matches no-op, no double audit
```

Adjacent test suite: `b-new-36-lifecycle-controller.test.ts` (10 tests) — ALL GREEN, no regressions.
tsc baseline: 494 errors (unchanged).

---

## 6. Verification plan post-deploy

**Today (Sat May 31):**
1. Push → CI all-4-green → deploy
2. Confirm scanner BOOT log shows reconcile-tick interval registered
3. Confirm error.log shows no `[B-NEW-36][POLL_RECONCILE_FAIL]` for first 30 min
4. (Optional, low-risk) Manually set `mockInsideWindow=false` somehow on staging to force a drift detection? Better: rely on Sun 8PM ET boundary as the live test.

**Sun 31 May 8 PM ET = Mon 1 June 00:00 UTC (the actual test):**
1. Watch for one of:
   - `[B-NEW-36][WEEKEND_RESTART_START] trigger=cron` at 00:00:00 UTC ± seconds — cron fired normally
   - `[B-NEW-36][POLL_RECONCILE_DRIFT] window=open scanner=paused → triggering restart` at 00:00:30 UTC ± 30s, followed by `[B-NEW-36][POLL_RESTART_FIRE]` and `[B-NEW-36][WEEKEND_RESTART_START] trigger=poll` — cron missed, poll caught up
2. Either way: scheduled_tasks_audit must have a row for `weekend_restart` with meta.trigger_source = 'cron' OR 'poll'
3. If poll fired: system-alert row appears in /var/log/dawntrader/system-alerts.jsonl — surfaceable to next CC turn
4. Scanner resumes, trades restored from weekend_suspended → open, fresh scan cycles begin

---

## 7. Two questions for you

1. **Reconcile cadence — 30s.** Same as scan cadence. Cheap. Max recovery latency = 30s. Confirm sane vs alternatives (60s, 5min). My lean: stay at 30s, piggybacks existing tick.
2. **Manual drift-detection test on staging before Sun?** I could write a tiny `staging-trigger-reconcile.ts` script that calls `xstockSpotScanner.reconcileWindowState(now)` via injection, to prove the path fires end-to-end. Worth doing pre-Sun-fire, or sufficient to wait for the natural boundary? My lean: wait for natural boundary — manual injection adds complexity for marginal verification value.

---

*Reply ACK to push, ACK-W-REVISIONS with changes, or BLOCK. Reply target <800 tokens. Inbox path after SCP: `/home/langston/inbox/B-NEW-36-WEEKEND-CRON/B_NEW_36_WEEKEND_CRON_STEP4_REVIEW.md`*
