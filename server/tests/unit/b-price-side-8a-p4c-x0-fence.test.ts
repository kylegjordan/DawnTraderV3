/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c`, increment 2 (X0) — the zero-defaulted xStock sides are GONE and cannot come back.
 * The real VTS lane built `bid: parseFloat(r.bid) || 0` on every xStock price entry: a missing side fabricated as zero.
 * Nothing read it (plan §C2 E1, Langston re-derived at `7fc76ca43`), so it is deleted, and the TYPES forbid it (C3):
 * the entry type carries no side and the lookup helper returns the price only, on both classes (C4).
 * Every assertion below has a capability arm — the pattern is shown able to match before its zero counts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const VTS = readFileSync(join(process.cwd(), 'server/services/vts-runner.ts'), 'utf-8').replace(/\r\n/g, '\n');
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

// A side defaulted to zero, in any spelling this file has used: `parseFloat(r.bid) || 0`, `Number(x.ask) ?? 0`, …
const ZERO_DEFAULTED_SIDE = /\b(bid|ask)\s*:\s*[^,\n]*\b(bid|ask)\b[^,\n]*(\|\||\?\?)\s*0\b/g;
const REAL_LANE_ENTRY_TYPE = /const xstockPriceMap = new Map<string, \{ symbol: string; price: number; rawQuote: XsQuoteRow \}>\(\);/g;
const HELPER_SIGNATURE = /get\(symbol: string, assetClass\?: string\): \{ price: number \} \| undefined \{/g;
const SIDE_ON_A_MAP_TYPE = /new Map<string, \{[^}]*\b(bid|ask)\??\s*:/g;
const SIDE_IN_HELPER_RETURN = /\{ price: [\w.]+, (bid|ask): /g;

describe('8a-P4c X0 — the patterns can fire (capability arm, #661)', () => {
  it('each pattern matches the shape it forbids', () => {
    expect(count('              bid: parseFloat(r.bid) || 0,', ZERO_DEFAULTED_SIDE)).toBe(1);
    expect(count('  ask: Number(q.ask) ?? 0,', ZERO_DEFAULTED_SIDE)).toBe(1);
    expect(count('new Map<string, { symbol: string; price: number; bid: number; rawQuote: XsQuoteRow }>()', SIDE_ON_A_MAP_TYPE)).toBe(1);
    expect(count('new Map<string, { price: number; ask?: number }>()', SIDE_ON_A_MAP_TYPE)).toBe(1);
    expect(count('return p ? { price: p.price, bid: p.bid, ask: p.ask } : undefined;', SIDE_IN_HELPER_RETURN)).toBe(1);
  });

  it('…and not the shapes it allows (a null-preserving side, the shadow entry type)', () => {
    expect(count('rawQuote: { last: price, bid: parseQuoteNumber(r.bid), ask: parseQuoteNumber(r.ask), atMs: 1 }', ZERO_DEFAULTED_SIDE)).toBe(0);
    expect(count('new Map<string, { price: number; rawQuote: XsQuoteRow }>()', SIDE_ON_A_MAP_TYPE)).toBe(0);
  });
});

describe('8a-P4c X0 — the fence on vts-runner.ts', () => {
  it('no side is defaulted to zero anywhere in the runner', () => {
    expect(count(VTS, ZERO_DEFAULTED_SIDE)).toBe(0);
  });

  it('the real-lane xStock entry type carries no side (C3)', () => {
    expect(count(VTS, REAL_LANE_ENTRY_TYPE)).toBe(1);
    expect(count(VTS, SIDE_ON_A_MAP_TYPE)).toBe(0);
  });

  it('the lookup helper returns the price only, on BOTH classes (C3 + C4)', () => {
    expect(count(VTS, HELPER_SIGNATURE)).toBe(1);
    expect(count(VTS, SIDE_IN_HELPER_RETURN)).toBe(0);
  });

  it('positive control — the undefaulted quote is still carried on both lanes', () => {
    const carried = /rawQuote: \{ last: price, bid: parseQuoteNumber\(r\.bid\), ask: parseQuoteNumber\(r\.ask\), atMs: parseQuoteNumber\(r\.at_ms\) \}/g;
    expect(count(VTS, carried)).toBe(2); // real lane + shadow lane
  });
});
