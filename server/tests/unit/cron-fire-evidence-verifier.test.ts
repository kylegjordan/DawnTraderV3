/**
 * B-NEW-49 + B-NEW-51 — cron-fire-evidence verifier tests.
 *
 * B-NEW-51 (2026-06-02): the verifier is now CADENCE-AWARE — it judges staleness
 * against a schedule's actual most-recent calendar occurrence (cron-parser
 * `.prev()`), not a fixed `lastFire + intervalSeconds × 1.5` window — and passes
 * a `dedupe_key` so a repeating stale condition collapses to one alert. These
 * tests use a fixed injected `now` + real cron-parser (cron-next-fire is NOT
 * mocked) so occurrences are deterministic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Fixed reference instant: Tuesday 2026-06-02 15:00:00Z.
const NOW = Date.parse('2026-06-02T15:00:00Z');
const PAST_BOOT_GRACE = NOW - 10 * 60 * 1000; // 10-min uptime → past the 5-min boot grace

let mockedLastFires: Map<string, Date | null> = new Map();
const dbCalls: any[] = [];

vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn(async (q: any) => {
      dbCalls.push(q);
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
  const { runVerification, _setProcessStartForTest } =
    await import('../../services/cron-fire-evidence-verifier.js');
  cronRegistry._resetForTest();
  _setProcessStartForTest(PAST_BOOT_GRACE); // default: past boot-grace
  return { cronRegistry, runVerification, _setProcessStartForTest };
}

function makeJob(name: string, expression: string, intervalSeconds: number, timezone = 'UTC') {
  return {
    name,
    task: {
      getNextRun: () => new Date(NOW + intervalSeconds * 1000),
      id: 'fake', cronExpression: '*' as any, options: undefined,
      start: vi.fn(), stop: vi.fn(), getStatus: vi.fn(() => 'scheduled'),
      destroy: vi.fn(), execute: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn(),
    } as any,
    expression,
    timezone,
    intervalSeconds,
    enabled: true,
  };
}

describe('B-NEW-51 cadence-aware cron-fire-evidence verifier', () => {
  it('STALE: weekly job whose most-recent occurrence has no fire-evidence', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    // Weekly Saturday 00:00 UTC. prev() from Tue 06-02 15:00Z = Sat 05-30 00:00Z.
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    // Last fire a week earlier (05-23) → the 05-30 occurrence was missed.
    mockedLastFires.set('weekly_sat', new Date('2026-05-23T00:00:00Z'));
    const report = await runVerification(NOW);
    expect(report.ok).toBe(false);
    expect(report.stale).toContain('weekly_sat');
    expect(alertCalls).toHaveLength(1);
    // Dedup key is keyed on the missed occurrence (2026-05-30T00:00:00.000Z).
    expect(alertCalls[0].dedupe_key).toBe('cron_stale:weekly_sat:2026-05-30T00:00:00.000Z');
    expect(alertCalls[0].metadata.reason).toBe('stale_fire_evidence');
  });

  it('HEALTHY: weekly job that fired on its most-recent occurrence (old interval×1.5 model would FALSE-flag mid-week)', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    // Fired just after the 05-30 occurrence → healthy even though it's now Tuesday
    // (3 days later, well past intervalSeconds×1.5 would have flagged it).
    mockedLastFires.set('weekly_sat', new Date('2026-05-30T00:05:00Z'));
    const report = await runVerification(NOW);
    expect(report.ok).toBe(true);
    expect(report.stale).toEqual([]);
    expect(alertCalls).toHaveLength(0);
  });

  it('STALE: never-fired weekly job (lastFire null) past boot-grace', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    // no entry in mockedLastFires → lastFire null
    const report = await runVerification(NOW);
    expect(report.ok).toBe(false);
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].metadata.reason).toBe('no_fires_ever');
  });

  it('GRACE skip: occurrence within FIRE_LATENCY_GRACE is not yet judged stale', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    // Every-minute job. At :30s the prev occurrence is :00 of this minute (30s ago)
    // → inside the 10-min fire-latency grace → skip even with a stale lastFire.
    cronRegistry.register(makeJob('every_min', '* * * * *', 60));
    mockedLastFires.set('every_min', new Date(NOW - 60 * 60 * 1000)); // 1h ago (stale)
    const report = await runVerification(NOW + 30 * 1000);
    expect(report.ok).toBe(true);
    expect(alertCalls).toHaveLength(0);
  });

  it('BOOT-GRACE: skips the whole run when uptime < boot grace', async () => {
    const { cronRegistry, runVerification, _setProcessStartForTest } = await loadModules();
    _setProcessStartForTest(NOW); // uptime 0 → in boot grace
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    mockedLastFires.set('weekly_sat', new Date('2026-05-23T00:00:00Z')); // would be stale
    const report = await runVerification(NOW);
    expect(report.ok).toBe(true);
    expect(alertCalls).toHaveLength(0);
  });

  it('INTERVAL-FALLBACK: unparseable expression falls back to interval×1.5', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('bad_expr', 'NOT A CRON', 300)); // prev → null
    mockedLastFires.set('bad_expr', new Date(NOW - 20 * 60 * 1000)); // 20min ago, grace=450s → stale
    const report = await runVerification(NOW);
    expect(report.ok).toBe(false);
    expect(report.stale).toContain('bad_expr');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].metadata.reason).toBe('stale_fire_evidence_interval_fallback');
  });

  it('skips disabled jobs', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    const job = makeJob('disabled', '0 0 * * 6', 604800);
    job.enabled = false;
    cronRegistry.register(job);
    mockedLastFires.set('disabled', new Date('2026-01-01T00:00:00Z')); // very stale
    const report = await runVerification(NOW);
    expect(report.ok).toBe(true);
    expect(alertCalls).toHaveLength(0);
  });

  it('returns ok=true when registry is empty', async () => {
    const { runVerification } = await loadModules();
    const report = await runVerification(NOW);
    expect(report.ok).toBe(true);
    expect(report.stale).toEqual([]);
  });

  it('RUNNING_ISSUES #167 regression-lock — JS-filter keeps only registered jobs', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('healthy_registered', '0 0 * * 6', 604800));
    mockedLastFires.set('healthy_registered', new Date('2026-05-30T00:05:00Z')); // healthy
    mockedLastFires.set('boot_state_reconciliation', new Date('2026-01-01T00:00:00Z')); // NOT registered
    mockedLastFires.set('weekend_shutdown', new Date('2026-01-01T00:00:00Z')); // NOT registered
    const report = await runVerification(NOW);
    expect(report.ok).toBe(true);
    expect(report.stale).toEqual([]);
    expect(alertCalls).toHaveLength(0);
  });

  it('does not throw if DB query fails (failure-safe)', async () => {
    const dbModule = await import('../../db.js');
    (dbModule.db.execute as any).mockImplementationOnce(async () => {
      throw new Error('SIMULATED_DB_FAIL');
    });
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('test', '0 0 * * 6', 604800));
    await expect(runVerification(NOW)).resolves.toBeDefined();
  });
});
