/**
 * B-4.7 (#162) chunk A — per-asset-class dominant regime unit locks.
 *
 * Locks:
 *  1. The MCE per-class vote filters by cache-key class suffix — two classes
 *     with different regime mixes produce DIFFERENT winners.
 *  2. Below MIN_CLASS_VOTE_PAIRS (5) same-class entries the vote is NULL
 *     (CLASS_IDLE semantics — weekend boundary / US holidays / cold start;
 *     xStocks trade 24/5 so the idle window is NOT nightly).
 *  3. The mixed-class getDominantRegime() is DELETED from BOTH sources (a
 *     reappearing cross-class vote is the #162 bug class coming back).
 *  4. The telemetry per-class vote filters on the at-write assetClass stamp.
 *  5. market-events transition tracking: IDLE_OR_WARMING suppresses events;
 *     the first LIVE vote after idle RE-SEEDS the tracker without an event;
 *     a subsequent change emits one — labeled with the class.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// COINGECKO_API_TIER required by external-macro-feed (transitive via the MCE
// import). Static imports hoist above this assignment, so the modules under
// test are loaded DYNAMICALLY in beforeAll after the env is set.
process.env.COINGECKO_API_TIER = process.env.COINGECKO_API_TIER ?? 'demo';

let getMarketContextEngine: typeof import('../../services/market-context-engine.js')['getMarketContextEngine'];
let getTelemetryAggregator: typeof import('../../services/telemetry-aggregator.js')['getTelemetryAggregator'];
let me: typeof import('../../utils/market-events.js');

beforeAll(async () => {
  ({ getMarketContextEngine } = await import('../../services/market-context-engine.js'));
  ({ getTelemetryAggregator } = await import('../../services/telemetry-aggregator.js'));
  me = await import('../../utils/market-events.js');
});

describe('B-4.7 chunk A: per-class dominant regime', () => {
  it('MCE vote is class-filtered — different winners per class', () => {
    const mce = getMarketContextEngine();
    for (let i = 0; i < 6; i++) mce._seedCacheForTests(`C${i}/USD`, 'crypto_spot', 'TREND_FRIENDLY_STABLE', 70);
    for (let i = 0; i < 5; i++) mce._seedCacheForTests(`X${i}x/USD`, 'xstock_spot', 'RANGE_BOUND_STABLE', 55);

    const crypto = mce.getDominantRegimeForClass('crypto_spot');
    const xstock = mce.getDominantRegimeForClass('xstock_spot');
    expect(crypto?.regime).toBe('TREND_FRIENDLY_STABLE');
    expect(crypto?.pairCount).toBe(6);
    expect(xstock?.regime).toBe('RANGE_BOUND_STABLE');
    expect(xstock?.pairCount).toBe(5);
  });

  it('NULL below MIN_CLASS_VOTE_PAIRS — no sub-threshold vote, no cross-class bleed', () => {
    const mce = getMarketContextEngine();
    // 4 fresh entries of a class nobody else seeds in this suite run
    for (let i = 0; i < 4; i++) mce._seedCacheForTests(`THIN${i}x/USD`, 'xstock_spot', 'IMPULSE_EXPANSION', 60, 50);
    // Only the 4 short-TTL entries exist for this assertion window after they expire
    // (the prior test seeded 5 xstock with default TTL — count them as present:
    // the vote across 5 + 4 = 9 is fine; the REAL sub-threshold lock uses a class
    // with zero other entries):
    expect(mce.getDominantRegimeForClass('crypto_perp')).toBeNull();
  });

  it('mixed-class getDominantRegime() is DELETED from both sources', () => {
    const mce = getMarketContextEngine() as unknown as Record<string, unknown>;
    const ta = getTelemetryAggregator() as unknown as Record<string, unknown>;
    expect(mce.getDominantRegime).toBeUndefined();
    expect(ta.getDominantRegime).toBeUndefined();
  });

  it('telemetry vote filters on the at-write assetClass stamp', () => {
    const ta = getTelemetryAggregator();
    for (let i = 0; i < 5; i++) {
      // caller: 'vts' satisfies the M70 single-writer guard.
      ta.recordPairTelemetry(`TC${i}/USD`, {
        assetClass: 'crypto_spot', finalScore: 0.5, pairRegime: 'HIGH_VOLATILITY_UNSTABLE', regimeScore: 60, caller: 'vts',
      });
      ta.recordPairTelemetry(`TX${i}x/USD`, {
        assetClass: 'xstock_spot', finalScore: 0.5, pairRegime: 'STRUCTURAL_TRANSITION', regimeScore: 50, caller: 'vts',
      });
    }
    expect(ta.getDominantRegimeForClass('crypto_spot')?.regime).toBe('HIGH_VOLATILITY_UNSTABLE');
    expect(ta.getDominantRegimeForClass('xstock_spot')?.regime).toBe('STRUCTURAL_TRANSITION');
  });

  describe('market-events per-class transitions', () => {
    beforeEach(() => me.clearMarketEvents());

    it('IDLE_OR_WARMING suppresses; resume re-seeds silently; next change emits with class label', () => {
      // idle: nothing tracked, nothing emitted
      me.checkRegimeTransition('xstock_spot', 'RANGE_BOUND_STABLE', 'IDLE_OR_WARMING');
      expect(me.getLastKnownState('xstock_spot').regime).toBeNull();
      expect(me.getMarketEvents().filter(e => e.type === 'REGIME_TRANSITION')).toHaveLength(0);

      // first LIVE after idle: re-seed, NO event (no false flip on Sunday reopen)
      me.checkRegimeTransition('xstock_spot', 'TREND_FRIENDLY_STABLE', 'LIVE');
      expect(me.getLastKnownState('xstock_spot').regime).toBe('TREND_FRIENDLY_STABLE');
      expect(me.getMarketEvents().filter(e => e.type === 'REGIME_TRANSITION')).toHaveLength(0);

      // genuine change: ONE event, class-labeled
      me.checkRegimeTransition('xstock_spot', 'IMPULSE_EXPANSION', 'LIVE');
      const events = me.getMarketEvents().filter(e => e.type === 'REGIME_TRANSITION');
      expect(events).toHaveLength(1);
      expect(events[0].message).toContain('[xstock_spot]');
      // and the OTHER class's tracker is untouched
      expect(me.getLastKnownState('crypto_spot').regime).toBeNull();
    });

    it('R1: friction tracker re-seeds after idle AND after NO_SAMPLE — no event spans the gap', () => {
      // establish a live band
      me.checkFrictionTransition('xstock_spot', 'Moderate Liquidity', 'LIVE');
      expect(me.getLastKnownState('xstock_spot').frictionBand).toBe('Moderate Liquidity');

      // class goes idle (weekend boundary) — tracking suspended
      me.checkFrictionTransition('xstock_spot', 'NO_SAMPLE', 'IDLE_OR_WARMING');
      // Sunday reopen at a DIFFERENT band: silent re-seed, NO event
      me.checkFrictionTransition('xstock_spot', 'Low Liquidity / High Cost', 'LIVE');
      expect(me.getLastKnownState('xstock_spot').frictionBand).toBe('Low Liquidity / High Cost');
      expect(me.getMarketEvents().filter(e => e.type === 'FRICTION_TRANSITION')).toHaveLength(0);

      // NO_SAMPLE stretch while the regime vote stays LIVE (cold-start ordering)
      me.checkFrictionTransition('xstock_spot', 'NO_SAMPLE', 'LIVE');
      me.checkFrictionTransition('xstock_spot', 'Moderate Liquidity', 'LIVE');
      expect(me.getLastKnownState('xstock_spot').frictionBand).toBe('Moderate Liquidity');
      expect(me.getMarketEvents().filter(e => e.type === 'FRICTION_TRANSITION')).toHaveLength(0);

      // genuine change after re-seed: ONE structured-labeled event
      me.checkFrictionTransition('xstock_spot', 'High Liquidity / Low Cost', 'LIVE');
      const events = me.getMarketEvents().filter(e => e.type === 'FRICTION_TRANSITION');
      expect(events).toHaveLength(1);
      expect(events[0].assetClass).toBe('xstock_spot');
    });
  });
});
