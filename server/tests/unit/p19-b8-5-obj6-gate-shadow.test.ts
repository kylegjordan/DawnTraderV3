// P19-B8.5 OBJ-6 — HF8 confidence floor + HF9 governance gate retired to SHADOW on the
// ACTIVE path (Langston-approved design). These pin the contract: with
// gateShadowMode=true the two gates still EVALUATE (shadow log) but never push a
// failure; without it (and without the VTS skip flags) they block exactly as before.
// The stability driving both gates is fabricated on the active path (cold-start
// defaults in signal-orchestrator) — see SQEOptions.gateShadowMode + RUNNING_ISSUES #514.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { signalQualityEvaluator, type SQEInput } from '../../core/filters/signal_quality_evaluator';
import { _seedModuleCacheForTests, invalidateModuleCache } from '../../services/module-constants-service';

beforeAll(() => {
  // 2026-07-18 fix (found when the suite went red on the first WEEKEND CI run):
  // the killInput is xstock_spot, and the SQE's B79 weekend-closure gate
  // EARLY-RETURNS a single 'xstock_weekend_closure' failure on Sat/Sun — the
  // Confidence/NetEV gates under test are never reached, so all three
  // composition assertions fail every weekend. Pin the clock to a known
  // WEEKDAY inside the xStock 24/5 window (Wed 2026-07-15 15:00Z) so the
  // contract under test is date-deterministic. setSystemTime mocks Date only
  // (real timers stay live — no async interference).
  vi.setSystemTime(new Date('2026-07-15T15:00:00Z'));
  // evaluate() sync-reads the strategy_gates module (per-class strategy gate) — warm it
  // with the same explicit-enabled posture the live seeds carry.
  _seedModuleCacheForTests('strategy_gates', [
    { moduleName: 'strategy_gates', constantName: 'enabled', value: true, exchange: '*', assetClass: 'xstock_spot', strategy: 'inside_bar_reversal', regime: '*' } as any,
  ]);
  // sqe_config is also sync-read and REQUIRES its rows (fail-hard reader) — seed the
  // two scoring floors permissively so neither is the failure under test.
  _seedModuleCacheForTests('sqe_config', [
    { moduleName: 'sqe_config', constantName: 'min_final_score', value: 0, exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any,
    { moduleName: 'sqe_config', constantName: 'min_regime_weight', value: 0, exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any,
  ]);
  // The confidence-floor overlay reads governance_modes (fail-hard) — seed the four
  // mode floors at their live values (DEFENSIVE 0.7 is the one under test).
  const gm = (name: string, v: number) => ({ moduleName: 'governance_modes', constantName: name, value: v, exchange: '*', assetClass: '*', strategy: '*', regime: '*' } as any);
  _seedModuleCacheForTests('governance_modes', [
    gm('normal_mode_confidence_floor', 0.5),
    gm('aggressive_mode_confidence_floor', 0.4),
    gm('defensive_mode_confidence_floor', 0.7),
    gm('survival_mode_confidence_floor', 0.8),
  ]);
});

afterAll(() => {
  // The seeds above never expire — drop them so same-worker test files that manage
  // their own module-cache state are not poisoned.
  for (const m of ['strategy_gates', 'sqe_config', 'governance_modes']) invalidateModuleCache(m);
  vi.useRealTimers();
});

// A DEFENSIVE-mode stability with a sub-floor confidence: fails BOTH gates when they
// are live (floor 0.7; defensive_hedge is regime-dependent → governance-blocked).
function killInput(): SQEInput {
  return {
    signalId: 'shadow-test-1',
    symbol: 'NVDA/USD',
    strategy: 'inside_bar_reversal',
    mode: 'paper',
    assetClass: 'xstock_spot',
    confidence: 0.3,
    finalScore: 0.9,
    regimeWeight: 0.9,
    trendStrength: 0.5,
    volatility: 0.3,
    regimeStability: 'unstable',
    chosenNetEv: 0.001, // positive — the honest netEV admission must NOT be the failure
  } as SQEInput;
}

describe('[P19-B8.5 OBJ-6] HF8/HF9 gate shadow mode', () => {
  it('LIVE gates (no flags): the sub-floor confidence produces a Confidence failure', async () => {
    const r = await signalQualityEvaluator.evaluate(killInput());
    expect(r.failures.some(f => f.startsWith('Confidence '))).toBe(true);
  });

  it('SHADOW mode: identical input produces NO Confidence and NO Governance failures', async () => {
    const r = await signalQualityEvaluator.evaluate(killInput(), { gateShadowMode: true });
    expect(r.failures.some(f => f.startsWith('Confidence '))).toBe(false);
    expect(r.failures.some(f => f.startsWith('Governance:'))).toBe(false);
  });

  it('SHADOW mode leaves the honest gates intact: a NEGATIVE chosenNetEv still rejects', async () => {
    const input = { ...killInput(), chosenNetEv: -0.001 };
    const r = await signalQualityEvaluator.evaluate(input, { gateShadowMode: true });
    expect(r.passed).toBe(false);
    expect(r.failures.some(f => f.startsWith('NetEV '))).toBe(true);
  });

  it('exploration-lane qualification is restored by shadow mode: with the gates shadowed, a NetEV-only failure is possible for a signal that ALSO fails confidence', async () => {
    // The structural-zero mechanism: a live Confidence failure makes failures.length > 1
    // → isNetEvOnlyFailure false → exploration can never admit. In shadow mode the same
    // signal's ONLY failure is NetEV — the exploration lane can now see it.
    const input = { ...killInput(), chosenNetEv: -0.001 };
    const live = await signalQualityEvaluator.evaluate(input);
    const shadow = await signalQualityEvaluator.evaluate(input, { gateShadowMode: true });
    expect(live.failures.length).toBeGreaterThan(1);
    const netEvOnly = shadow.failures.length === 1 && shadow.failures[0].startsWith('NetEV ');
    expect(netEvOnly).toBe(true);
  });
});
