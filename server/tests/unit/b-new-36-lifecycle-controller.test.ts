/**
 * B-NEW-36 sub-batch (b) — Off-hours session-lifecycle controller tests.
 *   ★ B-NEW-52 (2026-06-06): the fire-once weekend node-cron was RETIRED. The
 *     30s poll-reconcile is the single driver. Tests that asserted the weekend
 *     CRONS were registered / fired have been replaced with the reconcile-path
 *     equivalents (see b-new-36-poll-reconciliation.test.ts for the full
 *     poll-path suite). This file now covers boot reconciliation + that init()
 *     registers NO scheduled timers.
 *
 * Verifies:
 *   - Boot-time inside-window detection drives scanner.pause() + bulk-suspend.
 *   - Boot-time outside-window detection drives scanner.resume() (if paused)
 *     + bulk-unsuspend.
 *   - init() registers NO node-cron timers (B-NEW-52 retirement).
 *   - Audit row written on boot reconciliation.
 *   - Tear-down is idempotent (no scheduled tasks to stop).
 *
 * Mocks: db, scanner, vts-runner Map accessor, prewarm, market-hours predicate,
 * and node-cron itself (so we can assert it is NOT called).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock db.execute and capture SQL fragments + params. ──────────────────────
const dbCalls: Array<{ sql: string; params: any[] }> = [];
const dbExecute = vi.fn(async (q: any) => {
  // B-NEW-43 Phase 2 chunk 14 (2026-05-23): Drizzle's sql template tag
  // (per node_modules/drizzle-orm/sql/sql.js) pushes ALTERNATING StringChunk
  // objects + RAW param values into queryChunks. RAW values are NOT wrapped
  // in any Param object — they're just the value (string, number, Date,
  // etc.). To extract params: exclude StringChunk entries (those have
  // `.value: string[]`). Everything else IS a raw param.
  const chunks = (q?.queryChunks ?? []) as any[];
  const sqlText = chunks.map((c: any) => c?.value ?? c).join(' ');
  const isStringChunk = (c: any) =>
    c && typeof c === 'object' && Array.isArray(c.value);
  const params = chunks.filter((c: any) => !isStringChunk(c));
  dbCalls.push({ sql: sqlText, params });
  if (sqlText.toUpperCase().includes('SELECT COUNT')) {
    return { rows: [{ count: '0' }] } as any;
  }
  return { rows: [] } as any;
});
vi.mock('../../db.js', () => ({ db: { execute: (q: any) => dbExecute(q) } }));

// ── Mock market-hours predicate so tests control inside-window. ──────────────
let mockInsideWindow = false;
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockMarketOpenUTC: vi.fn((_symbol: string, _now?: Date) => !mockInsideWindow),
}));

// ── Mock the xStock scanner to record pause/resume/getIsPaused calls. ────────
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

// ── Mock vts-runner to return a deterministic Map for the controller. ───────
const fakeMap = new Map<string, { assetClass: string; state?: string }>();
vi.mock('../../services/vts-runner.js', () => ({
  getOpenVirtualTradesMap: vi.fn(() => fakeMap),
}));

// ── Mock vts-trade-persistence helpers. ──────────────────────────────────────
const suspendCalls: any[] = [];
const restoreCalls: any[] = [];
vi.mock('../../services/vts-trade-persistence.js', () => ({
  markAllXstockWeekendSuspended: vi.fn(async (m: any) => {
    suspendCalls.push(m);
    return { updated: 7 }; // arbitrary non-zero so we can assert it's threaded through
  }),
  unmarkAllXstockWeekendSuspended: vi.fn(async (m: any) => {
    restoreCalls.push(m);
    return { updated: 3 };
  }),
}));

// ── Mock the prewarm script — toggle to simulate failure for circuit-breaker test. ──
let prewarmShouldThrow = false;
vi.mock('../../../scripts/b-new-34b-prewarm-snapshot.js', () => ({
  runPrewarm: vi.fn(async () => {
    if (prewarmShouldThrow) {
      throw new Error('SIMULATED_PREWARM_FAILURE');
    }
    return {
      totalSeconds: 1,
      symbolsProcessed: 265,
      symbolsWithData: 260,
      symbolsEmpty: 5,
      symbolErrors: 0,
      totalBuckets: 15000,
      totalUpserts: 15000,
      dryRun: false,
    };
  }),
}));

// ── Mock node-cron so we can capture registrations and fire deterministically. ──
interface MockScheduledTask {
  expression: string;
  fn: (ctx: any) => Promise<void>;
  options: any;
  stopped: boolean;
}
const cronRegistrations: MockScheduledTask[] = [];
vi.mock('node-cron', () => ({
  schedule: vi.fn((expression: string, fn: any, options: any) => {
    const task: MockScheduledTask = { expression, fn, options, stopped: false };
    cronRegistrations.push(task);
    return {
      id: `mock-${cronRegistrations.length}`,
      name: options?.name,
      start: vi.fn(),
      stop: vi.fn(() => { task.stopped = true; }),
      getStatus: vi.fn(() => 'scheduled'),
      destroy: vi.fn(),
      execute: vi.fn(),
      getNextRun: vi.fn(() => new Date()),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
    };
  }),
  createTask: vi.fn(),
  validate: vi.fn(() => true),
  getTasks: vi.fn(() => new Map()),
  getTask: vi.fn(),
}));

// Reset all state between tests.
beforeEach(() => {
  dbCalls.length = 0;
  scannerCalls.length = 0;
  scannerIsPaused = false;
  fakeMap.clear();
  suspendCalls.length = 0;
  restoreCalls.length = 0;
  cronRegistrations.length = 0;
  prewarmShouldThrow = false;
  mockInsideWindow = false;
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

async function loadController() {
  // Re-import fresh so each test gets a clean singleton state.
  return await import('../../services/session-lifecycle-controller.js');
}

describe('B-NEW-36 — session-lifecycle-controller boot-time reconciliation', () => {
  it('inside-window boot pauses scanner + bulk-suspends trades + writes audit row', async () => {
    mockInsideWindow = true;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    expect(scannerCalls).toContain('pause');
    expect(suspendCalls).toHaveLength(1);
    expect(restoreCalls).toHaveLength(0);

    // Audit row written.
    const audit = dbCalls.find((c) => c.sql.includes('INSERT INTO scheduled_tasks_audit'));
    expect(audit).toBeTruthy();
    const taskName = audit?.params.find((p: any) => p === 'boot_state_reconciliation');
    expect(taskName).toBe('boot_state_reconciliation');

    mod.sessionLifecycleController.shutdown();
  });

  it('outside-window boot does not pause scanner + bulk-restores trades', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    expect(scannerCalls).not.toContain('pause');
    expect(restoreCalls).toHaveLength(1);
    expect(suspendCalls).toHaveLength(0);

    mod.sessionLifecycleController.shutdown();
  });

  it('outside-window boot resumes scanner if it was found paused', async () => {
    mockInsideWindow = false;
    scannerIsPaused = true; // pre-condition: prior pause not yet resumed
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    expect(scannerCalls).toContain('resume');
    mod.sessionLifecycleController.shutdown();
  });

  it('init is idempotent — second call returns without re-running', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();
    const firstCount = cronRegistrations.length;
    await mod.sessionLifecycleController.init();
    expect(cronRegistrations.length).toBe(firstCount);
    mod.sessionLifecycleController.shutdown();
  });
});

describe('B-NEW-52 — weekend node-cron retirement', () => {
  it('init() registers NO node-cron timers (weekend crons retired)', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    // The fire-once weekend crons are gone; the 30s poll-reconcile is the
    // single driver. init() must not call cron.schedule at all.
    expect(cronRegistrations).toHaveLength(0);

    mod.sessionLifecycleController.shutdown();
  });

  it('init() registers NO timers even inside the weekend window', async () => {
    mockInsideWindow = true;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    expect(cronRegistrations).toHaveLength(0);
    // Boot reconciliation still paused the scanner inside the window.
    expect(scannerCalls).toContain('pause');

    mod.sessionLifecycleController.shutdown();
  });
});

describe('B-NEW-36 / B-NEW-52 — pre-warm circuit-breaker (now on the poll path)', () => {
  it('pre-warm failure during poll-shutdown still suspends trades + pauses scanner', async () => {
    // Scanner running, window now closed → reconcile shutdown boundary.
    scannerIsPaused = false;
    mockInsideWindow = true;
    const mod = await loadController();
    suspendCalls.length = 0;
    scannerCalls.length = 0;
    dbCalls.length = 0;

    prewarmShouldThrow = true;
    await mod.sessionLifecycleController.runShutdownFromPoll(new Date('2026-05-22T00:00:00Z'));

    // Lifecycle work proceeded despite pre-warm failure.
    expect(suspendCalls).toHaveLength(1);
    expect(scannerCalls).toContain('pause');

    // Audit row recorded the failure.
    const audit = dbCalls.find((c) => c.sql.includes('INSERT INTO scheduled_tasks_audit'));
    expect(audit?.params).toContain('weekend_shutdown');
    expect(audit?.params).toContain('error');
    const errMsg = audit?.params.find(
      (p: any) => typeof p === 'string' && p.includes('SIMULATED_PREWARM_FAILURE'),
    );
    expect(errMsg).toBeTruthy();

    mod.sessionLifecycleController.shutdown();
  });

  it('pre-warm failure during poll-restart still resumes scanner + restores trades', async () => {
    // Scanner paused, window now open → reconcile restart boundary.
    scannerIsPaused = true;
    mockInsideWindow = false;
    const mod = await loadController();
    restoreCalls.length = 0;
    scannerCalls.length = 0;
    dbCalls.length = 0;

    prewarmShouldThrow = true;
    await mod.sessionLifecycleController.runRestartFromPoll(new Date('2026-05-25T00:00:00Z'));

    expect(scannerCalls).toContain('resume');
    expect(restoreCalls).toHaveLength(1);
    const audit = dbCalls.find((c) => c.sql.includes('INSERT INTO scheduled_tasks_audit'));
    expect(audit?.params).toContain('weekend_restart');
    expect(audit?.params).toContain('error');

    mod.sessionLifecycleController.shutdown();
  });

  it('poll-shutdown RUNS pre-warm (folded in from retired cron, B-NEW-52 Q2=b)', async () => {
    scannerIsPaused = false;
    mockInsideWindow = true;
    const mod = await loadController();
    dbCalls.length = 0;

    await mod.sessionLifecycleController.runShutdownFromPoll(new Date('2026-05-22T00:00:00Z'));

    const audit = dbCalls.find((c) =>
      c.sql.includes('INSERT INTO scheduled_tasks_audit') &&
      c.params.some((p: any) => p === 'weekend_shutdown'),
    );
    const metaParam = audit?.params.find(
      (p: any) => typeof p === 'string' && p.includes('prewarmStatus'),
    );
    // prewarm ran (success) → NOT 'skipped'.
    expect(metaParam).toContain('"prewarmStatus":"success"');
    expect(metaParam).not.toContain('"prewarmStatus":"skipped"');

    mod.sessionLifecycleController.shutdown();
  });
});

describe('B-NEW-52 — shutdown (no scheduled tasks)', () => {
  it('shutdown() is idempotent and there are no scheduled tasks to stop', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    // No crons were registered, so nothing to stop.
    expect(cronRegistrations).toHaveLength(0);
    expect(() => mod.sessionLifecycleController.shutdown()).not.toThrow();
    // Idempotent — second call doesn't throw.
    expect(() => mod.sessionLifecycleController.shutdown()).not.toThrow();
  });
});
