/**
 * ITEM-4 Phase B step 2 — labeled multi-source learning substrate (D9) +
 * source-namespaced hybrid-confluence buffer (D1b).
 *
 * Locks the Gate-2 converged design invariants:
 *  1. SOURCE ISOLATION — a paper_sim close can never touch the vts-trained
 *     aggregate (the whole point of the separation; RUNNING_ISSUES #210).
 *  2. WELFORD alongside retained EMA — count/mean/M2 correct; EMA math
 *     byte-identical to pre-step-2 behavior (zero overnight behavior change).
 *  3. CALIBRATION-EPOCH reset — epoch N → N+1 resets the Welford stream,
 *     EMA continues (documented limitation; Langston step-2 test ask).
 *  4. BUFFER NAMESPACE — a vts pattern is invisible to a paper_sim
 *     findCompatiblePatterns (D1b cross-producer contamination kill).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { outcomeFeedbackStore } from '../../core/metrics/outcome-feedback-store.js';
import { hybridConfluenceBuffer } from '../../services/hybrid-confluence-buffer.js';

describe('ITEM-4 step 2 — D9 labeled multi-source learning store', () => {
  beforeEach(() => {
    outcomeFeedbackStore.clear();
  });

  it('1. SOURCE ISOLATION: paper_sim writes never touch the vts partition (and vice versa)', () => {
    // VTS accrues a profitable tuple
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('vts', 'crypto_spot', 'TFS', 'breakout', 5.0, 0.10, 1000 + i, 1);
    }
    // Paper accrues a LOSING tuple on the SAME (assetClass, regime, strategy)
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('paper_sim', 'crypto_spot', 'TFS', 'breakout', -5.0, 0.10, 2000 + i, 1);
    }
    const vts = outcomeFeedbackStore.peek('vts', 'crypto_spot', 'TFS', 'breakout');
    const paper = outcomeFeedbackStore.peek('paper_sim', 'crypto_spot', 'TFS', 'breakout');
    const live = outcomeFeedbackStore.peek('live', 'crypto_spot', 'TFS', 'breakout');
    expect(vts).toBeDefined();
    expect(paper).toBeDefined();
    expect(live).toBeUndefined(); // never written
    expect(vts!.ema_pnl_pct).toBeGreaterThan(0); // VTS stays profitable
    expect(paper!.ema_pnl_pct).toBeLessThan(0);  // paper stays losing
    expect(vts!.sample_count).toBe(5);
    expect(paper!.sample_count).toBe(5);
  });

  it('2a. EMA math is byte-identical to pre-step-2 (first-sample-as-EMA + alpha decay)', () => {
    outcomeFeedbackStore.updateEma('vts', 'crypto_spot', 'TFS', 's1', 2.0, 0.10, 1000, 1);
    outcomeFeedbackStore.updateEma('vts', 'crypto_spot', 'TFS', 's1', 0.0, 0.10, 2000, 1);
    const e = outcomeFeedbackStore.peek('vts', 'crypto_spot', 'TFS', 's1')!;
    // first sample = 2.0 directly (§D.3); second: 0.1*0 + 0.9*2.0 = 1.8
    expect(e.ema_pnl_pct).toBeCloseTo(1.8, 10);
    expect(e.sample_count).toBe(2);
  });

  it('2b. Welford triplet: correct running mean and variance', () => {
    const samples = [1.0, 3.0, 5.0, 7.0];
    samples.forEach((v, i) =>
      outcomeFeedbackStore.updateEma('vts', 'crypto_spot', 'TFS', 'w1', v, 0.10, 1000 + i, 1));
    const e = outcomeFeedbackStore.peek('vts', 'crypto_spot', 'TFS', 'w1')!;
    expect(e.w_count).toBe(4);
    expect(e.w_mean).toBeCloseTo(4.0, 10);           // mean of 1,3,5,7
    expect(e.w_m2 / (e.w_count - 1)).toBeCloseTo(20 / 3, 10); // sample variance
    expect(e.epoch).toBe(1);
  });

  it('3. EPOCH RESET: bump resets Welford, EMA continues (documented limitation)', () => {
    for (let i = 0; i < 4; i++) {
      outcomeFeedbackStore.updateEma('vts', 'crypto_spot', 'TFS', 'ep1', 4.0, 0.10, 1000 + i, 1);
    }
    const before = outcomeFeedbackStore.peek('vts', 'crypto_spot', 'TFS', 'ep1')!;
    expect(before.w_count).toBe(4);
    const emaBefore = before.ema_pnl_pct;
    // calibration bump → epoch 2: Welford resets to the new sample; EMA decays on
    outcomeFeedbackStore.updateEma('vts', 'crypto_spot', 'TFS', 'ep1', -2.0, 0.10, 5000, 2);
    const after = outcomeFeedbackStore.peek('vts', 'crypto_spot', 'TFS', 'ep1')!;
    expect(after.epoch).toBe(2);
    expect(after.w_count).toBe(1);                   // honest reset
    expect(after.w_mean).toBeCloseTo(-2.0, 10);
    expect(after.w_m2).toBe(0);
    expect(after.ema_pnl_pct).toBeCloseTo(0.10 * -2.0 + 0.90 * emaBefore, 10); // EMA continues
    expect(after.sample_count).toBe(5);              // EMA lineage uninterrupted
  });
});

describe('ITEM-4 step 2 — D1b source-namespaced hybrid-confluence buffer', () => {
  beforeEach(() => {
    hybridConfluenceBuffer.clear();
  });

  it('4. NAMESPACE ISOLATION: vts patterns invisible to paper_sim reads (and vice versa)', () => {
    hybridConfluenceBuffer.addPatternSignal({
      sourceMode: 'vts', symbol: 'BTC/USD', patternType: 'HAMMER',
      strategy: 'hammer_reversal', strength: 0.8, direction: 'BUY', timestamp: Date.now(),
    });
    hybridConfluenceBuffer.addPatternSignal({
      sourceMode: 'paper_sim', symbol: 'BTC/USD', patternType: 'ENGULFING',
      strategy: 'engulfing', strength: 0.7, direction: 'BUY', timestamp: Date.now(),
    });
    const vtsView = hybridConfluenceBuffer.findCompatiblePatterns('BTC/USD', 'vts');
    const paperView = hybridConfluenceBuffer.findCompatiblePatterns('BTC/USD', 'paper_sim');
    expect(vtsView).toHaveLength(1);
    expect(vtsView[0].patternType).toBe('HAMMER');
    expect(paperView).toHaveLength(1);
    expect(paperView[0].patternType).toBe('ENGULFING');
  });

  it('5. NO DECAY-CLOCK CROSS-REFRESH: same symbol+pattern in two sources are separate entries', () => {
    hybridConfluenceBuffer.addPatternSignal({
      sourceMode: 'vts', symbol: 'ETH/USD', patternType: 'DOJI',
      strategy: 'doji', strength: 0.5, direction: 'BUY', timestamp: Date.now(),
    });
    hybridConfluenceBuffer.addPatternSignal({
      sourceMode: 'paper_sim', symbol: 'ETH/USD', patternType: 'DOJI',
      strategy: 'doji', strength: 0.9, direction: 'BUY', timestamp: Date.now(),
    });
    expect(hybridConfluenceBuffer.size).toBe(2); // distinct keys — no overwrite across sources
    const vtsView = hybridConfluenceBuffer.findCompatiblePatterns('ETH/USD', 'vts');
    expect(vtsView[0].strength).toBe(0.5); // vts entry untouched by the paper write
  });
});
