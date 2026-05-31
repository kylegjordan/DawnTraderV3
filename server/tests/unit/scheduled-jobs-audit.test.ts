/**
 * B-NEW-49 — scheduled-jobs-audit writer tests.
 * Verifies the SQL row write shape + that audit-write failure is swallowed
 * (failure-safe; never propagates to cron callback).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbCalls: Array<{ sql: string; params: any[] }> = [];
let dbShouldThrow = false;

vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn(async (q: any) => {
      const chunks = (q?.queryChunks ?? []) as any[];
      const sqlText = chunks.map((c: any) => c?.value ?? c).join(' ');
      const isStringChunk = (c: any) => c && typeof c === 'object' && Array.isArray(c.value);
      const params = chunks.filter((c: any) => !isStringChunk(c));
      dbCalls.push({ sql: sqlText, params });
      if (dbShouldThrow) throw new Error('SIMULATED_DB_FAIL');
      return { rows: [] };
    }),
  },
}));

beforeEach(() => {
  dbCalls.length = 0;
  dbShouldThrow = false;
  vi.resetModules();
});

describe('B-NEW-49 scheduled-jobs-audit', () => {
  it('writeFireRow issues an INSERT into scheduled_tasks_audit with correct params', async () => {
    const { scheduledJobsAudit } = await import('../../services/scheduled-jobs-audit.js');
    const firedAt = new Date('2026-05-31T07:06:33.123Z');
    await scheduledJobsAudit.writeFireRow({
      jobName: 'test_cron',
      scheduledFor: firedAt,
      firedAt,
      status: 'success',
      meta: { trigger_source: 'cron', duration_ms: 42 },
    });
    expect(dbCalls).toHaveLength(1);
    expect(dbCalls[0].sql).toContain('INSERT INTO scheduled_tasks_audit');
    expect(dbCalls[0].params).toContain('test_cron');
    expect(dbCalls[0].params).toContain('success');
    expect(dbCalls[0].params).toContain('2026-05-31T07:06:33.123Z');
    // meta is JSON.stringify-ed
    const metaJson = dbCalls[0].params.find(
      (p) => typeof p === 'string' && p.includes('trigger_source'),
    );
    expect(metaJson).toBeDefined();
    expect(metaJson).toContain('"trigger_source":"cron"');
    expect(metaJson).toContain('"duration_ms":42');
  });

  it('writeFireRow includes error_message when status=error', async () => {
    const { scheduledJobsAudit } = await import('../../services/scheduled-jobs-audit.js');
    const firedAt = new Date();
    await scheduledJobsAudit.writeFireRow({
      jobName: 'test_cron',
      scheduledFor: firedAt,
      firedAt,
      status: 'error',
      errorMessage: 'simulated callback failure',
      meta: { trigger_source: 'cron' },
    });
    expect(dbCalls).toHaveLength(1);
    expect(dbCalls[0].params).toContain('error');
    expect(dbCalls[0].params).toContain('simulated callback failure');
  });

  it('writeFireRow NEVER throws even when DB execute fails (failure-safe)', async () => {
    dbShouldThrow = true;
    const { scheduledJobsAudit } = await import('../../services/scheduled-jobs-audit.js');
    // Must NOT reject.
    await expect(
      scheduledJobsAudit.writeFireRow({
        jobName: 'test_cron',
        scheduledFor: new Date(),
        firedAt: new Date(),
        status: 'success',
      }),
    ).resolves.toBeUndefined();
  });

  it('writeFireRow handles missing meta + missing errorMessage (defaults applied)', async () => {
    const { scheduledJobsAudit } = await import('../../services/scheduled-jobs-audit.js');
    const firedAt = new Date();
    await scheduledJobsAudit.writeFireRow({
      jobName: 'test_cron',
      scheduledFor: firedAt,
      firedAt,
      status: 'success',
    });
    expect(dbCalls).toHaveLength(1);
    // null for missing error_message
    expect(dbCalls[0].params).toContain(null);
    // {} for missing meta
    expect(dbCalls[0].params).toContain('{}');
  });
});
