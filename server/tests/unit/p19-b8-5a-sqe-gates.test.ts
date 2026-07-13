// P19-B8.5a — SQE gate-restructure tests (OBJ-3 net-EV admission + OBJ-5 finalScore retire).
// Uses the sync variant (pure, no DB) — semantic parity with the async path is by construction
// (same failure pushes, same skip conditions; see signal_quality_evaluator.ts).
import { describe, it, expect } from 'vitest';
import { evaluateSignalQualitySync } from '../../core/filters/signal_quality_evaluator';

const base = {
  signalId: 'test-b85a',
  symbol: 'BTC/USD',
  strategy: 'TREND',
  mode: 'paper' as const,
  assetClass: 'crypto_spot' as const,
  regimeWeight: 0.6,
};

describe('[P19-B8.5a] SQE gate restructure', () => {
  it('OBJ-3: non-positive chosenNetEv is REJECTED at admission', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.9, chosenNetEv: -0.002, chosenEntryMode: 'taker' } as any);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.startsWith('NetEV'))).toBe(true);
  });

  it('OBJ-3: exactly-zero chosenNetEv is REJECTED (strict > 0)', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.9, chosenNetEv: 0 } as any);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.startsWith('NetEV'))).toBe(true);
  });

  it('OBJ-3: ABSENT chosenNetEv SKIPS the net-EV check (fail-open, Langston-ratified — the [11.8B] taker-leg fallback nets legacy rows)', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.9 } as any);
    expect(r.passed).toBe(true);
  });

  it('OBJ-5 + OBJ-3 interplay: below-floor finalScore with POSITIVE netEV now ADMITS (the finalScore gate is retired; the number we rank on is the number that admits)', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.10, chosenNetEv: 0.004, chosenEntryMode: 'maker' } as any);
    expect(r.passed).toBe(true);
  });

  it('OBJ-5: below-floor finalScore alone no longer rejects (shadow-log only)', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.10 } as any);
    expect(r.passed).toBe(true);
    expect(r.failures.some((f) => f.startsWith('FinalScore'))).toBe(false);
  });

  it('surviving floor: regimeWeight below floor STILL rejects (structural floors unchanged)', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.9, regimeWeight: 0.05, chosenNetEv: 0.004 } as any);
    expect(r.passed).toBe(false);
    expect(r.failures.some((f) => f.startsWith('RegimeWeight'))).toBe(true);
  });

  it('combined: positive netEV + healthy regimeWeight passes clean', () => {
    const r = evaluateSignalQualitySync({ ...base, finalScore: 0.5, chosenNetEv: 0.0031, chosenEntryMode: 'taker' } as any);
    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });
});
