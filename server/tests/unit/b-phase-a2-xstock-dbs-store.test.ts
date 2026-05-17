/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-PHASE-A2 — xStock Directional Bias Store Contract Test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the two-instance pattern + xStock-specific behaviors:
 *
 *   1. Constructor mode='crypto' preserves pre-B-PHASE-A2 semantics:
 *      - Floor against `this.store.size` (sentinels included)
 *      - No sector partition filter
 *      - Single global floor only
 *
 *   2. Constructor mode='xstock' applies new behaviors:
 *      - Floor counts ONLY GICS-sectored non-sentinel entries
 *      - INDEX_PROXY / BROAD_ETF / INTL_ETF / undefined-sector entries stored but
 *        excluded from floor count AND from weighted-median aggregation
 *      - Sector coverage floor (≥7 distinct GICS sectors required to publish)
 *
 *   3. updatePair() 5-arg variant (with sector) populates entry shape; 4-arg
 *      variant (back-compat for crypto callers) leaves sector undefined.
 *
 *   4. Both singletons exist independently — clearing one doesn't affect the other.
 *
 * Reference: B_PHASE_A1_DBS_design_ask_rev2.md §3.1, §3.6.
 *            B_PHASE_A2_DBS_SCOPE.md D16, D17.
 *            B_PHASE_A2_DBS_PRE_AUDIT.md §8.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  directionalBiasStore,
  xstockDirectionalBiasStore,
  getLatestGlobalDbsSnapshot,
  getLatestXstockGlobalDbsSnapshot,
} from '../../core/metrics/directional-bias-store';
import type { XstockSector } from '../../../shared/asset-classes';

// Mock module-constants-service so tests don't require a warm DB cache.
// Returns the seed values that A.2 migration will set in module_constants.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, knob: string, key: any) => {
    if (module !== 'dbs_calculation') throw new Error(`unexpected module ${module}`);
    if (knob === 'min_sample_count') {
      // crypto wildcard -> 20; xstock_spot row -> 30
      return key.assetClass === 'xstock_spot' ? 30 : 20;
    }
    throw new Error(`unexpected required knob ${knob}`);
  },
  getCachedConstant: (module: string, knob: string, key: any) => {
    if (module === 'dbs_calculation' && knob === 'sector_coverage_floor'
        && key.assetClass === 'xstock_spot') {
      return 7;
    }
    return undefined;
  },
}));

const GICS: XstockSector[] = ['XLK','XLE','XLV','XLF','XLI','XLP','XLY','XLU','XLB','XLRE','XLC'];

function populateXstock(n: number, opts: { sectorCycle?: boolean; sentinel?: boolean; sector?: XstockSector } = {}): void {
  for (let i = 0; i < n; i++) {
    const sector = opts.sector ?? (opts.sectorCycle ? GICS[i % GICS.length] : 'XLK');
    xstockDirectionalBiasStore.updatePair(
      `XS${i}/USD`,
      0.1 + i * 0.01,
      opts.sentinel ?? false,
      1000 + i,
      sector,
    );
  }
}

function populateCrypto(n: number, sentinel = false): void {
  for (let i = 0; i < n; i++) {
    directionalBiasStore.updatePair(
      `SYM${i}/USD`,
      0.1 + i * 0.01,
      sentinel,
      1000 + i,
    );
  }
}

