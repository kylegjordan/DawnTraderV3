/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B65.1 — Module Constants Resolution Hierarchy Test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the most-specific-wins resolution logic in
 * `server/services/module-constants-service.ts` across the 4-dimension wildcard
 * hierarchy: (exchange, asset_class, strategy, regime).
 *
 * We test the resolution scoring directly (unit test on the pure logic) rather
 * than touching the DB — the service's DB call is a thin wrapper; the
 * interesting behavior is the in-memory scoring.
 *
 * Source: BATCH_65_SCOPE.md §4.2, MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md §3.3
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the DB layer so tests don't require a running Postgres. We inject rows
// by replacing what db.select() returns and then call the service normally.
const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockRows.current,
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  },
}));

import {
  getConstant,
  getModuleConstants,
  clearModuleConstantsCache,
  type ResolutionKey,
} from '../../services/module-constants-service.js';

const defaultKey: ResolutionKey = {
  exchange: 'kraken',
  assetClass: 'crypto_spot',
  strategy: 'strong_bull_trend',
  regime: 'TREND_FRIENDLY_STABLE',
};

function row(opts: {
  moduleName?: string;
  exchange?: string;
  assetClass?: string;
  strategy?: string;
  regime?: string;
  constantName?: string;
  value: unknown;
}) {
  return {
    moduleName: opts.moduleName ?? 'trailing_exit',
    exchange: opts.exchange ?? '*',
    assetClass: opts.assetClass ?? '*',
    strategy: opts.strategy ?? '*',
    regime: opts.regime ?? '*',
    constantName: opts.constantName ?? 'break_even_trigger_r',
    value: opts.value,
    updatedAt: new Date(),
    updatedBy: 'test',
  };
}

describe('B65.1 module_constants resolution hierarchy', () => {
  beforeEach(() => {
    clearModuleConstantsCache();
    mockRows.current = [];
  });

  it('returns global wildcard row when no more-specific row exists', async () => {
    mockRows.current = [row({ value: 1.0 })];
    const v = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);
    expect(v).toBe(1.0);
  });

  it('returns most-specific row when multiple compatible rows exist', async () => {
    mockRows.current = [
      row({ value: 1.0 }),                                    // global wildcard
      row({ exchange: 'kraken', value: 1.1 }),                // exchange-specific
      row({ exchange: 'kraken', assetClass: 'crypto_spot', value: 1.2 }), // more specific
      row({                                                    // most specific
        exchange: 'kraken',
        assetClass: 'crypto_spot',
        strategy: 'strong_bull_trend',
        regime: 'TREND_FRIENDLY_STABLE',
        value: 1.5,
      }),
    ];
    const v = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);
    expect(v).toBe(1.5);
  });

  it('rejects rows whose concrete dimension values do not match the key', async () => {
    mockRows.current = [
      row({ exchange: 'binance', value: 99 }),   // incompatible exchange
      row({ value: 1.0 }),                        // global wildcard — compatible
    ];
    const v = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);
    expect(v).toBe(1.0);
  });

  it('returns undefined when no row exists for the constant', async () => {
    mockRows.current = [row({ constantName: 'something_else', value: 99 })];
    const v = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);
    expect(v).toBeUndefined();
  });

  it('strategy-specific row beats exchange-specific row (strategy weighted higher)', async () => {
    mockRows.current = [
      row({ exchange: 'kraken', value: 10 }),          // exchange-specific, score 1
      row({ strategy: 'strong_bull_trend', value: 20 }), // strategy-specific, score 4
    ];
    const v = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);
    expect(v).toBe(20);
  });

  it('regime-specific row beats strategy-specific row (regime weighted highest)', async () => {
    mockRows.current = [
      row({ strategy: 'strong_bull_trend', value: 20 }),               // score 4
      row({ regime: 'TREND_FRIENDLY_STABLE', value: 40 }),             // score 8
    ];
    const v = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);
    expect(v).toBe(40);
  });

  it('getModuleConstants returns a map of { constantName → best value }', async () => {
    mockRows.current = [
      row({ constantName: 'break_even_trigger_r', value: 1.0 }),
      row({ constantName: 'target_lock_r', value: 1.5 }),
      row({ constantName: 'trail_distance_atr_multiplier', value: 1.0 }),
      row({ constantName: 'persistence_debounce_ms', value: 5000 }),
    ];
    const bundle = await getModuleConstants('trailing_exit', defaultKey);
    expect(bundle).toEqual({
      break_even_trigger_r: 1.0,
      target_lock_r: 1.5,
      trail_distance_atr_multiplier: 1.0,
      persistence_debounce_ms: 5000,
    });
  });

  it('caches module load within the 60s TTL (same row set returned without re-reading DB)', async () => {
    mockRows.current = [row({ value: 1.0 })];
    const v1 = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);

    // Change the mock rows; without cache, second read would see 2.0
    mockRows.current = [row({ value: 2.0 })];
    const v2 = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);

    expect(v1).toBe(1.0);
    expect(v2).toBe(1.0); // served from cache, not the new mock rows
  });

  it('invalidateModuleCache forces reload from DB', async () => {
    const { invalidateModuleCache } = await import('../../services/module-constants-service.js');

    mockRows.current = [row({ value: 1.0 })];
    const v1 = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);

    mockRows.current = [row({ value: 2.0 })];
    invalidateModuleCache('trailing_exit');
    const v2 = await getConstant<number>('trailing_exit', 'break_even_trigger_r', defaultKey);

    expect(v1).toBe(1.0);
    expect(v2).toBe(2.0);
  });
});
