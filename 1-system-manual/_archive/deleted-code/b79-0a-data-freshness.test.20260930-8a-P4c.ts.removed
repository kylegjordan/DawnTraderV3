/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0a — Data freshness helper unit tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies isPairDataFresh:
 *   - Per-class window resolved from module_constants
 *   - Stale (now - lastTick > window) returns false
 *   - lastTick=0 returns false
 *   - No-window-configured returns true (Infinity sentinel)
 *
 * B-NEW-34 (2026-05-15) removed the closed-market xstock_spot short-circuit
 * branch from the helper alongside the xstock scanner's switch to OHLC-history
 * gating. The corresponding "closed-market returns true" test case is therefore
 * removed; the isXstockMarketOpenUTC mock and dependency are no longer needed.
 * Generic per-class window resolution semantics (the tests that remain) are
 * unchanged and continue to provide regression coverage for the helper itself.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
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
