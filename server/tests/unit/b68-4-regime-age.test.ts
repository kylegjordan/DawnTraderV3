/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B68.4 — Regime Age (Freshness Factor) Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers the freshness factor:
 *   raw    = 1.0 + (target - actual) × sensitivity / target
 *   factor = clamp(min, max, raw)
 *
 * Reference: BATCH_67_4_SCOPE.md §B
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { computeFreshnessFactor } from '../../core/metrics/regime-age-factor';
import type { RegimeAgeConfig } from '../../services/market-context-engine';

const CFG: RegimeAgeConfig = {
  targetAgeHours: 6.0,
  sensitivity: 0.10,
  factorMin: 0.92,
  factorMax: 1.05,
};

const HR = 60 * 60 * 1000; // ms in an hour

describe('B68.4 — Freshness factor', () => {
  it('age=0h returns factorMax (ceiling clamp)', () => {
    // raw = 1 + (6 - 0) × 0.10 / 6 = 1.10 → clamp to 1.05
    const r = computeFreshnessFactor(0, CFG);
    expect(r.factor).toBe(1.05);
    expect(r.coldStart).toBe(false);
    expect(r.ageHours).toBe(0);
  });

  it('age=6h (target) returns 1.00 exactly', () => {
    const r = computeFreshnessFactor(6 * HR, CFG);
    expect(r.factor).toBeCloseTo(1.00, 5);
    expect(r.ageHours).toBeCloseTo(6, 5);
  });

  it('age=12h or more returns factorMin (floor clamp)', () => {
    // raw = 1 + (6 - 12) × 0.10 / 6 = 0.90 → clamp to 0.92
    const r = computeFreshnessFactor(12 * HR, CFG);
    expect(r.factor).toBe(0.92);
  });

  it('age=3h returns ~1.05 (clamped boost)', () => {
    // raw = 1 + (6 - 3) × 0.10 / 6 = 1.05 → at clamp ceiling
    const r = computeFreshnessFactor(3 * HR, CFG);
    expect(r.factor).toBeCloseTo(1.05, 5);
  });

  it('undefined ageMs returns cold-start factor=1.0', () => {
    const r = computeFreshnessFactor(undefined, CFG);
    expect(r.coldStart).toBe(true);
    expect(r.factor).toBe(1.0);
    expect(r.ageHours).toBe(0);
  });

  it('non-finite ageMs returns cold-start factor=1.0', () => {
    const r = computeFreshnessFactor(NaN, CFG);
    expect(r.coldStart).toBe(true);
    expect(r.factor).toBe(1.0);
  });

  it('zero/negative target hours returns 1.0 without divide-by-zero', () => {
    const zeroCfg: RegimeAgeConfig = { ...CFG, targetAgeHours: 0 };
    const r = computeFreshnessFactor(2 * HR, zeroCfg);
    expect(r.factor).toBe(1.0);
    expect(r.coldStart).toBe(false);
  });

  it('factor monotonically decreases as age increases (in clamp interior)', () => {
    // Use a wider clamp so the slope is visible. With default [0.92, 1.05]
    // the floor/ceiling hide the interior.
    const wideCfg: RegimeAgeConfig = { ...CFG, factorMin: 0, factorMax: 10 };
    const f3 = computeFreshnessFactor(3 * HR, wideCfg).factor;
    const f6 = computeFreshnessFactor(6 * HR, wideCfg).factor;
    const f9 = computeFreshnessFactor(9 * HR, wideCfg).factor;
    expect(f3).toBeGreaterThan(f6);
    expect(f6).toBeGreaterThan(f9);
  });
});
