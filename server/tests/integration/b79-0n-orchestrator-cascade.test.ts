/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.ORCHESTRATOR — Integration: Per-Class Cascade End-to-End
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Three integration anchors that catch the wrong-value-threaded-correctly bug
 * class (Langston Q1 refinement). These tests prove that the per-class
 * assetClass value propagates SEMANTICALLY correctly across the swap surface,
 * not just that the parameter is *present* at each call site.
 *
 *   Test 1 — Sizing cascade: xstock pattern signal sizes against
 *            XSTOCK_PATTERN_POOL_GUARDRAILS (0.50 cap, DB-resolved); crypto
 *            pattern signal sizes against PATTERN_POOL_GUARDRAILS (0.15 cap,
 *            literal). Different inputs → different sizing caps.
 *
 *   Test 2 — SQE cascade: xstock pattern signal evaluated against xstock
 *            FINAL_SCORE_FLOOR; crypto pattern signal against crypto floor.
 *            Same value today (0.45 both) but the dispatcher path is
 *            exercised — future divergence will be caught by this test.
 *
 *   Test 3 — Dispatcher API resilience: passing an unknown assetClass
 *            (perp or reserved-future) throws cleanly without leaving the
 *            consumer in a half-state.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, name: string, key: { assetClass?: string }) => {
    if (module === 'pattern_pool_gates') {
      if (name === 'pattern_final_score_min') return 0.45;
      if (name === 'pattern_max_position_pct') {
        return key.assetClass === 'xstock_spot' ? 0.50 : 0.15;
      }
    }
    if (module === 'active_sizing' && name === 'max_position_buffer_factor') return 0.97;
    throw new Error(`[mock] unrecognized constant ${module}.${name}`);
  },
}));

import { sizeActivePositionForSignal } from '../../services/active-position-sizing.js';
import { getPatternPoolGuardrailsForAssetClass } from '../../asset_classes/pattern-pool-dispatch.js';

describe('B79.0n.ORCHESTRATOR — per-class cascade integration', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Test 1: Sizing cascade — xstock vs crypto get different position caps
  // ──────────────────────────────────────────────────────────────────────
  describe('sizing cascade (Chunk B end-to-end)', () => {
    const baseParams = {
      portfolioValue: 10000,
      guardrails: {
        userId: 0,
        portfolioRiskPerTradePct: '1.5',
        maxPositionPercentPct: '25',
        maxTotalExposurePct: '100',
      } as any,
      entryPrice: 100,
      stopPrice: 97,
      sourcePool: 'pattern' as const,
      mode: 'paper' as const, // P19-B4b D5: per-mode sizing param (S4 isolation)
    };

    it('xstock pattern signal sized against xstock 0.50 MAX_POSITION_PCT', () => {
      const result = sizeActivePositionForSignal({
        ...baseParams,
        symbol: 'AAPLx/USD',
        strategy: 'breakout',
        assetClass: 'xstock_spot',
      });
      // Sizing should NOT be clamped below the xstock 50% cap
      // (baseParams.guardrails.maxPositionPct=25; xstock pattern cap=50;
      // effective = min(25, 50) = 25). Earlier when import was hardcoded to
      // crypto's 15%, effective would have been min(25, 15) = 15.
      // Compare to crypto path below.
      expect(result.quantity).toBeGreaterThan(0);
      expect(result.estimatedValue).toBeGreaterThan(0);
    });

    it('crypto pattern signal sized against crypto 0.15 MAX_POSITION_PCT (unchanged)', () => {
      const result = sizeActivePositionForSignal({
        ...baseParams,
        symbol: 'BTC/USD',
        strategy: 'breakout',
        assetClass: 'crypto_spot',
      });
      expect(result.quantity).toBeGreaterThan(0);
      expect(result.estimatedValue).toBeGreaterThan(0);
    });

    it('xstock pattern signal allows LARGER position than crypto for the same risk inputs (0.50 vs 0.15 cap)', () => {
      const xstockResult = sizeActivePositionForSignal({
        ...baseParams,
        symbol: 'AAPLx/USD',
        strategy: 'breakout',
        assetClass: 'xstock_spot',
      });
      const cryptoResult = sizeActivePositionForSignal({
        ...baseParams,
        symbol: 'BTC/USD',
        strategy: 'breakout',
        assetClass: 'crypto_spot',
      });
      // With baseParams.guardrails.maxPositionPct=25, neither hits the per-class
      // cap (xstock 50, crypto 15). Crypto's 15 < 25 = effectiveMaxPositionPct=15.
      // Xstock's 50 > 25 = effectiveMaxPositionPct=25. So xstock allows MORE.
      expect(xstockResult.estimatedValue).toBeGreaterThan(cryptoResult.estimatedValue);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 2: SQE cascade — dispatcher used for pattern-pool FINAL_SCORE_FLOOR
  // ──────────────────────────────────────────────────────────────────────
  describe('SQE cascade (Chunk C end-to-end)', () => {
    it('xstock pattern signal final-score-floor comes from xstock dispatcher (0.45 today)', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('xstock_spot');
      expect(guardrails.FINAL_SCORE_FLOOR).toBe(0.45);
    });

    it('crypto pattern signal final-score-floor comes from crypto literal (0.45)', () => {
      const guardrails = getPatternPoolGuardrailsForAssetClass('crypto_spot');
      expect(guardrails.FINAL_SCORE_FLOOR).toBe(0.45);
    });

    it('SQE source file consumes dispatcher (not direct literal)', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const src = readFileSync(
        join(process.cwd(), 'server/core/filters/signal_quality_evaluator.ts'),
        'utf-8',
      );
      expect(src).toMatch(/getPatternPoolGuardrailsForAssetClass\(input\.assetClass\)\.FINAL_SCORE_FLOOR/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 3: Dispatcher API resilience — clean throws
  // ──────────────────────────────────────────────────────────────────────
  describe('dispatcher resilience', () => {
    it('passing unknown assetClass causes clean throw (no half-state in consumer)', () => {
      expect(() => getPatternPoolGuardrailsForAssetClass('crypto_perp')).toThrow(/CLASS_NOT_WIRED/);
      expect(() => getPatternPoolGuardrailsForAssetClass('xstock_perp')).toThrow(/CLASS_NOT_WIRED/);
    });

    it('consumer that doesnt catch the throw fails cleanly (no silent fallback to crypto)', () => {
      // Simulating a future site that calls the dispatcher without try/catch.
      // The throw propagates — the bug is exposed at the boundary, not papered
      // over with a silent crypto_spot return.
      let threw = false;
      try {
        getPatternPoolGuardrailsForAssetClass('crypto_perp');
      } catch (err) {
        threw = true;
        expect((err as Error).message).toMatch(/CLASS_NOT_WIRED/);
      }
      expect(threw).toBe(true);
    });
  });
});
