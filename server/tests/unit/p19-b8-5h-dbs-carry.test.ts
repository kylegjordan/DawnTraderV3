/**
 * P19-B8.5h (#560 ≡ #377) — the xStock DBS at-queue carry.
 *
 * The CI/regression guard the defect lacked: xStock's real DBS must reach the at-queue
 * carry (it was 0/28 — the FX5 pool the carry read is crypto-only), while the crypto path
 * stays provably byte-invariant. `resolveDbsScoreAtQueue` is the pure class-aware selector
 * feeding BOTH the maker/taker decision and the persisted `dbs_score_at_queue` (F2
 * single-basis). The xStock source is a THUNK so crypto never invokes getCachedContext.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveDbsScoreAtQueue } from '../../services/signal-orchestrator.js';

describe('P19-B8.5h — resolveDbsScoreAtQueue (class-aware DBS at-queue source)', () => {
  it('crypto_spot: returns the FX5 DBS and NEVER invokes the xStock thunk (crypto provably invariant)', () => {
    const xstockThunk = vi.fn(() => 0.99);
    expect(resolveDbsScoreAtQueue('crypto_spot', 0.42, xstockThunk)).toBe(0.42);
    expect(xstockThunk).not.toHaveBeenCalled(); // crypto path does zero extra work
  });

  it('crypto_spot with a null FX5 DBS: returns null, thunk still not called', () => {
    const xstockThunk = vi.fn(() => 0.99);
    expect(resolveDbsScoreAtQueue('crypto_spot', null, xstockThunk)).toBeNull();
    expect(xstockThunk).not.toHaveBeenCalled();
  });

  it('xstock_spot: returns the class-keyed MCE DBS (the fix — was unreachable via the crypto pool)', () => {
    // fx5 value is null for an xStock symbol; the real DBS comes from the thunk (MCE ctx).
    expect(resolveDbsScoreAtQueue('xstock_spot', null, () => 0.65)).toBe(0.65);
    expect(resolveDbsScoreAtQueue('xstock_spot', null, () => -0.30)).toBe(-0.30);
  });

  it('xstock_spot miss (TTL-cold ctx or thin-pair): returns undefined → each site falls to its kernel default', () => {
    expect(resolveDbsScoreAtQueue('xstock_spot', null, () => undefined)).toBeUndefined();
  });

  it('preserves EACH call site null sentinel (must-not #1): ?? undefined for maker/taker, ?? null for the carry', () => {
    // real xStock value survives both coalesces
    const real = resolveDbsScoreAtQueue('xstock_spot', null, () => 0.5);
    expect(real ?? undefined).toBe(0.5); // maker/taker input
    expect(real ?? null).toBe(0.5); // persisted dbs_score_at_queue
    // a miss yields the correct per-site sentinel
    const miss = resolveDbsScoreAtQueue('xstock_spot', null, () => undefined);
    expect(miss ?? undefined).toBeUndefined(); // maker/taker → undefined (today's shape)
    expect(miss ?? null).toBeNull(); // carry → null (today's shape)
    // crypto miss: identical to the pre-fix `fx5Data?.dbsScore ?? null` / `?? undefined`
    const cryptoMiss = resolveDbsScoreAtQueue('crypto_spot', undefined, () => 0.9);
    expect(cryptoMiss ?? undefined).toBeUndefined();
    expect(cryptoMiss ?? null).toBeNull();
  });

  it('a future non-crypto class routes to the MCE source too (synthesized-neutral 0 is in-range)', () => {
    expect(resolveDbsScoreAtQueue('crypto_perp', null, () => 0)).toBe(0);
  });
});