describe('B-PHASE-A2 — xStock Directional Bias Store', () => {
  beforeEach(() => {
    directionalBiasStore.clear();
    xstockDirectionalBiasStore.clear();
  });

  describe('Two-instance independence', () => {
    it('crypto and xStock singletons are distinct instances', () => {
      expect(directionalBiasStore).not.toBe(xstockDirectionalBiasStore);
    });

    it('clearing xStock store does not clear crypto store', () => {
      populateCrypto(25);
      populateXstock(35, { sectorCycle: true });
      xstockDirectionalBiasStore.clear();
      expect(directionalBiasStore.getStoreSize()).toBe(25);
      expect(xstockDirectionalBiasStore.getStoreSize()).toBe(0);
    });

    it('convenience accessors return correct snapshots', () => {
      expect(getLatestGlobalDbsSnapshot()).toBeNull();
      expect(getLatestXstockGlobalDbsSnapshot()).toBeNull();
    });
  });

  describe('Crypto store back-compat (mode=crypto)', () => {
    it('updatePair 4-arg variant works unchanged (no sector)', () => {
      populateCrypto(25);
      expect(directionalBiasStore.getStoreSize()).toBe(25);
    });

    it('publish at 25 pairs clears the 20-pair crypto floor', () => {
      populateCrypto(25);
      const snap = directionalBiasStore.publishSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.isStale).toBe(false);
      expect(snap!.coverage).toBe(25);
    });

    it('publish at 15 pairs (below 20-floor) returns null on cold start', () => {
      populateCrypto(15);
      const snap = directionalBiasStore.publishSnapshot();
      expect(snap).toBeNull();
    });
  });

  describe('xStock store — sector partition + dual floors (mode=xstock)', () => {
    it('publish at 30 GICS-sectored entries across 7 sectors clears both floors', () => {
      populateXstock(35, { sectorCycle: true }); // cycles through 11 GICS = 7+ sectors covered
      const snap = xstockDirectionalBiasStore.publishSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.isStale).toBe(false);
      expect(snap!.coverage).toBeGreaterThanOrEqual(30);
    });

    it('publish at 35 entries all single-sector (XLK only) fails sector-coverage-7 floor', () => {
      populateXstock(35, { sector: 'XLK' }); // all XLK → only 1 sector covered
      const snap = xstockDirectionalBiasStore.publishSnapshot();
      expect(snap).toBeNull(); // cold start + below sector-coverage floor
    });

    it('publish at 25 GICS-sectored entries fails global-30 floor', () => {
      populateXstock(25, { sectorCycle: true }); // global 25 < 30
      const snap = xstockDirectionalBiasStore.publishSnapshot();
      expect(snap).toBeNull();
    });

    it('INDEX_PROXY entries stored but excluded from floor count', () => {
      // 28 GICS-sectored + 5 INDEX_PROXY = 33 total entries but only 28 toward floor
      populateXstock(28, { sectorCycle: true });
      for (let i = 0; i < 5; i++) {
        xstockDirectionalBiasStore.updatePair(`IDX${i}/USD`, 0.2, false, 5000, 'INDEX_PROXY');
      }
      expect(xstockDirectionalBiasStore.getStoreSize()).toBe(33);
      // 28 GICS-sectored < 30 floor → returns null
      const snap = xstockDirectionalBiasStore.publishSnapshot();
      expect(snap).toBeNull();
    });

    it('sentinel entries do NOT count toward xStock floor', () => {
      // 32 non-sentinel (cycle GICS) + 10 sentinel = 42 total, but 32 toward floor
      populateXstock(32, { sectorCycle: true, sentinel: false });
      for (let i = 0; i < 10; i++) {
        xstockDirectionalBiasStore.updatePair(`SENT${i}/USD`, 0, true, 100, 'XLK');
      }
      expect(xstockDirectionalBiasStore.getStoreSize()).toBe(42);
      const snap = xstockDirectionalBiasStore.publishSnapshot();
      expect(snap).not.toBeNull(); // 32 non-sentinel GICS entries clear 30 global + 11 sectors clear 7
      expect(snap!.coverage).toBe(32);
    });
  });

  describe('Independent operation of the two stores', () => {
    it('crypto publish does not consume xStock store entries', () => {
      populateCrypto(25);
      populateXstock(28, { sectorCycle: true });
      const cryptoSnap = directionalBiasStore.publishSnapshot();
      const xstockSnap = xstockDirectionalBiasStore.publishSnapshot();
      expect(cryptoSnap).not.toBeNull(); // 25 ≥ 20 crypto floor
      expect(xstockSnap).toBeNull();     // 28 < 30 xStock floor
    });
  });
});
