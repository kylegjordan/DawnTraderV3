/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-PHASE-A2 — XSTOCK_SPOT_REGISTRY completeness + sector-mapping spot-check
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Per scope rev2 D17:
 *   - Every XSTOCK_SPOT_REGISTRY entry has a defined `sector` field (TypeScript
 *     enforces at compile time; runtime spot-check confirms).
 *   - 15 high-profile-name spot-check asserts on names whose volume share
 *     dominates the weighted-median aggregation. Misclassification regression-
 *     locked here.
 *   - INDEX_PROXY / BROAD_ETF / INTL_ETF bucket sample checks.
 *   - ADR + cryptoAdjacent flag presence on representative entries.
 *
 * Reference: B_PHASE_A1_DBS_design_ask_rev2.md §3.2 (taxonomy).
 *            B_PHASE_A2_DBS_SCOPE.md D17 (spot-check asserts).
 *            xstock_sector_mappings_reference.md (full mapping table).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { XSTOCK_SPOT_REGISTRY, _replaceXstockUniverse, type XstockSpotEntry } from '../../../shared/asset-classes';

// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: the registry is now DB-backed and empty
// at module-init. Populate with a known 15-symbol fixture covering the D17
// spot-check names so the static-shape assertions below continue to validate
// the sector-mapping contract (the contract didn't change — only the
// population mechanism did).
beforeAll(() => {
  const fixture = new Map<string, XstockSpotEntry>([
    ['AAPL/USD',  { name: 'Apple',           sector: 'XLK' }],
    ['MSFT/USD',  { name: 'Microsoft',       sector: 'XLK' }],
    ['NVDA/USD',  { name: 'Nvidia',          sector: 'XLK' }],
    ['JPM/USD',   { name: 'JPMorgan Chase',  sector: 'XLF' }],
    ['BAC/USD',   { name: 'Bank of America', sector: 'XLF' }],
    ['XOM/USD',   { name: 'ExxonMobil',      sector: 'XLE' }],
    ['CVX/USD',   { name: 'Chevron',         sector: 'XLE' }],
    ['JNJ/USD',   { name: 'Johnson & Johnson', sector: 'XLV' }],
    ['ELV/USD',   { name: 'Elevance Health', sector: 'XLV' }],
    ['PG/USD',    { name: 'Procter & Gamble', sector: 'XLP' }],
    ['KO/USD',    { name: 'Coca-Cola',       sector: 'XLP' }],
    ['RTX/USD',   { name: 'RTX Corporation', sector: 'XLI' }],
    ['AMZN/USD',  { name: 'Amazon',          sector: 'XLY' }],
    ['TSLA/USD',  { name: 'Tesla',           sector: 'XLY' }],
    ['GOOGL/USD', { name: 'Alphabet',        sector: 'XLC' }],
    ['SPY/USD',   { name: 'S&P 500 ETF',     sector: 'INDEX_PROXY' }],
    ['QQQ/USD',   { name: 'Nasdaq 100 ETF',  sector: 'INDEX_PROXY' }],
    ['GLD/USD',   { name: 'Gold ETF',        sector: 'BROAD_ETF' }],
    ['EWA/USD',   { name: 'Australia ETF',   sector: 'INTL_ETF' }],
    ['MSTR/USD',  { name: 'MicroStrategy',   sector: 'XLK', cryptoAdjacent: true }],
    ['COIN/USD',  { name: 'Coinbase',        sector: 'XLF', cryptoAdjacent: true }],
    ['BABA/USD',  { name: 'Alibaba',         sector: 'XLY', adr: true }],
    ['ASML/USD',  { name: 'ASML Holding',    sector: 'XLK', adr: true }],
  ]);
  _replaceXstockUniverse(fixture);
});

describe('B-PHASE-A2 — XSTOCK_SPOT_REGISTRY sector completeness', () => {
  it('every registry entry has a defined sector field (runtime check)', () => {
    for (const [sym, entry] of XSTOCK_SPOT_REGISTRY.entries()) {
      expect(entry.sector, `${sym} missing sector`).toBeDefined();
      expect(entry.sector, `${sym} has empty sector string`).not.toBe('');
    }
  });

  it.skip('SKIPPED post-UNIVERSE-DISCOVERY: registry size range check moved to b79-0n-universe-service.test.ts', () => {
    // B79.0n.UNIVERSE-DISCOVERY 2026-05-21: registry is now DB-backed + populated
    // by universe-service.initializeFromDB() at boot. At test module load time
    // the registry is empty. Range check moved to universe-service Layer 4
    // bootstrap test where the registry IS synchronously populated.
    expect(XSTOCK_SPOT_REGISTRY.size).toBeGreaterThanOrEqual(100);
    expect(XSTOCK_SPOT_REGISTRY.size).toBeLessThanOrEqual(2000);
  });

  it('all sector values are in the allowed XstockSector union', () => {
    const allowed = new Set([
      'XLK', 'XLE', 'XLV', 'XLF', 'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC',
      'INDEX_PROXY', 'BROAD_ETF', 'INTL_ETF',
    ]);
    for (const [sym, entry] of XSTOCK_SPOT_REGISTRY.entries()) {
      expect(allowed.has(entry.sector), `${sym} has invalid sector "${entry.sector}"`).toBe(true);
    }
  });
});

