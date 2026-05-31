/**
 * B-NEW-49 — cron-arm smoke test tests.
 * Verifies classification logic + system-alert write on non-OK status.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const alertCalls: any[] = [];

vi.mock('../../services/system-alerts.js', () => ({
  addAlert: vi.fn(async (opts: any) => {
    alertCalls.push(opts);
    return { id: 'mock-id', ...opts };
  }),
}));

beforeEach(() => {
  alertCalls.length = 0;
  vi.resetModules();
});

async function loadModules() {
  const { cronRegistry } = await import('../../services/cron-registry.js');
  const { runSmokeTest } = await import('../../services/cron-arm-smoke-test.js');
  cronRegistry._resetForTest();
  return { cronRegistry, runSmokeTest };
}

function makeJob(name: string, nextRun: Date | null, intervalSeconds = 3600) {
  return {
    name,
    task: {
      getNextRun: () => nextRun,
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

describe('B-NEW-49 cron-arm smoke test', () => {
  it('returns OK for all jobs when next_fire is within expected window', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    cronRegistry.register(makeJob('a', new Date(Date.now() + 1800_000)));  // 30min ahead, interval 1h
    cronRegistry.register(makeJob('b', new Date(Date.now() + 60_000)));     // 1min ahead
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(true);
    expect(report.results.every((r) => r.status === 'OK')).toBe(true);
    expect(alertCalls).toHaveLength(0);
  });

  it('flags PAST_DUE when next_fire is in the past', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    cronRegistry.register(makeJob('past', new Date(Date.now() - 60_000)));
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(false);
    expect(report.results[0].status).toBe('PAST_DUE');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/PAST_DUE/);
    expect(alertCalls[0].severity).toBe('warning');
  });

  it('flags TOO_FAR_FUTURE when next_fire exceeds 2x interval ahead', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    // intervalSeconds=3600 (hourly), nextRun 5h ahead = far beyond 2x
    cronRegistry.register(makeJob('far', new Date(Date.now() + 5 * 3600 * 1000), 3600));
    const report = await runSmokeTest('test');
    expect(report.results[0].status).toBe('TOO_FAR_FUTURE');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/TOO_FAR_FUTURE/);
  });

  it('flags NULL_NEXT_RUN when getNextRun returns null', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    cronRegistry.register(makeJob('null', null));
    const report = await runSmokeTest('test');
    expect(report.results[0].status).toBe('NULL_NEXT_RUN');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].title).toMatch(/NULL_NEXT_RUN/);
  });

  it('reports DISABLED without firing alert for disabled jobs', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    const disabledJob = makeJob('disabled_job', null);
    disabledJob.enabled = false;
    cronRegistry.register(disabledJob);
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(true);  // disabled doesn't break ok
    expect(report.results[0].status).toBe('DISABLED');
    expect(alertCalls).toHaveLength(0);
  });

  it('aggregate ok=false if any job is non-OK + non-DISABLED', async () => {
    const { cronRegistry, runSmokeTest } = await loadModules();
    cronRegistry.register(makeJob('ok', new Date(Date.now() + 60_000)));
    cronRegistry.register(makeJob('bad', null));
    const report = await runSmokeTest('test');
    expect(report.ok).toBe(false);
  });
});
