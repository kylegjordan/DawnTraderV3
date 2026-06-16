/**
 * P19-B4b.1 — depth-gate config (fail-closed) + warmth/sufficiency assessors + counter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRows: Record<string, unknown> = {};
vi.mock('../../services/module-constants-service.js', () => ({
  getModuleConstants: async () => mockRows,
}));
// depth-source pulls in the live WS adapter + db; stub both so the pure assessors load clean.
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', () => ({
  krakenWebSocketAdapter: { getBookForFill: () => null },
}));
vi.mock('../../db.js', () => ({ db: { execute: async () => ({ rows: [] }) } }));

import {
  resolveFillDepthGateConfig,
  _testClearDepthGateCache,
  type FillDepthGateConfig,
} from '../../services/execution/depth-gate-config.js';
import {
  assessWarmth,
  assessSufficiency,
  recordDepthGateBlock,
  getDepthGateBlockStats,
  _testResetDepthGateBlocks,
  type DepthSnapshot,
} from '../../services/execution/depth-source.js';

const CONFIG: FillDepthGateConfig = {
  warmthMaxAgeMs: 5000,
  sufficiencyMultiple: 3,
  minLevels: 3,
  beyondDepthPenaltyBps: 50,
};
const snap = (over: Partial<DepthSnapshot> = {}): DepthSnapshot => ({
  asks: [{ price: 100, qty: 5 }, { price: 101, qty: 5 }, { price: 102, qty: 5 }],
  bids: [{ price: 99, qty: 5 }, { price: 98, qty: 5 }, { price: 97, qty: 5 }],
  ageMs: 1000,
  source: 'crypto_ws_book',
  ...over,
});

describe('P19-B4b.1 depth-gate config — fail-closed (rule-11/15)', () => {
  beforeEach(() => _testClearDepthGateCache());
  it('complete rows → config', async () => {
    mockRows = { warmth_max_age_ms: 5000, sufficiency_multiple: 3, min_levels: 3, beyond_depth_penalty_bps: 50 };
    const c = await resolveFillDepthGateConfig('crypto_spot');
    expect(c).not.toBeNull();
    expect(c!.sufficiencyMultiple).toBe(3);
    expect(c!.beyondDepthPenaltyBps).toBe(50);
  });
  it('missing a key → null (fail-closed, blocks the fill)', async () => {
    _testClearDepthGateCache();
    mockRows = { warmth_max_age_ms: 5000, sufficiency_multiple: 3 };
    expect(await resolveFillDepthGateConfig('crypto_spot')).toBeNull();
  });
  it('non-numeric → null', async () => {
    _testClearDepthGateCache();
    mockRows = { warmth_max_age_ms: 'x', sufficiency_multiple: 3, min_levels: 3, beyond_depth_penalty_bps: 50 };
    expect(await resolveFillDepthGateConfig('crypto_spot')).toBeNull();
  });
});

describe('P19-B4b.1 assessWarmth', () => {
  it('null snapshot → not warm (no_book)', () => {
    expect(assessWarmth(null, 'asks', CONFIG)).toEqual({ warm: false, reason: 'no_book' });
  });
  it('stale book (age > max) → not warm', () => {
    const r = assessWarmth(snap({ ageMs: 9000 }), 'asks', CONFIG);
    expect(r.warm).toBe(false);
    expect(r.reason).toMatch(/stale_book/);
  });
  it('thin book (levels < min) → not warm', () => {
    const r = assessWarmth(snap({ asks: [{ price: 100, qty: 5 }] }), 'asks', CONFIG);
    expect(r.warm).toBe(false);
    expect(r.reason).toMatch(/thin_book/);
  });
  it('fresh + deep enough → warm', () => {
    expect(assessWarmth(snap(), 'asks', CONFIG).warm).toBe(true);
  });
});

describe('P19-B4b.1 assessSufficiency (ratio gate)', () => {
  it('depth ≥ order × multiple → sufficient', () => {
    // asks notional = 100*5+101*5+102*5 = 1515; order 100 * 3x = 300 ≤ 1515
    const r = assessSufficiency(snap(), 'asks', 100, CONFIG);
    expect(r.sufficient).toBe(true);
    expect(r.availableNotional).toBeCloseTo(1515, 6);
  });
  it('thin book vs order × multiple → insufficient (binds on the thin tail)', () => {
    const thin = snap({ asks: [{ price: 100, qty: 1 }, { price: 101, qty: 1 }, { price: 102, qty: 1 }] }); // ~303
    const r = assessSufficiency(thin, 'asks', 200, CONFIG); // need 600 > 303
    expect(r.sufficient).toBe(false);
    expect(r.reason).toMatch(/insufficient_depth/);
  });
});

describe('P19-B4b.1 depth-gate block counter (observable, rules 10/11)', () => {
  beforeEach(() => _testResetDepthGateBlocks());
  it('buckets by assetClass + reason kind', () => {
    recordDepthGateBlock('crypto_spot', 'stale_book age=9000ms>5000ms');
    recordDepthGateBlock('crypto_spot', 'stale_book age=8000ms>5000ms');
    recordDepthGateBlock('xstock_spot', 'no_book');
    const stats = getDepthGateBlockStats();
    expect(stats['crypto_spot:stale_book'].count).toBe(2);
    expect(stats['xstock_spot:no_book'].count).toBe(1);
  });
});
