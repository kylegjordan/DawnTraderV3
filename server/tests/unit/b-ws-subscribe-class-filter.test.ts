import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// B-WS-SUBSCRIBE-CLASS-FILTER OBJ-2 (#559) — source fences on the I8C open-positions provider.
//
// The crypto Kraken WS feed serves ONLY crypto_spot. The I8C provider is the ONE confirmed source
// of the 5s subscription storm (i8cRunSubscriptionAudit reads it). Before this batch it returned
// ALL open positions incl. xStocks, which can never map on the crypto feed, so each was flagged
// missing_subscription and re-subscribed every 5s (~133k futile SUBSCRIBE_SKIPPED/day).
//
// These fences pin the corrected shape (Langston-ruled): filter at the provider using the
// AUTHORITATIVE stored asset_class via the established stamp→resolve→default idiom, and SURFACE the
// null/unresolvable branch with a deduped WARN rather than silently defaulting to crypto (so a
// class-less crypto row is never silently dropped OR silently guessed). A behavioral proof — the
// SUBSCRIBE_SKIPPED lines for xStock stopping post-deploy — is the batch's live verification.
const SRC = readFileSync(
  resolve(__dirname, '../../services/active-execution-engine.ts'),
  'utf8',
);

describe('B-WS-SUBSCRIBE-CLASS-FILTER OBJ-2: the I8C provider filters to crypto by stored class', () => {
  it('no longer returns every open position unfiltered', () => {
    // The pre-batch defect was `return positions.map(p => p.symbol)` with no class filter.
    expect(SRC).not.toContain('return positions.map(p => p.symbol)');
  });

  it('uses the authoritative stored class (stamp→resolve→default idiom), not a bare re-resolve', () => {
    // Must trust the stored asset_class first; only fall through to symbol resolution, because
    // plain-form xStock (C/USD) is indistinguishable from crypto by symbol alone.
    expect(SRC).toContain('asValidAssetClass(p.assetClass) ?? safeResolveAssetClass(p.symbol,');
  });

  it("keeps only rows resolving to crypto_spot for the crypto WS feed", () => {
    expect(SRC).toMatch(/if \(cls === 'crypto_spot'\) cryptoSymbols\.push\(p\.symbol\)/);
  });

  it('SURFACES the class-less branch with a deduped WARN — never a silent crypto default', () => {
    // Langston OBJ-2 ruling: a class-less crypto row must be surfaced, not silently dropped (which
    // a bare `=== crypto_spot` would do) nor silently guessed.
    expect(SRC).toContain('[B-WS-SUBSCRIBE-CLASS-FILTER][CLASSLESS]');
    expect(SRC).toContain('wsSubClasslessWarned');
  });
});
