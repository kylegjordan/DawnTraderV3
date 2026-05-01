/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B67.4 — Outcome Feedback Store Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 * - EMA math (alpha decay, first-sample-as-EMA per pre-audit §D.3)
 * - Cold-start floor (factor=1.0 when sample_count < min_samples)
 * - Factor clamp (factor_min / factor_max bounds)
 * - 0/sentinel input handling
 *
 * Reference: BATCH_67_4_SCOPE.md §A + BATCH_67_4_PRE_AUDIT.md §D
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  outcomeFeedbackStore,
  computeOutcomeFeedbackFactor,
  type OutcomeFeedbackConfig,
} from '../../core/metrics/outcome-feedback-store';

const TEST_CFG: OutcomeFeedbackConfig = {
  alpha: 0.10,
  sensitivity: 4.0,
  minSamples: 5,
  factorMin: 0.85,
  factorMax: 1.05,
  expiryHours: 168,
};

const PERSIST_FILE = '/tmp/b67-4-outcome-feedback.json';

describe('B67.4 — Outcome Feedback EMA', () => {
  beforeEach(() => {
    outcomeFeedbackStore.clear();
    // Best-effort cleanup of disk state between tests
    try { if (fs.existsSync(PERSIST_FILE)) fs.unlinkSync(PERSIST_FILE); } catch { /* ignore */ }
  });

  it('first sample becomes EMA directly (no decay applied)', () => {
    outcomeFeedbackStore.updateEma('TFS', 'vwap_pullback', 1.5, 0.10, Date.now());
    const entry = outcomeFeedbackStore.peek('TFS', 'vwap_pullback');
    expect(entry).toBeDefined();
    expect(entry!.ema_pnl_pct).toBeCloseTo(1.5, 5);
    expect(entry!.sample_count).toBe(1);
  });

  it('subsequent samples decay correctly: ema_new = alpha*pnl + (1-alpha)*ema_old', () => {
    outcomeFeedbackStore.updateEma('TFS', 's1', 2.0, 0.10, 1000);
    outcomeFeedbackStore.updateEma('TFS', 's1', 0.0, 0.10, 2000);
    const entry = outcomeFeedbackStore.peek('TFS', 's1');
    expect(entry!.ema_pnl_pct).toBeCloseTo(0.10 * 0.0 + 0.90 * 2.0, 5);
    expect(entry!.sample_count).toBe(2);
  });

  it('cold-start floor: sample_count < min_samples → factor=1.0', () => {
    for (let i = 0; i < 4; i++) {
      outcomeFeedbackStore.updateEma('TFS', 'cs', 5.0, 0.10, 1000 + i);
    }
    const entry = outcomeFeedbackStore.peek('TFS', 'cs');
    const result = computeOutcomeFeedbackFactor(entry, TEST_CFG);
    expect(result.coldStart).toBe(true);
    expect(result.factor).toBe(1.0);
  });

  it('warm path: factor = clamp(min, max, 1 + ema_pct × sensitivity / 100)', () => {
    // 5 samples of +1% → ema_pct = 1.0 → factor = 1.0 + 1.0 × 4.0 / 100 = 1.04
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('TFS', 'warm', 1.0, 0.10, 1000 + i);
    }
    const entry = outcomeFeedbackStore.peek('TFS', 'warm');
    const result = computeOutcomeFeedbackFactor(entry, TEST_CFG);
    expect(result.coldStart).toBe(false);
    expect(result.factor).toBeCloseTo(1.04, 4);
  });

  it('floor clamp: very negative EMA hits factorMin', () => {
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('TFS', 'losing', -10.0, 0.10, 1000 + i);
    }
    const entry = outcomeFeedbackStore.peek('TFS', 'losing');
    const result = computeOutcomeFeedbackFactor(entry, TEST_CFG);
    // raw = 1 + (-10 × 4.0)/100 = 0.60 → clamped to 0.85
    expect(result.factor).toBe(0.85);
  });

  it('ceiling clamp: very positive EMA hits factorMax', () => {
    for (let i = 0; i < 5; i++) {
      outcomeFeedbackStore.updateEma('TFS', 'winning', 10.0, 0.10, 1000 + i);
    }
    const entry = outcomeFeedbackStore.peek('TFS', 'winning');
    const result = computeOutcomeFeedbackFactor(entry, TEST_CFG);
    // raw = 1 + (10 × 4.0)/100 = 1.40 → clamped to 1.05
    expect(result.factor).toBe(1.05);
  });

  it('different (regime, strategy) tuples are independent', () => {
    outcomeFeedbackStore.updateEma('TFS', 's1', 1.0, 0.10, 1000);
    outcomeFeedbackStore.updateEma('RBS', 's1', -1.0, 0.10, 1000);
    expect(outcomeFeedbackStore.peek('TFS', 's1')!.ema_pnl_pct).toBeCloseTo(1.0, 5);
    expect(outcomeFeedbackStore.peek('RBS', 's1')!.ema_pnl_pct).toBeCloseTo(-1.0, 5);
  });

  it('non-finite pnl is silently dropped', () => {
    outcomeFeedbackStore.updateEma('TFS', 's1', NaN, 0.10, 1000);
    expect(outcomeFeedbackStore.peek('TFS', 's1')).toBeUndefined();
  });

  it('invalid alpha is silently dropped', () => {
    outcomeFeedbackStore.updateEma('TFS', 's1', 1.0, 0, 1000);
    outcomeFeedbackStore.updateEma('TFS', 's1', 1.0, 1.5, 1000);
    expect(outcomeFeedbackStore.peek('TFS', 's1')).toBeUndefined();
  });

  it('evictExpired removes stale tuples', () => {
    outcomeFeedbackStore.updateEma('TFS', 'old', 1.0, 0.10, 1000);
    const now = 1000 + 8 * 24 * 60 * 60 * 1000; // 8 days later
    const removed = outcomeFeedbackStore.evictExpired(7 * 24 * 60 * 60 * 1000, now);
    expect(removed).toBe(1);
    expect(outcomeFeedbackStore.peek('TFS', 'old')).toBeUndefined();
  });

  it('undefined entry → cold-start', () => {
    const result = computeOutcomeFeedbackFactor(undefined, TEST_CFG);
    expect(result.coldStart).toBe(true);
    expect(result.factor).toBe(1.0);
  });
});
