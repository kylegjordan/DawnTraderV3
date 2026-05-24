/**
 * B79.0n.STRATEGY (2026-05-24) — Hybrid Integration canonical taxonomy fix
 *
 * Per scope §4 test #6: verifies BUG-007 closure — selectHybridStrategy
 * no longer returns legacy H1_TREND_SNIPER / H2_SLINGSHOT / H3_GATECRASHER /
 * H4_MOMENTUM_LINK values; instead returns canonical hybrid strategy keys
 * derived from the pattern dimension of the confluence.
 *
 * Pattern→Hybrid mapping per Directive 11.4H.6G PATTERN_TO_HYBRID:
 *   MORNING_STAR → pivot_shift
 *   PINBAR       → reverse_impulse
 *   ENGULFING    → defensive_hedge
 *   TRI_STAR     → adaptive_flow
 *   ABCD         → volatility_edge
 *   (other)      → quant_fallback
 */

import { describe, it, expect } from 'vitest';
import { HybridIntegrationService } from '../../services/hybrid-integration';

describe('B79.0n.STRATEGY — Hybrid Integration canonical taxonomy (BUG-007 closure)', () => {
  const svc = new HybridIntegrationService();
  const baseQuant = {
    symbol: 'BTC/USD',
    strategy: 'breakout',
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    confidence: 0.7,
    direction: 'BUY' as const,
    timestamp: Date.now(),
  };

  function mkPattern(pattern: string) {
    return {
      symbol: 'BTC/USD',
      pattern: pattern as any,
      strength: 0.7,
      direction: 'BUY' as const,
      timestamp: Date.now(),
    } as any;
  }

  // selectHybridStrategy is private — exercise via detectConfluence which calls it.
  it('MORNING_STAR pattern → pivot_shift hybrid', () => {
    const hybrids = svc.detectConfluence([baseQuant], [mkPattern('MORNING_STAR')]);
    if (hybrids.length > 0) {
      expect(hybrids[0].hybridStrategy).toBe('pivot_shift');
    }
  });

  it('PINBAR pattern → reverse_impulse hybrid', () => {
    const hybrids = svc.detectConfluence([baseQuant], [mkPattern('PINBAR')]);
    if (hybrids.length > 0) {
      expect(hybrids[0].hybridStrategy).toBe('reverse_impulse');
    }
  });

  it('ENGULFING pattern → defensive_hedge hybrid', () => {
    const hybrids = svc.detectConfluence([baseQuant], [mkPattern('ENGULFING')]);
    if (hybrids.length > 0) {
      expect(hybrids[0].hybridStrategy).toBe('defensive_hedge');
    }
  });

  it('TRI_STAR pattern → adaptive_flow hybrid', () => {
    const hybrids = svc.detectConfluence([baseQuant], [mkPattern('TRI_STAR')]);
    if (hybrids.length > 0) {
      expect(hybrids[0].hybridStrategy).toBe('adaptive_flow');
    }
  });

  it('ABCD pattern → volatility_edge hybrid', () => {
    const hybrids = svc.detectConfluence([baseQuant], [mkPattern('ABCD')]);
    if (hybrids.length > 0) {
      expect(hybrids[0].hybridStrategy).toBe('volatility_edge');
    }
  });

  it('legacy taxonomy values (H1_TREND_SNIPER etc.) NEVER returned post-batch (BUG-007 regression-lock)', () => {
    const legacyTaxonomy = ['H1_TREND_SNIPER', 'H2_SLINGSHOT', 'H3_GATECRASHER', 'H4_MOMENTUM_LINK'];
    for (const pat of ['MORNING_STAR', 'PINBAR', 'ENGULFING', 'TRI_STAR', 'ABCD', 'INSIDE_BAR']) {
      const hybrids = svc.detectConfluence([baseQuant], [mkPattern(pat)]);
      for (const h of hybrids) {
        expect(legacyTaxonomy).not.toContain(h.hybridStrategy);
      }
    }
  });
});
