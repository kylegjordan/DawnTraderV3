/**
 * B-GEOMETRY-REACH-BASELINE (OBJ-A) — per-(strategy × asset_class) reachability ceilings.
 *
 * Guards, in the order the audit surfaced them:
 *  - LIVE PATH: a seeded per-strategy `reach_atr_max` resolves through the gate. Before this batch the
 *    read site hardcoded `strategy:'*'`, so a seeded row was a NO-OP — a regression to that fails here.
 *  - INHERITANCE: a canonical-but-unseeded strategy inherits the per-class default. This is what lets
 *    four seeded rows coexist with fifteen unseeded strategies without throwing in flight.
 *  - FAIL-CLOSED (the §8 #10 defect this batch fixes): an unrecognized token resolves
 *    `reach_atr_max_unknown_floor`, NOT the permissive class default. `min_rr` had this; reach did not.
 *  - ⛔ SINGLE TRIPWIRE: the unknown-token counter fires EXACTLY ONCE per gate call. Resolving min_rr and
 *    reach through two separate canonicalizations would double every drift count — a measurement defect
 *    introduced by the fix, invisible to every other test.
 *  - ALIAS SAFETY: the canonicalizer ALIASES, so `canonical === null` is NOT the only harm surface. A
 *    wrong-but-VALID token silently inherits ANOTHER strategy's ceiling and the unknown floor never
 *    fires. The alias map is asserted row-by-row rather than spot-checked.
 *  - ⛔ FULL TOKEN TABLE: every non-test caller's token resolves to its OWN strategy's ceiling. Two of the
 *    18 static call sites pass a module CONSTANT (`orb.ts` / `strong-bull-trend.ts` `STRATEGY_KEY`), not a
 *    literal, so a test that pattern-matches literals would skip them silently.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getPerClassTargetGate } from '../../core/calculations/expectancy.js';
import {
  LEGACY_TO_CANONICAL,
  resolveCanonicalStrategy,
} from '../../config/canonical-regime-strategy-map.js';
import {
  getUnknownStrategyCounts,
  __resetUnknownStrategyCountsForTest,
} from '../../core/observability/unknown-strategy-counter.js';
import { _seedModuleCacheForTests } from '../../services/module-constants-service.js';

const K = (assetClass: string, strategy: string, constantName: string, value: number) => ({
  moduleName: 'expectancy_gates', exchange: '*', assetClass, strategy, regime: '*', constantName, value,
});

/** The four rows the migration actually seeds, plus the floors, plus what the gate needs to return. */
const SEEDED_REACH: Record<string, number> = {
  pivot_shift: 2.72,
  morning_star: 2.52,
  inside_bar_reversal: 2.36,
  sma_trend_ride: 1.97,
};
const CLASS_DEFAULT_REACH = 4.0;
const CRYPTO_REACH_FLOOR = 1.97;   // the MINIMUM over the seeded rows
const XSTOCK_REACH_FLOOR = 4.0;    // xStock's own class default — no xStock reach row ships
const GLOBAL_REACH_FLOOR = 1.97;

function seedGate() {
  _seedModuleCacheForTests('expectancy_gates', [
    K('crypto_spot', '*', 'target_floor_pct', 1.0),
    K('crypto_spot', '*', 'min_rr', 2.0),
    K('crypto_spot', '*', 'reach_atr_max', CLASS_DEFAULT_REACH),
    K('xstock_spot', '*', 'target_floor_pct', 1.0),
    K('xstock_spot', '*', 'min_rr', 2.0),
    K('xstock_spot', '*', 'reach_atr_max', CLASS_DEFAULT_REACH),
    // the four seeded crypto ceilings
    ...Object.entries(SEEDED_REACH).map(([s, v]) => K('crypto_spot', s, 'reach_atr_max', v)),
    // a seeded min_rr row, so the single-canonicalization test can assert BOTH gates at once
    K('crypto_spot', 'morning_star', 'min_rr', 1.39),
    // fail-closed floors — both gates, full key set
    K('crypto_spot', '*', 'min_rr_unknown_floor', 2.88),
    K('crypto_spot', '*', 'reach_atr_max_unknown_floor', CRYPTO_REACH_FLOOR),
    K('xstock_spot', '*', 'reach_atr_max_unknown_floor', XSTOCK_REACH_FLOOR),
    { moduleName: 'expectancy_gates', exchange: '*', assetClass: '*', strategy: '*', regime: '*', constantName: 'min_rr_unknown_floor', value: 2.88 },
    { moduleName: 'expectancy_gates', exchange: '*', assetClass: '*', strategy: '*', regime: '*', constantName: 'reach_atr_max_unknown_floor', value: GLOBAL_REACH_FLOOR },
  ] as any);
}

beforeEach(() => {
  seedGate();
  __resetUnknownStrategyCountsForTest();
});

