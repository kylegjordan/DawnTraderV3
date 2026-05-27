/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — Per-class refresh cadence (T2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the boot-time contract that each active asset class has its own
 * rtb_config.refresh_interval_ms row resolvable via getCachedNumberRequired
 * with `assetClass=<cls>` (per Langston C-10 + Scope §6.1). Per-class cadence
 * keys MUST resolve independently — a missing row throws (HARD-FAIL boot per
 * R-3). The 4 active classes are crypto_spot / crypto_perp / xstock_spot /
 * xstock_perp.
 *
 * Note: this test exercises the module_constants resolver contract that
 * server/index.ts uses at boot. It does not start the actual refresh timer
 * (LOCKED module rtb-refresh-service.ts) — it validates the underlying
 * per-class cadence-config lookup that the boot enumeration depends on.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
}));

import {
  prefetchModule,
  getCachedNumberRequired,
  clearModuleConstantsCache,
} from '../../services/module-constants-service.js';

const wildcardBase = {
  moduleName: 'rtb_config',
  exchange: '*',
  strategy: '*',
  regime: '*',
  updatedAt: new Date(),
  updatedBy: 'test',
};

function seedAllFourClasses(values: Record<string, number> = {
  crypto_spot: 30000,
  crypto_perp: 30000,
  xstock_spot: 30000,
  xstock_perp: 30000,
}) {
  mockRows.current = Object.entries(values).map(([cls, ms]) => ({
    ...wildcardBase,
    assetClass: cls,
    constantName: 'refresh_interval_ms',
    value: ms,
  }));
}

describe('B79.0n.RTB — Per-class refresh cadence (T2)', () => {
  beforeEach(async () => {
    clearModuleConstantsCache();
    mockRows.current = [];
  });

  it('T2.1 — all 4 active classes resolve refresh_interval_ms independently', async () => {
    seedAllFourClasses();
    await prefetchModule('rtb_config');

    const classes = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'] as const;
    for (const cls of classes) {
      const ms = getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
        exchange: '*', assetClass: cls, strategy: '*', regime: '*',
      });
      expect(ms).toBe(30000);
    }
  });

  it('T2.2 — each class can carry a DISTINCT cadence value', async () => {
    seedAllFourClasses({
      crypto_spot: 30000,
      crypto_perp: 15000,
      xstock_spot: 60000,
      xstock_perp: 45000,
    });
    await prefetchModule('rtb_config');

    expect(getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
      exchange: '*', assetClass: 'crypto_spot', strategy: '*', regime: '*',
    })).toBe(30000);
    expect(getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
      exchange: '*', assetClass: 'crypto_perp', strategy: '*', regime: '*',
    })).toBe(15000);
    expect(getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
      exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*',
    })).toBe(60000);
    expect(getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
      exchange: '*', assetClass: 'xstock_perp', strategy: '*', regime: '*',
    })).toBe(45000);
  });

  it('T2.3 — missing per-class row throws (HARD-FAIL R-3 contract)', async () => {
    // Seed only 3 classes; xstock_perp missing.
    seedAllFourClasses();
    mockRows.current = mockRows.current.filter((r) => r.assetClass !== 'xstock_perp');
    await prefetchModule('rtb_config');

    expect(() =>
      getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
        exchange: '*', assetClass: 'xstock_perp', strategy: '*', regime: '*',
      })
    ).toThrow(/refresh_interval_ms/);
  });

  it('T2.4 — non-numeric row value throws (defensive type check)', async () => {
    mockRows.current = [{
      ...wildcardBase,
      assetClass: 'crypto_spot',
      constantName: 'refresh_interval_ms',
      value: 'thirty-thousand', // wrong type
    }];
    await prefetchModule('rtb_config');

    expect(() =>
      getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
        exchange: '*', assetClass: 'crypto_spot', strategy: '*', regime: '*',
      })
    ).toThrow(/expected number/);
  });
});
