/**
 * B-5 AMR BODY — unit suite (scope §7 verification matrix, DB-free).
 *
 * Seeds the module_constants cache in-memory (the B-4.5 pattern — the
 * DB-backed path is exercised by CI db:migrate + the boot assertions).
 * Market-indicator/feed inputs are mocked per case so each class's weather
 * can be driven deterministically (the A2 parity philosophy: synthetic
 * inputs that actually reach DEFENSIVE/SURVIVAL/FAVORABLE — live telemetry
 * is near-all-NORMAL and would prove nothing).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  _seedModuleCacheForTests,
  type ModuleConstant,
} from '../../services/module-constants-service.js';

// ── Input mocks (hoisted before aggregator import) ──────────────────────────
const miMock = vi.hoisted(() => ({
  current: new Map<string, Record<string, unknown>>(),
}));
vi.mock('../../services/market-indicators.js', () => ({
  getMarketIndicators: (assetClass: string) => {
    const m = miMock.current.get(assetClass);
    if (!m) throw new Error(`test: no mock for ${assetClass}`);
    return m;
  },
}));
const macroMock = vi.hoisted(() => ({
  snapshot: { ageSeconds: Infinity } as Record<string, unknown>,
  baseline: {} as Record<string, unknown>,
}));
vi.mock('../../services/external-macro-feed.js', () => ({
  getLatestMacroSnapshot: () => macroMock.snapshot,
  getLatestMacroBaseline: () => macroMock.baseline,
}));
vi.mock('../../services/amr-equity-feed.js', () => ({
  getLatestEquitySnapshot: () => ({ ageSeconds: Infinity, fredCrossCheck: 'pending', schemaGuardTripped: false }),
}));
vi.mock('../../db.js', () => ({
  db: { insert: () => ({ values: async () => undefined }), execute: async () => ({ rows: [] }) },
}));

import {
  recordXstockFrictionCycle,
  resetXstockFrictionWarmup,
  getXstockFrictionSample,
  getMeasuredSpreadDecimal,
  _resetXstockFrictionStoreForTests,
} from '../../asset_classes/xstock_spot/friction-sample-store.js';
import {
  resolveStrategyModeFromWeather,
  getModeOverlayForClass,
  getSlotCapForMode,
  recordModeExecutionForClass,
  getModeStatsForClass,
  _resetClassModeStatsForTests,
  type StrategyMode,
} from '../../core/governance/strategy-modes.js';
import {
  runAmrWeatherCycle,
  getAmrWeatherReport,
  getCurrentModeForClass,
  getActiveModeForClass,
  feedEvGapObservation,
  _resetAmrWeatherForTests,
} from '../../services/amr-weather-report.js';
import { evaluateAmrGates } from '../../core/governance/amr-gates.js';
import { setCostMetrics, getCostMetrics } from '../../core/cache/cost-cache.js';
import { _resetAmrInputHealthForTests } from '../../services/amr-input-health.js';
import { getCachedCostMetrics } from '../../core/math/cost-model.js';

// ── Seeds (mirror migration 2026-06-11c-b5-amr-body.sql) ────────────────────
const row = (moduleName: string, assetClass: string, constantName: string, value: unknown) => ({
  moduleName, exchange: '*', assetClass, strategy: '*', regime: '*', constantName, value,
} as unknown as ModuleConstant);

function seedAll(flags: { crypto?: string; xstock?: string } = {}): void {
  _seedModuleCacheForTests('amr_runtime', [
    row('amr_runtime', 'crypto_spot', 'mode', flags.crypto ?? 'shadow'),
    row('amr_runtime', 'xstock_spot', 'mode', flags.xstock ?? 'shadow'),
  ]);
  const dialRows: ModuleConstant[] = [];
  const dials: Array<[string, Record<string, number>]> = [
    ['normal_', { position_size_multiplier: 1.0, stop_loss_distance_multiplier: 1.0, take_profit_distance_multiplier: 1.0, entry_cooldown_multiplier: 1.0 }],
    ['aggressive_', { position_size_multiplier: 1.25, stop_loss_distance_multiplier: 1.0, take_profit_distance_multiplier: 1.2, entry_cooldown_multiplier: 0.75 }],
    ['defensive_', { position_size_multiplier: 0.6, stop_loss_distance_multiplier: 1.2, take_profit_distance_multiplier: 0.8, entry_cooldown_multiplier: 1.5 }],
    ['survival_', { position_size_multiplier: 0.25, stop_loss_distance_multiplier: 1.5, take_profit_distance_multiplier: 0.6, entry_cooldown_multiplier: 2.0 }],
  ];
  for (const klass of ['crypto_spot', 'xstock_spot']) {
    for (const [prefix, vals] of dials) {
      for (const [k, v] of Object.entries(vals)) {
        // xstock aggressive size differs so per-class resolution is provable
        const vv = klass === 'xstock_spot' && prefix === 'aggressive_' && k === 'position_size_multiplier' ? 1.15 : v;
        dialRows.push(row('amr_response_dials', klass, prefix + k, vv));
      }
      dialRows.push(row('amr_response_dials', klass, prefix + 'hard_pause', false));
      dialRows.push(row('amr_response_dials', klass, prefix + 'allowed_source_pools', ['all']));
      dialRows.push(row('amr_response_dials', klass, prefix + 'allowed_strategy_families', ['all']));
      dialRows.push(row('amr_response_dials', klass, prefix + 'slot_cap', prefix === 'survival_' ? 2 : 8));
    }
  }
  _seedModuleCacheForTests('amr_response_dials', dialRows);
  _seedModuleCacheForTests('governance_modes', ['crypto_spot', 'xstock_spot', '*'].flatMap(k => [
    row('governance_modes', k, 'normal_mode_confidence_floor', 0.60),
    row('governance_modes', k, 'aggressive_mode_confidence_floor', 0.60), // B1: = NORMAL
    row('governance_modes', k, 'defensive_mode_confidence_floor', 0.70),
    row('governance_modes', k, 'survival_mode_confidence_floor', 0.80),
  ]));
  _seedModuleCacheForTests('amr_weather_rules', ['crypto_spot', 'xstock_spot'].flatMap(k => [
    row('amr_weather_rules', k, 'friction_score_choppy', k === 'crypto_spot' ? 40 : 45),
    row('amr_weather_rules', k, 'friction_score_stormy', k === 'crypto_spot' ? 60 : 70),
    row('amr_weather_rules', k, 'dbs_abs_choppy', k === 'crypto_spot' ? 0.45 : 0.32),
    row('amr_weather_rules', k, 'dbs_abs_stormy', k === 'crypto_spot' ? 0.60 : 0.45),
    row('amr_weather_rules', k, 'ev_gap_window_n', 5),
    row('amr_weather_rules', k, 'flip_window_epochs', 20),
    row('amr_weather_rules', k, 'regime_flips_choppy', 3),
    row('amr_weather_rules', k, 'regime_flips_stormy', 5),
    row('amr_weather_rules', k, 'ev_gap_choppy_ratio', 0.5),
    row('amr_weather_rules', k, 'ev_gap_stormy_ratio', 1.0),
    row('amr_weather_rules', k, 'favorable_min_score', 0.7),
    row('amr_weather_rules', k, 'score_stormy_max', 0.25),
    row('amr_weather_rules', k, 'score_choppy_max', 0.45),
    row('amr_weather_rules', k, 'dwell_min_epochs', 3),
    row('amr_weather_rules', k, 'relax_confirm_epochs', 3),
    row('amr_weather_rules', k, 'weight_friction', 0.30),
    row('amr_weather_rules', k, 'weight_dbs', 0.20),
    row('amr_weather_rules', k, 'weight_flips', 0.20),
    row('amr_weather_rules', k, 'weight_evgap', 0.20),
    row('amr_weather_rules', k, 'weight_macro', 0.10),
    row('amr_weather_rules', k, 'friction_trend_window_epochs', 20),
  ]));
  _seedModuleCacheForTests('amr_friction_sample', [
    row('amr_friction_sample', 'xstock_spot', 'freshness_window_seconds', 150),
    row('amr_friction_sample', 'xstock_spot', 'min_fresh_names', 3),
    row('amr_friction_sample', 'xstock_spot', 'warmup_cycles', 2),
  ]);
  _seedModuleCacheForTests('amr_input_health', ['crypto_spot', 'xstock_spot'].flatMap(k => [
    row('amr_input_health', k, 'stuck_arming_distinct_k', 3),
    row('amr_input_health', k, 'stuck_arming_window_days', 7),
    row('amr_input_health', k, 'stuck_value_epochs_n', 10),
    row('amr_input_health', k, 'stuck_zero_epochs_n', 4),
    row('amr_input_health', k, 'staleness_tolerance_epochs', 10),
    row('amr_input_health', k, 'z_abs_max', 6),
    row('amr_input_health', k, 'vote_pct_min', 0),
    row('amr_input_health', k, 'vote_pct_max', 100),
    row('amr_input_health', k, 'friction_score_min', 0),
    row('amr_input_health', k, 'friction_score_max', 100),
    row('amr_input_health', k, 'dbs_abs_max', 1),
  ]));
  _seedModuleCacheForTests('fee_model', ['crypto_spot', 'xstock_spot'].flatMap(k => [
    row('fee_model', k, 'spot_taker_fee', 0.008),
    row('fee_model', k, 'spot_maker_fee', 0.004),
  ]));
}

const LIVE_CALM = {
  voteStatus: 'LIVE', marketRegime: 'TREND_FRIENDLY_STABLE', regimePercentage: 62,
  globalFrictionScore: 29, frictionReason: null, frictionSampleSize: 13,
  globalDBS: { score: 0.10, category: 'NEUTRAL', pairCount: 300 }, globalDBSIsStale: false,
};
const LIVE_HOSTILE = {
  voteStatus: 'LIVE', marketRegime: 'HIGH_VOLATILITY_UNSTABLE', regimePercentage: 48,
  globalFrictionScore: 85, frictionReason: null, frictionSampleSize: 200,
  globalDBS: { score: -0.70, category: 'DOWN_STRONG', pairCount: 300 }, globalDBSIsStale: false,
};
const IDLE = {
  voteStatus: 'IDLE_OR_WARMING', marketRegime: 'RANGE_BOUND_STABLE', regimePercentage: 0,
  globalFrictionScore: null, frictionReason: 'MARKET_CLOSED', frictionSampleSize: 0,
  globalDBS: null, globalDBSIsStale: false,
};

// A Tuesday 15:00 UTC — inside RTH, inside the 24/5 window.
const OPEN_TS = Date.UTC(2026, 5, 9, 15, 0, 0);

beforeAll(() => seedAll());

beforeEach(() => {
  _resetAmrWeatherForTests();
  _resetAmrInputHealthForTests();
  _resetXstockFrictionStoreForTests();
  _resetClassModeStatsForTests();
  miMock.current.set('crypto_spot', { ...LIVE_CALM });
  miMock.current.set('xstock_spot', { ...LIVE_CALM });
  macroMock.snapshot = { ageSeconds: Infinity };
  macroMock.baseline = {};
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5 Obj-0a — XstockFrictionSample store (reason-coded taxonomy)', () => {
  const tick = (spread: number) => new Map([['TSLAx/USD', { bidAskSpreadPct: spread, volume24hShares: 1000 }], ['AAPLx/USD', { bidAskSpreadPct: spread + 0.01, volume24hShares: 900 }], ['SPY/USD', { bidAskSpreadPct: spread - 0.01, volume24hShares: 5000 }]]);
  const depth = new Map([['TSLAx/USD', { askDepthUsd: 5000, bidDepthUsd: 4000 }]]);

  it('NO_SOURCE before any cycle write', () => {
    expect(getXstockFrictionSample(OPEN_TS).status.kind).toBe('NO_SOURCE');
  });
  it('WARMING n=k/N until warmup_cycles, then OK with quantiles', () => {
    recordXstockFrictionCycle(tick(0.10), depth, OPEN_TS);
    const warming = getXstockFrictionSample(OPEN_TS);
    expect(warming.status).toEqual({ kind: 'WARMING', cyclesSeen: 1, cyclesRequired: 2 });
    recordXstockFrictionCycle(tick(0.10), depth, OPEN_TS + 30_000);
    const ok = getXstockFrictionSample(OPEN_TS + 30_000);
    expect(ok.status.kind).toBe('OK');
    expect(ok.p50SpreadPct).toBeCloseTo(0.10, 5);
  });
  it('LOW_VOLUME_THIN below min names — market open, never shutdown-shaped', () => {
    const thin = new Map([['TSLAx/USD', { bidAskSpreadPct: 0.2, volume24hShares: 10 }]]);
    recordXstockFrictionCycle(thin, depth, OPEN_TS);
    recordXstockFrictionCycle(thin, depth, OPEN_TS + 30_000);
    const read = getXstockFrictionSample(OPEN_TS + 30_000);
    expect(read.status).toEqual({ kind: 'LOW_VOLUME_THIN', sampleCount: 1, minRequired: 3 });
  });
  it('MARKET_CLOSED keys off the market-hours predicate, never sample absence', () => {
    const saturday = Date.UTC(2026, 5, 13, 15, 0, 0);
    expect(getXstockFrictionSample(saturday).status.kind).toBe('MARKET_CLOSED');
  });
  it('resume re-seeds the warmup honestly (post-idle WARMING)', () => {
    recordXstockFrictionCycle(tick(0.1), depth, OPEN_TS);
    recordXstockFrictionCycle(tick(0.1), depth, OPEN_TS + 30_000);
    expect(getXstockFrictionSample(OPEN_TS + 30_000).status.kind).toBe('OK');
    resetXstockFrictionWarmup();
    expect(getXstockFrictionSample(OPEN_TS + 60_000).status.kind).toBe('WARMING');
  });
  it('getMeasuredSpreadDecimal: fresh decimal, stale null, -1 sentinel null', () => {
    recordXstockFrictionCycle(tick(0.12), depth, OPEN_TS);
    expect(getMeasuredSpreadDecimal('TSLAx/USD', OPEN_TS + 1000)).toBeCloseTo(0.0012, 6);
    expect(getMeasuredSpreadDecimal('TSLAx/USD', OPEN_TS + 400_000)).toBeNull(); // stale
    recordXstockFrictionCycle(new Map([['BAD/USD', { bidAskSpreadPct: -1, volume24hShares: 5 }]]), depth, OPEN_TS);
    expect(getMeasuredSpreadDecimal('BAD/USD', OPEN_TS + 1000)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5 Obj-12 — cost-model measured-spread read (spreadSource stamp)', () => {
  it('measured spread present → spread=measured + spreadSource=measured', () => {
    recordXstockFrictionCycle(new Map([['NVDAx/USD', { bidAskSpreadPct: 0.20, volume24hShares: 100 }]]), new Map(), Date.now());
    const c = getCachedCostMetrics('NVDAx/USD', 'xstock_spot');
    expect(c.spreadSource).toBe('measured');
    expect(c.spread).toBeCloseTo(0.0020, 6);
    expect(c.fee).toBe(0.008);
  });
  it('absent symbol → static module spread + spreadSource=static_fallback', () => {
    const c = getCachedCostMetrics('GOOGLx/USD', 'xstock_spot');
    expect(c.spreadSource).toBe('static_fallback');
    expect(c.spread).toBe(0.0012);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5 Obj-1/2/4 — modes, per-class dials, brain seam', () => {
  it('brain seam mapping (M2): FAVORABLE→AGGRESSIVE, CALM→NORMAL, CHOPPY→DEFENSIVE, STORMY→SURVIVAL, IDLE→null', () => {
    expect(resolveStrategyModeFromWeather('FAVORABLE')).toBe('AGGRESSIVE');
    expect(resolveStrategyModeFromWeather('CALM')).toBe('NORMAL');
    expect(resolveStrategyModeFromWeather('CHOPPY')).toBe('DEFENSIVE');
    expect(resolveStrategyModeFromWeather('STORMY')).toBe('SURVIVAL');
    expect(resolveStrategyModeFromWeather('IDLE')).toBeNull();
  });
  it('per-class resolution: crypto AGGRESSIVE ≠ xstock AGGRESSIVE (Obj-1 verify)', () => {
    expect(getModeOverlayForClass('AGGRESSIVE', 'crypto_spot').positionSizeMultiplier).toBe(1.25);
    expect(getModeOverlayForClass('AGGRESSIVE', 'xstock_spot').positionSizeMultiplier).toBe(1.15);
  });
  it('B1: AGGRESSIVE floor equals NORMAL floor (no seeded quality-bar cut)', () => {
    expect(getModeOverlayForClass('AGGRESSIVE', 'crypto_spot').confidenceFloor)
      .toBe(getModeOverlayForClass('NORMAL', 'crypto_spot').confidenceFloor);
  });
  // RE-POINTED by B-SIZING-DEC-RESTORE obj-10, not deleted (Langston's subject-vs-probe
  // rule). The SUBJECT half — asserting the class-less trio's ×0.6/×1.2/×0.25 literals —
  // went with the mechanism, since those literals no longer exist. The INVARIANT it was
  // really protecting SURVIVES and is asserted here through the surviving per-class path:
  // a posture is reachable ONLY per asset class, never class-lessly, so crypto dials can
  // never be served to xstock. That used to be enforced by a fail-loud getter on the
  // class-less record; it is now enforced structurally, because no class-less record
  // exists at all.
  it('posture is reachable ONLY per asset class — the class-less route is gone entirely', async () => {
    const mod: Record<string, unknown> = await import('../../core/governance/strategy-modes.js');
    for (const gone of ['STRATEGY_MODE_OVERLAYS', 'getModeOverlay', 'resolveStrategyMode', 'getOverlayForStability']) {
      expect(mod[gone], `class-less posture route reappeared: ${gone}`).toBeUndefined();
    }
    // and the per-class route still serves genuinely different dials per class
    expect(getModeOverlayForClass('AGGRESSIVE', 'crypto_spot').positionSizeMultiplier)
      .not.toBe(getModeOverlayForClass('AGGRESSIVE', 'xstock_spot').positionSizeMultiplier);
  });
  it('per-class mode stats (F2) bump class AND legacy aggregate', () => {
    recordModeExecutionForClass('DEFENSIVE', 'xstock_spot');
    expect(getModeStatsForClass('xstock_spot').DEFENSIVE.trades).toBe(1);
    expect(getModeStatsForClass('crypto_spot').DEFENSIVE).toBeUndefined();
  });
  it('slot caps resolve per (mode, class)', () => {
    expect(getSlotCapForMode('SURVIVAL', 'crypto_spot')).toBe(2);
    expect(getSlotCapForMode('NORMAL', 'crypto_spot')).toBe(8);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5 Obj-3/3a — weather aggregator (per-class, IDLE, ladder, R2)', () => {
  it('cross-class independence: crypto CALM while xstock STORMY in the same cycle (04-22 signature intent)', () => {
    miMock.current.set('crypto_spot', { ...LIVE_CALM });
    miMock.current.set('xstock_spot', { ...LIVE_HOSTILE });
    runAmrWeatherCycle(OPEN_TS);
    expect(getAmrWeatherReport('crypto_spot')?.classification).toBe('CALM');
    expect(getAmrWeatherReport('xstock_spot')?.classification).toBe('STORMY');
    expect(getCurrentModeForClass('xstock_spot')).toBe('SURVIVAL');
  });
  it('IDLE: no posture decision; resume re-seeds silently with min(firstRead, NORMAL) (B5)', () => {
    miMock.current.set('xstock_spot', { ...IDLE });
    runAmrWeatherCycle(OPEN_TS);
    const idle = getAmrWeatherReport('xstock_spot')!;
    expect(idle.classification).toBe('IDLE');
    expect(idle.resolvedMode).toBeNull();
    // resume on a FAVORABLE-grade read — must seed NORMAL, never AGGRESSIVE
    miMock.current.set('xstock_spot', { ...LIVE_CALM, globalFrictionScore: 5, globalDBS: { score: 0.02, category: 'NEUTRAL', pairCount: 300 } });
    runAmrWeatherCycle(OPEN_TS + 30_000);
    expect(getCurrentModeForClass('xstock_spot')).toBe('NORMAL');
    // a hostile first read tightens immediately
    _resetAmrWeatherForTests();
    miMock.current.set('xstock_spot', { ...IDLE });
    runAmrWeatherCycle(OPEN_TS);
    miMock.current.set('xstock_spot', { ...LIVE_HOSTILE });
    runAmrWeatherCycle(OPEN_TS + 30_000);
    expect(getCurrentModeForClass('xstock_spot')).toBe('SURVIVAL');
  });
  it('relax is a one-rung ladder with dwell; tighten is immediate (A8a/A8b)', () => {
    miMock.current.set('crypto_spot', { ...LIVE_HOSTILE });
    runAmrWeatherCycle(OPEN_TS); // epoch 1: SURVIVAL
    expect(getCurrentModeForClass('crypto_spot')).toBe('SURVIVAL');
    // flip to calm — dwell (3 epochs) then confirm (3 epochs) before ONE rung
    miMock.current.set('crypto_spot', { ...LIVE_CALM });
    for (let i = 1; i <= 4; i++) runAmrWeatherCycle(OPEN_TS + i * 30_000);
    expect(getCurrentModeForClass('crypto_spot')).toBe('SURVIVAL'); // epochs 2-5: dwelling + confirming
    runAmrWeatherCycle(OPEN_TS + 5 * 30_000); // epoch 6: 3rd confirm → one rung
    expect(getCurrentModeForClass('crypto_spot')).toBe('DEFENSIVE');
    // one-rung proof: stays DEFENSIVE through the next dwell window
    for (let i = 6; i <= 8; i++) runAmrWeatherCycle(OPEN_TS + i * 30_000);
    expect(getCurrentModeForClass('crypto_spot')).toBe('DEFENSIVE');
  });
  it('R2: out-of-bounds input quarantines and caps the score at neutral (no FAVORABLE)', () => {
    // DBS |1.5| breaches dbs_abs_max=1 → quarantined; everything else perfect
    miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: 2, globalDBS: { score: 1.5, category: 'UP_STRONG', pairCount: 300 } });
    runAmrWeatherCycle(OPEN_TS);
    const r = getAmrWeatherReport('crypto_spot')!;
    expect(r.continuousScore).toBeLessThanOrEqual(0.5);
    expect(r.classification).not.toBe('FAVORABLE');
    expect(r.triggers).toContain('quarantine_cap(R2)');
    expect(r.staleness).toContain('dbs_quarantined');
  });
  it('A5: disabled = no compute (no report)', () => {
    seedAll({ crypto: 'disabled', xstock: 'shadow' });
    _resetAmrWeatherForTests();
    runAmrWeatherCycle(OPEN_TS);
    expect(getAmrWeatherReport('crypto_spot')).toBeNull();
    expect(getAmrWeatherReport('xstock_spot')).not.toBeNull();
    seedAll(); // restore
  });
  it('FAVORABLE -> AGGRESSIVE end-to-end: full 5/5 inputs, dwell + ladder (Langston coverage note)', () => {
    // all five inputs present + benign: friction 5, |DBS| 0.05, 0 flips,
    // EV-gap realized BEATS predicted (negative shortfall), macro z ~0.2
    macroMock.snapshot = { ageSeconds: 10, btcDominance: 56.4, fundingRate: 0.0001, mcapMomentum: 0.01 };
    macroMock.baseline = {
      btcDominanceSampleCount: 100, btcDominanceMean: 56.0, btcDominanceStdDev: 2.0,
      fundingSampleCount: 100, fundingMean: 0.0001, fundingStdDev: 0.0005,
      mcapMomentumSampleCount: 100, mcapMomentumMean: 0.0, mcapMomentumStdDev: 0.05,
    };
    for (let i = 0; i < 5; i++) feedEvGapObservation('crypto_spot', 2.0, 2.5);
    miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: 5, globalDBS: { score: 0.05, category: 'NEUTRAL', pairCount: 300 } });
    runAmrWeatherCycle(OPEN_TS); // epoch 1: classification FAVORABLE, seeded NORMAL (B5 reseed floor)
    const first = getAmrWeatherReport('crypto_spot')!;
    expect(first.inputs.evGapRatio).toBeLessThan(0);
    expect(first.classification).toBe('FAVORABLE'); // completeness cap NOT engaged: 5/5 present
    expect(getCurrentModeForClass('crypto_spot')).toBe('NORMAL');
    // dwell (3) + confirm (3): one rung NORMAL -> AGGRESSIVE at epoch 6
    for (let i = 1; i <= 4; i++) runAmrWeatherCycle(OPEN_TS + i * 30_000);
    expect(getCurrentModeForClass('crypto_spot')).toBe('NORMAL');
    runAmrWeatherCycle(OPEN_TS + 5 * 30_000);
    expect(getCurrentModeForClass('crypto_spot')).toBe('AGGRESSIVE'); // earned through evidence
  });

  it('EV-gap below window N reports warming; full window flows into inputs', () => {
    runAmrWeatherCycle(OPEN_TS);
    expect(getAmrWeatherReport('crypto_spot')!.staleness.join()).toContain('ev_gap_warming');
    for (let i = 0; i < 5; i++) feedEvGapObservation('crypto_spot', 2.0, 1.0); // realized eats half
    runAmrWeatherCycle(OPEN_TS + 30_000);
    expect(getAmrWeatherReport('crypto_spot')!.inputs.evGapRatio).toBeCloseTo(0.5, 5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5 Obj-5/6 — gates (flag discipline, dry-run, fail-closed)', () => {
  it('disabled → skipped, allowed', () => {
    seedAll({ crypto: 'disabled' });
    const r = evaluateAmrGates({ assetClass: 'crypto_spot', site: 'sqe_admission', strategy: 'breakout', confidence: 0.1 });
    expect(r).toMatchObject({ allowed: true, executed: 'skipped' });
    seedAll();
  });
  it('shadow → dry_run: blocks recorded, allowed=true (apply nothing)', () => {
    miMock.current.set('crypto_spot', { ...LIVE_HOSTILE });
    runAmrWeatherCycle(OPEN_TS); // SURVIVAL posture
    const r = evaluateAmrGates({ assetClass: 'crypto_spot', site: 'execution_entry', strategy: 'breakout', confidence: 0.10, openPositionCountForClass: 5 });
    expect(r.executed).toBe('dry_run');
    expect(r.allowed).toBe(true);
    expect(r.blocks.map(b => b.gate)).toEqual(expect.arrayContaining(['confidence_floor', 'slot_cap']));
  });
  it('active → enforce: same inputs now block', () => {
    seedAll({ crypto: 'active' });
    miMock.current.set('crypto_spot', { ...LIVE_HOSTILE });
    runAmrWeatherCycle(OPEN_TS);
    const r = evaluateAmrGates({ assetClass: 'crypto_spot', site: 'execution_entry', strategy: 'breakout', confidence: 0.10, openPositionCountForClass: 5 });
    expect(r.executed).toBe('enforce');
    expect(r.allowed).toBe(false);
    seedAll();
  });
  it('active divergence: crypto active + xstock shadow simultaneously (mixed-flag matrix)', () => {
    seedAll({ crypto: 'active', xstock: 'shadow' });
    miMock.current.set('crypto_spot', { ...LIVE_CALM });
    miMock.current.set('xstock_spot', { ...LIVE_CALM });
    runAmrWeatherCycle(OPEN_TS);
    expect(getActiveModeForClass('crypto_spot')).toBe('NORMAL');
    expect(getActiveModeForClass('xstock_spot')).toBeNull(); // shadow never applies
    expect(getCurrentModeForClass('xstock_spot')).toBe('NORMAL'); // but dry-run sees it
    seedAll();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5 Obj-15b — input-health sentinels (R3 arming, stuck-at-zero)', () => {
  it('stuck-value: arms after K distinct values, fires after N identical (zero fast path)', () => {
    // friction held at 0 after history of distinct values → zero fast-N (4)
    const values = [10, 20, 30, 0, 0, 0, 0, 0];
    let lastHealth: Array<{ input: string; varying: boolean | null }> = [];
    values.forEach((v, i) => {
      miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: v });
      runAmrWeatherCycle(OPEN_TS + i * 30_000);
      lastHealth = getAmrWeatherReport('crypto_spot')!.health;
    });
    const friction = lastHealth.find(h => h.input === 'friction')!;
    expect(friction.varying).toBe(false); // stuck detector fired
  });
  it('legitimately-quiet input stays DISARMED (varying=null), never false-alerts', () => {
    for (let i = 0; i < 8; i++) {
      miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: 29 });
      runAmrWeatherCycle(OPEN_TS + i * 30_000);
    }
    const friction = getAmrWeatherReport('crypto_spot')!.health.find(h => h.input === 'friction')!;
    expect(friction.varying).toBeNull(); // <K distinct → honestly disarmed
  });
});


// ════════════════════════════════════════════════════════════════════════════
describe('B-5.1 (#224) — friction warm-up IDLE + no_posture gate (pre-audit Note-3)', () => {
  it('friction WARMING -> IDLE per class (no thin-input CALM)', () => {
    miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: null, frictionReason: 'WARMING' });
    miMock.current.set('xstock_spot', { ...LIVE_CALM, globalFrictionScore: null, frictionReason: 'WARMING' });
    runAmrWeatherCycle(OPEN_TS);
    for (const k of ['crypto_spot', 'xstock_spot'] as const) {
      const r = getAmrWeatherReport(k)!;
      expect(r.classification).toBe('IDLE');
      expect(r.staleness).toContain('friction_warming');
      expect(r.resolvedMode).toBeNull();
    }
  });
  it('friction NO_SOURCE -> IDLE with friction_no_source (fail-closed for unsourced classes)', () => {
    miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: null, frictionReason: 'NO_SOURCE' });
    runAmrWeatherCycle(OPEN_TS);
    const r = getAmrWeatherReport('crypto_spot')!;
    expect(r.classification).toBe('IDLE');
    expect(r.staleness).toContain('friction_no_source');
  });
  it('LOW_VOLUME_THIN stays LIVE (market open + measured: caution-grade absence, not warm-up)', () => {
    miMock.current.set('xstock_spot', { ...LIVE_CALM, globalFrictionScore: null, frictionReason: 'LOW_VOLUME_THIN' });
    runAmrWeatherCycle(OPEN_TS);
    expect(getAmrWeatherReport('xstock_spot')!.classification).not.toBe('IDLE');
  });
  it('warm-up exit is safe by construction: IDLE while warming, first LIVE read never AGGRESSIVE', () => {
    miMock.current.set('crypto_spot', { ...LIVE_CALM, globalFrictionScore: null, frictionReason: 'WARMING' });
    runAmrWeatherCycle(OPEN_TS);
    expect(getAmrWeatherReport('crypto_spot')!.classification).toBe('IDLE');
    miMock.current.set('crypto_spot', { ...LIVE_CALM }); // friction sentinel warmed
    runAmrWeatherCycle(OPEN_TS + 30_000);
    const r = getAmrWeatherReport('crypto_spot')!;
    expect(r.classification).toBe('CALM');
    expect(r.resolvedMode).not.toBe('AGGRESSIVE'); // post-IDLE min(firstRead, NORMAL)
  });
  it('gates: enforce + null mode -> fail-closed no_posture (the ungated ACTIVE-restart window is CLOSED)', () => {
    seedAll({ crypto: 'active' }); // flag active, NO weather cycle run -> mode null
    const res = evaluateAmrGates({ assetClass: 'crypto_spot', site: 'sqe_admission' });
    expect(res.allowed).toBe(false);
    expect(res.executed).toBe('enforce');
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0].gate).toBe('no_posture');
    seedAll(); // restore shadow flags for subsequent tests
  });
  it('gates: dry_run (shadow) + null mode -> skipped/allowed (shadow behavior unchanged)', () => {
    const res = evaluateAmrGates({ assetClass: 'crypto_spot', site: 'sqe_admission' });
    expect(res.allowed).toBe(true);
    expect(res.executed).toBe('skipped');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('B-5.1 (#223) — cost-cache crossed-quote spread guard (pre-audit Note-2 matrix)', () => {
  it('(a) negative spread on EXISTING entry: prior good spread retained, siblings update', () => {
    setCostMetrics('B51TEST/USD', { spread: 0.002 });
    const out = setCostMetrics('B51TEST/USD', { spread: -0.001, slippage: 0.0009 });
    expect(out?.spread).toBe(0.002);
    expect(out?.slippage).toBe(0.0009);
  });
  it('(b) first-write negative: write REJECTED, no entry fabricated', () => {
    const out = setCostMetrics('B51FRESH/USD', { spread: -0.0011 });
    expect(out).toBeNull();
    expect(getCostMetrics('B51FRESH/USD')).toBeNull();
  });
  it('(c) zero spread (locked book) accepted', () => {
    expect(setCostMetrics('B51ZERO/USD', { spread: 0 })?.spread).toBe(0);
  });
  it('(d) positive path unchanged (upper clamp applies)', () => {
    const out = setCostMetrics('B51POS/USD', { spread: 0.5 });
    expect(out).not.toBeNull();
    expect(out!.spread).toBeLessThanOrEqual(0.02);
  });
});