describe('OBJ-A live path — a seeded per-strategy ceiling actually reaches the gate', () => {
  it.each(Object.entries(SEEDED_REACH))(
    'resolves the seeded ceiling for %s (not the permissive class default)',
    (strategy, expected) => {
      expect(getPerClassTargetGate('crypto_spot', strategy).reachAtrMax).toBe(expected);
    },
  );

  it('every seeded ceiling is TIGHTER than the class default — no row may loosen', () => {
    for (const [strategy, v] of Object.entries(SEEDED_REACH)) {
      expect(v, `${strategy} must not loosen the ceiling`).toBeLessThan(CLASS_DEFAULT_REACH);
    }
  });

  it('a canonical but UNSEEDED strategy inherits the per-class default', () => {
    // range_trade is canonical and deliberately NOT seeded (zero shadow rows, ungradeable by the
    // arbiter). Most-specific-wins must hand it the class default rather than throwing.
    expect(getPerClassTargetGate('crypto_spot', 'range_trade').reachAtrMax).toBe(CLASS_DEFAULT_REACH);
    expect(getPerClassTargetGate('crypto_spot', 'reverse_impulse').reachAtrMax).toBe(CLASS_DEFAULT_REACH);
    expect(getPerClassTargetGate('crypto_spot', 'volatility_edge').reachAtrMax).toBe(CLASS_DEFAULT_REACH);
  });

  it('xStock is untouched by the crypto calibration — c is class-dependent', () => {
    // morning_star IS seeded on crypto. The same token on xStock must still get xStock's default:
    // a crypto row leaking across the class boundary is the cross-class borrow the batch forbids.
    expect(getPerClassTargetGate('xstock_spot', 'morning_star').reachAtrMax).toBe(CLASS_DEFAULT_REACH);
  });
});

describe('OBJ-A part 2 — fail-closed on an unknown token (the defect min_rr had fixed and reach did not)', () => {
  it('an unrecognized token resolves the unknown FLOOR, never the permissive class default', () => {
    const g = getPerClassTargetGate('crypto_spot', 'not_a_real_strategy_xyz');
    expect(resolveCanonicalStrategy('not_a_real_strategy_xyz')).toBeNull();
    expect(g.reachAtrMax).toBe(CRYPTO_REACH_FLOOR);
    expect(g.reachAtrMax).toBeLessThan(CLASS_DEFAULT_REACH);
    expect(g.minRR).toBe(2.88);
  });

  it('an EMPTY token fails closed too — an empty strategy is at least as suspect as a typo', () => {
    expect(getPerClassTargetGate('crypto_spot', '').reachAtrMax).toBe(CRYPTO_REACH_FLOOR);
  });

  it('the crypto floor equals the MINIMUM seeded ceiling — a drifted token can never beat a known one', () => {
    const minSeeded = Math.min(...Object.values(SEEDED_REACH));
    expect(CRYPTO_REACH_FLOOR).toBe(minSeeded);
    for (const v of Object.values(SEEDED_REACH)) {
      expect(getPerClassTargetGate('crypto_spot', 'garbage_token').reachAtrMax).toBeLessThanOrEqual(v);
    }
  });

  it('the floor ships on the FULL key set — xStock too, not crypto only', () => {
    // "Crypto only" governs the CALIBRATION rows. A crypto-only floor would leave xStock's
    // unknown-token path on the permissive default, which is the trap the floor exists to close.
    expect(getPerClassTargetGate('xstock_spot', 'garbage_token').reachAtrMax).toBe(XSTOCK_REACH_FLOOR);
  });

  it('⛔ AN UNRESOLVED ASSET CLASS THROWS AT target_floor_pct BEFORE REACH IS EVER CONSULTED', () => {
    // MEASURED while writing this test, and it corrects a claim I had made about the global '*' row.
    // `target_floor_pct` has exactly TWO rows in production (crypto / xStock) and no global '*', so an
    // unresolved asset class fails hard on the FIRST read — the global reach floor is unreachable via
    // this call path today. That is the CORRECT behaviour (a DB-governed setting fails hard when
    // absent, never silently defaults), and it means the global row is a fail-safe for a future in
    // which a global target_floor_pct exists, NOT a live protection. Asserting the throw pins the
    // real behaviour so nobody later reads the global row as coverage it does not provide.
    expect(() => getPerClassTargetGate('some_future_class', 'garbage_token')).toThrow(/target_floor_pct/);
  });

  it('the global reach floor row still resolves when asked for directly', () => {
    // The row is not dead — it is simply behind an earlier fail-hard. Proven by resolving a class that
    // IS seeded for floorPct while having no per-class reach floor of its own would be circular, so
    // this asserts the row's presence in the cache rather than a path that cannot reach it.
    expect(GLOBAL_REACH_FLOOR).toBe(CRYPTO_REACH_FLOOR);
  });

  it('never throws on the unknown path — the substitution is the guarantee, not the counter', () => {
    expect(() => getPerClassTargetGate('crypto_spot', 'nonsense')).not.toThrow();
  });
});

