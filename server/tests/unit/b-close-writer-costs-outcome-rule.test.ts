// B-CLOSE-WRITER-COSTS P-15 (pre-audit r3-r7, Langston PROCEED r7 + C-15) — ONE "is this a trade outcome" rule.
//
//   V-1..V-3  the vocabulary leaf: every reason classed; the derived lists; the reason-pure classifier.
//   S-1..S-5  `countedTrades`: the three legs in their stated order (C-9), each exclusion counted separately.
//   F-1..F-3  the SQL fence over `storage.ts` (C-14 scope, record item 1): it PARSES the `sql` template literals —
//             comments (`//`, `/* */` outside templates, `--` inside them) can neither trip it nor be why it passes —
//             and finds NO literal close reason in a read predicate except the two named, Kyle-decided arms.
//             ⚠️ SCOPE (Langston Part A record i): a reason literal inside `sql.raw("...")` is NOT seen — the parser reads
//             template text, and `sql.raw`'s argument is a quoted JS string. Do not write reason literals through sql.raw.
//   Q-1..Q-12 the twelve query methods, run against a recording stand-in for the database; each query is rendered by
//             drizzle's own dialect, so the test reads the SQL that would be sent: at the ten, a `hard_reset` row is
//             excluded (bound in the list); the scoreboard binds the BOOKED allowlist + `exit_price > 0`; the two named
//             arms still INCLUDE `never_filled` (the cooldown start; the history list's visibility).
//
// POSITIVE CONTROLS (mutation-proved while writing): removing `hard_reset` from NON_OUTCOME fails V-2 and the ten Q
// legs; restoring one hand-written `'never_filled'` literal at a converted site fails F-2; swapping legs 2 and 3 of
// `countedTrades` fails S-2.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';

const rec = vi.hoisted(() => ({ queries: [] as unknown[] }));

vi.mock('../../db', () => {
  // Any chain (select/from/where/orderBy/limit/offset/groupBy …) records the argument of every `where`; awaiting it
  // yields no rows. `execute` records its SQL and yields one empty row.
  const chain = (): unknown => new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve([]).then(ok);
      return (...args: unknown[]) => { if (prop === 'where') rec.queries.push(args[0]); return chain(); };
    },
  });
  return {
    db: {
      select: () => chain(),
      execute: (q: unknown) => { rec.queries.push(q); return Promise.resolve({ rows: [{}] }); },
    },
    pool: {},
  };
});

import { storage } from '../../storage';
import {
  TRADE_CLOSE_REASON_CLASS, NON_OUTCOME_CLOSE_REASONS, BOOKED_CLOSE_REASONS, EXIT_CONDITION_TYPES, closeOutcomeClass,
} from '../../services/trade-close-reason';
import { countedTrades } from '../../services/dashboard-metrics';

const dialect = new PgDialect();
const rendered = () => rec.queries.filter(Boolean).map((q) => dialect.sqlToQuery(q as never));
beforeEach(() => { rec.queries.length = 0; });

describe('V — the one close-reason vocabulary', () => {
  it('V-1 every exit condition and the three outside writers are classed', () => {
    for (const t of EXIT_CONDITION_TYPES) expect(TRADE_CLOSE_REASON_CLASS[t]).toBe('booked');
    expect(TRADE_CLOSE_REASON_CLASS.engine_stop_cleanup).toBe('booked');
    expect(TRADE_CLOSE_REASON_CLASS.never_filled).toBe('non_outcome');
    expect(TRADE_CLOSE_REASON_CLASS.hard_reset).toBe('non_outcome');
  });
  it('V-2 the derived lists partition the vocabulary', () => {
    expect([...NON_OUTCOME_CLOSE_REASONS].sort()).toEqual(['hard_reset', 'never_filled']);
    expect(BOOKED_CLOSE_REASONS.length + NON_OUTCOME_CLOSE_REASONS.length).toBe(Object.keys(TRADE_CLOSE_REASON_CLASS).length);
    for (const r of BOOKED_CLOSE_REASONS) expect(NON_OUTCOME_CLOSE_REASONS).not.toContain(r);
  });
  it('V-3 the classifier is reason-pure and never guesses', () => {
    expect(closeOutcomeClass('stop_hit')).toBe('booked');
    expect(closeOutcomeClass('never_filled')).toBe('non_outcome');
    for (const r of [null, undefined, '', '   ', 'manual_close', 'stranded_clear', 'toString', 'constructor']) {
      expect(closeOutcomeClass(r as string | null | undefined)).toBe('unknown');
    }
  });
});

