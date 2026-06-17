/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4a — C1 (stamp-at-source): RTB writes the PIPE-STAMPED asset_class, never re-derives
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Stamp-at-source (Kyle directive 2026-06-14, Langston-approved — revises Probe-8): the
 * asset class is stamped at the per-pipe dispatch chokepoint (xStock scanner → xstock_spot,
 * FX5 scanner → crypto_spot) and carried as a REQUIRED field; downstream READS it and never
 * re-derives from the symbol. Re-deriving via resolveAssetClass is wrong-by-construction for
 * the collision-set tickers (exist as BOTH an xStock AND a Kraken crypto with identical
 * canonical form — the symbol alone can't disambiguate, only the pipe can).
 *
 * `queueSQESignal` therefore writes `input.assetClass` to BOTH the metadata mirror and the
 * first-class column, and THROWS (Langston Q4 backstop) if it is missing — an `as any` /
 * JSON-boundary / future-caller bypass that defeated the required-field type. The
 * `[B79.0n.RTB][QUEUE_FALLBACK]` warn stays as the zero-target tripwire for the A4 gate.
 *
 * The decisive regression-lock is the collision test: SUI/USD stamped via the xStock pipe
 * lands xstock_spot, via the crypto pipe lands crypto_spot — same symbol, two pipes, two
 * correct classes. This test COULD NOT pass under resolve-from-symbol (which forces SUI to
 * crypto_spot every time).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

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
    // P19-B6.5b (F1b): queueSQESignal now reads system context for the per-class admission gate.
    // These stamp-honoring tests exercise legitimately-active classes, so return both ON — the
    // guard passes and the stamp-honoring assertions run unchanged (the gate itself is tested in
    // p19-b6-5b-crypto-isolation.test.ts).
    getSystemContext: async () => ({ isEngineActive: true, activeAssetClasses: { crypto_spot: true, xstock_spot: true } }),
    upsertRtbSignal: async (data: any) => {
      capturedInsert = data;
      return { id: 1, ...data };
    },
  },
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service.js';
import { resolveAssetClass } from '../../../shared/asset-classes.js';

function baseInput(symbol: string, assetClass: any): any {
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
    assetClass, // the pipe-stamped class (or undefined to exercise the fail-loud backstop)
  };
}

describe('P19-B4a C1 (stamp-at-source) — queueSQESignal honors the pipe-stamped asset_class', () => {
  it('writes the stamped xstock_spot to column + metadata mirror', async () => {
    capturedInsert = null;
    await readyToBuyService.queueSQESignal(baseInput('TSLA/USD', 'xstock_spot'));
    expect(capturedInsert, 'upsertRtbSignal should have been called').toBeTruthy();
    expect(capturedInsert.assetClass).toBe('xstock_spot');
    expect(capturedInsert.metadata?.assetClass).toBe('xstock_spot');
  });

  it('writes the stamped crypto_spot (control)', async () => {
    capturedInsert = null;
    await readyToBuyService.queueSQESignal(baseInput('BTC/USD', 'crypto_spot'));
    expect(capturedInsert.assetClass).toBe('crypto_spot');
  });

  it('COLLISION regression-lock: SUI/USD honors the PIPE stamp over the symbol (both pipes)', async () => {
    // The symbol alone forces crypto_spot (SUI is a Kraken crypto / collision ticker)...
    expect(resolveAssetClass('SUI/USD', 'kraken')).toBe('crypto_spot');

    // ...but stamped via the xStock pipe, the write must land xstock_spot.
    capturedInsert = null;
    await readyToBuyService.queueSQESignal(baseInput('SUI/USD', 'xstock_spot'));
    expect(capturedInsert.assetClass).toBe('xstock_spot');

    // ...and via the crypto pipe, crypto_spot. Same symbol, two pipes, two correct classes.
    capturedInsert = null;
    await readyToBuyService.queueSQESignal(baseInput('SUI/USD', 'crypto_spot'));
    expect(capturedInsert.assetClass).toBe('crypto_spot');
  });

  it('FAIL-LOUD: a missing stamp throws (backstop), never a silent crypto_spot default', async () => {
    await expect(
      readyToBuyService.queueSQESignal(baseInput('TSLA/USD', undefined)),
    ).rejects.toThrow(/STAMP_MISSING/);
  });
});
