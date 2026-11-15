import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assembleEstimate,
  exactCountSql,
  isDailyLeaf,
  planEstimate,
  type LeafInfo,
} from '../../services/data-archive/archive-count-estimate';
import { ESTIMATED_COUNT_TABLES } from '../../services/drift-dashboard-aggregator';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DAY = 86_400_000;
const T = (iso: string) => Date.parse(iso);
// The staging moment the layout below was measured at (2026-11-14 ~21:40Z).
const NOW = T('2026-11-14T21:40:00Z');

/** signal_eval_archive as measured: 16 daily leaves with data (10-30 .. 11-14, today's open) + 14 empty future days. */
function seaLeaves(): LeafInfo[] {
  const out: LeafInfo[] = [];
  for (let d = T('2026-10-30T00:00:00Z'); d < T('2026-11-29T00:00:00Z'); d += DAY) {
    const day = new Date(d).toISOString().slice(0, 10).replace(/-/g, '_');
    const filled = d <= T('2026-11-14T00:00:00Z');
    out.push({ qname: `signal_eval_archive_${day}`, reltuples: filled ? 2_000_000 : -1, heapBytes: filled ? 1e9 : 0, fromMs: d, toMs: d + DAY, analyzedAt: filled ? '2026-11-14 20:18:52+00' : null });
  }
  return out;
}
/** signal_eval_provenance as measured: monthly 2026_10 and 2026_11 with data, 16 empty future daily leaves. */
function sepLeaves(): LeafInfo[] {
  const out: LeafInfo[] = [
    { qname: 'signal_eval_provenance_2026_10', reltuples: 18_951_660, heapBytes: 6e9, fromMs: T('2026-10-01T00:00:00Z'), toMs: T('2026-11-01T00:00:00Z'), analyzedAt: '2026-10-30 07:32:12+00' },
    { qname: 'signal_eval_provenance_2026_11', reltuples: 8_252_792, heapBytes: 2.5e9, fromMs: T('2026-11-01T00:00:00Z'), toMs: T('2026-12-01T00:00:00Z'), analyzedAt: '2026-11-13 22:28:31+00' },
  ];
  for (let d = T('2026-12-01T00:00:00Z'); d < T('2026-12-17T00:00:00Z'); d += DAY) {
    out.push({ qname: `signal_eval_provenance_${new Date(d).toISOString().slice(0, 10).replace(/-/g, '_')}`, reltuples: -1, heapBytes: 0, fromMs: d, toMs: d + DAY, analyzedAt: null });
  }
  return out;
}
const key = (q: string, since: string | null) => `${q}|${since ?? ''}`;

