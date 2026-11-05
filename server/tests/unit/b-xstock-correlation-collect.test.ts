import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  alignByTimestamp,
  buildB68_3Alternate,
  computePairCorrelation,
  inferIntervalMinutes,
  resolveCorrelationInputs,
  type CorrelationReferenceSources,
  type PairCorrelationConfig,
} from '../../core/metrics/pair-correlation.js';
import { findMatchingTrade, tradeIndexKey, type VtsTradeIndex } from '../../services/factor-replay-core.js';
import { spearmanRankCorrelation } from '../../strategies/strategy-helpers.js';
import type { OHLCData } from '../../types/market-regime.types.js';

// B-XSTOCK-CORRELATION-COLLECT (row 105, Kyle KD-14): record xStock pair correlation to SPY/USD without applying it.
// Pre-audit: Claude Comms and Packages/Scope Files/B_XSTOCK_CORRELATION_COLLECT_PRE_AUDIT.md (P-1..P-8).

const CFG: PairCorrelationConfig = {
  lookbackBars: 30, btcReferenceSymbol: 'SPY/USD', factorMin: 0.95, factorMax: 1.05, sensitivity: 0.05,
  minSamples: 30, driftingThreshold: 0.7, idiosyncraticThreshold: 0.3, computeCorrelationEnabled: true, applyFactor: false,
};
const T0 = Date.UTC(2026, 10, 5, 0, 0);
const MIN = 60_000;
// A series of 15-minute bars at the given slot numbers, with a deterministic, non-trivial close path.
function bars(slots: number[], seed: number): OHLCData[] {
  return slots.map((k) => {
    const close = 100 + 10 * Math.sin(k * 0.7 + seed) + k * 0.05;
    return { open: close, high: close, low: close, close, volume: 1, timestamp: T0 + k * 15 * MIN } as OHLCData;
  });
}
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

function stubSources() {
  const calls: string[] = [];
  const sources: CorrelationReferenceSources = {
    async crypto(symbol) { calls.push(`crypto:${symbol}`); return bars(range(0, 60), 1); },
    async xstock(symbol, interval) { calls.push(`xstock:${symbol}:${interval}`); return bars(range(0, 60), 2); },
  };
  return { calls, sources };
}

describe('P-1 the reference comes from the store that holds its class', () => {
  it('crypto: the Kraken source, pair untouched (the same array), not aligned', async () => {
    const { calls, sources } = stubSources();
    const pair = bars(range(0, 60), 3);
    const r = await resolveCorrelationInputs('crypto_spot', pair, { ...CFG, btcReferenceSymbol: 'XXBTZUSD' }, sources);
    expect(calls).toEqual(['crypto:XXBTZUSD']);
    if ('skip' in r) throw new Error(r.skip);
    expect(r.pair).toBe(pair);
    expect(r.alignedByTimestamp).toBe(false);
    expect(r.intervalMinutes).toBe(60);
  });
  it("xStock: the xStock bar store, at the PAIR series' own interval (15 minutes)", async () => {
    const { calls, sources } = stubSources();
    const r = await resolveCorrelationInputs('xstock_spot', bars(range(0, 60), 3), CFG, sources);
    expect(calls).toEqual(['xstock:SPY/USD:15']);
    if ('skip' in r) throw new Error(r.skip);
    expect(r.intervalMinutes).toBe(15);
    expect(r.alignedByTimestamp).toBe(true);
  });
  it('xStock: a pair series with no readable 15/60-minute interval is skipped, not guessed', async () => {
    const { calls, sources } = stubSources();
    const fiveMin = bars(range(0, 40), 3).map((b, i) => ({ ...b, timestamp: T0 + i * 5 * MIN }));
    const r = await resolveCorrelationInputs('xstock_spot', fiveMin, CFG, sources);
    expect('skip' in r).toBe(true);
    expect(calls).toEqual([]);
  });
  it('inferIntervalMinutes reads the median spacing', () => {
    expect(inferIntervalMinutes(bars([0, 1, 2, 4, 5], 0))).toBe(15);
    expect(inferIntervalMinutes(bars([0], 0))).toBeNull();
  });
});

