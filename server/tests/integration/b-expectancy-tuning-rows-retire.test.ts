/**
 * B-EXPECTANCY-TUNING-ROWS-RETIRE (sprint row 4a2, #1156) — the three `expectancy_tuning` rows are gone, ON REAL POSTGRES.
 *
 * Langston Step 2 C1 (2026-10-07): a `DELETE … WHERE` that matches nothing exits 0, so the migration is silent about its
 * own effect. CI runs `npm run db:migrate` before vitest, so this suite measures the POST-STATE on the migrated test
 * database — a permanent ratchet that also catches a future re-seed.
 *   DB leg   — count of `expectancy_tuning` rows = 0; control: `roi_gating` rows > 0 (the same query finds a live module).
 *   TEXT leg — the rollback can only ever be read as text: db-migrate never applies a rollback by construction.
 *   CODE leg — the boot warm-up no longer prefetches the module (control: it still prefetches `roi_gating`).
 * The control is `> 0`, not staging's 10: the CI database is built from the migrations, not copied from staging.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-EXPECTANCY-TUNING-ROWS-RETIRE';
const MIG = join(__dirname, '../../../drizzle/migrations');
const FORWARD = '2026-10-07-b-expectancy-tuning-rows-retire.sql';
const ROLLBACK = '2026-10-07-b-expectancy-tuning-rows-retire-rollback.sql';
const NAMES = ['winrate_floor_low', 'winrate_threshold_medium', 'winrate_threshold_high'];
let dbReachable = true;

const rows = (r: any): any[] => (r?.rows ?? r) as any[];

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(`[${TAG}] Postgres unreachable in CI — the post-state cannot be measured without it. `
        + `Original: ${err instanceof Error ? err.message : err}`);
    }
    dbReachable = false;
  }
  // Langston rider (a): say which way the DB leg went, so a green run and an unmeasured run never look alike.
  console.log(`[${TAG}] DB leg ${dbReachable && isTestDb ? 'MEASURED against the test database' : 'SKIPPED — no test database (not passed)'}`);
});

describe('row 4a2 — the expectancy_tuning rows are retired', () => {
  it('in CI the DB leg runs against the test database (not skipped)', () => {
    if (IS_CI) expect(isTestDb && dbReachable).toBe(true);
  });

  it('DB: zero expectancy_tuning rows after db:migrate; control — roi_gating still has rows', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const gone = rows(await db.execute(sql`
      SELECT count(*)::int AS n FROM module_constants WHERE module_name = 'expectancy_tuning'`))[0].n;
    const control = rows(await db.execute(sql`
      SELECT count(*)::int AS n FROM module_constants WHERE module_name = 'roi_gating'`))[0].n;
    console.log(`[${TAG}] expectancy_tuning=${gone} roi_gating=${control}`);
    expect(Number(gone)).toBe(0);
    expect(Number(control)).toBeGreaterThan(0);
  });

  it('TEXT (forward): deletes exactly the three names under the one module', () => {
    const f = readFileSync(join(MIG, FORWARD), 'utf8');
    const del = f.slice(f.indexOf('DELETE FROM module_constants'));
    expect(del).toMatch(/WHERE module_name = 'expectancy_tuning'/);
    for (const n of NAMES) expect(del).toContain(`'${n}'`);
    expect(del.match(/'[a-z_]+'/g)?.length).toBe(1 + NAMES.length); // the module + the three names, nothing else
  });

  it('TEXT ONLY (rollback — never applied by db-migrate): restores the three values and frees its _migrations row', () => {
    const r = readFileSync(join(MIG, ROLLBACK), 'utf8');
    expect(r).toMatch(/'winrate_floor_low',\s+'0\.4'::jsonb/);
    expect(r).toMatch(/'winrate_threshold_medium',\s+'0\.5'::jsonb/);
    expect(r).toMatch(/'winrate_threshold_high',\s+'0\.6'::jsonb/);
    expect(r).toContain(`DELETE FROM _migrations WHERE name = '${FORWARD}'`);
  });

  it('CODE: the boot warm-up does not prefetch expectancy_tuning (control: it prefetches roi_gating)', () => {
    const w = readFileSync(join(__dirname, '../../startup/b72-warmup.ts'), 'utf8');
    const list = w.slice(w.indexOf('const PREFETCH_MODULES = ['), w.indexOf('];', w.indexOf('const PREFETCH_MODULES = [')));
    expect(list).not.toMatch(/'expectancy_tuning'/);
    expect(list).toMatch(/'roi_gating'/);
  });
});
