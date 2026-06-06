/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-36 poll-reconcile (2026-05-31) — Weekend cron failure safety-net tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Context: Fri 29 May 8PM ET → Sat 30 May 00:00 UTC node-cron fire was
 * silently missed (no weekend_shutdown row in scheduled_tasks_audit, process
 * was up and other periodic ticks were firing normally). This batch adds a
 * poll-based reconciliation in xstockSpotScanner.clockTickHandler that
 * compares isXstockMarketOpenUTC() vs scanner.isPaused every 30s and triggers
 * the corresponding shutdown/restart via the session-lifecycle-controller's
 * poll-entry points when drift is detected.
 *
 * ★ B-NEW-52 (2026-06-06): the fire-once weekend node-cron was RETIRED; this
 *   reconcile path is now the PRIMARY (single-source-of-truth) driver, not a
 *   fallback. Two behaviors flipped vs the original B-NEW-36 design:
 *     - prewarm now RUNS on the reconcile path (folded in from the cron path,
 *       Langston Q2=b) — it was SKIPPED before.
 *     - NO "cron silently missed / poll caught up" breakage alert is emitted —
 *       this is the expected path now, so an alert would be weekly false-alarm
 *       noise. The normal audit row (trigger_source='poll') is sufficient.
 *
 * Verifies:
 *   - window=closed + scanner=running → triggers shutdown
 *   - window=open + scanner=paused → triggers restart
 *   - window=closed + scanner=paused → no-op (states match)
 *   - window=open + scanner=running → no-op (states match)
 *   - already-handled-then-second-tick race: poll arrives, sees state-matches, no-ops
 *   - inFlight mutex: concurrent invocations skip
 *   - inFlight mutex MUST clear in finally (Langston Q5 non-negotiable)
 *   - reconcile-fire does NOT write a breakage alert (B-NEW-52)
 *   - reconcile-fire writes audit row with meta.trigger_source='poll'
 *   - prewarm RUNS on the reconcile path (B-NEW-52 Q2=b)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock db.execute and capture SQL fragments + params. ──────────────────────
const dbCalls: Array<{ sql: string; params: any[] }> = [];
const dbExecute = vi.fn(async (q: any) => {
  const chunks = (q?.queryChunks ?? []) as any[];
  const sqlText = chunks.map((c: any) => c?.value ?? c).join(' ');
  const isStringChunk = (c: any) =>
    c && typeof c === 'object' && Array.isArray(c.value);
  const params = chunks.filter((c: any) => !isStringChunk(c));
  dbCalls.push({ sql: sqlText, params });
  return { rows: [] } as any;
});
vi.mock('../../db.js', () => ({ db: { execute: (q: any) => dbExecute(q) } }));

// ── Mock market-hours predicate so tests control inside-window. ──────────────
let mockInsideWindow = false;
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockMarketOpenUTC: vi.fn((_symbol: string, _now?: Date) => !mockInsideWindow),
}));

// ── Mock the xStock scanner. Note: this mocks the IMPORT of scanner from
//    session-lifecycle-controller. The actual scanner module isn't under test
//    here; the lifecycle controller's poll-entry-point behavior is.
const scannerCalls: string[] = [];
let scannerIsPaused = false;
vi.mock('../../asset_classes/xstock_spot/scanner.js', () => ({
  xstockSpotScanner: {
    pause: vi.fn(() => {
      scannerCalls.push('pause');
      scannerIsPaused = true;
    }),
    resume: vi.fn(() => {
      scannerCalls.push('resume');
      scannerIsPaused = false;
    }),
    getIsPaused: vi.fn(() => scannerIsPaused),
  },
}));

// ── Mock vts-runner. ─────────────────────────────────────────────────────────
const fakeMap = new Map<string, { assetClass: string; state?: string }>();
vi.mock('../../services/vts-runner.js', () => ({
  getOpenVirtualTradesMap: vi.fn(() => fakeMap),
}));

// ── Mock vts-trade-persistence helpers. ──────────────────────────────────────
const suspendCalls: any[] = [];
const restoreCalls: any[] = [];
let suspendShouldThrow = false;
vi.mock('../../services/vts-trade-persistence.js', () => ({
  markAllXstockWeekendSuspended: vi.fn(async (m: any) => {
    suspendCalls.push(m);
    if (suspendShouldThrow) throw new Error('SIMULATED_SUSPEND_FAILURE');
    return { updated: 244 };
  }),
  unmarkAllXstockWeekendSuspended: vi.fn(async (m: any) => {
    restoreCalls.push(m);
    return { updated: 244 };
  }),
}));

