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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Fixed reference instant: Tuesday 2026-06-02 15:00:00Z.
const NOW = Date.parse('2026-06-02T15:00:00Z');
const PAST_BOOT_GRACE = NOW - 10 * 60 * 1000; // 10-min uptime → past the 5-min boot grace

let mockedLastFires: Map<string, Date | null> = new Map();
let mockedCandidateSucceeded: Map<string, boolean> = new Map();
let legacyWindowSensitiveNames: Set<string> = new Set();
let queuedCandidateSucceeded: boolean[] = [];
const dbCalls: any[] = [];

function sqlBooleanParams(value: unknown): boolean[] {
  if (typeof value === 'boolean') return [value];
  if (Array.isArray(value)) return value.flatMap(sqlBooleanParams);
  if (value && typeof value === 'object' && Array.isArray((value as any).queryChunks)) {
    return (value as any).queryChunks.flatMap(sqlBooleanParams);
  }
  return [];
}

vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn(async (q: any) => {
      dbCalls.push(q);
      const legacyWindow = sqlBooleanParams(q)[0] ?? false;
      const queuedResult = queuedCandidateSucceeded.shift();
      const taskNames = new Set([
        ...mockedLastFires.keys(),
        ...mockedCandidateSucceeded.keys(),
        ...legacyWindowSensitiveNames,
      ]);
      const rows = Array.from(taskNames).map((task_name) => ({
        task_name,
        last_scheduled_for: mockedLastFires.get(task_name) ?? null,
        candidate_succeeded: queuedResult ?? (
          legacyWindowSensitiveNames.has(task_name)
            ? legacyWindow
            : mockedCandidateSucceeded.get(task_name) ?? false
        ),
      }));
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

const verifierLockCalls: Array<{ jobName: string }> = [];
let failVerifierLockOnce = false;
vi.mock('../../services/cron-occurrence-runner.js', () => ({
  cronOccurrenceRunner: {
    runVerifierLocked: vi.fn(async (jobName: string, run: () => Promise<unknown>) => {
      verifierLockCalls.push({ jobName });
      if (failVerifierLockOnce) {
        failVerifierLockOnce = false;
        throw new Error('simulated verifier lock session failure');
      }
      return run();
    }),
  },
}));

beforeEach(() => {
  mockedLastFires = new Map();
  mockedCandidateSucceeded = new Map();
  legacyWindowSensitiveNames = new Set();
  queuedCandidateSucceeded = [];
  dbCalls.length = 0;
  alertCalls.length = 0;
  verifierLockCalls.length = 0;
  failVerifierLockOnce = false;
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
  it('uses successful scheduled boundaries from both completion stores, not fired_at or error rows', () => {
    const source = readFileSync(resolve('server/services/cron-fire-evidence-verifier.ts'), 'utf8');
    expect(source).toMatch(/SELECT task_name,[\s\S]*?scheduled_for,[\s\S]*?FROM scheduled_tasks_audit\s+WHERE status = 'success'/);
    expect(source).toMatch(/SELECT job_name AS task_name,[\s\S]*?scheduled_for,[\s\S]*?FROM scheduled_job_occurrences\s+WHERE status = 'succeeded'/);
    expect(source).toMatch(/MAX\(successful_boundaries\.scheduled_for\) AS last_scheduled_for/);
    expect(source).toMatch(/successful_boundaries\.scheduled_for = candidates\.candidate_scheduled_for/);
    expect(source).toMatch(/AS candidate_succeeded/);
    expect(source).not.toMatch(/SELECT task_name,\s*MAX\(fired_at\)/);
  });

  it('maps only pre-boot legacy cron rows inside the exact candidate calendar partition', () => {
    const source = readFileSync(resolve('server/services/cron-fire-evidence-verifier.ts'), 'utf8');
    expect(source).toMatch(/'audit'::text AS evidence_source/);
    expect(source).toMatch(/meta->>'occurrence_id' AS occurrence_id/);
    expect(source).toMatch(/meta->>'trigger_source' AS trigger_source/);
    expect(source).toMatch(/successful_boundaries\.evidence_source = 'audit'/);
    expect(source).toMatch(/successful_boundaries\.occurrence_id IS NULL/);
    expect(source).toMatch(/successful_boundaries\.trigger_source = 'cron'/);
    expect(source).toMatch(/successful_boundaries\.scheduled_for = candidates\.candidate_scheduled_for[\s\S]*?successful_boundaries\.evidence_source = 'occurrence'/);
    expect(source).toMatch(/successful_boundaries\.evidence_source = 'audit'[\s\S]*?successful_boundaries\.occurrence_id IS NOT NULL[\s\S]*?successful_boundaries\.trigger_source IN \('cron', 'missed_catchup'\)/);
    expect(source).toMatch(/successful_boundaries\.scheduled_for >= candidates\.candidate_scheduled_for/);
    expect(source).toMatch(/successful_boundaries\.scheduled_for < candidates\.candidate_next_scheduled_for/);
    expect(source).not.toMatch(/successful_boundaries\.scheduled_for <= candidates\.candidate_next_scheduled_for/);
    expect(source.match(/allowLegacyWindow: [^\n]*processStartMs/g)).toHaveLength(2);
  });

  it('accepts pre-boot legacy evidence through the production initial read', async () => {
    const jobName = 'legacy_preboot_initial';
    legacyWindowSensitiveNames.add(jobName);
    mockedLastFires.set(jobName, new Date('2026-06-02T14:50:00.123Z'));
    const { cronRegistry, runVerification, _setProcessStartForTest } = await loadModules();
    // The mature 14:50 occurrence predates this 14:55 process start. At 15:00
    // the process is exactly past boot grace, so the verifier must judge it.
    _setProcessStartForTest(Date.parse('2026-06-02T14:55:00Z'));
    cronRegistry.register(makeJob(jobName, '*/5 * * * *', 300));

    const report = await runVerification(NOW);

    expect(report).toEqual({ ok: true, stale: [] });
    expect(dbCalls).toHaveLength(1);
    expect(dbCalls.map(sqlBooleanParams)).toEqual([[true]]);
    expect(verifierLockCalls).toHaveLength(0);
    expect(alertCalls).toHaveLength(0);
  });

  it('accepts pre-boot legacy evidence through the production locked recheck', async () => {
    const jobName = 'legacy_preboot_locked';
    legacyWindowSensitiveNames.add(jobName);
    mockedLastFires.set(jobName, new Date('2026-06-02T14:50:00.123Z'));
    queuedCandidateSucceeded.push(false); // first read is stale; locked read sees the legacy row
    const { cronRegistry, runVerification, _setProcessStartForTest } = await loadModules();
    _setProcessStartForTest(Date.parse('2026-06-02T14:55:00Z'));
    cronRegistry.register(makeJob(jobName, '*/5 * * * *', 300));

    const report = await runVerification(NOW);

    expect(report).toEqual({ ok: true, stale: [] });
    expect(dbCalls).toHaveLength(2);
    expect(dbCalls.map(sqlBooleanParams)).toEqual([[true], [true]]);
    expect(verifierLockCalls).toEqual([{ jobName }]);
    expect(alertCalls).toHaveLength(0);
  });

  it('rejects post-boot legacy-shaped evidence through both production reads', async () => {
    const jobName = 'legacy_postboot_rejected';
    legacyWindowSensitiveNames.add(jobName);
    mockedLastFires.set(jobName, new Date('2026-06-02T14:50:00.123Z'));
    const { cronRegistry, runVerification, _setProcessStartForTest } = await loadModules();
    // The 14:50 occurrence is after this process started at 14:45, so the
    // callback-time compatibility arm must remain closed in both reads.
    _setProcessStartForTest(Date.parse('2026-06-02T14:45:00Z'));
    cronRegistry.register(makeJob(jobName, '*/5 * * * *', 300));

    const report = await runVerification(NOW);

    expect(report).toEqual({ ok: false, stale: [jobName] });
    expect(dbCalls).toHaveLength(2);
    expect(dbCalls.map(sqlBooleanParams)).toEqual([[false], [false]]);
    expect(verifierLockCalls).toEqual([{ jobName }]);
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].dedupe_key).toBe(
      `cron_stale:${jobName}:2026-06-02T14:50:00.000Z`,
    );
  });

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
    expect(alertCalls[0].one_shot).toBe(true);
    expect(verifierLockCalls).toEqual([{ jobName: 'weekly_sat' }]);
  });

  it('HEALTHY: weekly job that fired on its most-recent occurrence (old interval×1.5 model would FALSE-flag mid-week)', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    // The exact 05-30 scheduled identity succeeded → healthy even though it's now Tuesday
    // (3 days later, well past intervalSeconds×1.5 would have flagged it).
    mockedLastFires.set('weekly_sat', new Date('2026-05-30T00:00:00Z'));
    mockedCandidateSucceeded.set('weekly_sat', true);
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

  it('judges the newest mature boundary while newer occurrences remain inside grace', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    // At 15:00:30 the 15:00 occurrence is still in grace, but 14:50 is mature
    // and must be judged instead of restarting grace at 15:00.
    cronRegistry.register(makeJob('every_min', '* * * * *', 60));
    mockedLastFires.set('every_min', new Date(NOW - 60 * 60 * 1000)); // 1h ago (stale)
    const report = await runVerification(NOW + 30 * 1000);
    expect(report.ok).toBe(false);
    expect(report.stale).toContain('every_min');
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].dedupe_key).toBe('cron_stale:every_min:2026-06-02T14:50:00.000Z');
  });

  it.each([
    'feed_integrity_cron',
    'xstock_qd_probe_cron',
  ])('requires success at the mature five-minute boundary for %s', async (jobName) => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob(jobName, '*/5 * * * *', 300));

    // At 15:00, 14:50 is the newest occurrence whose ten-minute evidence
    // window has elapsed. A 14:45 success cannot certify it.
    mockedLastFires.set(jobName, new Date('2026-06-02T14:45:00Z'));
    const staleReport = await runVerification(NOW);
    expect(staleReport.ok).toBe(false);
    expect(staleReport.stale).toContain(jobName);
    expect(alertCalls.at(-1)?.dedupe_key).toBe(
      `cron_stale:${jobName}:2026-06-02T14:50:00.000Z`,
    );

    // A later success is a different immutable occurrence and cannot erase the
    // missing 14:50 identity.
    alertCalls.length = 0;
    mockedLastFires.set(jobName, new Date('2026-06-02T14:55:00Z'));
    const laterReport = await runVerification(NOW);
    expect(laterReport.ok).toBe(false);
    expect(laterReport.stale).toContain(jobName);
    expect(alertCalls.at(-1)?.dedupe_key).toBe(
      `cron_stale:${jobName}:2026-06-02T14:50:00.000Z`,
    );

    // The exact mature boundary is sufficient; no newer-in-grace occurrence
    // is required and no stale alert is offered.
    alertCalls.length = 0;
    mockedLastFires.set(jobName, new Date('2026-06-02T14:50:00Z'));
    mockedCandidateSucceeded.set(jobName, true);
    const healthyReport = await runVerification(NOW);
    expect(healthyReport).toEqual({ ok: true, stale: [] });
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
    expect(alertCalls[0].one_shot).toBeUndefined();
  });

  it('re-offers the reusable no-prev-parse fallback after an earlier episode can resolve', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('bad_expr', 'NOT A CRON', 300));

    await runVerification(NOW);
    await runVerification(NOW + 15 * 60 * 1000);

    expect(alertCalls).toHaveLength(2);
    expect(alertCalls.map((call) => call.dedupe_key)).toEqual([
      'cron_stale:bad_expr:no_prev_parse',
      'cron_stale:bad_expr:no_prev_parse',
    ]);
    expect(alertCalls.every((call) => call.one_shot === undefined)).toBe(true);
  });

  it('rechecks under the job lock and suppresses a stale read after natural success', async () => {
    const dbModule = await import('../../db.js');
    (dbModule.db.execute as any).mockResolvedValueOnce({
      rows: [{
        task_name: 'weekly_sat',
        last_scheduled_for: new Date('2026-05-23T00:00:00Z'),
        candidate_succeeded: false,
      }],
    });
    mockedLastFires.set('weekly_sat', new Date('2026-05-30T00:00:00Z'));
    mockedCandidateSucceeded.set('weekly_sat', true);
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));

    const report = await runVerification(NOW);

    expect(report).toEqual({ ok: true, stale: [] });
    expect(verifierLockCalls).toEqual([{ jobName: 'weekly_sat' }]);
    expect(alertCalls).toHaveLength(0);
  });

  it('reports a failed verifier lock as blind, then retries independently and alerts after recovery', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    mockedLastFires.set('weekly_sat', new Date('2026-05-23T00:00:00Z'));
    failVerifierLockOnce = true;

    const failed = await runVerification(NOW);
    expect(failed).toEqual({
      ok: false,
      stale: [],
      skipped: 'locked_recheck_fail',
      blind: ['weekly_sat'],
    });
    expect(alertCalls).toHaveLength(0);

    const recovered = await runVerification(NOW + 1);
    expect(recovered).toEqual({ ok: false, stale: ['weekly_sat'] });
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].dedupe_key).toBe('cron_stale:weekly_sat:2026-05-30T00:00:00.000Z');
    expect(verifierLockCalls).toEqual([{ jobName: 'weekly_sat' }, { jobName: 'weekly_sat' }]);
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
    mockedLastFires.set('healthy_registered', new Date('2026-05-30T00:00:00Z')); // exact occurrence healthy
    mockedCandidateSucceeded.set('healthy_registered', true);
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
    // B-CRON-VERIFIER-QUERY-FAIL (#1211): the assertion this test never made — a failed read pages nothing.
    expect(alertCalls).toHaveLength(0);
  });
});

