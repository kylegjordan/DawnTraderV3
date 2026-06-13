/**
 * P19-B3a (#139) — classifier widen + centralized alarm + SSOT regex sharing.
 *
 * Verifies the root-cause fix for the symbol-classification gap Kyle flagged:
 *  - the base-length cap is a single SSOT constant; the canonical regex is built
 *    from it and SHARED with symbol-normalize.ts (no two-literal drift);
 *  - widening from 10→15 means an 11–15-char base now CLASSIFIES instead of
 *    throwing, while 16+ still trips (finite tripwire — Langston C1);
 *  - safeResolveAssetClass is the centralized, LOUD alarm: it counts fall-throughs
 *    and fires an optional escalation hook (never a silent skip — Kyle directive).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAssetClass,
  safeResolveAssetClass,
  CRYPTO_SPOT_BASE_MAX_LEN,
  CRYPTO_SPOT_CANONICAL,
  getClassifyFallthroughCount,
  setClassifyFallthroughHook,
} from '../../../shared/asset-classes.js';
import { normalize } from '../../utils/symbol-normalize.js';
import { ASSET_CLASSES } from '../../../shared/asset-classes.js';

describe('P19-B3a #139 — SSOT base-length cap + widen', () => {
  it('exposes a single finite base-length constant (Langston C1)', () => {
    expect(CRYPTO_SPOT_BASE_MAX_LEN).toBe(15);
  });

  it('classifies an 11-char base as crypto_spot (the gap that previously THREW at base>10)', () => {
    expect(resolveAssetClass('LONGTOKEN11/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
  });

  it('classifies a base exactly at the cap (15 chars)', () => {
    expect(resolveAssetClass('FIFTEENCHARBASE/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
  });

  it('still THROWS on a base over the cap (16 chars) — finite tripwire, not unbounded', () => {
    expect(() => resolveAssetClass('SIXTEENCHARBASES/USD', 'kraken')).toThrow();
  });

  it('the canonical regex is built FROM the constant (cap respected)', () => {
    expect(CRYPTO_SPOT_CANONICAL.test('A'.repeat(CRYPTO_SPOT_BASE_MAX_LEN) + '/USD')).toBe(true);
    expect(CRYPTO_SPOT_CANONICAL.test('A'.repeat(CRYPTO_SPOT_BASE_MAX_LEN + 1) + '/USD')).toBe(false);
  });

  it('symbol-normalize imports + uses the shared CRYPTO_SPOT_CANONICAL at runtime (an 11-char canonical pair is recognized)', () => {
    // Runtime wiring smoke for the SSOT import (compile-time guaranteed by tsc; this
    // confirms the shared regex resolves + matches at runtime). normalizeCryptoSpot tests
    // the raw symbol against the uppercase-only regex, so pass an uppercase pair.
    expect(normalize('LONGTOKEN11/USD', ASSET_CLASSES.CRYPTO_SPOT)).toBe('LONGTOKEN11/USD');
  });
});

describe('P19-B3a #139 — centralized alarm in safeResolveAssetClass', () => {
  beforeEach(() => setClassifyFallthroughHook(null));

  it('returns null + bumps the central counter on an unclassifiable pair (never silent)', () => {
    const before = getClassifyFallthroughCount();
    expect(safeResolveAssetClass('SIXTEENCHARBASES/USD', 'kraken')).toBeNull();
    expect(getClassifyFallthroughCount()).toBe(before + 1);
  });

  it('fires the optional escalation hook with the symbol + exchange', () => {
    const seen: Array<{ s: string; e: string }> = [];
    setClassifyFallthroughHook((s, e) => seen.push({ s, e }));
    safeResolveAssetClass('SIXTEENCHARBASES/USD', 'kraken');
    expect(seen).toEqual([{ s: 'SIXTEENCHARBASES/USD', e: 'kraken' }]);
  });

  it('a throwing hook never breaks the resolver (still returns null)', () => {
    setClassifyFallthroughHook(() => { throw new Error('hook boom'); });
    expect(safeResolveAssetClass('SIXTEENCHARBASES/USD', 'kraken')).toBeNull();
  });

  it('does NOT count/alarm on a valid pair', () => {
    const before = getClassifyFallthroughCount();
    expect(safeResolveAssetClass('BTC/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
    expect(getClassifyFallthroughCount()).toBe(before);
  });
});