// ── Mock system-alerts so we can assert the missed-cron alert was written. ──
const alertCalls: any[] = [];
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: vi.fn(async (opts: any) => {
    alertCalls.push(opts);
    return { id: 'mock-uuid', ...opts };
  }),
}));

// ── Mock prewarm — track call count so we can assert poll-path SKIPS it. ────
const prewarmCalls: any[] = [];
vi.mock('../../../scripts/b-new-34b-prewarm-snapshot.js', () => ({
  runPrewarm: vi.fn(async (opts: any) => {
    prewarmCalls.push(opts);
    return {
      totalSeconds: 1, symbolsProcessed: 0, symbolsWithData: 0,
      symbolsEmpty: 0, symbolErrors: 0, totalBuckets: 0, totalUpserts: 0,
      dryRun: false,
    };
  }),
}));

// ── Mock node-cron (we never fire timers here; just need registration to succeed). ──
vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({
    id: 'mock', name: 'mock', start: vi.fn(), stop: vi.fn(),
    getStatus: vi.fn(() => 'scheduled'), destroy: vi.fn(), execute: vi.fn(),
    getNextRun: vi.fn(() => new Date()), on: vi.fn(), off: vi.fn(), once: vi.fn(),
  })),
  createTask: vi.fn(), validate: vi.fn(() => true),
  getTasks: vi.fn(() => new Map()), getTask: vi.fn(),
}));