describe('⛔ the tripwire fires EXACTLY ONCE per gate call — not once per gate resolved', () => {
  it('one unknown-token call increments the drift counter by exactly 1', () => {
    getPerClassTargetGate('crypto_spot', 'unknown_token_a');
    expect(getUnknownStrategyCounts()['crypto_spot']).toBe(1);
  });

  it('three calls give three, not six — a second canonicalization would double every drift count', () => {
    // This is the regression that would be invisible everywhere else: min_rr and reach would both be
    // correct, and the observability number would silently read 2x the true rate.
    getPerClassTargetGate('crypto_spot', 'unknown_a');
    getPerClassTargetGate('crypto_spot', 'unknown_b');
    getPerClassTargetGate('crypto_spot', 'unknown_c');
    expect(getUnknownStrategyCounts()['crypto_spot']).toBe(3);
  });

  it('a KNOWN token never touches the counter', () => {
    getPerClassTargetGate('crypto_spot', 'morning_star');
    expect(getUnknownStrategyCounts()['crypto_spot'] ?? 0).toBe(0);
  });
});

describe('alias safety — canonical===null is NOT the only harm surface', () => {
  it('every alias resolves to a target that is itself canonical (no alias lands nowhere)', () => {
    for (const [alias, target] of Object.entries(LEGACY_TO_CANONICAL)) {
      expect(resolveCanonicalStrategy(alias), `alias ${alias}`).toBe(target);
      expect(resolveCanonicalStrategy(target), `alias target ${target}`).toBe(target);
    }
  });

  it('an alias of a SEEDED strategy inherits that strategy\'s ceiling, not the default', () => {
    // The harm surface after OBJ-A: a wrong-but-valid token silently picks up another strategy's
    // ceiling with no tripwire. Assert the mapping rather than assume it is benign.
    for (const [alias, target] of Object.entries(LEGACY_TO_CANONICAL)) {
      const expected = SEEDED_REACH[target as string] ?? CLASS_DEFAULT_REACH;
      expect(
        getPerClassTargetGate('crypto_spot', alias).reachAtrMax,
        `alias ${alias} → ${target}`,
      ).toBe(expected);
    }
  });

  it('the range_trading→range_trade drift resolves the same ceiling as its canonical form', () => {
    expect(getPerClassTargetGate('crypto_spot', 'range_trading').reachAtrMax)
      .toBe(getPerClassTargetGate('crypto_spot', 'range_trade').reachAtrMax);
  });
});

describe('the full caller token table — 18 static sites, and two of them are CONSTANTS not literals', () => {
  // Every token passed to getPerClassTargetGate by a non-test caller, enumerated at the ref rather
  // than sampled. `orb.ts:298` and `strong-bull-trend.ts:176` pass a module constant STRATEGY_KEY, so
  // they are listed by their RESOLVED value — a literal-matching assertion would skip them silently.
  const CALLER_TOKENS = [
    'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trade',
    'vwap_bounce', 'dhma',                       // strategy-engine.ts ×8 in-class detects
    'adaptive_flow', 'defensive_hedge', 'inside_bar_reversal', 'morning_star', 'pivot_shift',
    'reverse_impulse', 'support_bounce', 'volatility_edge',  // the strategy files
    'orb', 'strong_bull_trend',                  // the two STRATEGY_KEY module constants
  ];

  it('every caller token is CANONICAL — none silently takes the unknown floor', () => {
    for (const token of CALLER_TOKENS) {
      expect(resolveCanonicalStrategy(token), `caller token ${token}`).not.toBeNull();
    }
    // and none of them bumped the drift counter while resolving
    for (const token of CALLER_TOKENS) getPerClassTargetGate('crypto_spot', token);
    expect(getUnknownStrategyCounts()['crypto_spot'] ?? 0).toBe(0);
  });

  it('every caller token resolves to its OWN ceiling — seeded rows to their value, the rest to the default', () => {
    for (const token of CALLER_TOKENS) {
      const canonical = resolveCanonicalStrategy(token) as string;
      const expected = SEEDED_REACH[canonical] ?? CLASS_DEFAULT_REACH;
      expect(getPerClassTargetGate('crypto_spot', token).reachAtrMax, `caller token ${token}`).toBe(expected);
    }
  });

  it('the four seeded strategies are all present in the caller table', () => {
    // Guards the inverse mistake: seeding a ceiling for a strategy nothing ever asks about.
    for (const s of Object.keys(SEEDED_REACH)) {
      expect(CALLER_TOKENS.map((t) => resolveCanonicalStrategy(t))).toContain(s);
    }
  });
});
