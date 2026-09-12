/**
 * B-PRICE-SIDE-BY-JOB r5 OBJ-8, row 8f — the quote-currency admission gate (D9).
 *
 * ⛔ EXPECTED OUTCOMES WRITTEN BEFORE THE GATE RAN (#744 rider).
 *
 * THE FIXTURE SET IS LANGSTON'S, 2026-09-12, and the third one is the point: a suite of
 * "USDC in, EUR out" proves the two cases somebody already thought of and never touches the
 * SET BOUNDARY — which is the case that actually arrives, the day the venue lists a quote we
 * recognise but have not admitted.
 *   1. an ADMITTED quote        — `BTC/USD`   → admitted
 *   2. a SET quote              — `ETH/USDC`  → admitted
 *   3. a quote in NEITHER set   — `XYZ/PYUSD` → refused (recognised-but-not-traded, B6.5f)
 *   4. a FLOATING quote         — `SOL/EUR`   → refused (the denomination defect itself)
 *   5. an UNPARSEABLE symbol    — `BTCUSD`    → refused, NEVER assumed USD (#546/#1050)
 *
 * ⛔ THREE ADMISSION FUNCTIONS ARE EXERCISED — AND ONLY TWO OF THEM ARE LIVE DOORS.
 * `addSurvivors` and `addPatternPoolSurvivors` are separate live paths into pools the
 * orchestrator reads; a suite covering one would have let the other through while green.
 * ⚠️ `addFamilyPoolSurvivors` HAS ZERO CALLERS at the ref outside its own definition and the
 *    test below (Langston BLOCKER-2, re-derived: whole-tree grep). ⇒ THE TEST BELOW PROVES
 *    THE GATE, NOT ITS REACHABILITY — the existence of a symbol is not the reachability of
 *    it. It is hardened anyway because `getFamilyPool` IS read live
 *    (`signal-orchestrator.ts:2039`), so the writer is dead beside a live reader. That
 *    asymmetry is NOT 8f's to fix and is homed separately; this suite must not be read as
 *    evidence the path is exercised in production.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { activeFilterPool } from '../../services/active-filter-pool';

const survivor = (symbol: string) => ({
  symbol,
  currentPrice: 100,
  volume24h: 5_000_000,
  dailyRange: 3,
});

describe('8f gate — door 1: addSurvivors', () => {
  beforeEach(() => {
    activeFilterPool.initialize();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('admits an ADMITTED quote and a SET quote', () => {
    const r = activeFilterPool.addSurvivors('paper', [survivor('BTC/USD'), survivor('ETH/USDC')], true);
    expect(r.refusedQuote).toBe(0);
    expect(r.added).toBe(2);
  });

  it('REFUSES a floating quote, and counts it', () => {
    const r = activeFilterPool.addSurvivors('paper', [survivor('SOL/EUR')], true);
    expect(r.refusedQuote).toBe(1);
    expect(r.added).toBe(0);
  });

  it('REFUSES a quote in NEITHER set — the boundary case, not the obvious one', () => {
    const r = activeFilterPool.addSurvivors('paper', [survivor('XYZ/PYUSD')], true);
    expect(r.refusedQuote).toBe(1);
    expect(r.added).toBe(0);
  });

  it('REFUSES an unparseable symbol rather than assuming USD', () => {
    const r = activeFilterPool.addSurvivors('paper', [survivor('BTCUSD')], true);
    expect(r.refusedQuote).toBe(1);
    expect(r.added).toBe(0);
  });

  it('refusedQuote is a SUBSET of skipped, never additional to it', () => {
    // ⚠️ The pool is a module-level singleton and `initialize()` does not clear it, so a
    // symbol admitted by an earlier test returns as an UPDATE rather than an ADD. Distinct
    // symbols per assertion keep this independent of execution order — my first draft used
    // BTC/USD here and failed for that reason, not because the gate was wrong.
    const r = activeFilterPool.addSurvivors('paper', [survivor('SOL/CHF'), survivor('LTC/USDT')], true);
    expect(r.refusedQuote).toBe(1);
    expect(r.skipped).toBeGreaterThanOrEqual(r.refusedQuote);
    expect(r.added + r.updated).toBe(1);
  });

  it('names the reason in the log — D9 requires a SPECIFIC reason, not a silent drop', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    activeFilterPool.addSurvivors('paper', [survivor('SOL/EUR'), survivor('BTCUSD')], true);
    const lines = warn.mock.calls.map(c => String(c[0]));
    expect(lines.some(l => l.includes('[8f][QUOTE_REFUSED]') && l.includes('quote_not_admitted:EUR'))).toBe(true);
    expect(lines.some(l => l.includes('[8f][QUOTE_REFUSED]') && l.includes('symbol_unparseable'))).toBe(true);
  });

  it('the refused pair does NOT reach the pool the orchestrator reads', () => {
    activeFilterPool.addSurvivors('paper', [survivor('SOL/EUR'), survivor('BTC/USD')], true);
    const symbols = activeFilterPool.getActivePool('paper').map(p => p.symbol);
    expect(symbols).toContain('BTC/USD');
    expect(symbols).not.toContain('SOL/EUR');
  });
});

describe('8f gate — door 2: addPatternPoolSurvivors (a SEPARATE path into the orchestrator)', () => {
  beforeEach(() => {
    activeFilterPool.initialize();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('refuses a floating quote at the pattern door too, AND counts it', () => {
    // ⛔ door 2 returns `{ added, skipped, refusedQuote }` — my change list claimed it
    // returned void, which was false and was the premise of a judgement call Langston
    // overturned. Without the counter a refusal vanishes into `skipped`: live cycles print
    // `added=6, skipped=28`, so 8f's refusals would have been invisible inside that 28.
    const r = activeFilterPool.addPatternPoolSurvivors('paper', [survivor('SOL/EUR'), survivor('BTC/USD')] as never);
    expect(r.refusedQuote).toBe(1);
    expect(r.skipped).toBeGreaterThanOrEqual(r.refusedQuote);
    const symbols = activeFilterPool.getPatternPool('paper').map((p: { symbol: string }) => p.symbol);
    expect(symbols).toContain('BTC/USD');
    expect(symbols).not.toContain('SOL/EUR');
  });
});

describe('8f gate — addFamilyPoolSurvivors (⚠️ NOT a live door — zero callers at the ref)', () => {
  beforeEach(() => {
    activeFilterPool.initialize();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('refuses a floating quote at the family door too', () => {
    activeFilterPool.addFamilyPoolSurvivors('paper', 'trend', [
      { symbol: 'SOL/EUR', price: 100 },
      { symbol: 'BTC/USD', price: 100 },
    ]);
    const symbols = activeFilterPool.getFamilyPool('paper', 'trend').map((p: { symbol: string }) => p.symbol);
    expect(symbols).toContain('BTC/USD');
    expect(symbols).not.toContain('SOL/EUR');
  });
});
