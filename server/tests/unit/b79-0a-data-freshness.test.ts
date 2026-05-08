/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0a — Data freshness helper unit tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies isPairDataFresh:
 *   - Closed-market xstock_spot returns true (Langston Q2 lock)
 *   - Per-class window resolved from module_constants
 *   - Stale (now - lastTick > window) returns false
 *   - lastTick=0 returns false
 *   - No-window-configured returns true (Infinity sentinel)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
}));

// Mock isXstockMarketOpenUTC so we can flip it.
const marketOpenMock = { value: true };
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockMarketOpenUTC: () => marketOpenMock.value,
}));

import { isPairDataFresh, _testClearFreshnessCache } from '../../utils/data-freshness.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';

const baseRow = {
  moduleName: 'market_data',
  exchange: '*',
  strategy: '*',
  regime: '*',
  updatedAt: new Date(),
  updatedBy: 'test',
};

describe('B79.0a — isPairDataFresh', () => {
  beforeEach(() => {
    clearModuleConstantsCache();
    _testClearFreshnessCache();
    marketOpenMock.value = true;
  });

  it('xstock_spot during market-closed returns true (Langston Q2 belt-and-suspenders)', async () => {
    marketOpenMock.value = false;
    mockRows.current = [
      { ...baseRow, assetClass: 'xstock_spot', constantName: 'data_freshness_window_ms', value: 90000 },
    ];
    // Even with a stale-as-hell timestamp, closed-market wins
    const fresh = await isPairDataFresh('AAPL/USD', 'xstock_spot', 0, Date.now());
    expect(fresh).toBe(true);
  });

  it('xstock_spot during market-open + within window returns true', async () => {
    mockRows.current = [
      { ...baseRow, assetClass: 'xstock_spot', constantName: 'data_freshness_window_ms', value: 90000 },
    ];
    const now = 1_000_000;
    const lastTick = now - 30_000; // 30s old, well under 90s window
    const fresh = await isPairDataFresh('AAPL/USD', 'xstock_spot', lastTick, now);
    expect(fresh).toBe(true);
  });

  it('xstock_spot during market-open + outside window returns false', async () => {
    mockRows.current = [
      { ...baseRow, assetClass: 'xstock_spot', constantName: 'data_freshness_window_ms', value: 90000 },
    ];
    const now = 1_000_000;
    const lastTick = now - 150_000; // 150s old, > 90s window
    const fresh = await isPairDataFresh('AAPL/USD', 'xstock_spot', lastTick, now);
    expect(fresh).toBe(false);
  });

  it('lastTick=0 (never seen tick) returns false', async () => {
    mockRows.current = [
      { ...baseRow, assetClass: 'xstock_spot', constantName: 'data_freshness_window_ms', value: 90000 },
    ];
    const fresh = await isPairDataFresh('UNKNOWN/USD', 'xstock_spot', 0, 1_000_000);
    expect(fresh).toBe(false);
  });

  it('crypto_spot with no row configured returns true (Infinity sentinel)', async () => {
    mockRows.current = []; // no rows at all
    const fresh = await isPairDataFresh('BTC/USD', 'crypto_spot', 0, 1_000_000);
    expect(fresh).toBe(true);
  });
});