// B-CRON-VERIFIER-QUERY-FAIL (row 59g2, #1211): a failed history read is a skipped run, not "every job never fired".
// Each no-alert test has its minting twin — the never-fired fixture above, verbatim — so a pass cannot come from an
// empty registry or a job inside the latency grace.
describe('B-CRON-VERIFIER-QUERY-FAIL — a failed read is skipped, and a run of them says the verifier is blind', () => {
  // Queue n one-shot throws; later calls fall through to the factory's own read (Langston C-10: no restore, so a
  // "restored" mock can never quietly become a successful-but-EMPTY read — the very conflation this batch removes).
  const failNextReads = async (n: number) => {
    const dbModule = await import('../../db.js');
    for (let i = 0; i < n; i++) {
      (dbModule.db.execute as any).mockImplementationOnce(async () => { throw new Error('Query read timeout'); });
    }
  };
  const staleAlerts = () => alertCalls.filter((a) => String(a.dedupe_key).startsWith('cron_stale:'));
  const blindAlerts = () => alertCalls.filter((a) => String(a.dedupe_key).startsWith('cron_verifier_blind:'));
  const HEALTHY_FIRE = new Date('2026-05-30T00:00:00Z'); // the weekly_sat fixture's exact scheduled identity

  it('one failed read: no cron_stale page, and the run reports skipped', async () => {
    await failNextReads(1);
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    const report = await runVerification(NOW);
    expect(report).toEqual({ ok: true, stale: [], skipped: 'query_fail' });
    expect(alertCalls).toHaveLength(0);
  });

  it('its minting twin: the same fixture with the read working DOES page no_fires_ever', async () => {
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    const report = await runVerification(NOW);
    expect(report.ok).toBe(false);
    expect(staleAlerts()).toHaveLength(1);
    expect(staleAlerts()[0].metadata.reason).toBe('no_fires_ever');
  });

  it('four consecutive failed reads mint one blind alert (category breakage, a floor not a count); a fifth adds no new key', async () => {
    await failNextReads(5);
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    for (let i = 0; i < 3; i++) await runVerification(NOW + i * 900_000);
    expect(blindAlerts()).toHaveLength(0);
    await runVerification(NOW + 3 * 900_000);
    expect(blindAlerts()).toHaveLength(1);
    const blind = blindAlerts()[0];
    expect(blind.dedupe_key).toBe(`cron_verifier_blind:${new Date(NOW).toISOString()}`);
    expect(blind.category).toBe('breakage');
    expect(blind.title).toMatch(/at least 4 consecutive/);
    expect(blind.body).toMatch(/live count is in the \[CRON-FIRE-VERIFIER\]\[SKIPPED_QUERY_FAIL\]/);
    expect(blind.body).toContain('one check every 15 minutes'); // interpolated from VERIFIER_INTERVAL_MS, not a literal
    expect(blind.body).toMatch(/NEVER ACK/);
    // C-8: the fifth skip calls addAlert again with the SAME key (the dedupe keeps one row) — never a second episode.
    await runVerification(NOW + 4 * 900_000);
    expect(blindAlerts()).toHaveLength(2);                                   // `>=`: re-offered at skip 5 …
    expect(new Set(blindAlerts().map((a) => a.dedupe_key)).size).toBe(1);   // … under the same key (one row by dedupe)
    expect(staleAlerts()).toHaveLength(0);
  });

  it('a successful read resets the episode — asserted POSITIVELY (healthy, no alerts) — and four more failures are a new episode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const recovered = () => warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('[READ_RECOVERED]'));
    await failNextReads(3);
    const { cronRegistry, runVerification } = await loadModules();
    cronRegistry.register(makeJob('weekly_sat', '0 0 * * 6', 604800));
    mockedLastFires.set('weekly_sat', HEALTHY_FIRE);
    mockedCandidateSucceeded.set('weekly_sat', true);
    for (let i = 0; i < 3; i++) await runVerification(NOW + i * 900_000);
    const back = await runVerification(NOW + 3 * 900_000); // the read is back (falls through to the factory)
    expect(back).toEqual({ ok: true, stale: [] });          // a real, non-empty read judged the job healthy
    expect(alertCalls).toHaveLength(0);                       // three skips + a good read never escalate
    // The recovery line: once, on the good read, naming the episode (stderr, beside the SKIPPED lines).
    expect(recovered()).toEqual([
      `[CRON-FIRE-VERIFIER][READ_RECOVERED] after=3 consecutive skips since=${new Date(NOW).toISOString()} total_since_boot=3`,
    ]);
    await runVerification(NOW + 3 * 900_000 + 1);             // its twin: a good read with no skips before it
    expect(recovered()).toHaveLength(1);                      // … prints no recovery line
    const later = NOW + 4 * 900_000;
    await failNextReads(4);
    for (let i = 0; i < 4; i++) await runVerification(later + i * 900_000);
    expect(blindAlerts().map((a) => a.dedupe_key)).toEqual([`cron_verifier_blind:${new Date(later).toISOString()}`]);
    expect(staleAlerts()).toHaveLength(0);
    expect(blindAlerts()[0].body).toMatch(/\[CRON-FIRE-VERIFIER\]\[READ_RECOVERED\] line/);
    warn.mockRestore();
  });
});
