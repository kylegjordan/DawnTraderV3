/**
 * B-NEW-49 — cron-fire-evidence verifier tests.
 * Verifies the verifier alerts on stale schedules + respects boot-grace.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockedLastFires: Map<string, Date | null> = new Map();
const dbCalls: any[] = [];

vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn(async (q: any) => {
      dbCalls.push(q);
      // Synthesize the rows the verifier expects from the SQL query.
      const rows = Array.from(mockedLastFires.entries())
        .filter(([_, v]) => v !== null)
        .map(([task_name, last_fired_at]) => ({ task_name, last_fired_at }));
      return { rows };
    }),
  },
}));

const alertCalls: any[] = [];
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: vi.fn(async (opts: any) => {
    alertCalls.push(opts);
    return { id: 'mock-id', ...opts };
  }),
}));

beforeEach(() => {
  mockedLastFires = new Map();
  dbCalls.length = 0;
  alertCalls.length = 0;
  vi.resetModules();
});

async function loadModules() {
  const { cronRegistry } = await import('../../services/cron-registry.js');
  const { runVerification } = await import('../../services/cron-fire-evidence-verifier.js');
  cronRegistry._resetForTest();
  return { cronRegistry, runVerification };
}

function makeJob(name: string, intervalSeconds: number) {
  return {
    name,
    task: {
      getNextRun: () => new Date(Date.now() + intervalSeconds * 1000),
      id: 'fake', cronExpression: '*' as any, options: undefined,
      start: vi.fn(), stop: vi.fn(), getStatus: vi.fn(() => 'scheduled'),
      destroy: vi.fn(), execute: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn(),
    } as any,
    expression: '0 * * * *',
    timezone: 'UTC',
    intervalSeconds,
    enabled: true,
  };
}

describe('B-NEW-49 cron-fire-evidence verifier', () => {
  it('alerts when last fire is older than expected_by (intervalSeconds * 1.5)', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    // 5-min schedule (intervalSeconds=300; grace_window=450s).
    // Last fire 20min ago → stale by ~17min.
    cronRegistry.register(makeJob('stale_5min', 300));
    mockedLastFires.set('stale_5min', new Date(Date.now() - 20 * 60 * 1000));
    const report = await runVerification();
    expect(report.ok).toBe(false);
    expect(report.stale).toContain('stale_5min');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/silently stopped/);
  });

  it('reports healthy when last fire is within grace window', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('healthy', 300));
    mockedLastFires.set('healthy', new Date(Date.now() - 60 * 1000));  // 1min ago, well within
    const report = await runVerification();
    expect(report.ok).toBe(true);
    expect(report.stale).toEqual([]);
    expect(alertCalls).toHaveLength(0);
  });

  it('skips disabled jobs', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    const job = makeJob('disabled', 300);
    job.enabled = false;
    cronRegistry.register(job);
    mockedLastFires.set('disabled', new Date(Date.now() - 999 * 60 * 1000));  // very stale
    const report = await runVerification();
    expect(report.ok).toBe(true);
    expect(alertCalls).toHaveLength(0);
  });

  it('returns ok=true when registry is empty', async () => {
    const { runVerification } = await loadModules();
    const report = await runVerification();
    expect(report.ok).toBe(true);
    expect(report.stale).toEqual([]);
  });

  it('does not throw if DB query fails (failure-safe)', async () => {
    // Override the mock to throw for this test
    const dbModule = await import('../../db.js');
    (dbModule.db.execute as any).mockImplementationOnce(async () => {
      throw new Error('SIMULATED_DB_FAIL');
    });
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('test', 300));
    await expect(runVerification()).resolves.toBeDefined();
  });
});
