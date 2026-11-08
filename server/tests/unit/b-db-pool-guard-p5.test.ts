import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// B-DB-POOL-GUARD P5 (OBJ-6, #1239): the diagnostic pool. Behaviour where it is cheap to drive (the data-archive panel's
// failure flag, through a mocked pool), source fences for the wiring and the sizing arithmetic (Langston C-2: the
// fence is on the DERIVED peak, not on a constant).

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const failWith = vi.hoisted(() => ({ msg: 'canceling statement due to statement timeout' }));
vi.mock('../../db.js', () => ({
  diagDb: { execute: vi.fn(async () => { throw new Error(failWith.msg); }) },
  DIAG_POOL_MAX: 4,
  db: { execute: vi.fn(async () => { throw new Error('the MAIN pool must not be used by this panel'); }) },
}));
vi.mock('../../services/data-archive/archive-batch-writer.js', () => ({ getArchiveStats: () => ({}) }));
vi.mock('../../services/data-archive/archive-config.js', () => ({
  getArchiveConfig: () => ({ pairScanEnabled: true, signalEvalEnabled: true, signalEvalPreFilterEnabled: true, exitDecisionEnabled: true,
    macroFeedEnabled: true, parquetExportEnabled: false, retentionDays: 15, archiveWriterQueueMax: 1 }),
}));
vi.mock('../../services/run-mode-controller.js', () => ({ getCurrentMode: () => 'paper' }));

