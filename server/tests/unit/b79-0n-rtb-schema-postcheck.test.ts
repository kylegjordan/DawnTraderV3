/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — Post-Phase-3 rehydrate HARD-FAIL on null asset_class (T12)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston Step 2 ACK C-3 + scope §4 T8b→T12: once Phase 3 CHECK
 * constraint is in place (asset_class NOT NULL enforced), any row encountered
 * during rehydrate-on-boot with `asset_class=null` is a structural invariant
 * violation and MUST throw `[B79.0n.RTB][NULL_ASSET_CLASS_POST_BACKFILL]`.
 *
 * The Phase-3 flag (passed as input) gates the throw: pre-Phase-3 the legacy
 * fallback (T8a) still applies; post-Phase-3 the throw is mandatory.
 *
 * This test validates the CONTRACT (function shape + error text) so a
 * future rehydrate-path implementation conforms; the helper mirrors the
 * algorithm scope §4 T12 commits to.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
}));

/**
 * Mirrors the post-Phase-3 rehydrate-row check that the production code
 * will implement once the CHECK NOT NULL constraint lands. Test-side
 * implementation here documents the expected contract.
 */
function checkRehydratedRow(
  row: { id: string; assetClass: string | null | undefined; symbol?: string },
  phase3CheckConstraintActive: boolean,
): string {
  if (phase3CheckConstraintActive && (row.assetClass === null || row.assetClass === undefined || row.assetClass === '')) {
    throw new Error(
      `[B79.0n.RTB][NULL_ASSET_CLASS_POST_BACKFILL] row.id=${row.id} has asset_class=null after Phase-3 CHECK NOT NULL constraint should have enforced non-null. This is a structural invariant violation. Investigate why the backfill did not cover this row; consider re-running Phase-2 backfill before continuing boot.`
    );
  }
  return (row.assetClass ?? 'crypto_spot') as string;
}

describe('B79.0n.RTB — Post-Phase-3 rehydrate HARD-FAIL (T12)', () => {
  it('T12.1 — post-Phase-3 (flag=true) + null assetClass THROWS [NULL_ASSET_CLASS_POST_BACKFILL]', () => {
    expect(() =>
      checkRehydratedRow({ id: 'row-1', assetClass: null, symbol: 'BTC/USD' }, true)
    ).toThrow(/\[B79\.0n\.RTB\]\[NULL_ASSET_CLASS_POST_BACKFILL\]/);
  });

  it('T12.2 — post-Phase-3 (flag=true) + valid assetClass returns it unchanged', () => {
    const cls = checkRehydratedRow({ id: 'row-2', assetClass: 'xstock_perp' }, true);
    expect(cls).toBe('xstock_perp');
  });

  it('T12.3 — pre-Phase-3 (flag=false) + null assetClass does NOT throw; legacy fallback', () => {
    const cls = checkRehydratedRow({ id: 'row-3', assetClass: null }, false);
    expect(cls).toBe('crypto_spot'); // legacy default per T8a
  });

  it('T12.4 — error message includes row.id for debug surface', () => {
    let err: Error | null = null;
    try {
      checkRehydratedRow({ id: 'specific-row-id-42', assetClass: null }, true);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/row\.id=specific-row-id-42/);
  });

  it('T12.5 — undefined and empty-string treated as null (HARD-FAIL too)', () => {
    expect(() =>
      checkRehydratedRow({ id: 'r-u', assetClass: undefined }, true)
    ).toThrow(/NULL_ASSET_CLASS_POST_BACKFILL/);
    expect(() =>
      checkRehydratedRow({ id: 'r-e', assetClass: '' }, true)
    ).toThrow(/NULL_ASSET_CLASS_POST_BACKFILL/);
  });
});