describe('P-1 xStock bars are paired by TIME, not by position (A-2)', () => {
  // The pair is missing slots 40-44 — a gap INSIDE the 30-bar window; SPY is complete. By position, the last 30 of each
  // would compare different times (a gap outside the window would line up either way and prove nothing).
  const pair = bars([...range(0, 40), ...range(45, 60)], 3);
  const spy = bars(range(0, 60), 2);
  it('every aligned pair of bars shares one timestamp, and only shared timestamps survive', () => {
    const a = alignByTimestamp(pair, spy);
    expect(a.pair.length).toBe(55);
    expect(a.pair.every((b, i) => b.timestamp === a.ref[i].timestamp)).toBe(true);
  });
  it('the correlation computed from the resolved inputs is the time-paired one, with a full 30-bar window', async () => {
    const { sources } = stubSources();
    const sourcesWithSpy: CorrelationReferenceSources = { ...sources, xstock: async () => spy };
    const r = await resolveCorrelationInputs('xstock_spot', pair, CFG, sourcesWithSpy);
    if ('skip' in r) throw new Error(r.skip);
    const res = computePairCorrelation('AAPL/USD', r.pair, r.ref, CFG, 'xstock_spot');
    expect(res.coldStart).toBe(false);
    expect(res.sampleCount).toBe(29); // the ceiling for a 30-bar lookback (Langston: an equality, not >=)
    expect(res.btcReferenceAvailable).toBe(true);
    // Positional pairing over the raw series gives a DIFFERENT correlation here — the defect this batch removes.
    const positional = computePairCorrelation('AAPL/USD', pair, spy, CFG, 'xstock_spot');
    expect(positional.correlationToBtc).not.toBeCloseTo(res.correlationToBtc, 6);
  });
  it('bar shape: non-finite closes are visible — they drop returns, so sample_count falls below 29', async () => {
    const nanPair = bars(range(0, 60), 3).map((b, i) => (i === 45 ? { ...b, close: Number.NaN } : b));
    const r = await resolveCorrelationInputs('xstock_spot', nanPair, CFG, { ...stubSources().sources, xstock: async () => spy });
    if ('skip' in r) throw new Error(r.skip);
    expect(r.ref!.every((b) => Number.isFinite(b.close))).toBe(true);
    expect(computePairCorrelation('AAPL/USD', r.pair, r.ref, CFG, 'xstock_spot').sampleCount).toBeLessThan(29);
  });
  it('too few shared bars is a cold start, not a correlation', async () => {
    const thin = bars(range(0, 20), 3);
    const r = await resolveCorrelationInputs('xstock_spot', thin, CFG, { ...stubSources().sources, xstock: async () => spy });
    if ('skip' in r) throw new Error(r.skip);
    expect(computePairCorrelation('AAPL/USD', r.pair, r.ref, CFG, 'xstock_spot').coldStart).toBe(true);
  });
});

describe('P-4 a record-only row is honest about what the factor did (Langston binding condition, Step 2)', () => {
  const result = computePairCorrelation('AAPL/USD', bars(range(0, 60), 3), bars(range(0, 60), 9), CFG, 'xstock_spot');
  it('not applied: the alternate confidence IS the real confidence, exactly; with-factor is the would-be value', () => {
    expect(result.factor).toBeGreaterThan(1);
    const alt = buildB68_3Alternate(0.62, 'TFS', result, CFG, 'xstock_spot', { applied: false, intervalMinutes: 15, alignedByTimestamp: true });
    expect(alt.alternateDecision.confidence).toBe(0.62);
    const m = alt.alternateDecision.metadata as Record<string, unknown>;
    expect(m.confidence_without_factor).toBe(0.62);
    expect(m.confidence_with_factor).toBeCloseTo(0.62 * result.factor, 12);
    expect(m.factor_applied).toBe(false);
    expect(m.interval_minutes).toBe(15);
    expect(m.aligned_by_timestamp).toBe(true);
    expect(m.reference_symbol).toBe('SPY/USD');
  });
  it('applied (crypto): unchanged — the counterfactual divides the factor out of the real confidence', () => {
    const alt = buildB68_3Alternate(0.62, 'TFS', result, { ...CFG, applyFactor: true }, 'crypto_spot', { applied: true, intervalMinutes: 60, alignedByTimestamp: false });
    expect(alt.alternateDecision.confidence).toBeCloseTo(0.62 / result.factor, 12);
    expect((alt.alternateDecision.metadata as Record<string, unknown>).confidence_with_factor).toBe(0.62);
  });
});