describe('P5 — the data-archive panel on the diagnostic pool (C-1, Langston blocking)', () => {
  it('a failed count reads timedOut=true, never a confident 0 with timedOut=false — and it reads the DIAGNOSTIC pool', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { computeDataArchiveStatus } = await import('../../services/drift-dashboard-aggregator.js');
    const db = await import('../../db.js');
    const r = await computeDataArchiveStatus('rolling_24h' as never);
    spy.mockRestore();
    expect(r.tables.length).toBe(5);
    for (const t of r.tables) expect(t.timedOut, t.name).toBe(true);
    // 1 hot-horizon read (B-DB-SIZE-RELIEF OBJ-2) + 5 table reads, all on the diagnostic pool
    expect((db as unknown as { diagDb: { execute: { mock: { calls: unknown[] } } } }).diagDb.execute.mock.calls.length).toBe(6);
    // the horizon read failed too, so every row's partial flag is UNKNOWN (null), never a default
    for (const t of r.tables) { expect(t.hotHorizonDays, t.name).toBeNull(); expect(t.windowPartial, t.name).toBeNull(); }
    expect((db as unknown as { db: { execute: { mock: { calls: unknown[] } } } }).db.execute.mock.calls.length).toBe(0);
  });

  const HORIZON_ROWS = { rows: [
    { constant_name: 'signal_eval_archive.hot_retention_days', value: 15 },
    { constant_name: 'pair_scan_archive.hot_retention_days', value: 30 },
    { constant_name: 'exit_decision_archive.hot_retention_days', value: 30 },
    { constant_name: 'macro_feed_archive.hot_retention_days', value: 30 },
    // signal_eval_provenance deliberately absent: a missing key is UNKNOWN, never defaulted
  ] };

  it('B-DB-SIZE-RELIEF OBJ-2: with the table reads SUCCEEDING, a window wider than the hot horizon is PARTIAL beside a real count; one inside it is not', async () => {
    const db = await import('../../db.js');
    const exec = (db as unknown as { diagDb: { execute: ReturnType<typeof vi.fn> } }).diagDb.execute;
    exec.mockImplementationOnce(async () => HORIZON_ROWS);
    for (let i = 0; i < 5; i++) {
      exec.mockImplementationOnce(async () => ({ rows: [{ rows_in_window: 1000 + i, total_rows: 2000 + i, last_write_at: '2026-11-08T03:00:00Z', disk_bytes: 4096 }] }));
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { computeDataArchiveStatus } = await import('../../services/drift-dashboard-aggregator.js');
    const r = await computeDataArchiveStatus('rolling_30d' as never);
    expect(spy).not.toHaveBeenCalled(); // nothing failed, so no fault line
    spy.mockRestore();
    const byName = new Map(r.tables.map((t) => [t.name, t]));
    expect(byName.get('signal_eval_archive')).toMatchObject({ timedOut: false, rowsInWindow: 1001, hotHorizonDays: 15, windowPartial: true });
    expect(byName.get('pair_scan_archive')).toMatchObject({ timedOut: false, rowsInWindow: 1000, hotHorizonDays: 30, windowPartial: false });
    expect(byName.get('signal_eval_provenance')).toMatchObject({ timedOut: false, hotHorizonDays: null, windowPartial: null });
    const r24 = await (await import('../../services/drift-dashboard-aggregator.js')).computeDataArchiveStatus('rolling_24h' as never);
    expect(r24.tables.every((t) => t.windowPartial === null)).toBe(true); // that call's horizon read failed (the mock throws): unknown
  });

  it('gate 2 C-1: horizon read OK but the table reads time out (the likely render under pool pressure) — the client never shows PARTIAL beside QUERY TIMEOUT', async () => {
    const db = await import('../../db.js');
    const exec = (db as unknown as { diagDb: { execute: ReturnType<typeof vi.fn> } }).diagDb.execute;
    exec.mockImplementationOnce(async () => HORIZON_ROWS); // then the default: every table read throws a statement timeout
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { computeDataArchiveStatus } = await import('../../services/drift-dashboard-aggregator.js');
    const r = await computeDataArchiveStatus('rolling_30d' as never);
    spy.mockRestore();
    const sea = r.tables.find((t) => t.name === 'signal_eval_archive')!;
    // the server row states the geometry (15 d < 30 d) AND that no count was taken; the client must not combine them
    expect(sea).toMatchObject({ timedOut: true, rowsInWindow: 0, windowPartial: true });
    const client = read('client/src/pages/analytics.tsx');
    expect(client).toContain('{!t.timedOut && t.windowPartial === true && (');
    expect(client).not.toMatch(/\{t\.windowPartial === true && \(/);
    expect(client).toContain('Total rows (hot)'); // C-3: the total is the HOT total, said in the header
  });

  it('gate 2 C-2: only the statement-timeout cancel and the acquire timeout are LOAD; the rest of the "canceling statement" family are FAULTS', async () => {
    const { isDiagPoolLoad } = await import('../../services/drift-dashboard-aggregator.js');
    expect(isDiagPoolLoad(new Error('canceling statement due to statement timeout'))).toBe(true);
    expect(isDiagPoolLoad(new Error('timeout exceeded when trying to connect'))).toBe(true);
    for (const fault of ['canceling statement due to lock timeout', 'canceling statement due to user request',
      'canceling statement due to conflict with recovery', 'relation "x" does not exist']) {
      expect(isDiagPoolLoad(new Error(fault)), fault).toBe(false);
    }
    // all four catch sites use the one predicate/text; no loose substring survives
    const src = read('server/services/drift-dashboard-aggregator.ts');
    expect(src.match(/isDiagPoolLoad\(err\)/g)?.length).toBe(3);
    // the constant is USED at exactly two sites: inside the predicate, and the passive panel's safeCount timeout branch
    // (Langston r2: a toContain was satisfied by the predicate alone, so the fourth site was pinned by nothing)
    expect(src.match(/msg\.includes\(STATEMENT_TIMEOUT_CANCEL\)/g)?.length).toBe(2);
    // no literal timeout/cancel text inside ANY includes(), whatever the quote style (', ", or a template literal)
    expect(src).not.toMatch(/includes\(\s*[`'"][^`'"]*(canceling statement|statement timeout)/);
  });

  it('ANY failure sets timedOut — a non-timeout fault too, not only a statement timeout (Langston take (b))', async () => {
    failWith.msg = 'relation "pair_scan_archive" does not exist';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { computeDataArchiveStatus } = await import('../../services/drift-dashboard-aggregator.js');
    const r = await computeDataArchiveStatus('rolling_24h' as never);
    spy.mockRestore();
    failWith.msg = 'canceling statement due to statement timeout';
    for (const t of r.tables) expect(t.timedOut, t.name).toBe(true);
  });

  it('load writes NO error line; a real fault writes ONE line per call, not one per table (Langston fold)', async () => {
    const { computeDataArchiveStatus } = await import('../../services/drift-dashboard-aggregator.js');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const load of ['canceling statement due to statement timeout', 'timeout exceeded when trying to connect']) {
      failWith.msg = load;
      await computeDataArchiveStatus('rolling_24h' as never);
    }
    expect(spy).not.toHaveBeenCalled();
    failWith.msg = 'relation "pair_scan_archive" does not exist';
    await computeDataArchiveStatus('rolling_24h' as never);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toMatch(/^\[B70\]\[archive-status\] 5 of 5 table reads failed .*first: pair_scan_archive: relation/);
    spy.mockRestore();
    failWith.msg = 'canceling statement due to statement timeout';
  });
});

describe('P5 — wiring and sizing fences', () => {
  const dbSrc = read('server/db.ts');
  const agg = read('server/services/drift-dashboard-aggregator.ts');

  it('the diagnostic pool has its own name, its size constant, the shared guard and the instrument', () => {
    expect(dbSrc).toMatch(/application_name: 'dawntrader_diag'/);
    // keepAlive is set on BOTH pools and printed on both DB_POOL_INIT lines (Langston, Step 8 leg 1)
    const diagCfg = dbSrc.slice(dbSrc.indexOf('const DIAG_POOL_CONFIG = {'), dbSrc.indexOf('} as const;', dbSrc.indexOf('const DIAG_POOL_CONFIG = {')));
    expect(diagCfg).toMatch(/keepAlive: true,/);
    expect(diagCfg).toMatch(/keepAliveInitialDelayMillis: 10_000,/);
    expect(dbSrc).toMatch(/keepAlive=\$\{DIAG_POOL_CONFIG\.keepAlive\}/);
    expect(dbSrc).toMatch(/keepAliveInitialDelayMillis=\$\{DIAG_POOL_CONFIG\.keepAliveInitialDelayMillis\}/);
    expect(dbSrc).toMatch(/max: DIAG_POOL_MAX,/);
    expect(dbSrc).toMatch(/attachPoolGuards\(diagPool,/);
    expect(dbSrc).toMatch(/attachPoolInstrument\(diagPool,/);
  });

  it('both Drift Dashboard panel functions import the diagnostic pool, not the main one', () => {
    for (const fn of ['computeDataArchiveStatus', 'computePassiveArchiveStatus']) {
      const start = agg.indexOf(`export async function ${fn}(`);
      expect(start, fn).toBeGreaterThan(0);
      const head = agg.slice(start, start + 600);
      expect(head, fn).toMatch(/const \{ diagDb: db[^}]*\} = await import\('\.\.\/db\.js'\);/);
      expect(head, fn).not.toMatch(/const \{ db \} = await import/);
    }
  });

  it('the passive panel\'s peak, with the data-archive panel\'s one connection, fits the pool (derived, not asserted)', () => {
    const max = Number(dbSrc.match(/export const DIAG_POOL_MAX = (\d+);/)![1]);
    const concExpr = agg.match(/const PASSIVE_COUNT_CONCURRENCY = ([^;]+);/)![1].trim();
    expect(concExpr).toBe('DIAG_POOL_MAX - 1');
    const conc = max - 1;
    const fanout = Number(agg.match(/const DISK_PARENT_FANOUT = (\d+);/)![1]);
    expect(Math.max(conc, fanout) + 1).toBeLessThanOrEqual(max);
  });

  it('qd-probe stays on the main pool with its burst at 4, and its cron cannot overlap itself (C-4)', () => {
    const probe = read('server/asset_classes/xstock_spot/qd-probe-service.ts');
    expect(probe).toMatch(/const SNAP_QUERY_CONCURRENCY = 4;/);
    expect(probe).toMatch(/import \{ db \} from '\.\.\/\.\.\/db\.js';/);
    expect(read('server/services/xstock-qd-probe-cron.ts')).toMatch(/\{ timezone: 'UTC', noOverlap: true \}/);
    // a skipped fire leaves a NAMED line (node-cron's own warning names no task)
    expect(read('server/services/xstock-qd-probe-cron.ts')).toMatch(/_cronTask\.on\('execution:overlap'[\s\S]{0,200}fire SKIPPED/);
  });

  it('the stage-attrition refresher, cache and route are gone (P5-4, rule 18) and archived', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/services/stage-attrition-cache.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, '1-system-manual/_archive/deleted-code/stage-attrition-cache.ts.20261107-B-DB-POOL-GUARD.removed'))).toBe(true);
    expect(read('server/index.ts')).not.toMatch(/startStageAttritionRefresher/);
    expect(read('server/routes.ts')).not.toMatch(/diagnostics\/stage-attrition/);
    // control: the sibling route the panel really calls is still there, so the absence above is not a misread file
    expect(read('server/routes.ts')).toMatch(/diagnostics\/scan-latest/);
  });
});
