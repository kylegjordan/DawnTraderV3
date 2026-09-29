/**
 * B-SIZING-DEC-RESTORE increment 3 — the two DATABASE legs of PAPER-RESET-3000, ON REAL POSTGRES.
 *
 * (1) The band's three rows exist after `db:migrate` with the values Kyle set — 140 / 150 / 145 — because the server
 *     refuses to boot without them (server/index.ts) and a CI database that lacked them would hide that refusal.
 * (2) `storage.setScoreboardEpoch` — the ONE named writer of the dashboard epoch — writes the instant it is given,
 *     stamps `updated_by`, updates the single row IN PLACE (the six-column primary key), reads back what it wrote, and
 *     refuses an invalid date or an anonymous writer. The row that was there before the test is restored after it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { storage } from '../../storage.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-SIZING-INC3-DB';
let dbReachable = true;
let prior: { value: unknown; updated_by: string | null } | null = null;

const rows = (r: any): any[] => (r?.rows ?? r) as any[];

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(`[${TAG}] Postgres unreachable in CI — the epoch writer cannot be proved without it. `
        + `Original: ${err instanceof Error ? err.message : err}`);
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
    return;
  }
  if (!isTestDb) return;
  prior = rows(await db.execute(sql`
    SELECT value, updated_by FROM module_constants
     WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'`))[0] ?? null;
});

afterAll(async () => {
  if (!dbReachable || !isTestDb) return;
  if (prior) {
    await db.execute(sql`
      UPDATE module_constants SET value = ${JSON.stringify(prior.value)}::jsonb, updated_by = ${prior.updated_by}
       WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'`);
  } else {
    await db.execute(sql`DELETE FROM module_constants WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'`);
  }
});

describe('increment 3 — database legs', () => {
  it('in CI this runs against the test database (not skipped)', () => {
    if (IS_CI) expect(isTestDb && dbReachable).toBe(true);
  });

  it('the band migration seeded exactly low 140, high 150, target 145', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const got = rows(await db.execute(sql`
      SELECT constant_name, (value #>> '{}')::numeric AS v FROM module_constants
       WHERE module_name = 'paper_size_band' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
       ORDER BY constant_name`));
    expect(got.map((r) => [r.constant_name, Number(r.v)])).toEqual([['high', 150], ['low', 140], ['target', 145]]);
  });

  it('setScoreboardEpoch writes the instant, stamps updated_by, and reads it back', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const at = new Date('2026-10-02T20:15:00.123Z');
    const back = await storage.setScoreboardEpoch(at, `${TAG}-run-1`);
    expect(back.epochStartedAt.getTime()).toBe(at.getTime());
    expect(back.updatedBy).toBe(`${TAG}-run-1`);
    // Stored as the JSON-string shape the dashboard reader casts: (value #>> '{}')::timestamptz
    const raw = rows(await db.execute(sql`
      SELECT jsonb_typeof(value) AS t, (value #>> '{}')::timestamptz AS ts FROM module_constants
       WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'`))[0];
    expect(raw.t).toBe('string');
    expect(new Date(raw.ts).getTime()).toBe(at.getTime());
  });

  it('a second write UPDATES the one row in place — never a second epoch row', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const later = new Date('2026-10-03T08:00:00.000Z');
    const back = await storage.setScoreboardEpoch(later, `${TAG}-run-2`);
    expect(back.epochStartedAt.getTime()).toBe(later.getTime());
    expect(back.updatedBy).toBe(`${TAG}-run-2`);
    const n = rows(await db.execute(sql`
      SELECT count(*)::int AS n FROM module_constants WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'`))[0].n;
    expect(Number(n)).toBe(1);
  });

  it('refuses an invalid date and an anonymous writer — and writes nothing', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    await expect(storage.setScoreboardEpoch(new Date('not a date'), `${TAG}-bad`)).rejects.toThrow(/valid date/);
    await expect(storage.setScoreboardEpoch(new Date(), '  ')).rejects.toThrow(/updatedBy/);
    const by = rows(await db.execute(sql`
      SELECT updated_by FROM module_constants WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'`))[0].updated_by;
    expect(by).toBe(`${TAG}-run-2`);
  });
});
