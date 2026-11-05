/**
 * B-XSTOCK-DBS-TO-STRATEGIES (#1235) — the xStock strategies receive the directional score (DBS),
 * volatility_edge reads its strong-DBS threshold from settings, and crypto's strong-trend geometry
 * override is read from settings instead of literals.
 *
 * Scope:     Claude Comms and Packages/Scope Files/B_XSTOCK_DBS_TO_STRATEGIES_SCOPE.md (r4a)
 * Pre-audit: Claude Comms and Packages/Scope Files/B_XSTOCK_DBS_TO_STRATEGIES_PRE_AUDIT.md (P9)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const settings: { required: Record<string, number>; module: Record<string, number> } = {
  required: {},
  module: {},
};
const requiredCalls: Array<{ module: string; name: string; key: any }> = [];

vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, name: string, key: any) => {
    requiredCalls.push({ module, name, key });
    const v = settings.required[`${module}.${name}`];
    if (v === undefined) throw new Error(`[test] missing required constant ${module}.${name}`);
    return v;
  },
  getCachedNumbersForModule: () => settings.module,
}));

import { buildXstockDetectIndicators, detectDbsScoreOf } from '../../asset_classes/xstock_spot/detect-indicators.js';
import { detectVolatilityEdge } from '../../strategies/volatility-edge.js';
import { readStrongTrendGeometryOverride } from '../../services/strong-trend-geometry.js';
import { getNullReason, resetNullReason } from '../../utils/null-reason-tracker.js';

const ROOT = path.resolve(__dirname, '../../..');
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const MCE = {
  vwap: 10, sma: 9.8, currentPrice: 10.1, volume: 1000, high24h: 10.5, low24h: 9.5,
  atr: 0.2, volatility: 0.03, momentum: 0.4, adx: 22,
};

beforeEach(() => {
  settings.required = {};
  settings.module = {};
  requiredCalls.length = 0;
});

describe('OBJ-1 — the xStock detect input carries the directional score', () => {
  it('carries all three DBS fields from the scanner', () => {
    const out = buildXstockDetectIndicators(MCE, { score: 0.42, category: 'UP_STRONG', slope: 0.01 });
    expect(out.dbsScore).toBe(0.42);
    expect(out.dbsCategory).toBe('UP_STRONG');
    expect(out.dbsSlope).toBe(0.01);
  });

  it('keeps ALL ten MCE fields (a spread, never crypto’s seven-field pick)', () => {
    const out = buildXstockDetectIndicators(MCE, { score: 0.1, category: 'NEUTRAL', slope: 0 });
    for (const [k, v] of Object.entries(MCE)) expect((out as any)[k]).toBe(v);
  });

  it('does not mutate the MCE object (other readers in the loop use it as is)', () => {
    const base = { ...MCE };
    buildXstockDetectIndicators(base, { score: -0.5, category: 'DOWN_STRONG', slope: -0.02 });
    expect(base).toEqual(MCE);
    expect('dbsScore' in base).toBe(false);
  });

  it('with no scanner score the fields are ABSENT, not 0 (the strategies apply their own ?? 0)', () => {
    const out = buildXstockDetectIndicators(MCE, undefined);
    expect(out.dbsScore).toBeUndefined();
    expect(out.dbsCategory).toBeUndefined();
    expect(out.dbsSlope).toBeUndefined();
  });
});

describe('OBJ-3b — the score the archive records', () => {
  it('is the number detect received, or null', () => {
    expect(detectDbsScoreOf({ dbsScore: -0.37 })).toBe(-0.37);
    expect(detectDbsScoreOf({ dbsScore: 0 })).toBe(0);
    expect(detectDbsScoreOf({})).toBeNull();
    expect(detectDbsScoreOf({ dbsScore: NaN })).toBeNull();
  });
});

describe('OBJ-1b — volatility_edge reads its strong-DBS threshold from settings', () => {
  const indicators = (dbs: number) => ({ ...MCE, dbsScore: dbs }) as any;

  it('refuses at the SETTING, not at a literal 0.35 (setting 0.20, score 0.25 → refused)', () => {
    settings.required['strategy_dbs_routing_guards.dbs_min_threshold'] = 0.2;
    resetNullReason();
    expect(detectVolatilityEdge(indicators(0.25), [], null, 'crypto_spot')).toBeNull();
    expect(getNullReason()).toBe('b63_strong_dbs_exclusion');
  });

  it('passes the guard when the score is below the setting (setting 0.30, score 0.25)', () => {
    settings.required['strategy_dbs_routing_guards.dbs_min_threshold'] = 0.3;
    resetNullReason();
    detectVolatilityEdge(indicators(0.25), [], null, 'crypto_spot'); // fails later on no candles
    expect(getNullReason()).not.toBe('b63_strong_dbs_exclusion');
  });

  it('reads the group key with volatility_edge as the strategy (exchange/asset_class/regime *)', () => {
    settings.required['strategy_dbs_routing_guards.dbs_min_threshold'] = 0.35;
    detectVolatilityEdge(indicators(0.5), [], null, 'xstock_spot');
    const call = requiredCalls.find((c) => c.module === 'strategy_dbs_routing_guards');
    expect(call?.name).toBe('dbs_min_threshold');
    expect(call?.key).toEqual({ exchange: '*', assetClass: 'xstock_spot', strategy: 'volatility_edge', regime: '*' });
  });

  it('a value swap only: no mirror counter-trend arm (a strongly negative score is not refused here)', () => {
    settings.required['strategy_dbs_routing_guards.dbs_min_threshold'] = 0.35;
    resetNullReason();
    detectVolatilityEdge(indicators(-0.9), [], null, 'crypto_spot');
    expect(getNullReason()).not.toBe('b63b_counter_trend_long_exclusion');
    expect(getNullReason()).not.toBe('b63_strong_dbs_exclusion');
  });

  it('a missing row throws (no fallback)', () => {
    expect(() => detectVolatilityEdge(indicators(0.1), [], null, 'crypto_spot')).toThrow(/missing required constant/);
  });
});

describe('OBJ-1c — the strong-trend geometry override is read from settings', () => {
  it('returns the seeded values, keyed to vwap_pullback and the asset class', () => {
    settings.required['strategy.vwap_pullback.strong_trend_override_stop_atr_mult'] = 5;
    settings.required['strategy.vwap_pullback.strong_trend_override_target_r_multiple'] = 2;
    expect(readStrongTrendGeometryOverride('crypto_spot')).toEqual({ stopAtrMultiplier: 5, targetAsRMultiple: 2 });
    for (const c of requiredCalls) {
      expect(c.module).toBe('strategy.vwap_pullback');
      expect(c.key).toEqual({ exchange: '*', assetClass: 'crypto_spot', strategy: 'vwap_pullback', regime: '*' });
    }
  });

  it('throws when the row is missing (no fallback)', () => {
    expect(() => readStrongTrendGeometryOverride('xstock_spot')).toThrow(/missing required constant/);
  });
});

describe('source fences — the wiring the unit tests above cannot reach', () => {
  const evalCycle = src('server/asset_classes/xstock_spot/eval-cycle.ts');
  const vtsRunner = src('server/services/vts-runner.ts');
  const volEdge = src('server/strategies/volatility-edge.ts');

  it('the xStock loop hands detect the built object, not the raw MCE indicators', () => {
    const call = evalCycle.slice(evalCycle.indexOf('strategySignal = callStrategyDetect('));
    const args = call.slice(0, call.indexOf(');'));
    expect(args).toMatch(/strategyKey,\s*detectIndicators,/);
    expect(args).not.toContain('mceContext.indicators');
    expect(evalCycle).toContain('buildXstockDetectIndicators(mceContext.indicators, propagatedDbs)');
  });

  it('every one of the eight post-detect archive sites records detectDbsScore', () => {
    const sites = evalCycle.split('archiveSignalEval({').length - 1;
    expect(sites).toBe(8);
    // Comments are stripped first: a comment naming the key must not satisfy the fence.
    const stripComments = (t: string) => t.replace(/\/\/[^\n]*/g, '');
    const blocks = evalCycle.split('archiveSignalEval({').slice(1).map((b) => stripComments(b.slice(0, b.indexOf('});'))));
    for (const b of blocks) expect(b).toMatch(/\bdetectDbsScore\s*[,}]/);
  });

  it('crypto attaches the override only in the strong-trend arm, from settings, with no literals', () => {
    expect(vtsRunner).toMatch(/strongTrendGeometryOverride: isStrongTrendLane\s*\?\s*readStrongTrendGeometryOverride\(_assetClass\)\s*:\s*undefined/);
    expect(vtsRunner).not.toMatch(/stopAtrMultiplier:\s*4\.0/);
    expect(vtsRunner).not.toMatch(/targetAsRMultiple:\s*3\.0/);
  });

  it('volatility_edge has no literal 0.35 guard left', () => {
    expect(volEdge).not.toMatch(/dbsScore \?\? 0\)\s*>=\s*0\.35/);
    expect(volEdge).toMatch(/dbsScore \?\? 0\)\s*>=\s*dbsGuardThreshold/);
  });
});
