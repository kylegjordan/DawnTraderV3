/**
 * B-ATR-BAD-PRINT (#1153) — the one shared ATR (E3, returned-wick clip) and its fail-closed edges.
 * Record: Claude Comms and Packages/Scope Files/B_ATR_BAD_PRINT_PRE_AUDIT.md (§0 pre-registration, §1d ruling,
 * §4 Langston Step-2 conditions C1-C3).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { computeAtr, atrOrZero, trueRange } from '../../core/calculations/true-range-atr';
import { getEffectiveATR, clampEffectiveATR } from '../../strategies/strategy-helpers';
import { patternToTradeSignal } from '../../services/pattern-recognizer';
import { computeRealHybridScore } from '../../core/utils/vts-real-score';

type Bar = { open: number; high: number; low: number; close: number };
const bar = (o: number, h: number, l: number, c: number): Bar => ({ open: o, high: h, low: l, close: c });
const plainMean = (bs: Bar[]) => {
  let s = 0;
  for (let i = 1; i < bs.length; i++) s += trueRange(bs[i].high, bs[i].low, bs[i - 1].close);
  return s / (bs.length - 1);
};
const BASE: Bar[] = Array.from({ length: 15 }, () => bar(100, 100.5, 99.5, 100));

describe('E3 — the pre-registered fixtures (§0 criterion 3)', () => {
  const clean = computeAtr(BASE);
  it('clean bars: E3 equals the plain mean', () => {
    expect(clean).toBeCloseTo(plainMean(BASE), 12);
  });
  it('(a) one isolated returned wick is suppressed to within 1.5x the clean value', () => {
    const f = [...BASE.slice(0, 14), bar(100, 128, 99.5, 100.1)];
    expect(plainMean(f) / clean).toBeGreaterThan(2.5); // the defect, as a control
    expect(computeAtr(f) / clean).toBeLessThanOrEqual(1.5);
  });
  it('(b) three consecutive wide bars whose closes move pass through (>= 80 % of the plain rise)', () => {
    const f = [...BASE.slice(0, 12), bar(100, 104.5, 99.8, 104), bar(104, 108.5, 103.8, 108), bar(108, 112.5, 107.8, 112)];
    const rise = (computeAtr(f) - clean) / (plainMean(f) - clean);
    expect(rise).toBeGreaterThanOrEqual(0.8);
  });
  it('(c) a gap-and-hold passes through (>= 80 % of the plain rise)', () => {
    const f = [...BASE.slice(0, 14), bar(110, 111, 109, 110)];
    const rise = (computeAtr(f) - clean) / (plainMean(f) - clean);
    expect(rise).toBeGreaterThanOrEqual(0.8);
  });
});

describe('E3 — a real off-market print: GBP/USD, Kraken 60-min bars 2026-09-23 06:00Z-20:00Z', () => {
  // The 20:00Z bar printed a high of 1.70000 with the close back at 1.32399 (#1153).
  const GBP: Bar[] = [
    bar(1.33121, 1.3323, 1.33074, 1.33179), bar(1.33178, 1.33189, 1.32861, 1.33011), bar(1.3301, 1.33087, 1.32927, 1.32996),
    bar(1.32993, 1.33013, 1.32783, 1.32785), bar(1.32788, 1.32913, 1.32769, 1.32911), bar(1.32913, 1.32963, 1.32736, 1.32772),
    bar(1.32772, 1.32795, 1.32613, 1.32735), bar(1.32738, 1.32871, 1.32505, 1.32597), bar(1.32597, 1.32679, 1.32479, 1.32643),
    bar(1.32647, 1.3267, 1.32461, 1.32503), bar(1.32505, 1.32536, 1.32319, 1.32348), bar(1.32342, 1.32545, 1.32233, 1.32526),
    bar(1.32523, 1.3255, 1.32389, 1.32423), bar(1.32424, 1.32453, 1.32379, 1.32415), bar(1.32416, 1.7, 1.32381, 1.32399),
  ];
  it('the plain mean is blown up by the one bar; E3 brings it back near the clean range', () => {
    const trs: number[] = [];
    for (let i = 1; i < GBP.length; i++) trs.push(trueRange(GBP[i].high, GBP[i].low, GBP[i - 1].close));
    const clean13 = trs.slice(0, 13).reduce((a, b) => a + b, 0) / 13;
    expect(plainMean(GBP) / clean13).toBeGreaterThan(10);
    expect(computeAtr(GBP) / clean13).toBeLessThanOrEqual(1.5);
  });
});

describe('"not enough data" fails closed', () => {
  it('fewer than period + 1 bars => NaN; atrOrZero => 0', () => {
    expect(Number.isNaN(computeAtr(BASE.slice(0, 14), 14))).toBe(true);
    expect(atrOrZero(BASE.slice(0, 14), 14)).toBe(0);
  });
  it('a non-finite value in the window => NaN; atrOrZero => 0', () => {
    const f = [...BASE.slice(0, 14), bar(100, Number.NaN, 99.5, 100)];
    expect(Number.isNaN(computeAtr(f))).toBe(true);
    expect(atrOrZero(f)).toBe(0);
  });
  it('string-decimal rows (price_data) are read as numbers', () => {
    const s = BASE.map((b) => ({ open: String(b.open), high: String(b.high), low: String(b.low), close: String(b.close) }));
    expect(computeAtr(s)).toBeCloseTo(computeAtr(BASE), 12);
  });
});

describe('Langston Step-2 C1 — the clamp helpers never pass an unusable ATR through', () => {
  const candles = BASE.map((b) => ({ ...b, volume: 1 }));
  it('getEffectiveATR: too few bars => null (not NaN)', () => {
    expect(getEffectiveATR(candles.slice(0, 5), 100)).toBeNull();
  });
  it('getEffectiveATR: a normal window => a positive number', () => {
    expect(getEffectiveATR(candles, 100)).toBeGreaterThan(0);
  });
  it('clampEffectiveATR: NaN / Infinity / 0 => null', () => {
    expect(clampEffectiveATR(Number.NaN, 100)).toBeNull();
    expect(clampEffectiveATR(Number.POSITIVE_INFINITY, 100)).toBeNull();
    expect(clampEffectiveATR(0, 100)).toBeNull();
  });
});

describe('#371 identity — the guard ATR never exceeds the normalizer ATR (both from the shared function)', () => {
  it('clamped <= raw, including on a spike and on a very volatile window', () => {
    const spike = [...BASE.slice(0, 14), bar(100, 128, 99.5, 100.1)];
    const wild = BASE.map((_b, i) => bar(100, 100 + 15 + i, 85 - i, 100));
    for (const f of [BASE, spike, wild]) {
      const raw = computeAtr(f);
      const guard = clampEffectiveATR(atrOrZero(f), 100);
      expect(guard).not.toBeNull();
      expect(guard as number).toBeLessThanOrEqual(raw);
    }
  });
});

describe('the pattern path requires a valid ATR (no 1 % / 2 % fallback)', () => {
  const sig = { symbol: 'TEST/USD', pattern: 'PINBAR', direction: 'BUY' as const, strength: 0.7, timestamp: 0, metadata: {} };
  it('throws on 0, NaN and negative', () => {
    for (const a of [0, Number.NaN, -1]) {
      expect(() => patternToTradeSignal(sig as any, 100, a, 'crypto_spot')).toThrow(RangeError);
    }
  });
  it('a valid ATR still gives 1.5x / 2.5x geometry', () => {
    const t = patternToTradeSignal(sig as any, 100, 2, 'crypto_spot');
    expect(t.stopPrice).toBeCloseTo(97, 10);
    expect(t.targetPrice).toBeCloseTo(105, 10);
  });
});

describe('Langston §9b fold — the VTS score fabricates no ATR and no 24h range', () => {
  const ohlc = BASE.map((b, i) => ({ timestamp: i, ...b, volume: 1 })) as any;
  const ind = (over: Record<string, number>) => ({
    vwap: 99, sma: 98, currentPrice: 100, atr: 1, high24h: 101, low24h: 97,
    volatility: 0.01, momentum: 0.001, adx: 20, ...over,
  }) as any;
  const R = 'RANGE_FRIENDLY' as any;
  it('the three ATR readers score the neutral 0.50 on an unusable ATR (0, NaN)', () => {
    for (const s of ['vwap_pullback', 'vwap_bounce', 'mean_reversion']) {
      for (const a of [0, Number.NaN]) expect(computeRealHybridScore(s, ind({ atr: a }), ohlc, R), `${s} atr=${a}`).toBe(0.5);
    }
  });
  it('mean_reversion with atr = 0 is NOT the maximum reversion score (the Infinity path, Langston amendment 3)', () => {
    const atZero = computeRealHybridScore('mean_reversion', ind({ atr: 0, vwap: 90, sma: 90 }), ohlc, R);
    const maxish = computeRealHybridScore('mean_reversion', ind({ atr: 0.0001, vwap: 90, sma: 90 }), ohlc, R);
    expect(atZero).toBe(0.5);
    expect(maxish).toBeGreaterThan(0.5); // control: a huge deviation does score high
  });
  it('an ATR-independent branch keeps its real score whatever the ATR (no top-of-function neutral)', () => {
    for (const s of ['sma_trend_ride', 'breakout', 'support_bounce']) {
      expect(computeRealHybridScore(s, ind({ atr: 0 }), ohlc, R), s).toBe(computeRealHybridScore(s, ind({ atr: 1 }), ohlc, R));
    }
  });
  it("a zero 24h range uses each range reader's own neutral instead of a fabricated 2 % range", () => {
    // breakout: rangePosition neutral 0.5 -> not near an extreme -> nearExtreme 0.4
    const s = computeRealHybridScore('breakout', ind({ high24h: 100, low24h: 100, volatility: 0 }), ohlc, R);
    expect(s).toBeCloseTo(0.4 * 0.45 + 0 * 0.35 + 0.20, 10);
  });
});

// ── Census fences, read at the source ─────────────────────────────────────────────────────────────
const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === 'tests' || n === '__tests__' || n === 'node_modules') continue;
      walk(p, out);
    } else if (n.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('fence — every ATR call site uses the shared function (two named carve-outs)', () => {
  const SITES = [
    'server/services/market-context-engine.ts',
    'server/services/strategy-engine.ts',
    'server/strategies/strategy-helpers.ts',
    'server/services/fx5-scanner.ts',
    'server/services/market-scanner.ts',
    'server/asset_classes/xstock_spot/scanner.ts',
  ];
  it('the six former copies call atrOrZero', () => {
    for (const f of SITES) expect(read(f), f).toMatch(/atrOrZero\(/);
  });
  it('no other server file computes a true range inline, except the named carve-outs', () => {
    // A true-range expression: high − low, then |x − previous close|.
    const TR = /high\s*-\s*\w*\.?low[\s\S]{0,120}Math\.abs\([^)]*(prevClose|prev\.close|\[i\s*-\s*1\]\.close)/;
    const CARVE_OUTS: Record<string, string> = {
      'server/core/calculations/true-range-atr.ts': 'the shared function itself',
      'server/services/exit-strategy-replay-service.ts': '#866: deliberately divergent on 1-minute replay bars (Langston)',
      'server/core/metrics/market-regime.ts': 'ADX — converts in row 2a1 B-ADX-TRUE-RANGE-SHARED',
      'server/strategies/strategy-helpers.ts': 'calculateADXSeries — ADX, row 2a1 (its ATR now calls atrOrZero)',
    };
    const hits = walk(join(ROOT, 'server'))
      .filter((p) => TR.test(readFileSync(p, 'utf8')))
      .map((p) => relative(ROOT, p).split(sep).join('/'));
    expect(hits, 'positive control: the shared function matches').toContain('server/core/calculations/true-range-atr.ts');
    expect(hits.filter((h) => !(h in CARVE_OUTS))).toEqual([]);
  });
  it('the geometry fallbacks are gone (Langston ruling (e), C3)', () => {
    const orch = read('server/services/signal-orchestrator.ts');
    expect(orch).not.toMatch(/indicators\?\.atr\s*\?\?\s*\(currentPrice\s*\*\s*0\.02\)/);
    expect(orch).not.toMatch(/stopPrice\s*\?\?\s*currentPrice\s*\*\s*0\.97/);
    expect(orch).toMatch(/patternAtrDrops\+\+/);
    // Langston Step-4 conditions: the per-symbol catch is counted; the dead entryPrice fallback is gone.
    expect(orch).toMatch(/patternEvalErrors\+\+/);
    expect(orch).toMatch(/\[PATTERN_EVAL_ERRORS\] \$\{patternEvalErrors\}/);
    expect(orch).not.toMatch(/entryPrice:\s*tradeSignal\.entryPrice\s*\?\?/);
    expect(read('server/core/utils/vts-real-score.ts')).not.toMatch(/:\s*currentPrice\s*\*\s*0\.0[12];/); // code form, not the comment naming it
    // the drift dashboard honours the typed exclusion flag, as the VTS analytics route does
    expect(read('server/services/drift-dashboard-aggregator.ts')).toMatch(/t\.countsInAggregates === false/);
    // Langston R1: the % averages divide over rows carrying an entry price, not the full count
    const dd = read('server/services/drift-dashboard-aggregator.ts');
    expect(dd).not.toMatch(/sumNetPct \/ total\)/);
    expect(dd).not.toMatch(/sumNetPct \/ s\.tradeCount\)/);
    expect(dd).not.toMatch(/entryPrice \?\? 0/);
    expect(read('server/services/strategy-engine.ts')).not.toMatch(/c\['atr_fallback_daily_range_frac'\]/);
    // the old ternary fallback form `atr > 0 ? atr * 1.5 : currentPrice * …` (code, not the comment naming it)
    expect(read('server/services/pattern-recognizer.ts')).not.toMatch(/\?\s*atr\s*\*\s*1\.5\s*:\s*currentPrice/);
  });
  it('the retirement migration is registered; its rollback is not', () => {
    const lines = new Set(read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/).map((l) => l.trim()));
    expect(lines.has('2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql')).toBe(true);
    expect(lines.has('2026-10-06-b-atr-bad-print-retire-daily-range-frac-rollback.sql')).toBe(false);
  });
});
