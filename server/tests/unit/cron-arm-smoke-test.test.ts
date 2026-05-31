/**
 * B-NEW-49 / B-NEW-50 — cron-arm smoke test tests.
 * Verifies classification logic + system-alert write on non-OK status.
 *
 * B-NEW-50 (RI #165): classification is now driven by the authoritative
 * `computeNextFire()` (cron-parser), not node-cron's broken `task.getNextRun()`.
 * Tests mock computeNextFire (keyed by expression) to drive each status.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { computeNextFireMock } = vi.hoisted(() => ({ computeNextFireMock: vi.fn() }));
vi.mock('../../services/cron-next-fire.js', () => ({
  computeNextFire: computeNextFireMock,
}));

const alertCalls: any[] = [];
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: vi.fn(async (opts: any) => {
    alertCalls.push(opts);
    return { id: 'mock-id', ...opts };
  }),
}));

// Map expression -> next-fire the mock should return for this test.
let nextFireByExpr: Record<string, Date | null> = {};

beforeEach(() => {
  alertCalls.length = 0;
  nextFireByExpr = {};
  computeNextFireMock.mockReset();
  computeNextFireMock.mockImplementation((expr: string) =>
    expr in nextFireByExpr ? nextFireByExpr[expr] : new Date(Date.now() + 60_000),
  );
  vi.resetModules();
});

async function loadModules() {
  const { cronRegistry } = await import('../../services/cron-registry.js');
  const { runSmokeTest } = await import('../../services/cron-arm-smoke-test.js');
  cronRegistry._resetForTest();
  return { cronRegistry, runSmokeTest };
}

function makeJob(name: string, expression: string, intervalSeconds = 3600) {
  return {
    name,
    task: {
      getNextRun: () => null,
      id: 'fake', cronExpression: '*' as any, options: undefined,
      start: vi.fn(), stop: vi.fn(), getStatus: vi.fn(() => 'scheduled'),
      destroy: vi.fn(), execute: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn(),
    } as any,
    expression,
    timezone: 'UTC',
    intervalSeconds,
    enabled: true,
  };
}

describe('B-NEW-49/50 cron-arm smoke test', () => {
  it('returns OK for all jobs when next_fire is within expected window', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    nextFireByExpr['expr_a'] = new Date(Date.now() + 1800_000); // 30min ahead, interval 1h
    nextFireByExpr['expr_b'] = new Date(Date.now() + 60_000);   // 1min ahead
    cronRegistry.register(makeJob('a', 'expr_a'));
    cronRegistry.register(makeJob('b', 'expr_b'));
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(true);
    expect(report.results.every((r) => r.status === 'OK')).toBe(true);
    expect(alertCalls).toHaveLength(0);
  });

  it('OK for a real weekly day-of-week schedule (the RI #165 false-positive is gone)', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    // weekend_shutdown: interval 7d; correct next-fire <= 7d out => within 2x interval => OK.
    nextFireByExpr['0 20 * * 5'] = new Date(Date.now() + 5 * 86400 * 1000); // 5 days ahead
    cronRegistry.register(makeJob('weekend_shutdown', '0 20 * * 5', 604800));
    const report = await runSmokeTest('test');
    expect(report.results[0].status).toBe('OK');
    expect(alertCalls).toHaveLength(0);
  });

  it('flags PAST_DUE when next_fire is in the past', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    nextFireByExpr['expr_past'] = new Date(Date.now() - 60_000);
    cronRegistry.register(makeJob('past', 'expr_past'));
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(false);
    expect(report.results[0].status).toBe('PAST_DUE');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/PAST_DUE/);
    expect(alertCalls[0].severity).toBe('warning');
  });

  it('flags TOO_FAR_FUTURE when next_fire exceeds 2x interval ahead', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    nextFireByExpr['expr_far'] = new Date(Date.now() + 5 * 3600 * 1000); // 5h vs 1h interval
    cronRegistry.register(makeJob('far', 'expr_far', 3600));
    const report = await runSmokeTest('test');
    expect(report.results[0].status).toBe('TOO_FAR_FUTURE');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/TOO_FAR_FUTURE/);
  });

  it('flags NULL_NEXT_RUN when computeNextFire returns null', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    nextFireByExpr['expr_null'] = null;
    cronRegistry.register(makeJob('null', 'expr_null'));
    const report = await runSmokeTest('test');
    expect(report.results[0].status).toBe('NULL_NEXT_RUN');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/NULL_NEXT_RUN/);
  });

  it('reports DISABLED without firing alert for disabled jobs', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    const disabledJob = makeJob('disabled_job', 'expr_disabled');
    disabledJob.enabled = false;
    cronRegistry.register(disabledJob);
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(true);
    expect(report.results[0].status).toBe('DISABLED');
    expect(alertCalls).toHaveLength(0);
  });

  it('aggregate ok=false if any job is non-OK + non-DISABLED', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    nextFireByExpr['expr_ok'] = new Date(Date.now() + 60_000);
    nextFireByExpr['expr_bad'] = null;
    cronRegistry.register(makeJob('ok', 'expr_ok'));
    cronRegistry.register(makeJob('bad', 'expr_bad'));
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(false);
  });
});
