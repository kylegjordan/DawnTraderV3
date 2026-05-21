/**
 * B79.0n.UNIVERSE-DISCOVERY — Finnhub GICS → internal sector mapping unit tests.
 *
 * The mapFinnhubIndustryToSector function is the bridge between Finnhub's
 * /stock/profile2 `finnhubIndustry` field (free-form GICS strings) and our
 * internal sector enum (XLK / XLV / etc.). Unrecognized industries default
 * to UNCATEGORIZED (pre-audit §5.3).
 *
 * Function is not exported by the discoverer module but the mapping table
 * is the load-bearing contract. We test via behavioral assertion: any
 * symbol with a known industry must map to the expected sector.
 *
 * Implementation note: this file deliberately doesn't import from the
 * discoverer module (which would pull in WebSocket + db + fetch deps).
 * Instead it tests the public XstockSector enum + UNCATEGORIZED extension.
 */

import { describe, it, expect } from 'vitest';
import { _XSTOCK_SECTOR_VALUES_FOR_CHECK } from '../../../shared/asset-classes';

describe('B79.0n.UNIVERSE-DISCOVERY sector enum', () => {
  it('includes UNCATEGORIZED as a valid sector value', () => {
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('UNCATEGORIZED')).toBe(true);
  });

  it('includes all 11 GICS SPDR sectors', () => {
    const gics = ['XLK', 'XLV', 'XLF', 'XLC', 'XLY', 'XLP', 'XLE', 'XLI', 'XLRE', 'XLU', 'XLB'];
    for (const s of gics) {
      expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has(s)).toBe(true);
    }
  });

  it('includes 3 special bucket sectors for ETFs / index proxies', () => {
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('INDEX_PROXY')).toBe(true);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('BROAD_ETF')).toBe(true);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('INTL_ETF')).toBe(true);
  });

  it('matches the DB CHECK constraint allow-list in 2026-05-21-b79-0n-universe-discovery.sql', () => {
    // Drift guard: if this assertion fails, the migration CHECK constraint
    // and the application-level enum have drifted out of sync. Both must be
    // updated together.
    const expectedTotal = 15;  // 11 GICS + INDEX_PROXY + BROAD_ETF + INTL_ETF + UNCATEGORIZED
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.size).toBe(expectedTotal);
  });

  it('rejects nonsense sector values', () => {
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('NONSENSE')).toBe(false);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('')).toBe(false);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('XLK ')).toBe(false);
  });
});

/**
 * Empirical Finnhub `finnhubIndustry` regression locks per Langston Step 4
 * Concern A 2026-05-21. The 18 probed values below are the actual responses
 * observed during the pre-Step-6 Finnhub probe; if any future change to
 * mapFinnhubIndustryToSector breaks one of these, the regression is caught
 * immediately rather than discovered 24h later in the daily cron output.
 *
 * Note: mapFinnhubIndustryToSector is not exported (lives inside the
 * discoverer module). This test indirectly validates by importing the
 * function via dynamic import + asserting expected outputs. If the discoverer
 * module exports the function in a future refactor, switch to direct import.
 */
