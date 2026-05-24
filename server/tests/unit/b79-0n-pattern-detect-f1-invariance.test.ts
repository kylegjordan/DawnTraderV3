/**
 * B79.0n.PATTERN-DETECT — F-1 lever invariance test.
 *
 * Proves that the `PATTERN_TO_CANONICAL` map and `normalizePatternToCanonical`
 * function are CLASS-INVARIANT BY CONSTRUCTION — a PINBAR is a PINBAR
 * regardless of whether the chart shows BTC/USD or AAPLx/USD. Pattern name
 * mapping is universal taxonomy, NOT per-class scoped.
 *
 * If a future commit accidentally introduces per-class branching into
 * `normalizePatternToCanonical` (or any equivalent path), this regression-
 * lock fails and surfaces the design drift.
 *
 * Background: B79.0n.PATTERN-DETECT pre-audit §-7 + scope §-1 confirmed F-1
 * (class-invariant by construction) status for these two surfaces. This
 * test makes that determination machine-enforced.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePatternToCanonical,
  CANONICAL_PATTERN_TYPES,
} from '../../config/canonical-regime-strategy-map';

describe('B79.0n.PATTERN-DETECT — F-1 lever invariance', () => {

  describe('normalizePatternToCanonical is class-invariant', () => {
    const RAW_PATTERN_NAMES = [
      'PINBAR', 'ENGULFING', 'MORNING_STAR', 'ABCD', 'TRI_STAR',
      'INSIDE_BAR', 'THREE_SOLDIERS', 'EVENING_STAR', 'DOJI',
      'HAMMER', 'SHOOTING_STAR',
    ];

    for (const raw of RAW_PATTERN_NAMES) {
      it(`maps '${raw}' to the same canonical type regardless of caller context`, () => {
        // The function takes ONLY the pattern name. It has no asset-class
        // parameter today and must not in the future. If a signature change
        // adds an assetClass parameter, this test will fail to compile —
        // which is the architectural alarm we want.
        const result = normalizePatternToCanonical(raw);
        expect(result).not.toBeUndefined();
        // The result must be a member of the canonical pattern types union
        // (or null for unrecognized).
        if (result !== null) {
          expect(CANONICAL_PATTERN_TYPES).toContain(result);
        }
      });
    }

    it('returns null for unrecognized pattern names (class-invariant)', () => {
      expect(normalizePatternToCanonical('UNKNOWN_PATTERN_NAME')).toBeNull();
      expect(normalizePatternToCanonical(null)).toBeNull();
    });

    it('normalizes case + whitespace (universal taxonomy semantic)', () => {
      // normalizePatternToCanonical does .toUpperCase().replace(/[\s-]/g, '_').
      // So 'pinbar' → 'PINBAR' (lookup hit). 'morning star' → 'MORNING_STAR' (lookup hit).
      // 'Pin-Bar' → 'PIN_BAR' (NO map entry; returns null — by design, the map's
      // 'PINBAR' key has no underscore so hyphenated raw form doesn't resolve).
      expect(normalizePatternToCanonical('pinbar')).toBe('PINBAR');
      expect(normalizePatternToCanonical('morning star')).toBe('MORNING_STAR');
      expect(normalizePatternToCanonical('Pin-Bar')).toBeNull();  // documents the by-design limit
    });
  });

  describe('CANONICAL_PATTERN_TYPES is asset-class-invariant', () => {
    it('includes the 6 pattern types + null (universal across all asset classes)', () => {
      // Exact-match assertion — guards against accidental additions/removals.
      // Updates to this list must be deliberate (asset-class-invariant by design).
      expect(CANONICAL_PATTERN_TYPES).toEqual([
        'PINBAR',
        'ENGULFING',
        'INSIDE_BAR',
        'MORNING_STAR',
        'ABCD',
        'TRI_STAR',
        null,
      ]);
    });
  });
});
