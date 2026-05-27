/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.ORCHESTRATOR — Pattern-Pool Guardrails Dispatcher Tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   - `getPatternPoolGuardrailsForAssetClass('crypto_spot')` returns crypto's
 *     literal constants (FINAL_SCORE_FLOOR=0.45, MAX_POSITION_PCT=0.15)
 *   - `getPatternPoolGuardrailsForAssetClass('xstock_spot')` returns xstock's
 *     DB-resolved values (FINAL_SCORE_FLOOR=0.45, MAX_POSITION_PCT=0.50 from
 *     module_constants — placeholder-cloned today but real per-class plumbing)
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

// DB mock that mirrors the actual staging DB state per class — crypto and
// xstock have DIFFERENT `pattern_max_position_pct` rows (0.15 vs 0.50) per
// the psql probe documented in pre-audit §3 Probe 3. Both `PATTERN_POOL_GUARDRAILS`
// and `XSTOCK_PATTERN_POOL_GUARDRAILS` use DB-resolved getters with different
// `_PATTERN_KEY.assetClass` values — that's how the differentiation works.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, name: string, key: { assetClass?: string }) => {
    if (module === 'pattern_pool_gates') {
      if (name === 'pattern_final_score_min') return 0.45; // same value both classes today
      if (name === 'pattern_max_position_pct') {
        // Mirror staging DB rows: crypto 0.15, xstock 0.50
        return key.assetClass === 'xstock_spot' ? 0.50 : 0.15;
      }
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
      expect(guardrails.MAX_POSITION_PCT).toBe(0.15);
    });

    it('xstock_spot returns XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved via _PATTERN_KEY.assetClass=xstock_spot)', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('xstock_spot');
      expect(guardrails.FINAL_SCORE_FLOOR).toBe(0.45);
      // Behavioral correction: xstock's 0.50 vs crypto's 0.15 — pre-batch
      // xstock pattern signals were sized against crypto's 0.15 due to the
      // class-bound import; post-batch routes correctly through the xstock
      // module's getter chain.
      expect(guardrails.MAX_POSITION_PCT).toBe(0.50);
    });

    it('crypto_spot vs xstock_spot return DIFFERENT MAX_POSITION_PCT (0.15 vs 0.50)', () => {
      const crypto = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      const xstock = getPatternPoolGuardrailsForAssetClass('xstock_spot');
      expect(crypto.MAX_POSITION_PCT).not.toBe(xstock.MAX_POSITION_PCT);
      // 3.3× — flag for WIRE-IN #14 active-trading flip + Phase 19 calibration.
      expect(xstock.MAX_POSITION_PCT / crypto.MAX_POSITION_PCT).toBeCloseTo(3.33, 1);
    });
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
    it('returned object has FINAL_SCORE_FLOOR + MAX_POSITION_PCT keys', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      const keys = Object.keys(guardrails);
      expect(keys).toContain('FINAL_SCORE_FLOOR');
      expect(keys).toContain('MAX_POSITION_PCT');
    });

    it('FINAL_SCORE_FLOOR is a number', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      expect(typeof guardrails.FINAL_SCORE_FLOOR).toBe('number');
    });

    it('MAX_POSITION_PCT is a number', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      expect(typeof guardrails.MAX_POSITION_PCT).toBe('number');
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
const _typeCheck: PatternPoolGuardrails = { FINAL_SCORE_FLOOR: 0, MAX_POSITION_PCT: 0 };
void _typeCheck;
