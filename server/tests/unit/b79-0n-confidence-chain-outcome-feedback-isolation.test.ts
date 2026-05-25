/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B79.0n.CONFIDENCE-CHAIN — Outcome-feedback per-class isolation tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Asserts the per-class store key shape change is genuinely isolating crypto
 * trade outcomes from xstock signal modulation (and vice-versa). This is the
 * R-10-mitigation test surface — if a future refactor regresses the per-class
 * key, the cross-contamination would be silent without these tests.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { outcomeFeedbackStore } from '../../core/metrics/outcome-feedback-store';

describe('B79.0n.CONFIDENCE-CHAIN — outcome-feedback per-class isolation', () => {
  beforeEach(() => {
    outcomeFeedbackStore.clear();
  });

  it('crypto trade does NOT contaminate xstock entry for same (regime, strategy)', () => {
    // 5 crypto trades winning at +5% net
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'breakout', 5.0, 0.10, 1000 + i);
    }
    // xstock entry for same regime+strategy is independent
    const cryptoEntry = outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'breakout');
    const xstockEntry = outcomeFeedbackStore.peek('xstock_spot', 'TFS', 'breakout');
    expect(cryptoEntry?.sample_count).toBe(5);
    expect(cryptoEntry?.ema_pnl_pct).toBeCloseTo(5.0, 5);
    expect(xstockEntry).toBeUndefined();
  });

  it('xstock trade does NOT contaminate crypto entry for same (regime, strategy)', () => {
    // 5 xstock trades losing at -3% net
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('xstock_spot', 'TFS', 'mean_reversion', -3.0, 0.10, 1000 + i);
    }
    const xstockEntry = outcomeFeedbackStore.peek('xstock_spot', 'TFS', 'mean_reversion');
    const cryptoEntry = outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'mean_reversion');
    expect(xstockEntry?.sample_count).toBe(5);
    expect(xstockEntry?.ema_pnl_pct).toBeCloseTo(-3.0, 5);
    expect(cryptoEntry).toBeUndefined();
  });

  it('parallel crypto + xstock EMAs evolve independently with different signs', () => {
    // crypto WINNING (+5%) at the same (regime, strategy) where xstock is LOSING (-5%).
    for (let i = 0; i < 10; i++) {
      outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'breakout', 5.0, 0.10, 1000 + i);
      outcomeFeedbackStore.updateEma('xstock_spot', 'TFS', 'breakout', -5.0, 0.10, 1000 + i);
    }
    const crypto = outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'breakout');
    const xstock = outcomeFeedbackStore.peek('xstock_spot', 'TFS', 'breakout');
    expect(crypto?.ema_pnl_pct).toBeCloseTo(5.0, 5);
    expect(xstock?.ema_pnl_pct).toBeCloseTo(-5.0, 5);
    // The two EMAs have opposite sign — the per-class key successfully prevents
    // sign cancellation that would happen with the pre-CONFIDENCE-CHAIN single key.
    expect(crypto!.ema_pnl_pct * xstock!.ema_pnl_pct).toBeLessThan(0);
  });

  it('peek with wrong asset class returns undefined (no fall-through resolver)', () => {
    outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'breakout', 1.5, 0.10, Date.now());
    // Same regime + strategy but DIFFERENT asset class — undefined, not the crypto entry.
    expect(outcomeFeedbackStore.peek('xstock_spot', 'TFS', 'breakout')).toBeUndefined();
    expect(outcomeFeedbackStore.peek('crypto_perp', 'TFS', 'breakout')).toBeUndefined();
  });

  it('different regimes within same asset class stay independent', () => {
    outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'breakout', 5.0, 0.10, 1000);
    outcomeFeedbackStore.updateEma('crypto_spot', 'RBS', 'breakout', -5.0, 0.10, 1000);
    const tfs = outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'breakout');
    const rbs = outcomeFeedbackStore.peek('crypto_spot', 'RBS', 'breakout');
    expect(tfs?.ema_pnl_pct).toBeCloseTo(5.0, 5);
    expect(rbs?.ema_pnl_pct).toBeCloseTo(-5.0, 5);
  });

  it('different strategies within same (asset class, regime) stay independent', () => {
    outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'breakout', 2.0, 0.10, 1000);
    outcomeFeedbackStore.updateEma('crypto_spot', 'TFS', 'mean_reversion', -2.0, 0.10, 1000);
    expect(outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'breakout')?.ema_pnl_pct).toBeCloseTo(2.0, 5);
    expect(outcomeFeedbackStore.peek('crypto_spot', 'TFS', 'mean_reversion')?.ema_pnl_pct).toBeCloseTo(-2.0, 5);
  });
});
