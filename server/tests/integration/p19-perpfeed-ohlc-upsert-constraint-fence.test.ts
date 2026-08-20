/**
 * P19-B-PERPFEED / #704 — fence: every OHLC table the batch writer upserts into MUST carry
 * a UNIQUE constraint matching the writer's own ON CONFLICT target.
 *
 * THE DEFECT THIS FENCES. `crypto_perp_ohlc_1m` shipped (2026-08-18) without the
 * `(symbol, interval_begin)` UNIQUE its three siblings carry — theirs came from the initial
 * schema, and the constraint is NOT declared in Drizzle for ANY of the four, so a table born
 * later does not inherit it. `ohlc-batch-writer.ts` upserts with
 * `onConflictDoUpdate({ target: [symbol, intervalBegin] })`, so every flush threw
 * "there is no unique or exclusion constraint matching the ON CONFLICT specification" and the
 * catch DROPPED the already-spliced batch: 368,841 bars scanned, 0 rows landed, for ~15 h.
 * The failure was invisible on stdout (success logs via console.log, failure via console.error).
 *
 * ★ WHY IT DERIVES ITS SUBJECT INSTEAD OF LISTING NAMES (Langston Step-4 condition, and it is
 * the whole point): a fence over a hardcoded list of four table names would have PASSED on
 * 2026-08-19 while the defect was live, and would reproduce it one generation later. The
 * subject is `Object.keys(tableForAssetClass)` — the writer's OWN map. Adding a fifth asset
 * class is TypeScript-forced into that map, so this fence extends itself to the new table and
 * FAILS until its migration lands. The fence cannot go stale by omission.
 *
 * READ-ONLY: queries pg_constraint only. No seeding, so no live-DB write hazard — but it still
 * self-skips when Postgres is unreachable rather than failing the file for anyone without one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { tableForAssetClass } from '../../services/passive-archive/ohlc-batch-writer.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);

const TAG = 'P19-PERPFEED-OHLC-CONSTRAINT-FENCE';
// ★ CI vs local, and the distinction is load-bearing (Langston blocker, 2026-08-20).
// CI PROVISIONS Postgres and runs `db:migrate` before this suite, so an unreachable DB THERE is
// a real failure and must fail the run — never an excuse. Locally a developer box usually has no
// Postgres, so the DB legs self-skip. And they SKIP: an `if (!x) return` inside an `it` reports
// PASS, which is #704's exact shape — an invisible failure on a happy-looking stream. The
// reporter must show these as skipped, so the gating is done with `it.skipIf`, not an early return.
const IS_CI = !!process.env.CI;
let dbReachable = true;

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      // Hard-fail the file: CI guarantees the database, so absence here is a genuine regression.
      throw new Error(
        `[${TAG}] Postgres unreachable in CI — this fence cannot assert anything without it, and a ` +
        `green suite would be a false all-clear (#704's failure class). Original: ${err instanceof Error ? err.message : err}`,
      );
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
  }
});

describe(TAG, () => {
  it('exposes a non-empty writer map (positive control — the subject must not be vacuously empty)', () => {
    const classes = Object.keys(tableForAssetClass);
    expect(classes.length).toBeGreaterThanOrEqual(4);
  });

  // ctx.skip() and NOT it.skipIf(): skipIf is evaluated at COLLECTION time, before `beforeAll`
  // has probed the database, so it would read the initial `true` and run the test anyway. ctx.skip()
  // is evaluated at RUN time and marks the case SKIPPED in the reporter — never PASSED (#704 shape).
  it('every OHLC table in the writer map carries a UNIQUE matching the ON CONFLICT target', async (ctx) => {
    if (!dbReachable) ctx.skip();
    const classes = Object.keys(tableForAssetClass);
    const missing: string[] = [];
    const checked: string[] = [];

    for (const assetClass of classes) {
      // The physical table name as Drizzle knows it — derived, never re-typed here.
      const tbl: any = (tableForAssetClass as any)[assetClass];
      const name: string | undefined =
        tbl?.[Symbol.for('drizzle:Name')] ?? tbl?._?.name ?? tbl?.[Symbol.for('drizzle:BaseName')];
      expect(name, `could not resolve a table name for asset class ${assetClass}`).toBeTruthy();

      const res: any = await db.execute(sql`
        SELECT count(*)::int AS n
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = ${name}
           AND c.contype = 'u'
           AND pg_get_constraintdef(c.oid) ILIKE '%(symbol, interval_begin)%'
      `);
      const n = Number((res.rows ?? res)[0]?.n ?? 0);
      checked.push(`${assetClass}:${name}=${n}`);
      if (n < 1) missing.push(`${assetClass} (${name})`);
    }

    // Positive control on the INSTRUMENT: if the query shape were wrong, every table would read
    // 0 and the failure message would be indistinguishable from a real regression. At least one
    // table must be found carrying it, or the probe itself is broken.
    const anyFound = checked.some(c => !c.endsWith('=0'));
    expect(anyFound, `instrument check failed — no table matched the constraint probe at all (${checked.join(', ')})`).toBe(true);

    expect(
      missing,
      `OHLC table(s) missing the UNIQUE (symbol, interval_begin) that ohlc-batch-writer's ` +
      `onConflictDoUpdate targets — every flush for these classes will throw and DROP the batch ` +
      `(#704). Add it by migration, including the partition key. Checked: ${checked.join(', ')}`,
    ).toEqual([]);
  });

  // ★ MUTATION PROOF (house standard: a fence that cannot fail is not a fence). The probe above
  // reports "missing" as an ABSENCE, and an absence claim needs presence-evidence — so here the
  // same SQL runs against two synthetic tables, one WITH the constraint and one WITHOUT, and must
  // discriminate. Without this, a typo in the probe would make every table read 0 (or 1) and the
  // suite would still be green. Gated to the test database: it creates and drops real tables.
  it('the probe DISCRIMINATES — same SQL reports 1 for a table with the constraint and 0 for one without', async (ctx) => {
    if (!dbReachable || !(isTestDb || IS_CI)) ctx.skip();
    const withU = `_fence704_with_${Date.now()}`;
    const noU = `_fence704_without_${Date.now()}`;
    const probe = async (name: string) => {
      const res: any = await db.execute(sql`
        SELECT count(*)::int AS n
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = ${name}
           AND c.contype = 'u'
           AND pg_get_constraintdef(c.oid) ILIKE '%(symbol, interval_begin)%'
      `);
      return Number((res.rows ?? res)[0]?.n ?? 0);
    };
    try {
      await db.execute(sql.raw(`CREATE TABLE ${withU} (symbol text NOT NULL, interval_begin timestamptz NOT NULL, CONSTRAINT ${withU}_u UNIQUE (symbol, interval_begin))`));
      await db.execute(sql.raw(`CREATE TABLE ${noU} (symbol text NOT NULL, interval_begin timestamptz NOT NULL)`));
      expect(await probe(withU), 'probe failed to SEE a constraint that exists').toBe(1);
      expect(await probe(noU), 'probe reported a constraint that does NOT exist').toBe(0);
    } finally {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS ${withU}`));
      await db.execute(sql.raw(`DROP TABLE IF EXISTS ${noU}`));
    }
  });
});
