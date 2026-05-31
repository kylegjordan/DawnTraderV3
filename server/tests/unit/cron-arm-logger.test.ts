/**
 * B-NEW-49 / B-NEW-50 — cron-arm-logger unit tests.
 * Verifies the canonical [CRON-REGISTRATION] log line shape and tagging.
 *
 * B-NEW-50 (RI #165): `next_fire` + warning tags are now driven by the
 * authoritative `computeNextFire()` (cron-parser), while node-cron's raw
 * `task.getNextRun()` is emitted only as the labelled `[UNTRUSTED]` diagnostic.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { RegisteredCronJob } from '../../services/cron-registry.js';
import type { ScheduledTask } from 'node-cron';

// Authoritative next-fire is computeNextFire — mock it (hoisted for vitest).
const { computeNextFireMock } = vi.hoisted(() => ({ computeNextFireMock: vi.fn() }));
vi.mock('../../services/cron-next-fire.js', () => ({
  computeNextFire: computeNextFireMock,
}));

import { logCronArm } from '../../services/cron-arm-logger.js';

function makeJob(opts: { rawNextRun?: Date | null | (() => never) }): RegisteredCronJob {
  const raw = opts.rawNextRun !== undefined ? opts.rawNextRun : new Date(Date.now() + 3600_000);
  const taskFn = typeof raw === 'function' ? raw : () => raw as Date | null;
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
  computeNextFireMock.mockReset();
  computeNextFireMock.mockReturnValue(new Date(Date.now() + 3600_000)); // default: future
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('B-NEW-49/50 cron-arm-logger', () => {
  it('logs [CRON-REGISTRATION] with computed next_fire ISO when next-run is in the future', () => {
    const future = new Date(Date.now() + 3600_000);
    computeNextFireMock.mockReturnValue(future);
    logCronArm(makeJob({ rawNextRun: future }));
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

  it('emits node-cron raw value as labelled [UNTRUSTED] diagnostic (B-NEW-50 Q-1)', () => {
    const computed = new Date(Date.now() + 3600_000);
    const raw = new Date('2027-01-02T00:00:00.000Z'); // the node-cron bug value
    computeNextFireMock.mockReturnValue(computed);
    logCronArm(makeJob({ rawNextRun: raw }));
    const line = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain(`raw_nodecron_next=${raw.toISOString()}`);
    expect(line).toContain('[UNTRUSTED ncv=4.2.1]');
    // The broken raw value must NOT have triggered any warning tag.
    expect(line).not.toContain('[WARNING_');
    expect(line).toContain(`next_fire=${computed.toISOString()}`);
  });

  it('tags WARNING_NULL_NEXT_RUN when computeNextFire returns null', () => {
    computeNextFireMock.mockReturnValue(null);
    logCronArm(makeJob({ rawNextRun: null }));
    const line = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain('next_fire=null');
    expect(line).toContain('[WARNING_NULL_NEXT_RUN]');
  });

  it('tags WARNING_PAST_NEXT_RUN when computeNextFire returns a past timestamp', () => {
    const past = new Date(Date.now() - 60_000);
    computeNextFireMock.mockReturnValue(past);
    logCronArm(makeJob({ rawNextRun: past }));
    const line = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain(`next_fire=${past.toISOString()}`);
    expect(line).toContain('[WARNING_PAST_NEXT_RUN]');
  });

  it('handles raw getNextRun throwing — logs error, tags raw as threw, authoritative unaffected', () => {
    const computed = new Date(Date.now() + 3600_000);
    computeNextFireMock.mockReturnValue(computed);
    logCronArm(makeJob({ rawNextRun: (() => { throw new Error('simulated'); }) as any }));
    const logLine = logSpy.mock.calls.map((c) => c[0]).join('\n');
    const errorLine = errorSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(errorLine).toContain('raw getNextRun() threw');
    expect(errorLine).toContain('simulated');
    expect(logLine).toContain('raw_nodecron_next=threw');
    expect(logLine).toContain(`next_fire=${computed.toISOString()}`);
    expect(logLine).not.toContain('[WARNING_'); // authoritative path was fine
  });
});
