/**
 * B-NEW-36 sub-batch (b) — Off-hours session-lifecycle controller tests.
 *
 * Verifies:
 *   - Boot-time inside-window detection drives scanner.pause() + bulk-suspend.
 *   - Boot-time outside-window detection drives scanner.resume() (if paused)
 *     + bulk-unsuspend.
 *   - Pre-warm failure does NOT abort the rest of the hook (circuit-breaker).
 *   - Audit row written on every fire (success path AND error path).
 *   - Scheduled timers are registered with the correct cron expressions
 *     and ET timezone.
 *   - Tear-down stops both scheduled tasks.
 *
 * Mocks: db, scanner, vts-runner Map accessor, prewarm, market-hours predicate,
 * and node-cron itself (so we can simulate timer fires deterministically
 * without real wall-clock waits).
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

  it('init is idempotent — second call returns without re-registering', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();
    const firstCount = cronRegistrations.length;
    await mod.sessionLifecycleController.init();
    expect(cronRegistrations.length).toBe(firstCount);
    mod.sessionLifecycleController.shutdown();
  });
});

describe('B-NEW-36 — scheduled timer registration', () => {
  it('registers Fri 8PM ET shutdown + Sun 8PM ET restart with America/New_York timezone', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    expect(cronRegistrations).toHaveLength(2);

    const fri = cronRegistrations.find((r) => r.expression === '0 20 * * 5');
    const sun = cronRegistrations.find((r) => r.expression === '0 20 * * 0');
    expect(fri).toBeTruthy();
    expect(sun).toBeTruthy();
    expect(fri?.options.timezone).toBe('America/New_York');
    expect(sun?.options.timezone).toBe('America/New_York');
    expect(fri?.options.noOverlap).toBe(true);
    expect(sun?.options.noOverlap).toBe(true);

    mod.sessionLifecycleController.shutdown();
  });

  it('Fri-shutdown fire suspends trades + pauses scanner + writes audit row', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();
    // Reset capture after boot reconciliation so we observe ONLY the fire.
    suspendCalls.length = 0;
    scannerCalls.length = 0;
    dbCalls.length = 0;

    const fri = cronRegistrations.find((r) => r.expression === '0 20 * * 5')!;
    await fri.fn({ triggeredAt: new Date('2026-05-22T00:00:00Z') });

    expect(suspendCalls).toHaveLength(1);
    expect(scannerCalls).toContain('pause');
    const audit = dbCalls.find((c) => c.sql.includes('INSERT INTO scheduled_tasks_audit'));
    expect(audit?.params).toContain('weekend_shutdown');
    expect(audit?.params).toContain('success');

    mod.sessionLifecycleController.shutdown();
  });

  it('Sun-restart fire resumes scanner + restores trades + writes audit row', async () => {
    mockInsideWindow = true;
    scannerIsPaused = true;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();
    restoreCalls.length = 0;
    scannerCalls.length = 0;
    dbCalls.length = 0;

    const sun = cronRegistrations.find((r) => r.expression === '0 20 * * 0')!;
    await sun.fn({ triggeredAt: new Date('2026-05-25T00:00:00Z') });

    expect(scannerCalls).toContain('resume');
    expect(restoreCalls).toHaveLength(1);
    const audit = dbCalls.find((c) => c.sql.includes('INSERT INTO scheduled_tasks_audit'));
    expect(audit?.params).toContain('weekend_restart');
    expect(audit?.params).toContain('success');

    mod.sessionLifecycleController.shutdown();
  });
});

describe('B-NEW-36 — pre-warm circuit-breaker', () => {
  it('pre-warm failure during Fri-shutdown still suspends trades + pauses scanner', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();
    suspendCalls.length = 0;
    scannerCalls.length = 0;
    dbCalls.length = 0;

    prewarmShouldThrow = true;
    const fri = cronRegistrations.find((r) => r.expression === '0 20 * * 5')!;
    await fri.fn({ triggeredAt: new Date('2026-05-22T00:00:00Z') });

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

  it('pre-warm failure during Sun-restart still resumes scanner + restores trades', async () => {
    mockInsideWindow = true;
    scannerIsPaused = true;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();
    restoreCalls.length = 0;
    scannerCalls.length = 0;
    dbCalls.length = 0;

    prewarmShouldThrow = true;
    const sun = cronRegistrations.find((r) => r.expression === '0 20 * * 0')!;
    await sun.fn({ triggeredAt: new Date('2026-05-25T00:00:00Z') });

    expect(scannerCalls).toContain('resume');
    expect(restoreCalls).toHaveLength(1);
    const audit = dbCalls.find((c) => c.sql.includes('INSERT INTO scheduled_tasks_audit'));
    expect(audit?.params).toContain('weekend_restart');
    expect(audit?.params).toContain('error');

    mod.sessionLifecycleController.shutdown();
  });
});

describe('B-NEW-36 — shutdown', () => {
  it('shutdown() stops both scheduled tasks and is idempotent', async () => {
    mockInsideWindow = false;
    const mod = await loadController();
    await mod.sessionLifecycleController.init();

    mod.sessionLifecycleController.shutdown();
    expect(cronRegistrations.every((r) => r.stopped)).toBe(true);

    // Idempotent — second call doesn't throw.
    expect(() => mod.sessionLifecycleController.shutdown()).not.toThrow();
  });
});
