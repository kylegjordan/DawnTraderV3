/**
 * B-NEW-49 — cron-registry unit tests.
 * Verifies registration, duplicate-rejection, and getter behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cronRegistry, type RegisteredCronJob } from '../../services/cron-registry.js';
import type { ScheduledTask } from 'node-cron';

function makeFakeTask(): ScheduledTask {
  return {
    id: 'fake',
    name: 'fake',
    cronExpression: '*' as any,
    options: undefined,
    getNextRun: vi.fn(() => new Date(Date.now() + 60_000)),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    getStatus: vi.fn(() => 'scheduled'),
    destroy: vi.fn(async () => {}),
    execute: vi.fn(async () => {}),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  } as unknown as ScheduledTask;
}

function makeJob(name: string): RegisteredCronJob {
  return {
    name,
    task: makeFakeTask(),
    expression: '0 0 * * *',
    timezone: 'UTC',
    intervalSeconds: 86400,
    enabled: true,
  };
}

describe('B-NEW-49 cron-registry', () => {
  beforeEach(() => {
    cronRegistry._resetForTest();
  });

  it('registers a job and returns it via get()', () => {
    const job = makeJob('test_job_1');
    cronRegistry.register(job);
    expect(cronRegistry.get('test_job_1')).toBe(job);
  });

  it('returns undefined for an unregistered name', () => {
    expect(cronRegistry.get('nonexistent')).toBeUndefined();
  });

  it('getAll() returns all registered jobs', () => {
    cronRegistry.register(makeJob('a'));
    cronRegistry.register(makeJob('b'));
    cronRegistry.register(makeJob('c'));
    expect(cronRegistry.getAll().map((j) => j.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('idempotent on duplicate registration — first wins, second ignored', () => {
    const first = makeJob('dup');
    const second = makeJob('dup');
    second.expression = '0 12 * * *';  // different expression to distinguish
    cronRegistry.register(first);
    cronRegistry.register(second);
    expect(cronRegistry.get('dup')).toBe(first);  // first preserved
    expect(cronRegistry._countForTest()).toBe(1);  // not two
  });

  it('_resetForTest clears the registry', () => {
    cronRegistry.register(makeJob('foo'));
    cronRegistry.register(makeJob('bar'));
    expect(cronRegistry._countForTest()).toBe(2);
    cronRegistry._resetForTest();
    expect(cronRegistry._countForTest()).toBe(0);
    expect(cronRegistry.getAll()).toEqual([]);
  });
});
