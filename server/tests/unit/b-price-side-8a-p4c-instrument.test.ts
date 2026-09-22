/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c`, increment 1 — the VTS xStock decision-quote instrument.
 * Capability leg (#661): every arm of the classifier and the aggregator fires on a known input. Fence (P5): no xStock
 * VTS decision moved — every one still reads `last`, and nothing reads the instrument back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getXstockSession } from '../../asset_classes/xstock_spot/time-of-day.js';
import {
  classifyXstockVtsLook, XsVtsInstrument, parseQuoteNumber, XS_VTS_SPREAD_CEILING, XS_VTS_AGE_CANDIDATES_MS,
  type XsQuoteRow,
} from '../../asset_classes/xstock_spot/vts-xs-instrument.js';

const VTS = readFileSync(join(process.cwd(), 'server/services/vts-runner.ts'), 'utf-8').replace(/\r\n/g, '\n');
const INSTR = readFileSync(join(process.cwd(), 'server/asset_classes/xstock_spot/vts-xs-instrument.ts'), 'utf-8').replace(/\r\n/g, '\n');
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;

const T0 = Date.parse('2026-09-22T14:00:00Z'); // 10:00 EDT, a regular-session instant
const row = (o: Partial<XsQuoteRow> = {}): XsQuoteRow => ({ last: 100, bid: 99.9, ask: 100.1, atMs: T0 - 2_000, ...o });

describe('8a-P4c — the four New York sessions (DST-aware)', () => {
  it('EDT boundaries', () => {
    expect(getXstockSession(Date.parse('2026-09-22T13:29:59Z'))).toBe('pre');       // 09:29:59 EDT
    expect(getXstockSession(Date.parse('2026-09-22T13:30:00Z'))).toBe('regular');   // 09:30 EDT
    expect(getXstockSession(Date.parse('2026-09-22T19:59:00Z'))).toBe('regular');   // 15:59 EDT
    expect(getXstockSession(Date.parse('2026-09-22T20:00:00Z'))).toBe('after');     // 16:00 EDT
    expect(getXstockSession(Date.parse('2026-09-22T23:59:00Z'))).toBe('after');     // 19:59 EDT
    expect(getXstockSession(Date.parse('2026-09-23T00:00:00Z'))).toBe('overnight'); // 20:00 EDT
    expect(getXstockSession(Date.parse('2026-09-23T07:59:00Z'))).toBe('overnight'); // 03:59 EDT
    expect(getXstockSession(Date.parse('2026-09-23T08:00:00Z'))).toBe('pre');       // 04:00 EDT
  });
  it('EST: the same clock times fall one UTC hour later', () => {
    expect(getXstockSession(Date.parse('2026-12-01T14:29:00Z'))).toBe('pre');     // 09:29 EST
    expect(getXstockSession(Date.parse('2026-12-01T14:30:00Z'))).toBe('regular'); // 09:30 EST
    expect(getXstockSession(Date.parse('2026-12-01T21:00:00Z'))).toBe('after');   // 16:00 EST
    expect(getXstockSession(Date.parse('2026-12-02T01:00:00Z'))).toBe('overnight'); // 20:00 EST
  });
});

describe('8a-P4c — classifyXstockVtsLook, every arm', () => {
  it('no row ⇒ noRow, and every candidate refuses', () => {
    const l = classifyXstockVtsLook(null, T0, 95, 105);
    expect(l.noRow).toBe(true);
    expect(l.refusedAt).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => true));
    expect(l.ageOver).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => true));
    expect(l.sideUnusable).toBe(false);
    expect(l.bidFiresStop).toBe(false);
  });

  it('a fresh, tight, two-sided row is refused by no candidate', () => {
    const l = classifyXstockVtsLook(row(), T0, 95, 105);
    expect(l.noRow || l.sideUnusable || l.wide || l.ageUnknown).toBe(false);
    expect(l.ageMs).toBe(2_000);
    expect(l.ageBucket).toBe(0); // ≤5 s
    expect(l.refusedAt).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => false));
    expect(l.spread).toBeCloseTo(0.002, 6);
    expect(l.spreadBucket).toBe(0); // ≤0.25%
  });

  it('age: each candidate ceiling is a strict "older than"', () => {
    const l = classifyXstockVtsLook(row({ atMs: T0 - 30_000 }), T0, null, null); // exactly 30 s
    expect(l.ageOver).toEqual([true, false, false, false, false]); // >15 s only
    expect(l.ageBucket).toBe(2); // ≤30 s
    const l2 = classifyXstockVtsLook(row({ atMs: T0 - 30_001 }), T0, null, null);
    expect(l2.ageOver).toEqual([true, true, false, false, false]);
    expect(l2.ageBucket).toBe(3); // ≤60 s
  });

  it('age unknown ⇒ counted as unknown and over every candidate', () => {
    const l = classifyXstockVtsLook(row({ atMs: null }), T0, null, null);
    expect(l.ageUnknown).toBe(true);
    expect(l.ageOver).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => true));
    expect(l.ageBucket).toBeNull();
  });

  it('side unusable: missing, zero, crossed — through the shared predicate', () => {
    for (const o of [{ bid: null }, { ask: null }, { bid: 0 }, { bid: 100.2, ask: 100.1 }, { bid: Number.NaN }]) {
      const l = classifyXstockVtsLook(row(o as Partial<XsQuoteRow>), T0, null, null);
      expect(l.sideUnusable).toBe(true);
      expect(l.spread).toBeNull();
      expect(l.refusedAt).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => true)); // union: refused at every ceiling
    }
  });

  it('wide: strictly above the pre-registered 1.115% ceiling, and it refuses a FRESH row (the union)', () => {
    expect(XS_VTS_SPREAD_CEILING).toBe(0.01115);
    const narrow = classifyXstockVtsLook(row({ bid: 99.45, ask: 100.55 }), T0, null, null); // 1.1%
    expect(narrow.wide).toBe(false);
    expect(narrow.spreadBucket).toBe(2); // ≤ceiling
    const wide = classifyXstockVtsLook(row({ bid: 99.4, ask: 100.6 }), T0, null, null); // 1.2%
    expect(wide.wide).toBe(true);
    expect(wide.spreadBucket).toBe(3); // ≤2%
    expect(wide.ageOver).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => false)); // fresh…
    expect(wide.refusedAt).toEqual(XS_VTS_AGE_CANDIDATES_MS.map(() => true)); // …but refused on spread
    const blowout = classifyXstockVtsLook(row({ bid: 80, ask: 120 }), T0, null, null);
    expect(blowout.spreadBucket).toBe(5); // >5%
  });

  it('divergence: the bid fires the stop while last does not; last fires the target while the bid has not', () => {
    const stop = classifyXstockVtsLook(row({ last: 95.05, bid: 94.9, ask: 95.1 }), T0, 95, 110);
    expect(stop.bidFiresStop).toBe(true);
    const bothBelow = classifyXstockVtsLook(row({ last: 94.95, bid: 94.9, ask: 95.1 }), T0, 95, 110);
    expect(bothBelow.bidFiresStop).toBe(false); // last fires too — no divergence
    const target = classifyXstockVtsLook(row({ last: 105, bid: 104.9, ask: 105.1 }), T0, 90, 105);
    expect(target.lastFiresTarget).toBe(true);
    const bidAtTarget = classifyXstockVtsLook(row({ last: 105.1, bid: 105, ask: 105.2 }), T0, 90, 105);
    expect(bidAtTarget.lastFiresTarget).toBe(false);
    const unusable = classifyXstockVtsLook(row({ last: 95.05, bid: null }), T0, 95, 110);
    expect(unusable.bidFiresStop).toBe(false); // no usable bid ⇒ no divergence claim
  });

  it('parseQuoteNumber never defaults a side to zero', () => {
    expect(parseQuoteNumber(null)).toBeNull();
    expect(parseQuoteNumber(undefined)).toBeNull();
    expect(parseQuoteNumber('')).toBeNull();
    expect(parseQuoteNumber('abc')).toBeNull();
    expect(parseQuoteNumber('0')).toBe(0);
    expect(parseQuoteNumber('101.25')).toBe(101.25);
  });
});

describe('8a-P4c — XsVtsInstrument: per-pass lines and the hourly per-symbol roll-up', () => {
  it('a pass with looks emits one line carrying lane, session and every counter', () => {
    const lines: string[] = [];
    const inst = new XsVtsInstrument('vts', (l) => lines.push(l));
    inst.beginPass(T0);
    inst.recordLook('AAA/USD', row(), T0, 95, 105);
    inst.recordLook('BBB/USD', null, T0, 95, 105);
    inst.recordLook('CCC/USD', row({ bid: 99.4, ask: 100.6 }), T0, 95, 105);
    inst.recordPendingLook(row({ ask: 100.1 }), 100.2);
    inst.endPass();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[8a-P4c\]\[VTS_XS_TOUCH\] lane=vts session=regular looks=3 noRow=1 ageUnknown=0 sideUnusable=0 wide=1 /);
    expect(lines[0]).toContain('refused=[2,2,2,2,2]');
    expect(lines[0]).toContain('pendingLooks=1 pendingNoRow=0 pendingAskAtOrBelow=1 pendingLastAtOrBelow=1');
  });

  it('a weekend-close pass is labelled weekend, never a weekday session (the shadow lane and pending rests run then)', () => {
    const lines: string[] = [];
    const inst = new XsVtsInstrument('shadow', (l) => lines.push(l));
    const sat = Date.parse('2026-09-26T14:00:00Z'); // Saturday 10:00 EDT — a regular clock time inside the weekend close
    inst.beginPass(sat); inst.recordLook('AAA/USD', row({ atMs: sat - 1_000 }), sat, null, null); inst.endPass();
    const touch = () => lines.filter((l) => l.startsWith('[8a-P4c][VTS_XS_TOUCH]')); // hour changes also flush SYM lines
    expect(touch()[0]).toMatch(/^\[8a-P4c\]\[VTS_XS_TOUCH\] lane=shadow session=weekend looks=1 /);
    const fri = Date.parse('2026-09-26T00:30:00Z'); // Friday 20:30 EDT — after the Fri 20:00 close
    inst.beginPass(fri); inst.recordLook('AAA/USD', null, fri, null, null); inst.endPass();
    expect(touch()[1]).toContain('session=weekend');
    const sunOpen = Date.parse('2026-09-28T00:00:00Z'); // Sunday 20:00 EDT — the week opens
    inst.beginPass(sunOpen); inst.recordLook('AAA/USD', null, sunOpen, null, null); inst.endPass();
    expect(touch()[2]).toContain('session=overnight');
  });

  it('a pass with nothing to look at emits nothing', () => {
    const lines: string[] = [];
    const inst = new XsVtsInstrument('shadow', (l) => lines.push(l));
    inst.beginPass(T0);
    inst.endPass();
    expect(lines).toHaveLength(0);
  });

  it('symbol roll-ups are keyed by (session, symbol) and flushed when the clock hour changes', () => {
    const lines: string[] = [];
    const inst = new XsVtsInstrument('vts', (l) => lines.push(l));
    const preT = Date.parse('2026-09-22T13:10:00Z'); // 09:10 EDT, pre — hour 13Z
    inst.beginPass(preT); inst.recordLook('AAA/USD', row({ atMs: preT - 1_000 }), preT, null, null); inst.endPass();
    const regT = Date.parse('2026-09-22T13:40:00Z'); // 09:40 EDT, regular — same hour 13Z
    inst.beginPass(regT); inst.recordLook('AAA/USD', null, regT, null, null); inst.endPass();
    expect(lines.filter((l) => l.includes('VTS_XS_SYM'))).toHaveLength(0); // same hour: nothing flushed yet
    const next = Date.parse('2026-09-22T14:00:05Z');
    inst.beginPass(next);
    const sym = lines.filter((l) => l.includes('[8a-P4c][VTS_XS_SYM]'));
    expect(sym).toHaveLength(2); // pre and regular are separate keys
    expect(sym.some((l) => l.includes('hour=2026-09-22T13Z session=pre symbol=AAA/USD looks=1 noRow=0'))).toBe(true);
    expect(sym.some((l) => l.includes('hour=2026-09-22T13Z session=regular symbol=AAA/USD looks=1 noRow=1'))).toBe(true);
  });

  it('the default sink is console.warn (error.log reach), never console.log', () => {
    expect(INSTR).toContain('(line) => console.warn(line)');
    expect(count(INSTR, /console\.log\(/g)).toBe(0);
  });
});

describe('8a-P4c — P5 fence: no xStock VTS decision moved, and nothing reads the instrument back', () => {
  it('the real-lane xStock seams still read `last` (currentPrice)', () => {
    expect(count(VTS, /let _pFillPrice: number \| null = currentPrice;/g)).toBe(1);
    expect(count(VTS, /let _vtsTriggerPrice: number \| null = currentPrice;/g)).toBe(1);
    expect(count(VTS, /resolveVtsBookedExitPrice\(trade\.assetClass, _vtsExitBid, currentPrice, decision\.exitPrice\)/g)).toBe(1);
  });

  it('the shadow lane still triggers xStock on `last`', () => {
    expect(count(VTS, /triggerPrice: trade\.assetClass === 'crypto_spot' \? _sExitBid : currentPrice,/g)).toBe(1);
  });

  it('the instrument is only WRITTEN from the runner — no reader of its state, and rawQuote feeds only the instrument', () => {
    const uses = VTS.match(/_xs(Vts|Shadow)Instrument\.(\w+)\(/g) ?? [];
    const verbs = new Set(uses.map((u) => u.replace(/^_xs(Vts|Shadow)Instrument\./, '').replace('(', '')));
    expect(Array.from(verbs).sort()).toEqual(['beginPass', 'endPass', 'recordLook', 'recordPendingLook']);
    const rawReads = VTS.match(/\.rawQuote\b/g) ?? [];
    expect(rawReads.length).toBe(3); // real-lane look, real-lane pending look, shadow look
    expect(count(VTS, /xstockPriceMap\.get\(trade\.symbol\)\?\.rawQuote \?\? null/g)).toBe(3);
  });
});
