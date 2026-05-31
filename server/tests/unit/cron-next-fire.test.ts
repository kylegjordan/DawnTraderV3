/**
 * B-NEW-50 — cron-next-fire regression-lock (RUNNING_ISSUES #165).
 *
 * Locks the correct next-fire computation against node-cron 4.2.1's broken
 * getNextRun(), which returned a future Jan-1st (e.g. 2027-01-02) for any
 * day-of-week schedule whose next hit was >= ~2 days out. Every assertion
 * here would FAIL against the old node-cron getNextRun() path.
 */

import { describe, it, expect, vi } from 'vitest';
import { computeNextFire } from '../../services/cron-next-fire.js';

describe('B-NEW-50 cron-next-fire (RUNNING_ISSUES #165 regression-lock)', () => {
  it('weekend_shutdown (Fri 8PM ET) from a Wednesday → imminent 2026 Friday, NOT 2027', () => {
    const next = computeNextFire('0 20 * * 5', 'America/New_York', new Date('2026-06-03T12:00:00Z'));
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-06-06T00:00:00.000Z'); // Fri 2026-06-05 20:00 EDT
    expect(next!.getUTCFullYear()).toBe(2026); // node-cron getNextRun() returned 2027 here
  });

  it('weekend_restart (Sun 8PM ET) from a Friday → imminent 2026 Sunday', () => {
    const next = computeNextFire('0 20 * * 0', 'America/New_York', new Date('2026-06-05T12:00:00Z'));
    expect(next!.toISOString()).toBe('2026-06-08T00:00:00.000Z'); // Sun 2026-06-07 20:00 EDT
    expect(next!.getUTCFullYear()).toBe(2026);
  });

  it('Tue 8PM ET from a Sunday → imminent 2026 Tuesday (node-cron returned 2030)', () => {
    const next = computeNextFire('0 20 * * 2', 'America/New_York', new Date('2026-05-31T22:00:00Z'));
    expect(next!.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(next!.getUTCFullYear()).toBe(2026);
  });

  it('Thu 8PM UTC from a Monday → imminent 2026 Thursday (node-cron returned 2032)', () => {
    const next = computeNextFire('0 20 * * 4', 'UTC', new Date('2026-06-01T08:00:00Z'));
    expect(next!.toISOString()).toBe('2026-06-04T20:00:00.000Z');
    expect(next!.getUTCFullYear()).toBe(2026);
  });

  it('6-field (seconds) day-of-week schedule resolves correctly (Langston gap #1)', () => {
    // 6-field: sec=30 min=0 hour=20 dow=5 → Fri 2026-06-05 20:00:30 EDT.
    const next = computeNextFire('30 0 20 * * 5', 'America/New_York', new Date('2026-06-03T12:00:00Z'));
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-06-06T00:00:30.000Z');
    expect(next!.getUTCFullYear()).toBe(2026);
  });

  it('undefined timezone does not throw and returns a Date (Langston gap #2)', () => {
    // Exact ISO is host-local-tz dependent; lock only type + that it is the imminent year.
    const next = computeNextFire('0 20 * * 5', undefined, new Date('2026-06-03T12:00:00Z'));
    expect(next).not.toBeNull();
    expect(next instanceof Date).toBe(true);
    expect(next!.getUTCFullYear()).toBe(2026);
  });

  it('returns null (failure-safe) on an unparseable expression', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const next = computeNextFire('not a cron expression', 'UTC');
    expect(next).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('interval schedule (every 5 min) also resolves within the interval', () => {
    const from = new Date('2026-06-01T08:02:00Z');
    const next = computeNextFire('*/5 * * * *', 'UTC', from);
    expect(next!.toISOString()).toBe('2026-06-01T08:05:00.000Z');
  });
});
