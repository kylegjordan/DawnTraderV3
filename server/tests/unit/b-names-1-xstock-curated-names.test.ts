/**
 * B-NAMES.1 (#298 xStock half, 2026-06-15) — curated xStock name map integrity.
 *
 * The whole point of B-NAMES.1 is that an xStock name is EITHER a real name OR
 * null (hidden), NEVER a ticker-echo. The curated static map is the one place a
 * careless future edit could reintroduce an echo, so we structurally guard it:
 * no entry's name may equal its base ticker.
 */
import { describe, it, expect } from 'vitest';
import { CURATED_XSTOCK_NAMES } from '../../../shared/asset-classes.js';

describe('B-NAMES.1 CURATED_XSTOCK_NAMES integrity', () => {
  it('no entry is a ticker-echo (name !== base ticker)', () => {
    const echoes: string[] = [];
    for (const [pair, name] of Object.entries(CURATED_XSTOCK_NAMES)) {
      const base = pair.split('/')[0]?.toUpperCase() ?? '';
      if (name.trim().toUpperCase() === base) echoes.push(pair);
    }
    expect(echoes).toEqual([]);
  });

  it('every key is a canonical BASE/USD pair and every value is a non-empty name', () => {
    for (const [pair, name] of Object.entries(CURATED_XSTOCK_NAMES)) {
      expect(pair).toMatch(/^[A-Z0-9]+\/USD$/);
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it('carries the vetted names for the symbols Kyle flagged / Step-8 surfaced', () => {
    expect(CURATED_XSTOCK_NAMES['PALL/USD']).toBe('abrdn Physical Palladium Shares ETF');
    expect(CURATED_XSTOCK_NAMES['SPY/USD']).toBe('SPDR S&P 500 ETF Trust');
    expect(CURATED_XSTOCK_NAMES['QQQ/USD']).toBe('Invesco QQQ Trust');
    expect(CURATED_XSTOCK_NAMES['TBLL/USD']).toBe('Invesco Short Term Treasury ETF');
    expect(CURATED_XSTOCK_NAMES['TOTL/USD']).toBe('SPDR DoubleLine Total Return Tactical ETF');
  });
});
