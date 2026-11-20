/**
 * B-XSTOCK-BAR-AVAILABILITY Step 9 C6 (design r8) - unit fences for the chunked gate read.
 * The real-database equality proof is `tests/integration/b-xstock-bar-availability-gate-read.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXACTNESS_MAX_IDS,
  GATE_READ_BUDGET,
  InconclusiveRead,
  asInconclusive,
  budgetedQuery,
  planGradedChunks,
  POPULATION_CHUNK_SQL,
  POPULATION_EXACTNESS_SQL,
  SESSION_CHUNK_SQL,
  UNLINKED_RECHECK_SQL,
  readPopulationChunked,
  reconstructDistinctCounts,
  startBudget,
  summarizeTimings,
  type IdentityRead,
  type PopulationRead,
  type ReadBudget,
} from '../../scripts/b-xstock-bar-availability-gate-read.js';

const root = path.resolve(__dirname, '../../..');
const DAY = 86_400_000;

function fakeClient(responder: (text: string, params?: unknown[]) => unknown) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    calls,
    // A stand-in for pg's overloaded ClientBase.query: the reader only ever calls (text, params).
    query: (async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      const out = responder(text, params);
      if (out instanceof Error) throw out;
      return out ?? { rows: [{}] };
    }) as any,
  };
}

function budgetAt(remainingMs: number): ReadBudget {
  const now = 1_000_000;
  return { startedAtMs: now, deadlineMs: now + remainingMs, now: () => now, timings: [] };
}

describe('C6 planGradedChunks - every bound from the two captured values, nothing dropped', () => {
  it('whole UTC days from a midnight start, then the partial trailing chunk ending at observedAt', () => {
    const start = new Date('2026-11-23T00:00:00.000Z');
    const observed = new Date('2026-11-25T06:30:00.000Z');
    const chunks = planGradedChunks(start, observed);
    expect(chunks.map((c) => [c.start.toISOString(), c.end.toISOString(), c.partial])).toEqual([
      ['2026-11-23T00:00:00.000Z', '2026-11-24T00:00:00.000Z', false],
      ['2026-11-24T00:00:00.000Z', '2026-11-25T00:00:00.000Z', false],
      ['2026-11-25T00:00:00.000Z', '2026-11-25T06:30:00.000Z', true],
    ]);
  });
  it('a 00:05 start yields a leading partial chunk to the next midnight', () => {
    const chunks = planGradedChunks(new Date('2026-11-09T00:05:00Z'), new Date('2026-11-10T12:00:00Z'));
    expect(chunks[0]).toMatchObject({ partial: true });
    expect(chunks[0].end.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(chunks.at(-1)!.end.toISOString()).toBe('2026-11-10T12:00:00.000Z');
  });
  it('an observedAt exactly at midnight leaves no empty trailing chunk; the chunks tile the window', () => {
    const start = new Date('2026-11-23T00:00:00Z');
    const observed = new Date(start.getTime() + 2 * DAY);
    const chunks = planGradedChunks(start, observed);
    expect(chunks).toHaveLength(2);
    expect(chunks.every((c) => !c.partial)).toBe(true);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start.getTime()).toBe(chunks[i - 1].end.getTime());
  });
  it('an empty or inverted window plans nothing', () => {
    const t = new Date('2026-11-23T00:00:00Z');
    expect(planGradedChunks(t, t)).toEqual([]);
    expect(planGradedChunks(t, new Date(t.getTime() - 1))).toEqual([]);
  });
});

describe('C6-3 budgetedQuery - the cap is enforced server-side, re-issued before every statement', () => {
  it('sets statement_timeout = min(cap, remaining) before the statement', async () => {
    const client = fakeClient(() => ({ rows: [{}] }));
    await budgetedQuery(client, budgetAt(50_000), 120_000, 'leg', 'SELECT 1');
    expect(client.calls[0].text).toBe('SET LOCAL statement_timeout = 50000');
    expect(client.calls[1].text).toBe('SELECT 1');
    await budgetedQuery(client, budgetAt(10 * 60_000), 120_000, 'leg', 'SELECT 2');
    expect(client.calls[2].text).toBe('SET LOCAL statement_timeout = 120000');
  });
  it('below the minimum remaining budget it does not start the statement: INCONCLUSIVE', async () => {
    const client = fakeClient(() => ({ rows: [{}] }));
    await expect(budgetedQuery(client, budgetAt(GATE_READ_BUDGET.minimumStatementMs - 1), 120_000, 'leg', 'SELECT 1'))
      .rejects.toBeInstanceOf(InconclusiveRead);
    expect(client.calls).toHaveLength(0);
  });
  it('a statement timeout (57014) and a lock timeout (55P03) become INCONCLUSIVE; other errors stay fatal', async () => {
    const cancel = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    const lock = Object.assign(new Error('could not obtain lock'), { code: '55P03' });
    const other = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    for (const [error, inconclusive] of [[cancel, true], [lock, true], [other, false]] as const) {
      const client = fakeClient((text) => (text.startsWith('SET LOCAL') ? { rows: [] } : error));
      const run = budgetedQuery(client, budgetAt(60_000), 120_000, 'leg', 'SELECT 1');
      if (inconclusive) await expect(run).rejects.toBeInstanceOf(InconclusiveRead);
      else await expect(run).rejects.toBe(other);
    }
    expect(asInconclusive(other, 'x')).toBeNull();
  });
});

describe('R7 condition 1 - every statement is timed, whatever its outcome', () => {
  function clockBudget(remainingMs: number) {
    let t = 5_000_000;
    const budget = startBudget(remainingMs, () => t);
    return { budget, advance: (ms: number) => { t += ms; } };
  }
  it('records leg, elapsed, the applied timeout and the outcome for ok, inconclusive, fatal and refused', async () => {
    const { budget, advance } = clockBudget(60_000);
    const cancel = Object.assign(new Error('cancel'), { code: '57014' });
    const other = Object.assign(new Error('boom'), { code: '42P01' });
    let next: unknown = { rows: [{}] };
    const client = fakeClient((text) => {
      if (text.startsWith('SET LOCAL')) return { rows: [] };
      advance(250);
      return next;
    });
    await budgetedQuery(client, budget, 120_000, 'meta', 'SELECT 1');
    next = cancel;
    await expect(budgetedQuery(client, budget, 2_000, 'population', 'SELECT 2')).rejects.toBeInstanceOf(InconclusiveRead);
    next = other;
    await expect(budgetedQuery(client, budget, 120_000, 'telemetry', 'SELECT 3')).rejects.toBe(other);
    advance(60_000);
    await expect(budgetedQuery(client, budget, 120_000, 'archive', 'SELECT 4')).rejects.toBeInstanceOf(InconclusiveRead);
    expect(budget.timings).toEqual([
      { leg: 'meta', elapsedMs: 250, timeoutMs: 60_000, outcome: 'ok' },
      { leg: 'population', elapsedMs: 250, timeoutMs: 2_000, outcome: 'inconclusive' },
      { leg: 'telemetry', elapsedMs: 250, timeoutMs: 59_500, outcome: 'error' },
      { leg: 'archive', elapsedMs: 0, timeoutMs: 0, outcome: 'refused' },
    ]);
  });
  it('summarizeTimings rolls up per leg in first-seen order and reports the RUN elapsed, not a window length', async () => {
    const { budget, advance } = clockBudget(20 * 60_000);
    const client = fakeClient((text) => {
      if (!text.startsWith('SET LOCAL')) advance(text === 'SLOW' ? 1_000 : 100);
      return { rows: [{}] };
    });
    await budgetedQuery(client, budget, 120_000, 'population', 'SLOW');
    await budgetedQuery(client, budget, 120_000, 'meta', 'FAST');
    await budgetedQuery(client, budget, 120_000, 'population', 'FAST');
    advance(400); // client-side work between statements
    const s = summarizeTimings(budget);
    expect(s.runElapsedMs).toBe(1_600);
    expect(s.statementMs).toBe(1_200);
    expect(s.statements).toBe(3);
    expect(s.legTimings).toEqual([
      { leg: 'population', statements: 2, totalMs: 1_100, maxMs: 1_000, outcomes: { ok: 2, inconclusive: 0, error: 0, refused: 0 } },
      { leg: 'meta', statements: 1, totalMs: 100, maxMs: 100, outcomes: { ok: 1, inconclusive: 0, error: 0, refused: 0 } },
    ]);
  });
});

describe('C6-5 the exactness pass - batched, and capped', () => {
  const window = [new Date('2026-11-23T00:00:00Z'), new Date('2026-11-24T00:00:00Z')] as const;
  const row = (links: number, unfound: string[]) => ({
    expected_revision_links: links, unfound_ids: unfound, revision_events: links - unfound.length,
    null_visible_seq_rows: 0, symbol_set: ['A/USD'], applied_winners: links - unfound.length,
    rejected_older_arrivals: 0, repeated_payload_attempts: 0, pending_certificates: 0,
    unhealthy_certificates: 0, negative_certificate_lags: 0,
    lag_min_ms: 1, lag_p50_ms: 2, lag_p95_ms: 3, lag_max_ms: 4,
  });
  it('ids missed by the bound get ONE batched unbounded lookup, and are counted', async () => {
    const client = fakeClient((text) => {
      if (text.startsWith('SET LOCAL')) return { rows: [] };
      if (text.includes('unnest($1::uuid[])')) {
        return { rows: [{ missing_linked_revision_events: 0, found_ids: ['u1'], revision_events: 1,
          null_visible_seq_rows: 0, symbol_set: ['B/USD'], applied_winners: 1, rejected_older_arrivals: 0,
          repeated_payload_attempts: 0, pending_certificates: 0, unhealthy_certificates: 0,
          negative_certificate_lags: 0 }] };
      }
      return { rows: [row(1_000, ['u1'])] };
    });
    const read = await readPopulationChunked(client, budgetAt(10 * 60_000), window[0], window[1]);
    const lookups = client.calls.filter((c) => c.text.includes('unnest($1::uuid[])'));
    expect(lookups).toHaveLength(1);
    expect(lookups[0].params).toEqual([['u1']]);
    expect(read.revisionEvents).toBe(1_000);
    expect(read.outOfBoundIds).toEqual(['u1']);
    expect([...read.symbols].sort()).toEqual(['A/USD', 'B/USD']);
  });
  it(`above ${EXACTNESS_MAX_IDS} unfound ids in a chunk the run is INCONCLUSIVE, worded as undetermined`, async () => {
    const unfound = Array.from({ length: EXACTNESS_MAX_IDS + 1 }, (_, i) => `u${i}`);
    const client = fakeClient((text) => (text.startsWith('SET LOCAL') ? { rows: [] } : { rows: [row(900_000, unfound)] }));
    const run = readPopulationChunked(client, budgetAt(10 * 60_000), window[0], window[1]);
    await expect(run).rejects.toBeInstanceOf(InconclusiveRead);
    await expect(run).rejects.toThrow(/out-of-bound or absent - not determined/);
    expect(client.calls.some((c) => c.text.includes('unnest($1::uuid[])'))).toBe(false);
  });
  it('window-wide lag min/max merge across chunks; per-chunk elapsed is recorded', async () => {
    const client = fakeClient((text) => (text.startsWith('SET LOCAL') ? { rows: [] } : { rows: [row(10, [])] }));
    const two = await readPopulationChunked(client, budgetAt(10 * 60_000),
      new Date('2026-11-23T00:00:00Z'), new Date('2026-11-25T00:00:00Z'));
    expect(two.lagMinMs).toBe(1);
    expect(two.lagMaxMs).toBe(4);
    expect(two.perDay.every((d) => typeof d.elapsedMs === 'number')).toBe(true);
  });
});

describe('C6-1 the identity reconstruction fails exactly when the single-shot would', () => {
  const population = { revisionEvents: 500, nullVisibleSeqRows: 0 } as PopulationRead;
  const clean: IdentityRead = {
    duplicateLinkExtra: 0, revisionDuplicateIdsTableWide: 0, linkedRevisionDuplicateIds: 0,
    linkedRevisionDuplicateExtraRows: 0, visibleSeqDuplicatesTableWide: 0, linkedVisibleSeqDuplicates: 0,
    linkedVisibleSeqDuplicateExtraRows: 0,
  };
  it('no duplicate: both distinct counts equal the event count', () => {
    expect(reconstructDistinctCounts(population, clean)).toEqual({ distinctRevisionIds: 500, distinctVisibleSeqs: 500 });
  });
  it('a duplicate event row, a duplicate link, a duplicate seq or a null seq each drop it below', () => {
    expect(reconstructDistinctCounts(population, { ...clean, linkedRevisionDuplicateExtraRows: 1 }).distinctRevisionIds).toBe(499);
    const link = reconstructDistinctCounts(population, { ...clean, duplicateLinkExtra: 1 });
    expect(link.distinctRevisionIds).toBe(499);
    expect(link.distinctVisibleSeqs).toBe(499);
    expect(reconstructDistinctCounts(population, { ...clean, linkedVisibleSeqDuplicateExtraRows: 1 }).distinctVisibleSeqs).toBe(499);
    expect(reconstructDistinctCounts({ ...population, nullVisibleSeqRows: 2 } as PopulationRead, clean).distinctVisibleSeqs).toBe(498);
  });
});

describe('C6 source fences on the gate script', () => {
  const gate = fs.readFileSync(path.join(root, 'server/scripts/b-xstock-bar-availability-capacity-gate.ts'), 'utf8');
  it('keeps ONE repeatable-read read-only snapshot with a gate-side lock timeout', () => {
    expect(gate.match(/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/g)).toHaveLength(1);
    expect(gate).toContain('SET LOCAL lock_timeout = ${GATE_READ_BUDGET.lockTimeoutMs}');
  });
  it('every data statement in the script goes through the budget (only BEGIN, SET LOCAL lock_timeout, COMMIT and ROLLBACK do not)', () => {
    const raw = [...gate.matchAll(/client\.query\(([^)]{0,60})/g)].map((m) => m[1]);
    expect(raw.every((arg) => /BEGIN|lock_timeout|COMMIT|ROLLBACK/.test(arg))).toBe(true);
  });
  it('every event lookup is bounded by arrived_at or by an explicit id list; the gate itself joins no event table', () => {
    expect(POPULATION_CHUNK_SQL).toContain('WHERE arrived_at >= $3 AND arrived_at < $4');
    expect(POPULATION_CHUNK_SQL).toContain('LEFT JOIN ev e ON e.revision_id = l.revision_id');
    expect(POPULATION_EXACTNESS_SQL).toContain('FROM unnest($1::uuid[]) AS ids(revision_id)');
    expect(SESSION_CHUNK_SQL).toContain('WHERE arrived_at >= $3 AND arrived_at < $4');
    expect(SESSION_CHUNK_SQL).toContain('WHERE revision_id = ANY($5::uuid[])');
    expect(UNLINKED_RECHECK_SQL).toContain('WHERE c.completed_at < $2 AND saved.revision_id = ANY($1::uuid[])');
    expect(gate).not.toMatch(/JOIN xstock_bar_revision_event/);
  });
  it('inconclusive is a written verdict with its own exit code; pass and fail have theirs', () => {
    expect(gate).toContain("export const GATE_EXIT = { pass: 0, fatal: 1, fail: 2, inconclusive: 3 } as const;");
    expect(gate).toMatch(/error instanceof InconclusiveRead[\s\S]{0,700}state: 'inconclusive'[\s\S]{0,400}GATE_EXIT\.inconclusive/);
    expect(gate).toContain("state: verdict.pass ? 'pass' : 'fail'");
  });
  it('R7 condition 1: the PASS/FAIL verdict and the inconclusive verdict both carry runTiming', () => {
    expect(gate).toContain("verdict: { state: verdict.pass ? 'pass' : 'fail', ...verdict, runTiming: summarizeTimings(budget) }");
    expect(gate).toMatch(/state: 'inconclusive'[\s\S]{0,120}runTiming: summarizeTimings\(budget\)/);
  });
  it('carried item (a): EVERY module_constants lookup in the gate carries a scope predicate (counted, not named)', () => {
    const lookups = gate.split('FROM module_constants').slice(1).map((after) => after.slice(0, after.indexOf('LIMIT 1')));
    expect(lookups.length).toBeGreaterThanOrEqual(5);
    for (const lookup of lookups) {
      expect(lookup.includes('${WILDCARD_SCOPE_SQL}') || lookup.includes('${DATA_LIFECYCLE_SCOPE_SQL}')).toBe(true);
    }
  });
});
