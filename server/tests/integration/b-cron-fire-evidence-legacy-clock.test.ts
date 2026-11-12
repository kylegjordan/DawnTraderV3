import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// B-CRON-MISSED-CATCHUP OBJ-6: execute the verifier's real SQL against the
// migrated CI database. Locally the suite skips when the test database is not
// available; CI must fail rather than silently skip.
const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const parsed = (() => {
  try { return new URL(RAW_DB_URL); } catch { return null; }
})();
const SAFE_TEST_DB = parsed !== null
  && ['localhost', '127.0.0.1'].includes(parsed.hostname)
  && parsed.pathname === '/test';

async function reachable(): Promise<boolean> {
  if (!SAFE_TEST_DB) return false;
  const client = new pg.Client({ connectionString: RAW_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const DB = await reachable();
if (process.env.CI && !DB) {
  throw new Error('B-CRON legacy-clock integration: the migrated CI test database is unreachable');
}

describe.skipIf(!DB)('B-CRON verifier legacy-clock compatibility on real Postgres', () => {
  const client = new pg.Client({ connectionString: RAW_DB_URL });
  const prefix = `b_cron_legacy_clock_${process.pid}_`;
  const job = (suffix: string) => `${prefix}${suffix}`;

  beforeAll(async () => {
    await client.connect();
    await client.query('DELETE FROM scheduled_tasks_audit WHERE task_name LIKE $1', [`${prefix}%`]);
    await client.query('DELETE FROM scheduled_job_occurrences WHERE job_name LIKE $1', [`${prefix}%`]);

    const auditRows: Array<[string, string, 'success' | 'error', Record<string, unknown>]> = [
      [job('legacy_inside'), '2026-06-02T14:50:00.123Z', 'success', { trigger_source: 'cron' }],
      [job('legacy_at_next'), '2026-06-02T14:55:00.000Z', 'success', { trigger_source: 'cron' }],
      [job('legacy_noncron'), '2026-06-02T14:50:00.123Z', 'success', { trigger_source: 'manual' }],
      [job('legacy_error'), '2026-06-02T14:50:00.123Z', 'error', { trigger_source: 'cron' }],
      [job('current_exact'), '2026-06-02T14:50:00.000Z', 'success', {
        trigger_source: 'cron', occurrence_id: '00000000-0000-4000-8000-000000000001',
      }],
      [job('current_nonexact'), '2026-06-02T14:50:00.123Z', 'success', {
        trigger_source: 'cron', occurrence_id: '00000000-0000-4000-8000-000000000002',
      }],
      [job('legacy_disabled'), '2026-06-02T14:50:00.123Z', 'success', { trigger_source: 'cron' }],
    ];
    for (const [taskName, timestamp, status, meta] of auditRows) {
      await client.query(
        `INSERT INTO scheduled_tasks_audit
           (task_name, scheduled_for, fired_at, status, error_message, meta)
         VALUES ($1, $2::timestamptz, $2::timestamptz, $3, NULL, $4::jsonb)`,
        [taskName, timestamp, status, JSON.stringify(meta)],
      );
    }

    for (const [suffix, timestamp] of [
      ['durable_exact', '2026-06-02T14:50:00.000Z'],
      ['durable_later', '2026-06-02T14:55:00.000Z'],
    ] as const) {
      await client.query(
        `INSERT INTO scheduled_job_occurrences
           (job_name, scheduled_for, first_source, policy_version, status,
            claimed_at, started_at, completed_at, lag_ms, metadata)
         VALUES ($1, $2::timestamptz, 'natural', 'test/v1', 'succeeded',
                 $2::timestamptz, $2::timestamptz,
                 $2::timestamptz + interval '1 millisecond', 0, '{}'::jsonb)`,
        [job(suffix), timestamp],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM scheduled_tasks_audit WHERE task_name LIKE $1', [`${prefix}%`]);
    await client.query('DELETE FROM scheduled_job_occurrences WHERE job_name LIKE $1', [`${prefix}%`]);
    await client.end();
  });

  it('accepts only exact current/durable evidence or a pre-boot legacy row before the next boundary', async () => {
    const { _queryFireEvidenceForTest } = await import('../../services/cron-fire-evidence-verifier.js');
    const candidate = new Date('2026-06-02T14:50:00.000Z');
    const next = new Date('2026-06-02T14:55:00.000Z');
    const suffixes = [
      'legacy_inside',
      'legacy_at_next',
      'legacy_noncron',
      'legacy_error',
      'current_exact',
      'current_nonexact',
      'legacy_disabled',
      'durable_exact',
      'durable_later',
    ];
    const evidence = await _queryFireEvidenceForTest(suffixes.map((suffix) => ({
      name: job(suffix),
      scheduledFor: candidate,
      nextScheduledFor: next,
      allowLegacyWindow: suffix !== 'legacy_disabled',
    })));

    expect(evidence).not.toBeNull();
    const succeeded = (suffix: string) => evidence?.get(job(suffix))?.candidateSucceeded;
    expect(succeeded('legacy_inside')).toBe(true);
    expect(succeeded('current_exact')).toBe(true);
    expect(succeeded('durable_exact')).toBe(true);
    expect(succeeded('legacy_at_next')).toBe(false);
    expect(succeeded('legacy_noncron')).toBe(false);
    expect(succeeded('legacy_error')).toBe(false);
    expect(succeeded('current_nonexact')).toBe(false);
    expect(succeeded('legacy_disabled')).toBe(false);
    expect(succeeded('durable_later')).toBe(false);
  });
});
