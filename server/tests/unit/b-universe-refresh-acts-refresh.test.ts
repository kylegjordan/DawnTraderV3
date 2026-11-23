/**
 * B-UNIVERSE-REFRESH-ACTS (#1018, KD-26) — the daily crypto spot universe refresh (pre-audit Part C P11a).
 *
 * The gate's pure half (decideRefresh and its helpers) and the run itself, end to end, against:
 *   - a fake run table that answers the refresh's three reads from the rows the refresh itself inserted, so chained
 *     runs carry the counter, the episode baseline and the running-set age exactly as the database would;
 *   - a fake recorder whose running set the apply mutates;
 *   - the REAL alert store on a temp file (C3: the resolve goes through the canonical-actor and evidence gates).
 * The loader's two gates (isUniverseFetchComplete, assertClassifiedPlausible) are the REAL functions; only the Kraken
 * fetch (loadCryptoSpotUniverse) is replaced.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  return {
    rows: [] as Array<Record<string, any>>,
    running: [] as string[],
    universe: null as null | Record<string, any>,
    pins: [] as string[],
    pinsThrow: false,
    applyCalls: [] as Array<{ add: string[]; drop: string[]; occurrenceId: string }>,
    untrackedOverflowAdds: [] as string[],
    CFG: {} as Record<string, number>,
  };
});

// ── fake run table ─────────────────────────────────────────────────────────────────────────────────────────────
// The refresh issues exactly three reads, each identified by its projection:
//   { consecutiveRefusals }          → the latest row
//   { outcome, computedSymbols }     → the latest confirmable row
//   { finishedAt }                   → the latest clean (applied | applied_confirmed | noop) row
vi.mock('../../db.js', () => {
  const pick = (proj: Record<string, unknown>) => {
    const keys = Object.keys(proj);
    const newestFirst = [...h.rows].reverse();
    let src: Array<Record<string, any>>;
    if (keys.includes('consecutiveRefusals')) src = newestFirst;
    else if (keys.includes('computedSymbols')) src = newestFirst.filter(r => r.confirmable === true);
    else if (keys.includes('finishedAt')) src = newestFirst.filter(r => ['applied', 'applied_confirmed', 'noop'].includes(r.outcome));
    else throw new Error(`fake db: unexpected projection ${keys.join(',')}`);
    return src.map(r => Object.fromEntries(keys.map(k => [k, r[k]])));
  };
  const db = {
    select: (proj: Record<string, unknown>) => {
      const chain: any = {
        from: () => chain, where: () => chain, orderBy: () => chain,
        limit: async (n: number) => pick(proj).slice(0, n),
      };
      return chain;
    },
    insert: () => ({
      values: (v: Record<string, any>) => ({
        returning: async () => {
          const id = randomUUID();
          h.rows.push({ ...v, id });
          return [{ id }];
        },
      }),
    }),
  };
  return { db };
});

vi.mock('../../services/passive-archive/crypto-spot-archiver.js', () => ({
  takeCryptoAddFailures: () => ({ rejected: [], unconfirmed: [] }),
  getCryptoRecorderRunningSymbols: () => [...h.running],
  applyCryptoUniverseChange: async (args: { add: string[]; drop: string[]; occurrenceId: string }) => {
    h.applyCalls.push(args);
    const drop = new Set(args.drop);
    h.running = [...h.running.filter(s => !drop.has(s)), ...args.add];
    return {
      added: [...args.add], dropped: [...args.drop],
      untrackedOverflowAdds: [...h.untrackedOverflowAdds], shardsOpened: [], shardsStopped: [],
    };
  },
}));

vi.mock('../../services/passive-archive/universe-loader.js', async () => {
  const actual = await vi.importActual<typeof import('../../services/passive-archive/universe-loader.js')>(
    '../../services/passive-archive/universe-loader.js');
  return {
    isUniverseFetchComplete: actual.isUniverseFetchComplete,
    assertClassifiedPlausible: actual.assertClassifiedPlausible,
    loadCryptoSpotUniverse: async () => {
      if (!h.universe) throw new Error('test: no universe set');
      return h.universe;
    },
  };
});

vi.mock('../../services/passive-archive/crypto-universe-pins.js', () => ({
  readCryptoUniversePins: async () => {
    if (h.pinsThrow) throw new Error('pins read failed');
    return [...h.pins];
  },
}));

vi.mock('../../services/module-constants-service.js', () => ({
  getConstant: async (_m: string, name: string) => h.CFG[name],
  GLOBAL_KEY: { exchange: '*', assetClass: '*', strategy: '*', regime: '*' },
}));

import {
  baselineFrom, decideRefresh, nextConsecutiveRefusals, rungBody, rungFor, symmetricDiffShare,
  RUNG_PREFIX, REFRESH_ACTOR,
} from '../../services/crypto-universe-refresh.js';
import type * as RefreshModule from '../../services/crypto-universe-refresh.js';

// The alert store reads SYSTEM_ALERTS_FILE at module load. The refresh imports it dynamically and this file imports it
// in beforeAll, so setting it here, before either, points both at the temp file.
const ALERTS_FILE = join(mkdtempSync(join(tmpdir(), 'b-universe-refresh-acts-')), 'system-alerts.jsonl');
process.env.SYSTEM_ALERTS_FILE = ALERTS_FILE;

let refresh: typeof RefreshModule;
let alerts: typeof import('../../services/system-alerts');
beforeAll(async () => {
  alerts = await import('../../services/system-alerts');
  refresh = await import('../../services/crypto-universe-refresh.js');
});

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────
const sym = (i: number) => `S${String(i).padStart(3, '0')}/USD`;
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => sym(a + k)); // [a, b)
const OK_BATCHES = [
  { kind: 'asset_pairs', ok: true, httpStatus: 200, krakenError: null, rowsRequested: null, rowsReturned: 900 },
  { kind: 'ticker', ok: true, httpStatus: 200, krakenError: null, rowsRequested: 100, rowsReturned: 100 },
  { kind: 'ticker', ok: true, httpStatus: 200, krakenError: null, rowsRequested: 100, rowsReturned: 100 },
];
const SILENT_BATCH = { kind: 'ticker', ok: false, httpStatus: 200, krakenError: null, rowsRequested: 100, rowsReturned: 0 };
// Volume of S<i> is i — so "lowest volume first" is "lowest index first".
const volumes = (syms: string[]) => Object.fromEntries(syms.map(s => [s, Number(s.slice(1, 4))]));
const universeOf = (symbols: string[], batches: any[] = OK_BATCHES) => ({
  symbols, totalCandidates: symbols.length, filterReasons: { dead: 0, wrongQuote: 0, offline: 0, noTicker: 0 },
  batches, volumeUsdBySymbol: volumes(symbols), floorUsd: 10_000,
});
const run = () => refresh.runCryptoUniverseRefresh({ occurrenceId: randomUUID(), triggerSource: 'cron' });
const rungRows = () => alerts.readAllAlerts().filter(a => a.dedupe_key?.startsWith(RUNG_PREFIX));
const lastRow = () => h.rows[h.rows.length - 1];

beforeEach(() => {
  h.rows.length = 0;
  h.running = range(0, 469);
  h.universe = null;
  h.pins = [];
  h.pinsThrow = false;
  h.applyCalls.length = 0;
  h.untrackedOverflowAdds.length = 0;
  h.CFG = { universe_refresh_max_drop_share: 0.30, universe_refresh_confirm_max_diff_share: 0.50 };
  writeFileSync(ALERTS_FILE, '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the pure gate', () => {
  it('symmetricDiffShare is |a Δ b| / |b|, and an empty baseline can confirm nothing', () => {
    expect(symmetricDiffShare(['A', 'B', 'C'], ['A', 'B', 'D'])).toBeCloseTo(2 / 3);
    expect(symmetricDiffShare(['A'], [])).toBe(Number.POSITIVE_INFINITY);
    expect(symmetricDiffShare([], ['A', 'B'])).toBe(1);
  });

  it('a drop at the measured maximum (110 of 469 = 0.2345) applies without confirmation', () => {
    const d = decideRefresh({
      running: range(0, 469), computed: range(0, 359), pins: [], volumeUsdBySymbol: {},
      maxDropShare: 0.30, confirmMaxDiffShare: 0.50, baselineComputed: null,
    });
    expect(d.outcome).toBe('applied');
    expect(d.drop).toHaveLength(110);
    expect(d.dropShare).toBeCloseTo(110 / 469);
  });

  it('145 of 469 (0.309) with no baseline is refused on drop share, and nothing is applied', () => {
    const d = decideRefresh({
      running: range(0, 469), computed: range(0, 324), pins: [], volumeUsdBySymbol: {},
      maxDropShare: 0.30, confirmMaxDiffShare: 0.50, baselineComputed: null,
    });
    expect([d.outcome, d.refusalReason, d.add, d.drop, d.confirmDiffShare]).toEqual(['refused', 'drop_share', [], [], null]);
  });

  it('a confirming run that disagrees too much with the baseline stays refused, and records how far apart they were', () => {
    const d = decideRefresh({
      running: range(0, 469), computed: range(0, 324), pins: [], volumeUsdBySymbol: {},
      maxDropShare: 0.30, confirmMaxDiffShare: 0.50, baselineComputed: range(500, 800),
    });
    expect(d.outcome).toBe('refused');
    expect(d.confirmDiffShare).toBeGreaterThan(0.5);
  });

  it('a confirmed drop takes at most floor(max x running), lowest volume first, a symbol with no volume first of all', () => {
    const vols = volumes(range(0, 469));
    delete vols[sym(468)];
    const d = decideRefresh({
      running: range(0, 469), computed: range(0, 324), pins: [], volumeUsdBySymbol: vols,
      maxDropShare: 0.30, confirmMaxDiffShare: 0.50, baselineComputed: range(0, 324),
    });
    expect(d.outcome).toBe('applied_confirmed');
    expect(d.drop).toHaveLength(140);
    expect(d.drop).toContain(sym(468));                           // no volume → dropped first
    expect(d.drop).toEqual([...range(324, 463), sym(468)].sort()); // then S324..S462 (139)
    expect(d.boundedStep).toBeCloseTo(140 / 145);
  });

  it('nextConsecutiveRefusals: refused and applied_confirmed extend the episode; applied and noop end it', () => {
    expect(nextConsecutiveRefusals(0, 'refused')).toBe(1);
    expect(nextConsecutiveRefusals(1, 'applied_confirmed')).toBe(2);
    expect(nextConsecutiveRefusals(2, 'applied')).toBe(0);
    expect(nextConsecutiveRefusals(5, 'noop')).toBe(0);
  });

  it('baselineFrom: only a row still inside an episode is a baseline', () => {
    expect(baselineFrom(null)).toBeNull();
    expect(baselineFrom({ outcome: 'applied', computedSymbols: ['A'] })).toBeNull();
    expect(baselineFrom({ outcome: 'noop', computedSymbols: ['A'] })).toBeNull();
    expect(baselineFrom({ outcome: 'refused', computedSymbols: ['A', 7, 'B'] })).toEqual(['A', 'B']);
    expect(baselineFrom({ outcome: 'applied_confirmed', computedSymbols: ['C'] })).toEqual(['C']);
  });

  it('rungs: 1 info, 2 warning, 3+ critical, and only rung 3 carries the no-operator-path lines', () => {
    expect(rungFor(1)).toEqual({ key: `${RUNG_PREFIX}1`, severity: 'info', level: 1 });
    expect(rungFor(2)).toEqual({ key: `${RUNG_PREFIX}2`, severity: 'warning', level: 2 });
    expect(rungFor(3)).toEqual({ key: `${RUNG_PREFIX}3`, severity: 'critical', level: 3 });
    expect(rungFor(9).key).toBe(`${RUNG_PREFIX}3`);
    const base = { consecutive: 3, ageHours: 50, outcome: 'refused' as const, refusalReason: 'drop_share' as const,
      occurrenceId: 'o', runId: 'r' };
    expect(rungBody({ ...base, level: 3 })).toMatch(/NO operator path/);
    expect(rungBody({ ...base, level: 2 })).not.toMatch(/NO operator path/);
    expect(rungBody({ ...base, level: 1 })).toMatch(/RESOLVE it, never ack it/);
    // Rungs 1-2 are mint-time records and are labelled as such; rung 3 stays open across later refusals
    // (addAlert returns an open same-key row unchanged), so it carries no figure and points at the table.
    expect(rungBody({ ...base, level: 1 })).toMatch(/As of run r: consecutive runs without a clean apply 3;/);
    expect(rungBody({ ...base, level: 2 })).toMatch(/50\.0 h before this run/);
    const r3 = rungBody({ ...base, level: 3 });
    expect(r3).not.toMatch(/\b3\b|50\.0|h ago|As of run/);
    expect(r3).toMatch(/consecutive_refusals and running_set_age_hours on the LATEST row of crypto_universe_refresh_runs/);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the run — arm (a), degeneracy and arm (b) against the real loader gates', () => {
  it('a normal day (110 of 469 gone, 12 new) applies, and the row and the recorder agree', async () => {
    h.universe = universeOf([...range(0, 359), ...range(600, 612)]);
    const r = await run();
    expect(r).toMatchObject({ outcome: 'applied', refusalReason: null, countBefore: 469, countAfter: 371,
      addedCount: 12, droppedCount: 110, consecutiveRefusals: 0 });
    expect(lastRow()).toMatchObject({ outcome: 'applied', confirmable: true, countBefore: 469, countAfter: 371,
      triggerSource: 'cron', maxDropShare: 0.30, confirmMaxDiffShare: 0.50,
      untrackedOverflowAdds: [] });
    expect(rungRows()).toHaveLength(0);
  });

  it('persists the exact overflow symbols whose open-time subscribe replies are not add-tracked', async () => {
    h.universe = universeOf([...range(0, 469), sym(600)]);
    h.untrackedOverflowAdds = [sym(600)];
    const r = await run();

    expect(r).toMatchObject({ outcome: 'applied', addedCount: 1, droppedCount: 0 });
    expect(lastRow()).toMatchObject({
      added: [sym(600)],
      rejectedAdds: [],
      unconfirmedAdds: [],
      untrackedOverflowAdds: [sym(600)],
    });
  });

  it('the 2026-10-30 fixture (every ticker answer empty, all 428 would go) is refused by arm (a), not reached by arm (b)', async () => {
    h.running = range(0, 428);
    h.universe = universeOf([], [OK_BATCHES[0], SILENT_BATCH, SILENT_BATCH]);
    const r = await run();
    expect([r.outcome, r.refusalReason, r.countAfter]).toEqual(['refused', 'incomplete_fetch', 428]);
    expect(lastRow()).toMatchObject({ confirmable: false, dropShare: null });
    expect(h.applyCalls).toHaveLength(0);
  });

  it('ONE silent ticker batch (59 of 469 = 0.126, which arm (b) would pass) is refused by arm (a)', async () => {
    h.universe = universeOf(range(0, 410), [...OK_BATCHES, SILENT_BATCH]);
    const r = await run();
    expect([r.outcome, r.refusalReason, r.droppedCount]).toEqual(['refused', 'incomplete_fetch', 0]);
    expect(h.running).toHaveLength(469);
  });

  it('an empty computed list after an empty boot is degenerate, not a noop', async () => {
    h.running = [];
    h.universe = universeOf([]);
    const r = await run();
    expect([r.outcome, r.refusalReason]).toEqual(['refused', 'degenerate']);
  });

  it('C1/C2: 227 against 469 (under the ceil(469/2)=235 floor) is degenerate — caught, recorded unconfirmable, our own message', async () => {
    h.universe = universeOf(range(0, 227));
    const warn = vi.spyOn(console, 'warn');
    const r = await run();
    expect([r.outcome, r.refusalReason]).toEqual(['refused', 'degenerate']);
    expect(h.rows).toHaveLength(1);                                // C1: the run row IS written
    expect(lastRow()).toMatchObject({ outcome: 'refused', refusalReason: 'degenerate', confirmable: false,
      computedCount: 227, countBefore: 469 });
    const msgs = warn.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => m.includes('computed 227 symbols against 469 running (floor 235); refusing as degenerate'))).toBe(true);
    expect(msgs.some(m => m.includes('[perpfeed]'))).toBe(false); // C2
  });

  // The floor is pinned from BOTH sides at 235 (Langston Gate A, #10 residual): 234 is degenerate and 235 is not, so a
  // loosened floor fails the first and a tightened one fails the second, and the printed "floor 235" cannot drift.
  it('#10: the plausibility floor is exactly 235 against 469 — 234 is degenerate, 235 is not', async () => {
    h.universe = universeOf(range(0, 234));
    const warn = vi.spyOn(console, 'warn');
    const below = await run();
    expect([below.outcome, below.refusalReason]).toEqual(['refused', 'degenerate']);
    expect(warn.mock.calls.map(c => String(c[0])).some(m => m.includes('computed 234 symbols against 469 running (floor 235)'))).toBe(true);
    h.universe = universeOf(range(0, 235));
    const at = await run();
    expect(at.refusalReason).not.toBe('degenerate');
    expect([at.outcome, at.refusalReason]).toEqual(['refused', 'drop_share']);
  });

  it('a degenerate row is never a baseline: the next run judges arm (b) as if no episode had a baseline', async () => {
    h.universe = universeOf(range(0, 227));
    await run();
    h.universe = universeOf(range(0, 324));                        // 145 of 469 → over the share
    const r = await run();
    expect([r.outcome, r.refusalReason]).toEqual(['refused', 'drop_share']);
    expect(lastRow().confirmDiffShare).toBeNull();
  });

  it('a pinned symbol is held even when the computed list drops it', async () => {
    h.pins = [sym(400)];
    h.universe = universeOf(range(0, 359));                        // drops S359..S468, S400 among them
    const r = await run();
    expect(r.outcome).toBe('applied');
    expect(r.droppedCount).toBe(109);
    expect(h.running).toContain(sym(400));
    expect(lastRow().pinned).toEqual([sym(400)]);
  });

  it('a failed pins read throws — an unknown held set is never "none" — and writes no row', async () => {
    h.pinsThrow = true;
    h.universe = universeOf(range(0, 359));
    await expect(run()).rejects.toThrow(/pins read failed/);
    expect(h.rows).toHaveLength(0);
    expect(h.applyCalls).toHaveLength(0);
  });

  it('a missing knob throws before anything is read or written', async () => {
    delete h.CFG.universe_refresh_confirm_max_diff_share;
    h.universe = universeOf(range(0, 359));
    await expect(run()).rejects.toThrow(/required number missing for crypto_spot\.universe_refresh_confirm_max_diff_share \(got no row\)/);
    expect(h.rows).toHaveLength(0);
  });

  it('a knob stored as a non-number throws too — no coercion', async () => {
    (h.CFG as Record<string, unknown>).universe_refresh_max_drop_share = '0.30';
    h.universe = universeOf(range(0, 359));
    await expect(run()).rejects.toThrow(/required number missing for crypto_spot\.universe_refresh_max_drop_share \(got string\)/);
    expect(h.rows).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the episode — refuse, confirm, converge', () => {
  it('145 of 469: refused, then confirmed and bounded to 140 (lowest volume), then the last 5 apply cleanly', async () => {
    h.universe = universeOf(range(0, 324));
    const r1 = await run();
    expect([r1.outcome, r1.consecutiveRefusals, r1.countAfter]).toEqual(['refused', 1, 469]);
    expect(lastRow().confirmable).toBe(true);

    const r2 = await run();
    expect([r2.outcome, r2.droppedCount, r2.countAfter, r2.consecutiveRefusals]).toEqual(['applied_confirmed', 140, 329, 2]);
    expect(lastRow().boundedStep).toBeCloseTo(140 / 145);
    expect(h.running).toEqual(expect.arrayContaining(range(464, 469)));      // the 5 highest-volume survivors
    expect(h.running).not.toContain(sym(324));

    const r3 = await run();
    expect([r3.outcome, r3.droppedCount, r3.countAfter, r3.consecutiveRefusals]).toEqual(['applied', 5, 324, 0]);
    expect([...h.running].sort()).toEqual(range(0, 324));
  });

  it('a symbol missed by only ONE of the two computations is kept', async () => {
    h.universe = universeOf(range(0, 324));                        // run 1 misses S324..S468
    await run();
    h.universe = universeOf([...range(0, 323), sym(400)]);         // run 2 misses S323 (run 1 had it), has S400 back
    const r = await run();
    expect(r.outcome).toBe('applied_confirmed');
    expect(h.running).toContain(sym(323));                         // missed only by run 2
    expect(h.running).toContain(sym(400));                         // missed only by run 1
    expect(r.droppedCount).toBe(140);                              // of the 144 both agree on
  });

  it('the counter is not reset by a confirmed step, and an applied run ends the episode', async () => {
    h.universe = universeOf(range(0, 324));
    expect((await run()).consecutiveRefusals).toBe(1);
    expect((await run()).consecutiveRefusals).toBe(2);             // applied_confirmed extends
    expect((await run()).consecutiveRefusals).toBe(0);             // applied ends
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the rung alerts — real alert store', () => {
  it('rungs 1, 2 and 3 each mint one row; a 4th refusal re-uses rung 3; the next clean run resolves all three (C3)', async () => {
    h.universe = universeOf(range(0, 410), [...OK_BATCHES, SILENT_BATCH]);
    for (let i = 0; i < 4; i++) await run();
    const open = rungRows();
    expect(open.map(a => [a.dedupe_key, a.severity]).sort()).toEqual([
      [`${RUNG_PREFIX}1`, 'info'], [`${RUNG_PREFIX}2`, 'warning'], [`${RUNG_PREFIX}3`, 'critical'],
    ]);
    const rung3 = open.find(a => a.dedupe_key === `${RUNG_PREFIX}3`)!;
    const rung3Body = rung3.body;
    expect(rung3Body).toMatch(/NO operator path/);
    expect(lastRow().consecutiveRefusals).toBe(4);
    // The open rung-3 row was minted at refusal 3 and is now four refusals old: its body must carry no count or age
    // purporting to be current (Langston Gate A FINDING-1).
    expect(rung3Body).not.toMatch(/consecutive runs without a clean apply:? \d|h before this run|h ago/i);
    expect(rung3Body).toMatch(/LATEST row of crypto_universe_refresh_runs/);
    // The title is the widest-reach surface (the resurface path replays it to Kyle) and freezes the same way.
    expect(rung3.title).not.toMatch(/\d+ run\(s\)/);
    expect(rung3.title).toMatch(/3 or more consecutive runs without a clean apply/);
    // The frozen metadata never borrows the live column names the body advertises.
    const md = (typeof rung3.metadata === 'string' ? JSON.parse(rung3.metadata) : rung3.metadata) as Record<string, unknown>;
    expect(md).not.toHaveProperty('consecutive_refusals');
    expect(md).not.toHaveProperty('running_set_age_hours');
    expect(md.consecutive_refusals_at_mint).toBe(3);

    h.universe = universeOf(range(0, 469));                        // nothing to change → noop
    const r = await run();
    expect(r.outcome).toBe('noop');
    const after = rungRows();
    expect(after).toHaveLength(3);
    for (const a of after) {
      expect(a.state).toBe('resolved');
      expect(a.resolved_by_claimed).toBe(REFRESH_ACTOR);
      expect(a.resolved_by_transport).toBe('engine');
      expect(a.resolution_evidence).toBe(`crypto_universe_refresh_runs ${lastRow().id}`);
    }
  });

  it('a confirmed step raises a rung (still converging), and the following applied run resolves it', async () => {
    h.universe = universeOf(range(0, 324));
    await run();
    await run();
    expect(rungRows().filter(a => a.state !== 'resolved').map(a => a.dedupe_key).sort())
      .toEqual([`${RUNG_PREFIX}1`, `${RUNG_PREFIX}2`]);
    await run();
    expect(rungRows().every(a => a.state === 'resolved')).toBe(true);
  });

  it('after a resolved episode, a new refusal mints a fresh rung-1 row', async () => {
    h.universe = universeOf(range(0, 410), [...OK_BATCHES, SILENT_BATCH]);
    await run();
    h.universe = universeOf(range(0, 469));
    await run();
    h.universe = universeOf(range(0, 410), [...OK_BATCHES, SILENT_BATCH]);
    await run();
    const r1 = rungRows().filter(a => a.dedupe_key === `${RUNG_PREFIX}1`);
    expect(r1.map(a => a.state).sort()).toEqual(['resolved', 'scheduled']);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('the cron registration', () => {
  it('registers the daily 03:00 UTC job with a recovery run that returns the refresh outcome as meta', async () => {
    vi.resetModules();
    const registered: any[] = [];
    vi.doMock('node-cron', () => ({ createTask: () => ({ on: () => {}, start: () => {}, stop: () => {} }) }));
    vi.doMock('../../services/cron-registry.js', () => ({
      cronRegistry: { register: (e: any) => registered.push(e), get: (n: string) => registered.find(e => e.name === n) },
    }));
    vi.doMock('../../services/cron-arm-logger.js', () => ({ logCronArm: () => {} }));
    vi.doMock('../../services/cron-occurrence-runner.js', () => ({
      cronOccurrenceRunner: { prepareJob: async () => {}, runNatural: async () => {}, dispatchMissed: () => {} },
    }));
    const cronMod = await import('../../services/crypto-universe-refresh-cron.js');
    await cronMod.registerCryptoUniverseRefreshCron();
    expect(registered).toHaveLength(1);
    const e = registered[0];
    expect([e.name, e.expression, e.timezone, e.intervalSeconds, e.recovery.policyKey]).toEqual([
      'crypto_universe_refresh_cron', '0 3 * * *', 'UTC', 86400, 'crypto_universe_refresh_cron',
    ]);

    h.universe = universeOf([...range(0, 359), ...range(600, 612)]);
    const out = await e.recovery.run({ occurrenceId: randomUUID(), triggerSource: 'missed_catchup' });
    expect(out.meta).toEqual({ outcome: 'applied', refusal_reason: null, count_before: 469, count_after: 371,
      added: 12, dropped: 110, consecutive_refusals: 0 });
    expect(lastRow().triggerSource).toBe('missed_catchup');
  });
});
