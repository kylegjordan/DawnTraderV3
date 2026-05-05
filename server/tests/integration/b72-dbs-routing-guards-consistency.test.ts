/**
 * B72 Step 3 — DBS Routing Guards Mutual-Consistency Test
 *
 * Asserts the B63 mutual-exclusion guarantee: when |DBS| >= dbs_min_threshold,
 * pairs route exclusively to strong_bull_trend; counter-trend strategies
 * (defensive_hedge, reverse_impulse, morning_star) MUST skip those pairs.
 *
 * Group migrated atomically with strong_bull_trend.ts, defensive_hedge.ts,
 * reverse_impulse.ts, morning_star.ts. A SQL UPDATE that changes one row
 * but not the others would silently break the mutual-exclusion guarantee.
 * This test catches that.
 *
 * Tests:
 *   1. All 4 rows seeded for `strategy_dbs_routing_guards.dbs_min_threshold`.
 *   2. All 4 rows have equal value (mutual consistency invariant).
 *   3. The expected canonical value is the post-B63 calibration: 0.35.
 *   4. All 4 strategies resolve the same threshold via the cached resolver.
 *
 * Run: `npm test -- b72-dbs-routing-guards-consistency`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { moduleConstants } from '../../../shared/schema.js';
import { and, eq } from 'drizzle-orm';
import {
  prefetchModule,
  getCachedNumberRequired,
  clearModuleConstantsCache,
} from '../../services/module-constants-service.js';

const MODULE_NAME = 'strategy_dbs_routing_guards';
const CONSTANT_NAME = 'dbs_min_threshold';
const STRATEGIES = ['strong_bull_trend', 'defensive_hedge', 'reverse_impulse', 'morning_star'] as const;
const EXPECTED_CANONICAL_VALUE = 0.35;

describe('B72 — DBS routing guards mutual consistency', () => {
  beforeAll(async () => {
    clearModuleConstantsCache();
    const rowCount = await prefetchModule(MODULE_NAME);
    expect(rowCount).toBeGreaterThanOrEqual(STRATEGIES.length);
  });

  afterAll(() => {
    clearModuleConstantsCache();
  });

  it('seeds all 4 strategy rows in module_constants', async () => {
    const rows = await db
      .select()
      .from(moduleConstants)
      .where(
        and(
          eq(moduleConstants.moduleName, MODULE_NAME),
          eq(moduleConstants.constantName, CONSTANT_NAME),
        ),
      );

    const seededStrategies = new Set(rows.map((r) => r.strategy));
    for (const strategy of STRATEGIES) {
      expect(seededStrategies.has(strategy)).toBe(true);
    }
  });

  it('all 4 rows have equal value (mutual-exclusion invariant)', async () => {
    const rows = await db
      .select()
      .from(moduleConstants)
      .where(
        and(
          eq(moduleConstants.moduleName, MODULE_NAME),
          eq(moduleConstants.constantName, CONSTANT_NAME),
        ),
      );

    const filtered = rows.filter((r) => (STRATEGIES as readonly string[]).includes(r.strategy));
    const values = filtered.map((r) => Number(r.value));

    expect(filtered.length).toBe(STRATEGIES.length);

    const first = values[0];
    for (const v of values) {
      expect(v).toBe(first);
    }
  });

  it('canonical seeded value is 0.35 (post-B63 calibration)', async () => {
    const rows = await db
      .select()
      .from(moduleConstants)
      .where(
        and(
          eq(moduleConstants.moduleName, MODULE_NAME),
          eq(moduleConstants.constantName, CONSTANT_NAME),
        ),
      );

    for (const row of rows) {
      if ((STRATEGIES as readonly string[]).includes(row.strategy)) {
        expect(Number(row.value)).toBe(EXPECTED_CANONICAL_VALUE);
      }
    }
  });

  it('all 4 strategies resolve to the same threshold via cached resolver', () => {
    const resolved = STRATEGIES.map((strategy) =>
      getCachedNumberRequired(MODULE_NAME, CONSTANT_NAME, {
        exchange: '*',
        assetClass: '*',
        strategy,
        regime: '*',
      }),
    );

    const first = resolved[0];
    for (const v of resolved) {
      expect(v).toBe(first);
    }
    expect(first).toBe(EXPECTED_CANONICAL_VALUE);
  });

  it('resolver throws on cold cache (sync no-fallback contract)', () => {
    clearModuleConstantsCache();
    expect(() =>
      getCachedNumberRequired(MODULE_NAME, CONSTANT_NAME, {
        exchange: '*',
        assetClass: '*',
        strategy: 'strong_bull_trend',
        regime: '*',
      }),
    ).toThrow(/not warm/);
  });
});