describe('B-DB-SIZE-RELIEF Step-9 (KD-80) — the planner on the measured layouts', () => {
  it('signal_eval_archive at rolling_24h: two DAILY leaves counted EXACTLY (yesterday from the window start, today whole) — an exact figure', () => {
    const W = NOW - DAY;
    const plan = planEstimate(seaLeaves(), W, NOW);
    expect(plan.asks).toEqual([
      { qname: 'signal_eval_archive_2026_11_13', sinceIso: new Date(W).toISOString() },
      { qname: 'signal_eval_archive_2026_11_14', sinceIso: null },
    ]);
    const r = assembleEstimate(plan, new Map([[key('signal_eval_archive_2026_11_13', new Date(W).toISOString()), 146_195], [key('signal_eval_archive_2026_11_14', null), 1_851_107]]));
    expect(r.rowsInWindow).toBe(146_195 + 1_851_107);
    expect(r.rowsInWindowKind).toBe('exact');
    // total: 15 closed leaves by estimate + today exact
    expect(r.totalRows).toBe(15 * 2_000_000 + 1_851_107);
    expect(r.totalRowsKind).toBe('estimate');
  });
  it('signal_eval_archive at rolling_30d: the window starts before the first leaf — every closed leaf by estimate, today exact', () => {
    const W = NOW - 30 * DAY;
    const plan = planEstimate(seaLeaves(), W, NOW);
    expect(plan.asks).toEqual([{ qname: 'signal_eval_archive_2026_11_14', sinceIso: null }]);
    const r = assembleEstimate(plan, new Map([[key('signal_eval_archive_2026_11_14', null), 1_851_107]]));
    expect(r.rowsInWindow).toBe(15 * 2_000_000 + 1_851_107);
    expect(r.rowsInWindowKind).toBe('estimate');
  });
  it('the 14 unanalysed EMPTY future leaves contribute 0 and never make the figure a lower bound', () => {
    const r = assembleEstimate(planEstimate(seaLeaves(), NOW - 30 * DAY, NOW), new Map([[key('signal_eval_archive_2026_11_14', null), 1]]));
    expect(r.countNote ?? '').not.toMatch(/never analysed/);
    expect(r.totalRowsKind).toBe('estimate');
  });
  it('signal_eval_provenance at rolling_30d: the MONTHLY boundary leaf is EXCLUDED and named — a lower bound, no proration (Langston D)', () => {
    const r = assembleEstimate(planEstimate(sepLeaves(), NOW - 30 * DAY, NOW), new Map());
    expect(r.rowsInWindowKind).toBe('lower_bound');
    expect(r.rowsInWindow).toBe(8_252_792); // 2026_11 only; NOT 8,252,792 + a fraction of 18,951,660
    expect(r.countNote).toMatch(/excludes part of signal_eval_provenance_2026_10/);
    expect(r.countNote).toMatch(/signal_eval_provenance_2026_11 is still being written; its estimate is as of its last analyse/);
  });
  it('signal_eval_provenance at rolling_24h and rolling_7d: the window lies wholly inside the open MONTHLY leaf — UNAVAILABLE, not 0', () => {
    for (const w of [DAY, 7 * DAY]) {
      const r = assembleEstimate(planEstimate(sepLeaves(), NOW - w, NOW), new Map());
      expect(r.rowsInWindowKind).toBe('unavailable');
      expect(r.rowsInWindow).toBe(0);
      expect(r.countNote).toMatch(/excludes part of signal_eval_provenance_2026_11/);
    }
  });
  it('provenance total: both monthly estimates, labelled as an estimate, the open leaf named as lagging', () => {
    const r = assembleEstimate(planEstimate(sepLeaves(), NOW - DAY, NOW), new Map());
    expect(r.totalRows).toBe(18_951_660 + 8_252_792);
    expect(r.totalRowsKind).toBe('estimate');
  });
});