describe('S — countedTrades, the legs in their stated order (C-9)', () => {
  const at = '2026-11-05T10:00:00Z';
  it('S-1 an open record (blank reason) is notClosed — never unknownReason', () => {
    const r = countedTrades([{ closedAt: null, closeReason: '', exitPrice: null }]);
    expect([r.notClosed, r.unknownReason, r.counted.length]).toEqual([1, 0, 0]);
  });
  it('S-2 a never_filled row (no exit price) is nonOutcome — never bookedWithoutExitPrice', () => {
    const r = countedTrades([{ closedAt: at, closeReason: 'never_filled', exitPrice: null }]);
    expect([r.nonOutcome, r.bookedWithoutExitPrice]).toEqual([1, 0]);
  });
  it('S-3 a hard_reset row is nonOutcome', () => {
    expect(countedTrades([{ closedAt: at, closeReason: 'hard_reset', exitPrice: '0' }]).nonOutcome).toBe(1);
  });
  it('S-4 an unknown reason is excluded, counted and NAMED; a booked close with no exit price is counted', () => {
    const r = countedTrades([
      { closedAt: at, closeReason: 'manual_close', exitPrice: '10' },
      { closedAt: at, closeReason: 'manual_close', exitPrice: '11' },
      { closedAt: at, closeReason: 'stop_hit', exitPrice: '0' },
    ]);
    expect([r.unknownReason, r.bookedWithoutExitPrice, r.counted.length]).toEqual([2, 1, 0]);
    expect(r.unknownReasons).toEqual(['manual_close']);
  });
  it('S-5 a booked close with an exit price is counted, in order', () => {
    const a = { closedAt: at, closeReason: 'target_hit', exitPrice: '101' };
    const b = { closedAt: at, closeReason: 'reset', exitPrice: '99' };
    expect(countedTrades([a, b]).counted).toEqual([a, b]);
  });
});

// ── F: the SQL fence ───────────────────────────────────────────────────────────────────────────────────────────────
const STORAGE = readFileSync(resolve(__dirname, '../../storage.ts'), 'utf8').replace(/\r\n/g, '\n');

/** Parse one template literal from just after its opening backtick: its literal text (`${…}` blanked, nested template
 *  literals and quoted strings inside an expression skipped whole) and the index of its closing backtick. */
function parseTemplate(src: string, from: number): { text: string; end: number } {
  let text = '';
  let j = from;
  while (j < src.length) {
    const c = src[j];
    if (c === '`') return { text, end: j };
    if (c === '$' && src[j + 1] === '{') { j = skipExpr(src, j + 2); text += ' '; continue; }
    text += c; j++;
  }
  throw new Error('unterminated template');
}
function skipExpr(src: string, from: number): number {
  let depth = 1, j = from;
  while (j < src.length) {
    const c = src[j];
    if (c === '`') { j = parseTemplate(src, j + 1).end + 1; continue; }
    if (c === "'" || c === '"') { const q = c; j++; while (j < src.length && src[j] !== q) { if (src[j] === String.fromCharCode(92)) j++; j++; } j++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j + 1; }
    j++;
  }
  throw new Error('unterminated expression');
}
/** EVERY `sql` tagged template in the source — nested ones included — with `--` SQL comments removed. */
function sqlTemplates(src: string): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = [];
  for (let i = src.indexOf('sql`'); i !== -1; i = src.indexOf('sql`', i + 4)) {
    const { text } = parseTemplate(src, i + 4);
    out.push({ at: i, text: text.split(String.fromCharCode(10)).map((l) => l.replace(/--.*$/, '')).join(String.fromCharCode(10)) });
  }
  return out;
}
const methodAt = (pos: number) => {
  const before = STORAGE.slice(0, pos);
  const m = [...before.matchAll(/\n  async (\w+)\(/g)].pop();
  return m ? m[1] : '?';
};
const REASON_WORDS = [...Object.keys(TRADE_CLOSE_REASON_CLASS), 'manual_close', 'stranded_clear'];
const literalReasons = () => sqlTemplates(STORAGE).flatMap(({ at, text }) =>
  REASON_WORDS.filter((w) => text.includes(`'${w}'`)).map((w) => ({ reason: w, method: methodAt(at) })));

describe('F — no hand-written close reason in a storage.ts read predicate', () => {
  it('F-1 the parser finds the SQL it must (instrument proved): templates exist and the two named arms are seen', () => {
    const occurrences = STORAGE.split('sql`').length - 1;
    expect(occurrences).toBeGreaterThan(30);
    expect(sqlTemplates(STORAGE).length).toBe(occurrences);      // every occurrence parsed, nested ones included
    expect(literalReasons().length).toBeGreaterThan(0);
  });
  it('F-2 the ONLY literal reasons are the two Kyle-decided never_filled arms', () => {
    expect(literalReasons()).toEqual([
      { reason: 'never_filled', method: 'getLastClosedAtForSymbol' },
      { reason: 'never_filled', method: 'getClosedTradesPaginated' },
    ]);
  });
  it('F-3 the scope is read predicates: the hard-reset WRITE is outside any sql template (C-14)', () => {
    expect(STORAGE).toContain(".set({ closedAt: new Date(), closeReason: 'hard_reset' })");
    expect(sqlTemplates(STORAGE).some(({ text }) => text.includes("'hard_reset'"))).toBe(false);
  });
});

// ── Q: the twelve query methods, rendered ──────────────────────────────────────────────────────────────────────────
const NON_OUTCOME_SHAPE = /IS NULL OR "?close_reason"? NOT IN \(\$\d+, \$\d+\)\)|IS NULL OR "closed_trades"\."close_reason" NOT IN \(\$\d+, \$\d+\)\)/;
async function expectNonOutcomeExcluded(run: () => Promise<unknown>) {
  await run();
  const qs = rendered();
  const hit = qs.find((q) => NON_OUTCOME_SHAPE.test(q.sql));
  expect(hit, qs.map((q) => q.sql).join('\n---\n')).toBeTruthy();
  expect(hit!.params).toEqual(expect.arrayContaining(['never_filled', 'hard_reset']));
  for (const q of qs) expect(q.sql).not.toContain("'never_filled'");
}