describe('P-3 the two older call sites: no borrowed config, factor multiplied only when applied (source fence)', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
  for (const [file, cfgName, chain] of [
    ['services/signal-orchestrator.ts', 'pairCorrelationConfig', 'modulatedConfChain'],
    ['services/vts-runner.ts', '_pairCorrelationConfig', '_modulatedConfChain'],
  ] as const) {
    it(`${file}`, () => {
      const src = read(file);
      expect(src).not.toMatch(/getPairCorrelationConfigForClass\([^)]*\)\s*\?\?/);
      expect(src).toContain(`if (${cfgName}.applyFactor) ${chain} *= result.factor;`);
      expect(src).toContain('resolveCorrelationInputs(');
    });
  }
});

describe('P-6 the nightly replay matches a record to a trade of the SAME asset class', () => {
  const entry = (cls: string, t: number) => ({ entryTime: t, trade: { id: `${cls}-trade`, assetClass: cls }, source: 'db' as const });
  it('an xStock DASH/USD record does not take the crypto DASH/USD trade', () => {
    const db: VtsTradeIndex = new Map([[tradeIndexKey('crypto_spot', 'DASH/USD', 'breakout'), [entry('crypto_spot', 1_000_000)]]]);
    expect(findMatchingTrade(db, new Map(), 'xstock_spot', 'DASH/USD', 'breakout', 1_000_000)).toBeNull();
    expect(findMatchingTrade(db, new Map(), 'crypto_spot', 'DASH/USD', 'breakout', 1_000_000)?.trade.id).toBe('crypto_spot-trade');
  });
  it('with both present, each class gets its own', () => {
    const db: VtsTradeIndex = new Map([
      [tradeIndexKey('crypto_spot', 'DASH/USD', 'breakout'), [entry('crypto_spot', 1_000_000)]],
      [tradeIndexKey('xstock_spot', 'DASH/USD', 'breakout'), [entry('xstock_spot', 1_000_000)]],
    ]);
    expect(findMatchingTrade(db, new Map(), 'xstock_spot', 'DASH/USD', 'breakout', 1_000_000)?.trade.id).toBe('xstock_spot-trade');
  });
});

describe('P-7 only the calibration read excludes record-only rows; the replay-status read is unchanged (source fence)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'drift-dashboard-aggregator.ts'), 'utf8');
  const filter = "alternate_decision->'metadata'->>'factor_applied' IS DISTINCT FROM 'false'";
  it('the filter appears exactly once, inside computeFactorCalibration', () => {
    expect(src.split(filter).length - 1).toBe(1);
    const cal = src.indexOf('export async function computeFactorCalibration');
    expect(cal).toBeGreaterThan(0);
    expect(src.indexOf(filter)).toBeGreaterThan(cal);
  });
});

describe('fix on find: one NaN no longer hangs the rank correlation (spearmanRankCorrelation)', () => {
  it('terminates and ranks finite input exactly as before', () => {
    expect(() => spearmanRankCorrelation([1, Number.NaN, 3, 4, 5], [1, 2, 3, 4, 5])).not.toThrow();
    expect(spearmanRankCorrelation([1, 2, 2, 4, 5], [5, 4, 4, 2, 1])).toBeCloseTo(-1, 12); // ties still averaged
    expect(spearmanRankCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 12);
  }, 2_000);
});