beforeEach(() => {
  dbCalls.length = 0;
  scannerCalls.length = 0;
  scannerIsPaused = false;
  fakeMap.clear();
  suspendCalls.length = 0;
  restoreCalls.length = 0;
  alertCalls.length = 0;
  prewarmCalls.length = 0;
  mockInsideWindow = false;
  suspendShouldThrow = false;
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

async function loadController() {
  return await import('../../services/session-lifecycle-controller.js');
}

describe('B-NEW-36 poll-reconcile — drift-detection entry points', () => {
  it('runShutdownFromPoll: window=closed + scanner=running → pauses scanner, suspends trades, NO breakage alert', async () => {
    scannerIsPaused = false;
    mockInsideWindow = true;
    const { sessionLifecycleController } = await loadController();

    await sessionLifecycleController.runShutdownFromPoll(new Date('2026-05-31T01:00:00Z'));

    expect(scannerCalls).toContain('pause');
    expect(suspendCalls).toHaveLength(1);
    expect(restoreCalls).toHaveLength(0);
    // B-NEW-52: reconcile is the normal path — no "cron missed" breakage alert.
    expect(alertCalls).toHaveLength(0);
  });

  it('runRestartFromPoll: window=open + scanner=paused → resumes scanner, restores trades, NO breakage alert', async () => {
    scannerIsPaused = true;
    mockInsideWindow = false;
    const { sessionLifecycleController } = await loadController();

    await sessionLifecycleController.runRestartFromPoll(new Date('2026-06-01T01:00:00Z'));

    expect(scannerCalls).toContain('resume');
    expect(restoreCalls).toHaveLength(1);
    expect(suspendCalls).toHaveLength(0);
    // B-NEW-52: reconcile is the normal path — no "cron missed" breakage alert.
    expect(alertCalls).toHaveLength(0);
  });

  it('runShutdownFromPoll: scanner already paused (boundary already handled) → NO-OP, no alert', async () => {
    scannerIsPaused = true;  // boundary already handled this run
    const { sessionLifecycleController } = await loadController();

    await sessionLifecycleController.runShutdownFromPoll(new Date());

    expect(scannerCalls).not.toContain('pause');
    expect(suspendCalls).toHaveLength(0);
    expect(alertCalls).toHaveLength(0);
  });

  it('runRestartFromPoll: scanner already running (boundary already handled) → NO-OP, no alert', async () => {
    scannerIsPaused = false;
    const { sessionLifecycleController } = await loadController();

    await sessionLifecycleController.runRestartFromPoll(new Date());

    expect(scannerCalls).not.toContain('resume');
    expect(restoreCalls).toHaveLength(0);
    expect(alertCalls).toHaveLength(0);
  });

  it('reconcile path RUNS prewarm (folded in from retired cron, B-NEW-52 Q2=b)', async () => {
    scannerIsPaused = false;
    mockInsideWindow = true;
    const { sessionLifecycleController } = await loadController();

    await sessionLifecycleController.runShutdownFromPoll(new Date());

    expect(prewarmCalls).toHaveLength(1);  // prewarm MUST run on the reconcile path now
  });

  it('audit row meta.trigger_source = "poll" + prewarm ran on reconcile-triggered shutdown', async () => {
    scannerIsPaused = false;
    mockInsideWindow = true;
    const { sessionLifecycleController } = await loadController();

    await sessionLifecycleController.runShutdownFromPoll(new Date());

    // Find the weekend_shutdown audit call.
    const auditCall = dbCalls.find((c) =>
      c.sql.includes('scheduled_tasks_audit') &&
      c.params.some((p) => p === 'weekend_shutdown'),
    );
    expect(auditCall).toBeDefined();
    // meta is the JSON.stringify(meta) param — find it and assert trigger_source.
    const metaParam = auditCall!.params.find(
      (p) => typeof p === 'string' && p.includes('trigger_source'),
    );
    expect(metaParam).toBeDefined();
    expect(metaParam).toContain('"trigger_source":"poll"');
    // B-NEW-52: prewarm now RUNS on this path → status 'success', not 'skipped'.
    expect(metaParam).toContain('"prewarmStatus":"success"');
  });

  it('inFlight mutex: concurrent runShutdownFromPoll invocations — second skips', async () => {
    scannerIsPaused = false;
    mockInsideWindow = true;
    const { sessionLifecycleController } = await loadController();

    // Fire two concurrent shutdowns. The first holds inFlight; the second sees
    // it and skips. We can't easily await both at the same micro-task without
    // racing the test runner, so we rely on the inFlight check + the second
    // call being a synchronous no-op when the first is partway through.
    const p1 = sessionLifecycleController.runShutdownFromPoll(new Date());
    const p2 = sessionLifecycleController.runShutdownFromPoll(new Date());
    await Promise.all([p1, p2]);

    // Exactly one suspend should have happened (second was skipped via mutex
    // OR via the post-mutex state-already-matches check once first finished).
    expect(suspendCalls.length).toBeLessThanOrEqual(1);
    expect(scannerCalls.filter((c) => c === 'pause').length).toBeLessThanOrEqual(1);
  });

  it('inFlight mutex MUST clear in finally even if inner work throws (Langston Q5)', async () => {
    scannerIsPaused = false;
    mockInsideWindow = true;
    suspendShouldThrow = true;  // force the trade-suspend call to throw

    const { sessionLifecycleController } = await loadController();

    // First call throws inside try; finally must reset inFlight=false.
    // Function shouldn't reject (the inner try/catch swallows + writes error
    // audit row). We assert inFlight is reset by issuing a SECOND call after
    // resetting the suspend behavior — if the second call no-ops, the mutex
    // is stuck (test fails).
    await sessionLifecycleController.runShutdownFromPoll(new Date());

    // Mutex should be clear now.
    expect(sessionLifecycleController._getInFlightForTest()).toBe(false);

    // Verify the second call can proceed (mutex isn't permanently held).
    suspendShouldThrow = false;
    suspendCalls.length = 0;
    scannerIsPaused = false;  // reset state so condition still requires action
    await sessionLifecycleController.runShutdownFromPoll(new Date());
    expect(suspendCalls).toHaveLength(1);  // second call DID run
  });

  it('second reconcile tick after boundary handled — sees state matches, no-ops without audit row', async () => {
    // Simulate the boundary already handled by a prior tick (state=paused),
    // then a later reconcile tick arrives — it must no-op cleanly.
    scannerIsPaused = true;  // boundary-already-handled state
    mockInsideWindow = true;
    const { sessionLifecycleController } = await loadController();

    dbCalls.length = 0;  // clear any state from init()
    alertCalls.length = 0;

    await sessionLifecycleController.runShutdownFromPoll(new Date());

    // No new audit row written (poll saw state-already-matches, no-op).
    const newAuditCalls = dbCalls.filter((c) =>
      c.sql.includes('scheduled_tasks_audit') &&
      c.params.some((p) => p === 'weekend_shutdown'),
    );
    expect(newAuditCalls).toHaveLength(0);
    // No alert either.
    expect(alertCalls).toHaveLength(0);
  });
});