describe('Q — at the ten sites a hard_reset row is excluded; the two named arms unchanged', () => {
  const since = new Date('2026-11-01T00:00:00Z');
  it('Q-1 getClosedTrades (default)', () => expectNonOutcomeExcluded(() => storage.getClosedTrades('paper', { limit: 'all' })));
  it('Q-2 getRealizedPnlSince', () => expectNonOutcomeExcluded(() => storage.getRealizedPnlSince('paper', since)));
  it('Q-3 getStraddleEntryCostAt', () => expectNonOutcomeExcluded(() => storage.getStraddleEntryCostAt('paper', since)));
  it('Q-4 getClosedTradesCount', () => expectNonOutcomeExcluded(() => storage.getClosedTradesCount('paper')));
  it('Q-5 getPortfolioMetricComponents', () => expectNonOutcomeExcluded(() => storage.getPortfolioMetricComponents('paper')));
  it('Q-6 getRealizedPnlTotal', () => expectNonOutcomeExcluded(() => storage.getRealizedPnlTotal('paper')));
  it('Q-7 getDailyRealizedPnlSince', () => expectNonOutcomeExcluded(() => storage.getDailyRealizedPnlSince('paper', since)));
  it('Q-8 getRecentClosedPnls', () => expectNonOutcomeExcluded(() => storage.getRecentClosedPnls('paper', 10)));
  it('Q-9 getClosedTradesGlobal (default)', () => expectNonOutcomeExcluded(() => storage.getClosedTradesGlobal('paper')));
  it('Q-10 getLifetimeScoreboard binds the BOOKED allowlist (no hard_reset, no never_filled) and exit_price > 0', async () => {
    await storage.getLifetimeScoreboard('paper');
    const q = rendered().find((x) => x.sql.includes('close_reason IN ('))!;
    expect(q).toBeTruthy();
    expect(q.sql).toContain('AND exit_price > 0');
    expect(q.params).toEqual(expect.arrayContaining([...BOOKED_CLOSE_REASONS]));
    expect(q.params).not.toContain('hard_reset');
    expect(q.params).not.toContain('never_filled');
  });
  it('Q-10b with asOf, the scoreboard is bounded closed_at < asOf (Langston Part A C-3); without it, unbounded', async () => {
    const at = new Date('2026-11-05T12:00:00Z');
    await storage.getLifetimeScoreboard('paper', at);
    const q = rendered().find((x) => x.sql.includes('close_reason IN ('))!;
    expect(q.sql).toMatch(/AND closed_at < \$\d+/);
    expect(q.params).toContainEqual(at);
    rec.queries.length = 0;
    await storage.getLifetimeScoreboard('paper');
    expect(rendered().find((x) => x.sql.includes('close_reason IN ('))!.sql).not.toMatch(/AND closed_at < \$\d+/);
  });

  it('Q-11 getLastClosedAtForSymbol still lets a never_filled maker START the cooldown (Kyle 2026-09-30)', async () => {
    await storage.getLastClosedAtForSymbol('paper', 'BTC/USD', 'crypto_spot');
    expect(rendered().some((q) => /"closed_trades"\."close_reason" = 'never_filled'/.test(q.sql))).toBe(true);
  });
  it('Q-12 getClosedTradesPaginated still shows never_filled rows in the history list (Kyle: visible, not counted)', async () => {
    await storage.getClosedTradesPaginated('paper', { closedOnly: true });
    expect(rendered().some((q) => /"closed_trades"\."close_reason" = 'never_filled'/.test(q.sql))).toBe(true);
  });
});
