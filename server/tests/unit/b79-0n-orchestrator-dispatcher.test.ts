/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.ORCHESTRATOR — Pattern-Pool Guardrails Dispatcher Tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   - `getPatternPoolGuardrailsForAssetClass('crypto_spot')` returns crypto's
 *     FINAL_SCORE_FLOOR (0.45); since B-SIZING-DEC-RESTORE 2e there is no MAX_POSITION_PCT
 *   - `getPatternPoolGuardrailsForAssetClass('xstock_spot')` returns xstock's
 *     DB-resolved FINAL_SCORE_FLOOR (0.45) through its own per-class getter chain
 *   - All 6 non-spot classes throw with `[CLASS_NOT_WIRED]` in error message
 *   - `_exhaustive: never` discipline catches new AssetClass enum members at
 *     compile time (TypeScript-level lock, not runtime — covered by the
 *     compile-driven probe section §1 below).
 *
 * Section §1 is a TypeScript-only compile-time assertion harness. It does NOT
 * run at test time (no expect()) — only proves the type-level exhaustiveness
 * lock holds. If a new AssetClass enum value is added without a case in the
 * dispatcher, this file fails to compile (caught by tsc + baseline-comparison
 * gate before merge).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

// DB mock: both `PATTERN_POOL_GUARDRAILS` and `XSTOCK_PATTERN_POOL_GUARDRAILS` use DB-resolved getters keyed by
// `_PATTERN_KEY.assetClass`. `pattern_max_position_pct` is deliberately NOT answered: the pattern-list size cap was
// removed in B-SIZING-DEC-RESTORE 2e, so a re-introduced read throws here.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, name: string, _key: { assetClass?: string }) => {
    if (module === 'pattern_pool_gates') {
      if (name === 'pattern_final_score_min') return 0.45; // same value both classes today
      if (name === 'pattern_rsi_min') return 15;
      if (name === 'pattern_rsi_max') return 85;
    }
    throw new Error(`[mock] unrecognized constant ${module}.${name}`);
  },
}));

import {
  getPatternPoolGuardrailsForAssetClass,
  type PatternPoolGuardrails,
} from '../../asset_classes/pattern-pool-dispatch.js';
import type { AssetClass } from '../../../shared/asset-classes.js';

describe('B79.0n.ORCHESTRATOR — pattern-pool-dispatch', () => {
  // §1. Active-class dispatch tests
  describe('active classes', () => {
    it('crypto_spot returns crypto PATTERN_POOL_GUARDRAILS (DB-resolved via _PATTERN_KEY.assetClass=crypto_spot)', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      expect(guardrails.FINAL_SCORE_FLOOR).toBe(0.45);
    });

    it('xstock_spot returns XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved via _PATTERN_KEY.assetClass=xstock_spot)', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('xstock_spot');
      expect(guardrails.FINAL_SCORE_FLOOR).toBe(0.45);
    });
    // (The per-class MAX_POSITION_PCT assertions that stood here had the removed pattern size cap as their SUBJECT and
    // went with it — B-SIZING-DEC-RESTORE 2e, Langston §20 r2 condition 1.)
  });

  // §2. Perp-class CLASS_NOT_WIRED throws
  describe('perp classes — CLASS_NOT_WIRED', () => {
    it('crypto_perp throws with [CLASS_NOT_WIRED] tag', () => {
      expect(() => getPatternPoolGuardrailsForAssetClass('crypto_perp')).toThrow(/CLASS_NOT_WIRED/);
    });

    it('xstock_perp throws with [CLASS_NOT_WIRED] tag', () => {
      expect(() => getPatternPoolGuardrailsForAssetClass('xstock_perp')).toThrow(/CLASS_NOT_WIRED/);
    });

    it('error message includes activation breadcrumbs (ASSET_CLASS_ONBOARDING_WORKFLOW §4.22 reference)', () => {
      try {
        getPatternPoolGuardrailsForAssetClass('crypto_perp');
        // Should not reach
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const msg = (err as Error).message;
        expect(msg).toMatch(/B79\.0n\.ORCHESTRATOR/);
        expect(msg).toMatch(/CLASS_NOT_WIRED/);
        expect(msg).toMatch(/ASSET_CLASS_ONBOARDING_WORKFLOW/);
      }
    });
  });

  // §3. Reserved-future class CLASS_NOT_WIRED throws (exhaustiveness coverage)
  describe('reserved-future classes — CLASS_NOT_WIRED', () => {
    it.each(['equity_spot', 'equity_futures', 'commodity_futures', 'fx_spot'] as const)(
      '%s throws with [CLASS_NOT_WIRED] tag',
      (cls) => {
        expect(() => getPatternPoolGuardrailsForAssetClass(cls as AssetClass)).toThrow(/CLASS_NOT_WIRED/);
      },
    );
  });

  // §4. Return-type shape contract
  describe('PatternPoolGuardrails type-lock', () => {
    // Re-pointed in 2e (condition 1): MAX_POSITION_PCT was a PROBE of the per-class contract here; its subject,
    // FINAL_SCORE_FLOOR, survives. The removed key must be ABSENT (MUTATION: put the getter back and this fails).
    it('returned object has the FINAL_SCORE_FLOOR key and no MAX_POSITION_PCT', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      const keys = Object.keys(guardrails);
      expect(keys).toContain('FINAL_SCORE_FLOOR');
      expect(keys).not.toContain('MAX_POSITION_PCT');
    });

    it('FINAL_SCORE_FLOOR is a number', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      expect(typeof guardrails.FINAL_SCORE_FLOOR).toBe('number');
    });

    it('the xStock guardrails carry the same contract (FINAL_SCORE_FLOOR only)', () => {
      const keys = Object.keys(getPatternPoolGuardrailsForAssetClass('xstock_spot'));
      expect(keys).toContain('FINAL_SCORE_FLOOR');
      expect(keys).not.toContain('MAX_POSITION_PCT');
    });
  });
});

// §5. Compile-time exhaustiveness lock (no runtime behavior — only proves
// that adding a new AssetClass enum value without a switch case fails tsc).
// This is verified by the baseline-comparison gate: if the union grows and
// the dispatcher isn't updated, the `_exhaustive: never` line in the default
// branch errors at compile time.
//
// `PatternPoolGuardrails` interface must be exported from the dispatcher
// module — proved by the import at the top of this file.
const _typeCheck: PatternPoolGuardrails = { FINAL_SCORE_FLOOR: 0 };
void _typeCheck;