describe('B-DB-SIZE-RELIEF Step-9 — Langston E: an unanalysed leaf WITH DATA, and failed exact counts', () => {
  it('a filling leaf with reltuples -1 and heap > 0 is never coerced to 0 nor summed as -1: excluded, named, lower bound', () => {
    const leaves = seaLeaves();
    const i = leaves.findIndex((l) => l.qname.endsWith('2026_11_10'));
    leaves[i] = { ...leaves[i], reltuples: -1, analyzedAt: null };
    const r = assembleEstimate(planEstimate(leaves, NOW - 30 * DAY, NOW), new Map([[key('signal_eval_archive_2026_11_14', null), 1_000]]));
    expect(r.rowsInWindowKind).toBe('lower_bound');
    expect(r.totalRowsKind).toBe('lower_bound');
    expect(r.rowsInWindow).toBe(14 * 2_000_000 + 1_000); // not 15 x 2M, not 15 x 2M - 1
    expect(r.countNote).toMatch(/excludes signal_eval_archive_2026_11_10 \(holds data, never analysed\)/);
  });
  it('a failed exact count excludes its leaf (named) — never 0', () => {
    const W = NOW - DAY;
    const plan = planEstimate(seaLeaves(), W, NOW);
    const r = assembleEstimate(plan, new Map([[key('signal_eval_archive_2026_11_13', new Date(W).toISOString()), 146_195], [key('signal_eval_archive_2026_11_14', null), null]]));
    expect(r.rowsInWindowKind).toBe('lower_bound');
    expect(r.rowsInWindow).toBe(146_195);
    expect(r.countNote).toMatch(/excludes signal_eval_archive_2026_11_14 \(its exact count did not complete\)/);
  });
  it('every exact count failing leaves no contribution: UNAVAILABLE', () => {
    const W = NOW - DAY;
    const r = assembleEstimate(planEstimate(seaLeaves(), W, NOW), new Map([[key('signal_eval_archive_2026_11_13', new Date(W).toISOString()), null], [key('signal_eval_archive_2026_11_14', null), null]]));
    expect(r.rowsInWindowKind).toBe('unavailable');
  });
  it('a leaf with no date range (a DEFAULT partition) holding data makes the window a lower bound', () => {
    const leaves = [...seaLeaves(), { qname: 'signal_eval_archive_default', reltuples: 5, heapBytes: 8192, fromMs: null, toMs: null, analyzedAt: null }];
    const r = assembleEstimate(planEstimate(leaves, NOW - 30 * DAY, NOW), new Map([[key('signal_eval_archive_2026_11_14', null), 1]]));
    expect(r.rowsInWindowKind).toBe('lower_bound');
    expect(r.countNote).toMatch(/excludes signal_eval_archive_default \(no date range\)/);
  });
  it('isDailyLeaf: 24 h is daily, a month is not', () => {
    expect(isDailyLeaf(seaLeaves()[0])).toBe(true);
    expect(isDailyLeaf(sepLeaves()[0])).toBe(false);
  });
  it('exactCountSql refuses a leaf name outside the quoted-identifier alphabet', () => {
    expect(() => exactCountSql({ qname: 'x; drop table y', sinceIso: null })).toThrow(/unsafe leaf name/);
    expect(exactCountSql({ qname: 'signal_eval_archive_2026_11_14', sinceIso: '2026-11-13T21:40:00.000Z' }))
      .toBe("SELECT count(*)::bigint AS n FROM signal_eval_archive_2026_11_14 WHERE captured_at >= '2026-11-13T21:40:00.000Z'");
  });
});

