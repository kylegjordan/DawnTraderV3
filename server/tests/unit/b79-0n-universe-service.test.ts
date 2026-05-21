/**
 * B79.0n.UNIVERSE-DISCOVERY — universe-service tests.
 *
 * Covers the in-memory accessor + 5-layer fallback chain behavior. DB read
 * is mocked at the drizzle layer; file-cache read is mocked at fs/promises.
 *
 * Layer ordering tested:
 *   1. Live discovery — not this module
 *   2. DB snapshot — initializeFromDB() → InitResult{ok, dbReachable, rowCount, source}
 *   3. File cache — loadFromFileCache()
 *   4. Bootstrap — loadBootstrap() (always succeeds; sync)
 *   5. Fail-fast — boot orchestrator's responsibility, not this module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UNIVERSE_BOOTSTRAP_SET } from '../../asset_classes/xstock_spot/universe-bootstrap';

vi.mock('../../db.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
}));

import { db } from '../../db';
import fs from 'fs/promises';
import { xstockUniverseService } from '../../asset_classes/xstock_spot/universe-service';
import { XSTOCK_SPOT_SYMBOLS, XSTOCK_SPOT_REGISTRY, _replaceXstockUniverse } from '../../../shared/asset-classes';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the in-memory universe to empty between tests
  _replaceXstockUniverse(new Map());
});

describe('B79.0n.UNIVERSE-DISCOVERY universe-service: Layer 2 (DB)', () => {
  it('initializeFromDB populates the in-memory registry from db.execute rows', async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        { symbol: 'AAPL/USD', name: 'Apple', sector: 'XLK', crypto_adjacent: false, adr: false, is_delisted: false },
        { symbol: 'TSLA/USD', name: 'Tesla', sector: 'XLY', crypto_adjacent: false, adr: false, is_delisted: false },
      ],
    });
    const result = await xstockUniverseService.initializeFromDB();
    expect(result.ok).toBe(true);
    expect(result.dbReachable).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(result.source).toBe('db');
    expect(XSTOCK_SPOT_SYMBOLS.has('AAPL/USD')).toBe(true);
    expect(XSTOCK_SPOT_SYMBOLS.has('TSLA/USD')).toBe(true);
    expect(XSTOCK_SPOT_REGISTRY.get('AAPL/USD')?.sector).toBe('XLK');
  });

  it('initializeFromDB DB-reachable-but-zero-rows distinction (Langston Q-PA-4)', async () => {
    (db.execute as any).mockResolvedValueOnce({ rows: [] });
    const result = await xstockUniverseService.initializeFromDB();
    expect(result.ok).toBe(true);
    expect(result.dbReachable).toBe(true);
    expect(result.rowCount).toBe(0);
    expect(XSTOCK_SPOT_SYMBOLS.size).toBe(0);
  });

  it('initializeFromDB DB-unreachable returns dbReachable=false', async () => {
    (db.execute as any).mockRejectedValueOnce(new Error('connection refused'));
    const result = await xstockUniverseService.initializeFromDB();
    expect(result.ok).toBe(false);
    expect(result.dbReachable).toBe(false);
    expect(result.error).toContain('connection refused');
  });

  it('initializeFromDB skips is_delisted=true rows', async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        { symbol: 'AAPL/USD', name: 'Apple', sector: 'XLK', crypto_adjacent: false, adr: false, is_delisted: false },
        { symbol: 'DEAD/USD', name: 'Deadname', sector: 'XLK', crypto_adjacent: false, adr: false, is_delisted: true },
      ],
    });
    const result = await xstockUniverseService.initializeFromDB();
    expect(result.ok).toBe(true);
    expect(XSTOCK_SPOT_SYMBOLS.has('AAPL/USD')).toBe(true);
    // is_delisted symbols are EXCLUDED from active in-memory universe
    expect(XSTOCK_SPOT_SYMBOLS.has('DEAD/USD')).toBe(false);
  });

  it('coerces unknown sector strings to UNCATEGORIZED', async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        { symbol: 'WEIRD/USD', name: 'Weird Co', sector: 'NONSENSE_SECTOR', crypto_adjacent: false, adr: false, is_delisted: false },
      ],
    });
    await xstockUniverseService.initializeFromDB();
    expect(XSTOCK_SPOT_REGISTRY.get('WEIRD/USD')?.sector).toBe('UNCATEGORIZED');
  });
});

describe('B79.0n.UNIVERSE-DISCOVERY universe-service: Layer 3 (file cache)', () => {
  it('loadFromFileCache populates from a valid JSON file', async () => {
    const cached = JSON.stringify([
      { symbol: 'AAPL/USD', name: 'Apple', sector: 'XLK', cryptoAdjacent: false, adr: false },
      { symbol: 'MSTR/USD', name: 'MicroStrategy', sector: 'XLK', cryptoAdjacent: true, adr: false },
    ]);
    (fs.readFile as any).mockResolvedValueOnce(cached);
    const ok = await xstockUniverseService.loadFromFileCache();
    expect(ok).toBe(true);
    expect(XSTOCK_SPOT_SYMBOLS.has('AAPL/USD')).toBe(true);
    expect(XSTOCK_SPOT_REGISTRY.get('MSTR/USD')?.cryptoAdjacent).toBe(true);
  });

  it('loadFromFileCache returns false on missing file', async () => {
    (fs.readFile as any).mockRejectedValueOnce(new Error('ENOENT'));
    const ok = await xstockUniverseService.loadFromFileCache();
    expect(ok).toBe(false);
  });

  it('loadFromFileCache returns false on empty array', async () => {
    (fs.readFile as any).mockResolvedValueOnce('[]');
    const ok = await xstockUniverseService.loadFromFileCache();
    expect(ok).toBe(false);
  });
});

describe('B79.0n.UNIVERSE-DISCOVERY universe-service: Layer 4 (bootstrap)', () => {
  it('loadBootstrap always succeeds with hardcoded mega-cap set', () => {
    const ok = xstockUniverseService.loadBootstrap();
    expect(ok).toBe(true);
    expect(XSTOCK_SPOT_SYMBOLS.size).toBe(UNIVERSE_BOOTSTRAP_SET.length);
    expect(XSTOCK_SPOT_SYMBOLS.has('AAPL/USD')).toBe(true);
    expect(XSTOCK_SPOT_SYMBOLS.has('SPY/USD')).toBe(true);
  });

  it('bootstrap set covers at least 5 distinct sectors', () => {
    xstockUniverseService.loadBootstrap();
    const sectors = new Set<string>();
    for (const entry of XSTOCK_SPOT_REGISTRY.values()) {
      sectors.add(entry.sector);
    }
    expect(sectors.size).toBeGreaterThanOrEqual(5);
  });
});

describe('B79.0n.UNIVERSE-DISCOVERY universe-service: cache state surface', () => {
  it('getCacheState reflects the most recent load source', async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [{ symbol: 'AAPL/USD', name: 'Apple', sector: 'XLK', crypto_adjacent: false, adr: false, is_delisted: false }],
    });
    await xstockUniverseService.initializeFromDB();
    expect(xstockUniverseService.getCacheState().source).toBe('db');

    xstockUniverseService.loadBootstrap();
    expect(xstockUniverseService.getCacheState().source).toBe('bootstrap');
  });
});
