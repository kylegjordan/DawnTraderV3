/**
 * P19-B8.5e — the earn-your-own-σ rule (`#548`).
 *
 * WHAT THIS PROTECTS. A young/thin/volatile symbol has little history and therefore
 * reads ARTIFICIALLY CALM — a low σ yields a WIDE staleness ceiling, i.e. we would be
 * blind for longest on exactly the names where a stale mark costs most. The rule is
 * that self-σ must be EARNED: below the observation threshold a symbol inherits a
 * conservative class-wide σ instead. These tests pin that rule and the fail-closed
 * behaviour, without a database.
 */
import { describe, it, expect } from 'vitest';
import { resolveSigmaRate, type SigmaRateStats } from '../../asset_classes/xstock_spot/sigma-rate.js';

const stats = (observations: number, sigmaRatePerSec: number | null): SigmaRateStats => ({
  observations,
  sigmaRatePerSec,
});

describe('P19-B8.5e — resolveSigmaRate: self-σ is EARNED, not assumed', () => {
  it('uses the symbol OWN σ once it has enough observations', () => {
    const r = resolveSigmaRate(stats(250, 0.0004), 0.0009, 200);
    expect(r).not.toBeNull();
    expect(r!.source).toBe('self');
    expect(r!.sigmaRatePerSec).toBe(0.0004);
  });

  it('★ THE CORE RULE: a thin symbol reading ARTIFICIALLY CALM inherits the conservative class-wide σ', () => {
    // 12 observations, and its own σ looks 3× calmer than the class. Trusting it would
    // produce the WIDEST ceiling on the least-known name — the exact failure mode.
    const r = resolveSigmaRate(stats(12, 0.0003), 0.0009, 200);
    expect(r).not.toBeNull();
    expect(r!.source).toBe('classwide');
    expect(r!.sigmaRatePerSec).toBe(0.0009);
    // and the inherited σ is HIGHER ⇒ a TIGHTER ceiling ⇒ the safe direction
    expect(r!.sigmaRatePerSec).toBeGreaterThan(0.0003);
  });

  it('treats the threshold as inclusive (exactly minObservations earns self-σ)', () => {
    expect(resolveSigmaRate(stats(200, 0.0005), 0.0009, 200)!.source).toBe('self');
    expect(resolveSigmaRate(stats(199, 0.0005), 0.0009, 200)!.source).toBe('classwide');
  });

  it('falls back to class-wide when the symbol has observations but NO usable rate (flat window)', () => {
    // Enough ticks, but zero variance ⇒ null rate. Must not be treated as "σ = 0",
    // which would divide into an infinite ceiling.
    const r = resolveSigmaRate(stats(500, null), 0.0009, 200);
    expect(r!.source).toBe('classwide');
  });

  it('rejects a non-positive own σ rather than dividing by it', () => {
    expect(resolveSigmaRate(stats(500, 0), 0.0009, 200)!.source).toBe('classwide');
  });

  it('★ FAIL-CLOSED: returns null when NEITHER source is available — caller must use its tightest ceiling', () => {
    expect(resolveSigmaRate(stats(5, null), null, 200)).toBeNull();
    expect(resolveSigmaRate(stats(5, 0.0003), null, 200)).toBeNull();
  });

  it('rejects a non-positive class-wide σ (never widens on a degenerate class read)', () => {
    expect(resolveSigmaRate(stats(5, null), 0, 200)).toBeNull();
  });

  it('carries the observation count through so the caller can log WHY a σ was inherited', () => {
    const r = resolveSigmaRate(stats(37, 0.0003), 0.0009, 200);
    expect(r!.observations).toBe(37);
  });
});
