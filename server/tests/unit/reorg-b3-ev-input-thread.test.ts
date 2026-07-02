/**
 * reorg-B3 (#233) — at-queue EV-input thread proof.
 *
 * Proves the Option B thread end-to-end at the unit level (the active path is DORMANT in
 * VTS/passive per the mode taxonomy, so a live open-gate run can't be exercised until paper-active
 * turns on — this is the achievable OBJ-6 proof now):
 *   1. OBJ-1 / Option B — the FX5 pool carries di + dbsScore as the routing-time survivor snapshot,
 *      reachable at the builder via getFX5DataForSymbol (the same call that supplies volume24h).
 *   2. OBJ-1 H2 — threading a non-default dbsScore FIRES the strong-trend pWin branch and lifts pWin
 *      off the 0.40 floor (the EV-relevant fix); a null dbsScore deterministically pins the floor.
 *   3. OBJ-1 H1 — threading real DI gives ZERO upward EV lift (default DI=50 already caps the
 *      standard branch at the 0.60 ceiling) → §9.1 disclaimer stands: reorg-B3 is NOT a crypto opener.
 *   4. OBJ-4 / OBJ-6 — the rtb-metrics EV-input proof surface captures what reached the kernel; a
 *      strong-trend sample with a non-default dbsScore is provable via getEvInputThreadProof()
 *      (strongTrendWithDbs > 0 is the #233-working signal). Forward-instrumentation: empty until
 *      the active open-gate runs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { activeFilterPool } from '../../services/active-filter-pool.js';
import { computeNetExpectancyKernel } from '../../core/calculations/net-expectancy-kernel.js';
import { rtbMetricsService } from '../../services/rtb-metrics-service.js';

describe('reorg-B3 (#233): at-queue EV-input thread', () => {
  describe('OBJ-1 / Option B — FX5 pool carries di + dbsScore (routing-time survivor snapshot)', () => {
    it('getFX5DataForSymbol returns the survivor di + dbsScore that drove routing (and still volume24h)', () => {
      activeFilterPool.addSurvivors('paper', [{
        symbol: 'B3STRONG/USD', currentPrice: 100, volume24h: 1_000_000, dailyRange: 5,
        dbsScore: 0.5, DI: 72, sourcePool: 'quant-strong_trend',
      }], true);
      const fx5 = activeFilterPool.getFX5DataForSymbol('B3STRONG/USD', 'paper');
      expect(fx5).not.toBeNull();
      expect(fx5!.dbsScore).toBeCloseTo(0.5);   // the SAME survivor DBS that drove strong-trend routing
      expect(fx5!.di).toBeCloseTo(72);
      expect(fx5!.volume24h).toBe(1_000_000);   // existing field unbroken (widening is additive-safe)
    });

    it('a cold-cache style survivor (no DI/dbsScore) returns undefined for them → kernel defaults', () => {
      activeFilterPool.addSurvivors('paper', [{
        symbol: 'B3COLD/USD', currentPrice: 10, volume24h: 5000, dailyRange: 1,
      }], true);
      const fx5 = activeFilterPool.getFX5DataForSymbol('B3COLD/USD', 'paper');
      expect(fx5).not.toBeNull();
      expect(fx5!.dbsScore).toBeUndefined();
      expect(fx5!.di).toBeUndefined();
    });
  });

  describe('OBJ-1 H2 — threading dbsScore fires the strong-trend branch (the EV-relevant fix)', () => {
    const base = { entryPrice: 100, stopPrice: 98, targetPrice: 104, totalFriction: 0, minPWin: 0.40, maxPWin: 0.60, diPWinFactor: 200 };

    it('strong-trend branch FIRES with a non-default dbsScore → pWin lifts to the ceiling', () => {
      const withDbs = computeNetExpectancyKernel({ ...base, sourcePool: 'quant-strong_trend', dbsScore: 0.5 });
      expect(withDbs.pWin).toBeCloseTo(0.60); // 0.40 + |0.5|/2 = 0.65 → clamped to 0.60 ceiling
    });

    it('null dbsScore on strong-trend deterministically pins pWin at the 0.40 floor (fail-safe default)', () => {
      const noDbs = computeNetExpectancyKernel({ ...base, sourcePool: 'quant-strong_trend', dbsScore: undefined });
      expect(noDbs.pWin).toBeCloseTo(0.40);
    });

    it('threading dbsScore strictly RAISES netEV for a strong-trend signal (vs the null floor)', () => {
      const withDbs = computeNetExpectancyKernel({ ...base, sourcePool: 'quant-strong_trend', dbsScore: 0.5 });
      const noDbs = computeNetExpectancyKernel({ ...base, sourcePool: 'quant-strong_trend', dbsScore: undefined });
      expect(withDbs.netEV).toBeGreaterThan(noDbs.netEV);
    });
  });

  describe('OBJ-1 H1 — threading real DI gives ZERO upward EV lift (accuracy-only; §9.1 stands)', () => {
    const base = { entryPrice: 100, stopPrice: 98, targetPrice: 104, totalFriction: 0, minPWin: 0.40, maxPWin: 0.60, diPWinFactor: 200 };

    it('default DI=50 already caps the standard branch at the 0.60 ceiling; real DI>=40 cannot lift it', () => {
      const defaultDi = computeNetExpectancyKernel({ ...base, DI: 50 }); // 0.40 + 50/200 = 0.65 → 0.60
      const realDi    = computeNetExpectancyKernel({ ...base, DI: 72 }); // 0.40 + 72/200 = 0.76 → 0.60
      expect(defaultDi.pWin).toBeCloseTo(0.60);
      expect(realDi.pWin).toBeCloseTo(0.60);
      expect(realDi.netEV).toBeCloseTo(defaultDi.netEV); // proves: real DI gives no upward EV lift
    });
  });

  describe('OBJ-4 / OBJ-6 — the EV-input proof surface captures what reached the kernel', () => {
    beforeEach(() => rtbMetricsService.reset());

    it('a strong-trend open-gate eval with a non-default dbsScore is provable via getEvInputThreadProof', () => {
      // Mirrors exactly the open-gate's recordEvInputSample call (active-execution-engine) after the
      // Net-Expectancy evaluation — the dbsScore/DI here are the carried at-queue column values.
      rtbMetricsService.recordEvInputSample({
        symbol: 'B3STRONG/USD', strategy: 'strong_bull_trend', assetClass: 'crypto_spot',
        DI: 72, dbsScore: 0.5, sourcePool: 'quant-strong_trend',
        usedStrongTrendBranch: true, netEV: 1.6, isTradeable: true, timestamp: Date.now(),
      });
      const proof = rtbMetricsService.getEvInputThreadProof();
      expect(proof.totalSamples).toBe(1);
      expect(proof.withNonNullDbs).toBe(1);
      expect(proof.strongTrendBranchFired).toBe(1);
      expect(proof.strongTrendWithDbs).toBe(1); // THE #233-working proof: non-default dbsScore on the strong-trend branch
    });

    it('the surface starts empty (forward-instrumentation — inert until paper-active turns on)', () => {
      expect(rtbMetricsService.getEvInputThreadProof().totalSamples).toBe(0);
      expect(rtbMetricsService.getEvInputSamples()).toHaveLength(0);
    });
  });
});