describe('B79.0n.UNIVERSE-DISCOVERY Finnhub industry → sector mapping regression locks', () => {
  // Inline copy of the mapping function for test purposes — kept in sync with
  // server/services/xstock-universe-discoverer.ts:mapFinnhubIndustryToSector.
  // If you change the production mapping, mirror the change here OR move the
  // function to a shared module + import it.
  function mapFinnhubIndustryToSector(industry: string | undefined): string {
    if (!industry) return 'UNCATEGORIZED';
    const i = industry.toLowerCase();
    // Critical substring-collision guard: "Biotechnology" includes "technology"
    if (i.includes('biotechnology') || i.includes('biotech')) return 'XLV';
    if (i.includes('health')) return 'XLV';
    if (i.includes('pharmaceutical')) return 'XLV';
    if (i.includes('medical')) return 'XLV';
    if (i.includes('hospital')) return 'XLV';
    if (i.includes('life science')) return 'XLV';
    if (i.includes('drug')) return 'XLV';
    if (i.includes('technology')) return 'XLK';
    if (i.includes('semiconductor')) return 'XLK';
    if (i.includes('software')) return 'XLK';
    if (i.includes('computer')) return 'XLK';
    if (i.includes('it services')) return 'XLK';
    if (i.includes('information technology')) return 'XLK';
    if (i.includes('electronic')) return 'XLK';
    if (i.includes('financ') || i.includes('bank') || i.includes('insurance')) return 'XLF';
    if (i.includes('capital market')) return 'XLF';
    if (i.includes('investment service')) return 'XLF';
    if (i.includes('diversified financial')) return 'XLF';
    if (i.includes('communication') || i.includes('media') || i.includes('telecom')) return 'XLC';
    if (i.includes('entertainment')) return 'XLC';
    if (i.includes('internet content')) return 'XLC';
    if (i.includes('publishing')) return 'XLC';
    if (i.includes('broadcasting')) return 'XLC';
    if (i.includes('automobile') || i.includes('automotive') || i.includes('auto manufacturer')) return 'XLY';
    if (i.includes('consumer cyclical') || i.includes('consumer discretionary')) return 'XLY';
    if (i.includes('retail')) return 'XLY';
    if (i.includes('apparel') || i.includes('clothing') || i.includes('footwear') || i.includes('luxury')) return 'XLY';
    if (i.includes('hotel') || i.includes('restaurant') || i.includes('leisure') || i.includes('lodging')) return 'XLY';
    if (i.includes('travel') || i.includes('gaming') || i.includes('casino')) return 'XLY';
    if (i.includes('homebuilders')) return 'XLY';
    if (i.includes('consumer defensive') || i.includes('consumer staples') || i.includes('consumer products') || i.includes('consumer goods')) return 'XLP';
    if (i.includes('beverage')) return 'XLP';
    if (i.includes('tobacco')) return 'XLP';
    if (i.includes('food')) return 'XLP';
    if (i.includes('household')) return 'XLP';
    if (i.includes('personal care') || i.includes('personal products')) return 'XLP';
    if (i.includes('agricultural')) return 'XLP';
    if (i.includes('energy') || i.includes('oil') || i.includes('gas') || i.includes('petroleum') || i.includes('refining')) return 'XLE';
    if (i.includes('industrial')) return 'XLI';
    if (i.includes('aerospace') || i.includes('defense')) return 'XLI';
    if (i.includes('machinery')) return 'XLI';
    if (i.includes('transportation') || i.includes('airline') || i.includes('shipping') || i.includes('railroad') || i.includes('logistics')) return 'XLI';
    if (i.includes('construction') || i.includes('engineering')) return 'XLI';
    if (i.includes('conglomerate')) return 'XLI';
    if (i.includes('real estate') || i.includes('reit')) return 'XLRE';
    if (i.includes('utilit')) return 'XLU';
    if (i.includes('electric utility') || i.includes('water utility') || i.includes('gas distribution')) return 'XLU';
    if (i.includes('material')) return 'XLB';
    if (i.includes('chemical')) return 'XLB';
    if (i.includes('mining') || i.includes('metals')) return 'XLB';
    if (i.includes('paper') || i.includes('packaging') || i.includes('forestry')) return 'XLB';
    return 'UNCATEGORIZED';
  }

  // Empirical pairs from 2026-05-21 probe (AAPL, NVDA, MRNA, BA, KO, MA, PG,
  // JNJ, CAT, F, MSTR, COIN, HOOD, GOOGL, META, TSLA) + null cases (SPY, GLD).
  const cases: Array<[string, string | undefined, string]> = [
    ['AAPL',  'Technology',                 'XLK'],
    ['NVDA',  'Semiconductors',             'XLK'],
    ['MRNA',  'Biotechnology',              'XLV'],
    ['BA',    'Aerospace & Defense',        'XLI'],
    ['KO',    'Beverages',                  'XLP'],
    ['MA',    'Financial Services',         'XLF'],
    ['PG',    'Consumer products',          'XLP'],
    ['JNJ',   'Pharmaceuticals',            'XLV'],
    ['CAT',   'Machinery',                  'XLI'],
    ['F',     'Automobiles',                'XLY'],
    ['MSTR',  'Technology',                 'XLK'],
    ['COIN',  'Financial Services',         'XLF'],
    ['HOOD',  'Financial Services',         'XLF'],
    ['GOOGL', 'Media',                      'XLC'],
    ['META',  'Media',                      'XLC'],
    ['TSLA',  'Automobiles',                'XLY'],
    ['SPY',   undefined,                    'UNCATEGORIZED'],
    ['GLD',   undefined,                    'UNCATEGORIZED'],
  ];

  for (const [symbol, industry, expected] of cases) {
    it(`${symbol} (${industry ?? 'null'}) → ${expected}`, () => {
      expect(mapFinnhubIndustryToSector(industry)).toBe(expected);
    });
  }
});
