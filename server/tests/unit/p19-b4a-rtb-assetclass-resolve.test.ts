/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4a — C1 (A1.5 spine): RTB writes a RESOLVED asset_class, never a silent default
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Before B4a, `queueSQESignal` wrote `input.assetClass || 'crypto_spot'` to BOTH the
 * metadata mirror and the first-class `asset_class` column — so a signal that reached
 * the queue without an assetClass (e.g. an xStock signal whose metadata field was
 * dropped) would be SILENTLY mislabeled `crypto_spot`. B4a (Langston Step-2 spine)
 * replaces the silent default with resolve-from-symbol-OR-THROW: a missing assetClass
 * is resolved deterministically from the (normalized) symbol via `resolveAssetClass`,
 * which THROWS on an unclassifiable symbol (fail loud — CLAUDE.md §10). The orchestrator
 * (the single queueSQESignal caller, :708) now also resolves from the raw symbol before
 * queueing, so this RTB resolve is defense-in-depth; the `[B79.0n.RTB][QUEUE_FALLBACK]`
 * warn stays as the zero-target tripwire for the A4 SET-NOT-NULL gate.
 *
 * These tests lock the row-write contract: with `input.assetClass` absent, the row
 * carries the class RESOLVED FROM THE SYMBOL — an xStock symbol lands `xstock_spot`,
 * NOT the old `crypto_spot` default. xStock spot classification on the (normalized)
 * canonical `TICKER/QUOTE` form is registry-membership-based (`asset-classes.ts:504`),
 * and the universe is DB/discovery-seeded — empty in unit tests — so we seed one entry
 * via the exported `_replaceXstockUniverse` and restore it after (file-isolated, but
 * tidy). Fail-loud-on-unclassifiable is delegated to `resolveAssetClass`'s own contract
 * (B3a classify tests); the C1 line calls it directly, so a throw propagates.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

let capturedInsert: any = null;

// Light DB stub (B79.0n.RTB / B3b precedent) so importing the singleton pulls no live DB.
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

// Capture the row handed to upsertRtbSignal; short-circuit the active-pair dedupe.
vi.mock('../../storage.js', () => ({
  storage: {
    hasActivePair: async () => false,
    getRtbSignals: async () => [],
    upsertRtbSignal: async (data: any) => {
      capturedInsert = data;
      return { id: 1, ...data };
    },
  },
}));

import { readyToBuyService, normalizePairKey } from '../../core/rtb/ready_to_buy_service.js';
import {
  resolveAssetClass,
  _replaceXstockUniverse,
  XSTOCK_SPOT_REGISTRY,
} from '../../../shared/asset-classes.js';

// Seed one xStock under the NORMALIZED pair key, since queueSQESignal resolves the
// normalized form. Restore the original universe after.
const XSTOCK_RAW = 'TSLA/USD';
const XSTOCK_NORM = normalizePairKey(XSTOCK_RAW);
let originalUniverse: ReadonlyMap<string, any>;

beforeAll(() => {
  originalUniverse = new Map(XSTOCK_SPOT_REGISTRY);
  _replaceXstockUniverse(
    new Map<string, any>([[XSTOCK_NORM, { name: 'Tesla xStock (test)', sector: 'XLY' }]]),
  );
});

afterAll(() => {
  _replaceXstockUniverse(originalUniverse);
});

function baseInput(symbol: string): any {
  return {
    symbol,
    mode: 'paper',
    strategy: 'vwap_pullback',
    signalId: 'sig_b4a_c1_test',
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    confidence: 0.8,
    riskScore: 0.5,
    profitRate: 0.1,
    finalScore: 0.7,
    quantity: 1,
    notional: 100,
    currentPrice: 100,
    skipSelfCheck: true, // skip the self-dedupe read (not under test)
    // NOTE: assetClass intentionally OMITTED — this is what exercises the resolve path.
  };
}

describe('P19-B4a C1 (A1.5) — queueSQESignal resolves asset_class from the symbol', () => {
  it('sanity: the seeded xStock symbol resolves to xstock_spot (registry membership)', () => {
    expect(resolveAssetClass(XSTOCK_NORM, 'kraken')).toBe('xstock_spot');
  });

  it('writes xstock_spot for an xStock symbol when assetClass is missing (not the old crypto_spot default)', async () => {
    capturedInsert = null;
    await readyToBuyService.queueSQESignal(baseInput(XSTOCK_RAW));

    expect(capturedInsert, 'upsertRtbSignal should have been called').toBeTruthy();
    expect(capturedInsert.assetClass).toBe('xstock_spot'); // first-class column — resolved, not defaulted
    expect(capturedInsert.metadata?.assetClass).toBe('xstock_spot'); // metadata mirror — same
  });

  it('writes crypto_spot for a crypto symbol when assetClass is missing (control)', async () => {
    capturedInsert = null;
    await readyToBuyService.queueSQESignal(baseInput('BTC/USD'));

    expect(capturedInsert).toBeTruthy();
    expect(capturedInsert.assetClass).toBe('crypto_spot');
  });
});
