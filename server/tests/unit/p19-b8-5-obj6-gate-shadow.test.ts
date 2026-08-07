// P19-B8.5 OBJ-6 — originally: HF8 confidence floor + HF9 governance gate retired to
// SHADOW on the ACTIVE path (Langston-approved design), pinning the contract that with
// gateShadowMode=true the gates still EVALUATE but never push a failure, and without it
// they block as before.
//
// ★ AMENDED by B-SIZING-DEC-RESTORE obj-10 (2026-08-07): THE CLASS-LESS CONFIDENCE FLOOR
// IS DELETED, so "without the flag it blocks" no longer has a subject. Applying Langston's
// subject-vs-probe rule test by test:
//   • the LIVE-gates test was a pure SUBJECT of the deleted floor → REMOVED with it;
//   • the shadow-mode and honest-NetEV tests PROBE surviving invariants → KEPT untouched;
//   • the exploration-lane test is RE-POINTED, not deleted — see its own comment. Its
//     invariant did not die, it got STRONGER, and asserting the old form would have
//     asserted the absence of a gate rather than the presence of the behaviour.
// Diagnosed by CC-B as #669 (the branch-wide red); the fallout is mine and so is the fix.
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
  // REMOVED by obj-10: this asserted that a sub-floor confidence PRODUCES a Confidence
  // failure on the live path. The class-less floor that produced it is deleted, so the
  // test's subject no longer exists. Keeping it as an inverted "no Confidence failure
  // ever" assertion was rejected deliberately — that would pin the ABSENCE of a gate,
  // which the deletion fence already does directly and better.

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

  it('exploration-lane qualification: a sub-floor signal whose only real problem is NetEV is NetEV-ONLY on BOTH paths', async () => {
    // RE-POINTED by obj-10 — and the invariant got STRONGER, which is why the old form
    // now fails honestly rather than revealing a defect.
    //
    // ORIGINALLY: a live Confidence failure made failures.length > 1 → isNetEvOnlyFailure
    // false → the exploration lane could never admit this signal. Shadow mode RESCUED it,
    // and the test proved the rescue by asserting live had MORE than one failure.
    //
    // NOW: the class-less floor is deleted, so the second failure never appears in the
    // first place. There is nothing left to rescue — the structural-zero is gone
    // UNCONDITIONALLY rather than only under a flag. Asserting `live.failures.length > 1`
    // would now be asserting that the deleted gate still fires.
    //
    // What is worth pinning is the BEHAVIOUR the exploration lane depends on: this signal
    // presents exactly one failure, NetEV, whether or not the shadow flag is set.
    const input = { ...killInput(), chosenNetEv: -0.001 };
    const live = await signalQualityEvaluator.evaluate(input);
    const shadow = await signalQualityEvaluator.evaluate(input, { gateShadowMode: true });
    for (const [label, r] of [['live', live], ['shadow', shadow]] as const) {
      expect(r.failures.length, `${label}: expected exactly one failure, got ${JSON.stringify(r.failures)}`).toBe(1);
      expect(r.failures[0].startsWith('NetEV '), `${label}: the single failure should be NetEV`).toBe(true);
    }
  });
});
