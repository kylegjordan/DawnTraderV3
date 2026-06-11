/**
 * B-4.7 (#163) chunk B — per-class canonical map source locks.
 *
 * The map's single source of truth now materializes per-class trees from the
 * authored base + ASSET_CLASS_OVERRIDES (both living in the source module).
 * These locks pin the membership deltas and the helper split:
 *  1. xStock TFS gains orb (the hand-authored B79.0n.STRATEGY add) — crypto
 *     TFS does NOT have it.
 *  2. defensive_hedge (BTC-decorrelation hedge) is absent from xStock HVU,
 *     present in crypto HVU.
 *  3. orb is absent from STRUCTURAL_TRANSITION in BOTH classes, and from
 *     crypto IMPULSE_EXPANSION (per-class excludes).
 *  4. Regime metrics (riskMultiplier / minConfidence) are class-free and
 *     identical across the trees — read via the class-free helpers.
 *  5. strong_bull_trend is excluded from TFS in BOTH classes (shared exclude).
 */
import { describe, it, expect } from 'vitest';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  getStrategiesForRegime,
  getRegimeRiskMultiplier,
  getRegimeMinConfidence,
  isValidCanonicalCombination,
} from '../../config/canonical-regime-strategy-map.js';

const keys = (cls: 'crypto_spot' | 'xstock_spot', regime: any) =>
  getStrategiesForRegime(cls, regime).map(s => s.strategyKey);

describe('B-4.7 chunk B: per-class canonical map', () => {
  it('xStock TFS gains orb; crypto TFS does not have it', () => {
    expect(keys('xstock_spot', 'TREND_FRIENDLY_STABLE')).toContain('orb');
    expect(keys('crypto_spot', 'TREND_FRIENDLY_STABLE')).not.toContain('orb');
  });

  it('defensive_hedge absent from xStock HVU, present in crypto HVU', () => {
    expect(keys('crypto_spot', 'HIGH_VOLATILITY_UNSTABLE')).toContain('defensive_hedge');
    expect(keys('xstock_spot', 'HIGH_VOLATILITY_UNSTABLE')).not.toContain('defensive_hedge');
  });

  it('orb excluded from STRUCTURAL_TRANSITION (both) and crypto IMPULSE_EXPANSION', () => {
    expect(keys('crypto_spot', 'STRUCTURAL_TRANSITION')).not.toContain('orb');
    expect(keys('xstock_spot', 'STRUCTURAL_TRANSITION')).not.toContain('orb');
    expect(keys('crypto_spot', 'IMPULSE_EXPANSION')).not.toContain('orb');
    // and xStock IE keeps it (only strong_bull_trend excluded there)
    expect(keys('xstock_spot', 'IMPULSE_EXPANSION')).toContain('orb');
  });

  it('strong_bull_trend excluded from TFS in both classes (shared exclude)', () => {
    expect(keys('crypto_spot', 'TREND_FRIENDLY_STABLE')).not.toContain('strong_bull_trend');
    expect(keys('xstock_spot', 'TREND_FRIENDLY_STABLE')).not.toContain('strong_bull_trend');
  });

  it('regime metrics are class-free: identical across trees, helpers read the base', () => {
    for (const regime of Object.keys(CANONICAL_REGIME_STRATEGY_MAP.crypto_spot) as Array<keyof typeof CANONICAL_REGIME_STRATEGY_MAP.crypto_spot>) {
      const c = CANONICAL_REGIME_STRATEGY_MAP.crypto_spot[regime];
      const x = CANONICAL_REGIME_STRATEGY_MAP.xstock_spot[regime];
      expect(c.riskMultiplier).toBe(x.riskMultiplier);
      expect(c.minConfidence).toBe(x.minConfidence);
      expect(getRegimeRiskMultiplier(regime)).toBe(c.riskMultiplier);
      expect(getRegimeMinConfidence(regime)).toBe(c.minConfidence);
    }
  });

  it('isValidCanonicalCombination covers the UNION of class memberships', () => {
    // orb belongs to TFS in SOME class (xstock add) — identity over the union
    // accepts it; class ELIGIBILITY is enforced elsewhere (strategy_gates).
    // (Validating over the authored base would falsely reject this legitimate
    // xStock combination — the add lives only in the materialized tree.)
    const orbDef = getStrategiesForRegime('xstock_spot', 'TREND_FRIENDLY_STABLE').find(s => s.strategyKey === 'orb')!;
    expect(isValidCanonicalCombination('TREND_FRIENDLY_STABLE', 'orb', orbDef.signalType, orbDef.patternType).valid).toBe(true);
    // a crypto-TFS member validates too:
    const first = getStrategiesForRegime('crypto_spot', 'TREND_FRIENDLY_STABLE')[0];
    expect(isValidCanonicalCombination('TREND_FRIENDLY_STABLE', first.strategyKey, first.signalType, null).valid).toBe(true);
    // and a combination in NO class tree is rejected:
    expect(isValidCanonicalCombination('TREND_FRIENDLY_STABLE', 'defensive_hedge', 'QUANT', null).valid).toBe(false);
  });
});
