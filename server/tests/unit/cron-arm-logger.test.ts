/**
 * B-NEW-49 — cron-arm-logger unit tests.
 * Verifies the canonical [CRON-REGISTRATION] log line shape and tagging.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { logCronArm } from '../../services/cron-arm-logger.js';
import type { RegisteredCronJob } from '../../services/cron-registry.js';
import type { ScheduledTask } from 'node-cron';

function makeJob(opts: { nextRun: Date | null | (() => never) }): RegisteredCronJob {
  const taskFn = typeof opts.nextRun === 'function'
    ? opts.nextRun
    : () => opts.nextRun as Date | null;
  return {
    name: 'unit_test_job',
    task: {
      id: 'fake',
      name: 'fake',
      cronExpression: '*' as any,
      options: undefined,
      getNextRun: taskFn,
      start: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn(() => 'scheduled'),
      destroy: vi.fn(),
      execute: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
    } as unknown as ScheduledTask,
    expression: '0 0 * * *',
    timezone: 'UTC',
    intervalSeconds: 86400,
    enabled: true,
  };
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('B-NEW-49 cron-arm-logger', () => {
  it('logs [CRON-REGISTRATION] with next_fire ISO when next-run is in the future', () => {
    const future = new Date(Date.now() + 3600_000);
    logCronArm(makeJob({ nextRun: future }));
    const line = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain('[CRON-REGISTRATION]');
    expect(line).toContain('job=unit_test_job');
    expect(line).toContain('expr=0 0 * * *');
    expect(line).toContain('tz=UTC');
    expect(line).toContain('interval_seconds=86400');
    expect(line).toContain(`next_fire=${future.toISOString()}`);
    expect(line).toContain('enabled=true');
    expect(line).not.toContain('[WARNING_');
  });

  it('tags WARNING_NULL_NEXT_RUN when getNextRun returns null', () => {
    logCronArm(makeJob({ nextRun: null }));
    const line = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain('next_fire=null');
    expect(line).toContain('[WARNING_NULL_NEXT_RUN]');
  });

  it('tags WARNING_PAST_NEXT_RUN when getNextRun returns a past timestamp', () => {
    const past = new Date(Date.now() - 60_000);
    logCronArm(makeJob({ nextRun: past }));
    const line = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain(`next_fire=${past.toISOString()}`);
    expect(line).toContain('[WARNING_PAST_NEXT_RUN]');
  });

  it('handles getNextRun throwing — logs error + uses null+WARNING_NULL_NEXT_RUN', () => {
    logCronArm(makeJob({ nextRun: (() => { throw new Error('simulated'); }) as any }));
    const logLine = logSpy.mock.calls.map((c) => c[0]).join('\n');
    const errorLine = errorSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(errorLine).toContain('getNextRun() threw');
    expect(errorLine).toContain('simulated');
    expect(logLine).toContain('next_fire=null');
    expect(logLine).toContain('[WARNING_NULL_NEXT_RUN]');
  });
});
