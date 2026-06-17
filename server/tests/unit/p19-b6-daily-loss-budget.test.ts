/**
 * P19-B6 unit tests — daily loss-budget kill switch pure core.
 * Covers the loss-% math (incl. the <=0-portfolio breach guard) + the tier classification
 * (incl. highest-band-wins + nonPositiveValue→kill). The evaluator's latch/hysteresis/ratchet
 * + the trip/flatten path are proven by the staging force-trip exercise (gate 7).
 */
import { describe, it, expect } from 'vitest';
import {
  computeLossPercent,
  classifyTier,
  resetDailyLossBudgetState,
  peekDailyLossBudgetState,
} from '../../services/daily-loss-budget';
import { guardrailPolicy } from '../../services/guardrail-policy';

describe('P19-B6 computeLossPercent', () => {
  it('returns 0 loss on a profit', () => {
    expect(computeLossPercent(500, 10000)).toEqual({ lossPercent: 0, nonPositiveValue: false });
  });

  it('returns 0 loss on a flat P&L', () => {
    expect(computeLossPercent(0, 10000)).toEqual({ lossPercent: 0, nonPositiveValue: false });
  });

  it('computes the loss magnitude as a % of portfolio', () => {
    const r = computeLossPercent(-1500, 10000); // 15% loss
    expect(r.nonPositiveValue).toBe(false);
    expect(r.lossPercent).toBeCloseTo(15, 6);
  });

  it('treats a non-positive portfolio value as a BREACH, never a NaN/ratio', () => {
    expect(computeLossPercent(-100, 0)).toEqual({ lossPercent: 0, nonPositiveValue: true });
    expect(computeLossPercent(-100, -50)).toEqual({ lossPercent: 0, nonPositiveValue: true });
  });

  it('guards non-finite inputs (no NaN escape)', () => {
    expect(computeLossPercent(NaN, 10000)).toEqual({ lossPercent: 0, nonPositiveValue: false });
    expect(computeLossPercent(-100, NaN)).toEqual({ lossPercent: 0, nonPositiveValue: true });
  });
});

describe('P19-B6 classifyTier (kill=15, warn1=50% → 7.5, warn2=75% → 11.25)', () => {
  const KILL = 15, W1 = 50, W2 = 75;
  const tier = (loss: number, npv = false) => classifyTier(loss, KILL, W1, W2, npv).tier;

  it('derives the absolute warn loss thresholds from % of the kill threshold', () => {
    const r = classifyTier(0, KILL, W1, W2, false);
    expect(r.warn1Loss).toBeCloseTo(7.5, 6);
    expect(r.warn2Loss).toBeCloseTo(11.25, 6);
  });

  it('none below warn1', () => {
    expect(tier(0)).toBe('none');
    expect(tier(7.49)).toBe('none');
  });

  it('warn1 in [7.5, 11.25)', () => {
    expect(tier(7.5)).toBe('warn1');
    expect(tier(11.24)).toBe('warn1');
  });

  it('warn2 in [11.25, 15)', () => {
    expect(tier(11.25)).toBe('warn2');
    expect(tier(14.99)).toBe('warn2');
  });

  it('kill at/above the kill threshold', () => {
    expect(tier(15)).toBe('kill');
    expect(tier(20)).toBe('kill');
  });

  it('highest band wins (a single jump past both warns classifies as warn2, not warn1)', () => {
    expect(tier(13)).toBe('warn2');
  });

  it('a non-positive portfolio value forces kill regardless of the (zeroed) loss%', () => {
    expect(tier(0, true)).toBe('kill');
  });
});

describe('P19-B6 in-memory state reset (invariant 1b)', () => {
  it('resetDailyLossBudgetState clears the kill latch + re-arms both warning tiers', () => {
    resetDailyLossBudgetState('paper');
    const s = peekDailyLossBudgetState('paper');
    expect(s).toBeDefined();
    expect(s!.killInProgress).toBe(false);
    expect(s!.warn1Armed).toBe(true);
    expect(s!.warn2Armed).toBe(true);
    expect(s!.sessionEpoch).toBeNull();
  });
});

describe('P19-B6 RULE_011 warning-tier ordering in validate() (Langston Blocker-1: string-coercion)', () => {
  // decimal(5,2) columns arrive off Drizzle as STRINGS; the pre-fix `warn1 < warn2` was a
  // lexicographic compare. These cases pass the warns AS STRINGS (the real row shape) to prove
  // the parseFloat fix: "9.00" < "80.00" is lexicographically FALSE but numerically TRUE.
  const base = { mode: 'paper' as const, dailyLossKillSwitchPct: 15 };
  const hasR11 = (g: any) => guardrailPolicy.validate(g).failures.some((f) => f.ruleId === 'RULE_011');

  it('PASSES a legal config that does NOT sort lexicographically (warn1=9, warn2=80)', () => {
    expect(hasR11({ ...base, dailyLossWarning1Pct: '9.00', dailyLossWarning2Pct: '80.00' })).toBe(false);
  });

  it('FAILS an inverted config that DOES sort lexicographically "valid" (warn1=80, warn2=9)', () => {
    expect(hasR11({ ...base, dailyLossWarning1Pct: '80.00', dailyLossWarning2Pct: '9.00' })).toBe(true);
  });

  it('PASSES the seeded defaults (50/75)', () => {
    expect(hasR11({ ...base, dailyLossWarning1Pct: 50, dailyLossWarning2Pct: 75 })).toBe(false);
  });

  it('FAILS equal tiers (warn1 == warn2) and warn2 == 100', () => {
    expect(hasR11({ ...base, dailyLossWarning1Pct: 50, dailyLossWarning2Pct: 50 })).toBe(true);
    expect(hasR11({ ...base, dailyLossWarning1Pct: 50, dailyLossWarning2Pct: 100 })).toBe(true);
  });

  it('FAILS a present-but-non-finite value (Langston note-1: NaN must FAIL, not silently skip)', () => {
    expect(hasR11({ ...base, dailyLossWarning1Pct: 'abc', dailyLossWarning2Pct: '75' })).toBe(true);
  });
});
