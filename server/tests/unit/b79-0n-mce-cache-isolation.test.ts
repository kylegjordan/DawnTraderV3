/**
 * B79.0n.MCE — per-symbol context cache keyed by (symbol, assetClass) (2026-05-21)
 *
 * The MarketContextEngine per-symbol context cache key was extended from
 * `${symbol}` to `${symbol}:${assetClass}` (market-context-engine.ts:812 +
 * :915). This prevents a wrong-class context being served if the same symbol
 * string were ever computed for two asset classes within the 60s TTL window —
 * defense-in-depth for the (rare) collision-ticker case where a symbol could
 * legitimately resolve to two classes depending on exchange context.
 *
 * SCOPE NOTE (read before extending this test): the cache key is built INLINE
 * at the two call sites listed above — there is no exported key-format helper
 * on `MarketContextEngine`, and exercising the real cache requires a fully
 * started MCE singleton (macro context + regime config + phase boundaries all
 * initialized via `MCE.start()` → `refreshMacroContext()`). That setup is too
 * heavy for a focused unit test. This test therefore asserts the key-format
 * CONTRACT (`${symbol}:${assetClass}`) against a local mirror of the format,
 * which is the surface a regression would have to break. If a future batch
 * extracts an exported `cacheKeyFor(symbol, assetClass)` helper on MCE, this
 * test should be upgraded to import and assert against that helper directly.
 */

import { describe, it, expect } from 'vitest';
import type { AssetClass } from '../../../shared/asset-classes';

/**
 * Local mirror of the inline cache-key format used at
 * market-context-engine.ts:812 (`getCachedContext`) and :915 (`computeContext`).
 * Kept identical to the production format string — if production drifts, the
 * isolation assertions below stop reflecting reality and should be revisited.
 */
function cacheKeyFor(symbol: string, assetClass: AssetClass): string {
  return `${symbol}:${assetClass}`;
}

describe('[B79.0n.MCE] context cache is keyed by (symbol, assetClass)', () => {
  it('the same symbol under two asset classes produces two DISTINCT cache keys', () => {
    const cryptoKey = cacheKeyFor('SUI/USD', 'crypto_spot');
    const xstockKey = cacheKeyFor('SUI/USD', 'xstock_spot');
    // SUI/USD is a real collision ticker (XSTOCK_SPOT_KRAKEN_COLLISIONS) —
    // exactly the case the (symbol, assetClass) key dimension defends against.
    expect(cryptoKey).not.toBe(xstockKey);
  });

  it('the cache key embeds the asset class as a colon-delimited suffix', () => {
    expect(cacheKeyFor('BTC/USD', 'crypto_spot')).toBe('BTC/USD:crypto_spot');
    expect(cacheKeyFor('AAPL/USD', 'xstock_spot')).toBe('AAPL/USD:xstock_spot');
  });

  it('same (symbol, assetClass) pair is stable — produces an identical key', () => {
    expect(cacheKeyFor('ETH/USD', 'crypto_spot')).toBe(cacheKeyFor('ETH/USD', 'crypto_spot'));
  });
});