describe('B-DB-SIZE-RELIEF Step-9 — Langston Step-4 folds (2026-11-15)', () => {
  it('a NON-daily boundary leaf asks for its in-window slice exactly; with the count, provenance 24h is EXACT, not unavailable', () => {
    const W = NOW - DAY;
    const plan = planEstimate(sepLeaves(), W, NOW);
    expect(plan.asks).toEqual([{ qname: 'signal_eval_provenance_2026_11', sinceIso: new Date(W).toISOString() }]);
    const r = assembleEstimate(plan, new Map([[key('signal_eval_provenance_2026_11', new Date(W).toISOString()), 1_234_567]]));
    expect(r.rowsInWindowKind).toBe('exact');
    expect(r.rowsInWindow).toBe(1_234_567);
  });
  it('provenance 30d with both slices answered: the 2026_11 leaf by estimate plus the 2026_10 slice exactly — an estimate, no exclusion', () => {
    const W = NOW - 30 * DAY;
    const plan = planEstimate(sepLeaves(), W, NOW);
    expect(plan.asks).toEqual([{ qname: 'signal_eval_provenance_2026_10', sinceIso: new Date(W).toISOString() }]);
    const r = assembleEstimate(plan, new Map([[key('signal_eval_provenance_2026_10', new Date(W).toISOString()), 3_000_000]]));
    expect(r.rowsInWindowKind).toBe('estimate');
    expect(r.rowsInWindow).toBe(8_252_792 + 3_000_000);
    expect(r.countNote ?? '').not.toMatch(/excludes/);
  });
  it('the slice count failing (the 6 s bound) falls back to the exclusion: a lower bound with the leaf named, never 0', () => {
    const W = NOW - 30 * DAY;
    const r = assembleEstimate(planEstimate(sepLeaves(), W, NOW), new Map([[key('signal_eval_provenance_2026_10', new Date(W).toISOString()), null]]));
    expect(r.rowsInWindowKind).toBe('lower_bound');
    expect(r.rowsInWindow).toBe(8_252_792);
    expect(r.countNote).toMatch(/excludes part of signal_eval_provenance_2026_10 \(its exact count did not complete\)/);
  });
  it('total-arm symmetry: when no leaf contributes to the total, the total is UNAVAILABLE, never a confident 0', () => {
    const open: LeafInfo = { qname: 'signal_eval_archive_2026_11_14', reltuples: -1, heapBytes: 1e9, fromMs: T('2026-11-14T00:00:00Z'), toMs: T('2026-11-15T00:00:00Z'), analyzedAt: null };
    const r = assembleEstimate(planEstimate([open], NOW - DAY, NOW), new Map([[key(open.qname, null), null]]));
    expect(r.totalRowsKind).toBe('unavailable');
    expect(r.totalRows).toBe(0);
    expect(r.rowsInWindowKind).toBe('unavailable');
  });
  it('when every partition holding data lies inside the window, the note says the window equals the total; when it does not, no such note', () => {
    const at30 = assembleEstimate(planEstimate(seaLeaves(), NOW - 30 * DAY, NOW), new Map([[key('signal_eval_archive_2026_11_14', null), 1]]));
    expect(at30.rowsInWindow).toBe(at30.totalRows);
    expect(at30.countNote).toMatch(/every partition holding data lies inside this window, so it equals the total/);
    const W7 = NOW - 7 * DAY;
    const plan7 = planEstimate(seaLeaves(), W7, NOW);
    const at7 = assembleEstimate(plan7, new Map(plan7.asks.map((a) => [key(a.qname, a.sinceIso), 1] as [string, number])));
    expect(at7.countNote ?? '').not.toMatch(/equals the total/);
  });
  it('the DROP-only premise is written into the module header (Langston B)', () => {
    const src = read('server/services/data-archive/archive-count-estimate.ts');
    expect(src).toMatch(/THE PREMISE THE ESTIMATES REST ON/);
    expect(src).toMatch(/never by a row DELETE\./);
    // fold-r2 C-1/C-2: the UPDATE that does exist is named and ruled immaterial; the variable-table DELETE is enumerated
    expect(src).toMatch(/An UPDATE does exist/);
    expect(src).toMatch(/PLAIN_RETENTION_TABLES \(xstock_qd_probe_history, vts_open_trades,\s*\n?\s*\*?\s*closed_trades\)/);
  });
});

describe('B-DB-SIZE-RELIEF Step-9 — wiring fences', () => {
  it('only the two measured tables take the estimate path; the other three keep exact counts', () => {
    expect([...ESTIMATED_COUNT_TABLES].sort()).toEqual(['signal_eval_archive', 'signal_eval_provenance']);
  });
  it('no reltuples coercion anywhere in the module (Langston E1: greatest(reltuples,0) is forbidden)', () => {
    const src = read('server/services/data-archive/archive-count-estimate.ts');
    expect(src).not.toMatch(/greatest\(\s*(c\.)?reltuples/i);
    expect(src).not.toMatch(/Math\.max\([^)]*reltuples/);
  });
  it('the client never shows a non-exact count bare: ≈, ≥ or "estimate unavailable"', () => {
    const src = read('client/src/pages/analytics.tsx');
    expect(src).toContain("if (kind === 'estimate') return `≈ ${v}`;");
    expect(src).toContain("if (kind === 'lower_bound') return `≥ ${v}`;");
    expect(src).toContain("'estimate unavailable'");
    expect(src).toContain('fmtArchiveCount(t.rowsInWindow, t.rowsInWindowKind, t.timedOut)');
    expect(src).toContain('fmtArchiveCount(t.totalRows, t.totalRowsKind, t.timedOut)');
  });
});