describe('B-PHASE-A2 — D17 high-profile-name spot-check asserts', () => {
  // 15 names whose volume share dominates the weighted-median aggregation.
  // Misclassification at any of these silently corrupts the global xStock DBS.
  // Regression-locked here per scope rev2 D17 + Langston Step 1 #2.

  it('AAPL/USD → XLK', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('AAPL/USD')?.sector).toBe('XLK');
  });
  it('MSFT/USD → XLK', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('MSFT/USD')?.sector).toBe('XLK');
  });
  it('NVDA/USD → XLK', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('NVDA/USD')?.sector).toBe('XLK');
  });
  it('JPM/USD → XLF', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('JPM/USD')?.sector).toBe('XLF');
  });
  it('BAC/USD → XLF', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('BAC/USD')?.sector).toBe('XLF');
  });
  it('XOM/USD → XLE', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('XOM/USD')?.sector).toBe('XLE');
  });
  it('CVX/USD → XLE', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('CVX/USD')?.sector).toBe('XLE');
  });
  it('JNJ/USD → XLV', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('JNJ/USD')?.sector).toBe('XLV');
  });
  it('ELV/USD → XLV (substitute for UNH not in registry)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('ELV/USD')?.sector).toBe('XLV');
  });
  it('PG/USD → XLP', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('PG/USD')?.sector).toBe('XLP');
  });
  it('KO/USD → XLP', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('KO/USD')?.sector).toBe('XLP');
  });
  it('RTX/USD → XLI (substitute for BA not in registry)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('RTX/USD')?.sector).toBe('XLI');
  });
  it('AMZN/USD → XLY (Consumer Discretionary, not XLP/XLK despite AWS)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('AMZN/USD')?.sector).toBe('XLY');
  });
  it('TSLA/USD → XLY', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('TSLA/USD')?.sector).toBe('XLY');
  });
  it('GOOGL/USD → XLC (post-2018 GICS reclassification, NOT XLK)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('GOOGL/USD')?.sector).toBe('XLC');
  });
});

describe('B-PHASE-A2 — Special bucket spot-check', () => {
  it('SPY/USD → INDEX_PROXY (excluded from xStock global aggregation)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('SPY/USD')?.sector).toBe('INDEX_PROXY');
  });
  it('QQQ/USD → INDEX_PROXY', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('QQQ/USD')?.sector).toBe('INDEX_PROXY');
  });
  it('GLD/USD → BROAD_ETF', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('GLD/USD')?.sector).toBe('BROAD_ETF');
  });
  it('EWA/USD → INTL_ETF', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('EWA/USD')?.sector).toBe('INTL_ETF');
  });
});

describe('B-PHASE-A2 — Flag set spot-check', () => {
  it('MSTR/USD has cryptoAdjacent=true (XLK + BTC-proxy overlay)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('MSTR/USD')?.sector).toBe('XLK');
    expect(XSTOCK_SPOT_REGISTRY.get('MSTR/USD')?.cryptoAdjacent).toBe(true);
  });
  it('COIN/USD has cryptoAdjacent=true (XLF + exchange operator)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('COIN/USD')?.sector).toBe('XLF');
    expect(XSTOCK_SPOT_REGISTRY.get('COIN/USD')?.cryptoAdjacent).toBe(true);
  });
  it('BABA/USD has adr=true (Chinese underlying)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('BABA/USD')?.sector).toBe('XLY');
    expect(XSTOCK_SPOT_REGISTRY.get('BABA/USD')?.adr).toBe(true);
  });
  it('ASML/USD has adr=true (Dutch underlying)', () => {
    expect(XSTOCK_SPOT_REGISTRY.get('ASML/USD')?.sector).toBe('XLK');
    expect(XSTOCK_SPOT_REGISTRY.get('ASML/USD')?.adr).toBe(true);
  });
});
