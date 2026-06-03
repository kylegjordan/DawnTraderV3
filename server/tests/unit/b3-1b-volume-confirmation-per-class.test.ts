/**
 * B3.1b — per-class volume-confirmation toggle resolution test.
 *
 * Verifies the `volume_confirmation_enabled` flag added by B3.1b resolves to the
 * correct value per asset class through the existing module-constants resolver,
 * and that the bypass expression used in every detect() — `(c['volume_confirmation_enabled'] ?? 1) !== 0`
 * — yields gate-ACTIVE for crypto and gate-BYPASSED for xstock_spot, with a safe
 * ENABLED default when the row is absent (preserves prior behavior).
 *
 * Mocks the DB layer (no Postgres needed), mirroring b65-module-constants-resolution.test.ts.
 */

process.env.COINGECKO_API_TIER = process.env.COINGECKO_API_TIER ?? 'demo';

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  },
}));

import {
  prefetchModule,
  getCachedNumbersForModule,
  clearModuleConstantsCache,
} from '../../services/module-constants-service.js';

const MODULE = 'strategy.breakout';

function flagRow(assetClass: string, value: number) {
  return {
    moduleName: MODULE, exchange: '*', assetClass, strategy: '*', regime: '*',
    constantName: 'volume_confirmation_enabled', value, updatedAt: new Date(), updatedBy: 'test',
  };
}
function key(assetClass: string) {
  return { exchange: '*', assetClass, strategy: 'breakout', regime: '*' };
}
// The exact expression used in every B3.1b-edited detect():
const gateActive = (c: Record<string, number>) => (c['volume_confirmation_enabled'] ?? 1) !== 0;

describe('B3.1b — per-class volume_confirmation_enabled', () => {
  beforeEach(() => clearModuleConstantsCache());

  it('resolves 1 (enabled) for crypto and 0 (disabled) for xstock_spot', async () => {
    mockRows.current = [flagRow('*', 1), flagRow('xstock_spot', 0)];
    await prefetchModule(MODULE);

    const crypto = getCachedNumbersForModule(MODULE, key('crypto_spot'));
    const xstock = getCachedNumbersForModule(MODULE, key('xstock_spot'));

    expect(crypto['volume_confirmation_enabled']).toBe(1);
    expect(xstock['volume_confirmation_enabled']).toBe(0);

    // Bypass semantics: crypto keeps the gate, xStock bypasses it.
    expect(gateActive(crypto)).toBe(true);
    expect(gateActive(xstock)).toBe(false);
  });

  it('defaults to ENABLED when no flag row is seeded (preserves prior behavior)', async () => {
    mockRows.current = []; // no volume_confirmation_enabled rows at all
    await prefetchModule(MODULE);

    const c = getCachedNumbersForModule(MODULE, key('crypto_spot'));
    expect(c['volume_confirmation_enabled']).toBeUndefined();
    expect(gateActive(c)).toBe(true); // absent → enabled (no silent behavior change)
  });

  it('does NOT bypass crypto when only the xstock_spot override exists', async () => {
    mockRows.current = [flagRow('*', 1), flagRow('xstock_spot', 0)];
    await prefetchModule(MODULE);
    const cryptoPerp = getCachedNumbersForModule(MODULE, key('crypto_perp'));
    expect(gateActive(cryptoPerp)).toBe(true); // falls through to global *=1
  });
});
