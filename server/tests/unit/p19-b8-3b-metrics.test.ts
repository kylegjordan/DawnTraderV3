/**
 * P19-B8.3b — the OBJ-3 (#415) reconciliation invariant.
 *
 * The headline `netPnl` (routes.ts analytics) now sums `num(t.netPnl ?? t.pnl)`
 * — the SAME canonical net-of-friction expression `computeByAssetClass` uses —
 * so the per-class dollars MUST total the headline. This pins that identity
 * (previously the headline summed raw `t.pnl` (gross) → diverged by fees).
 *
 * Langston Step-2 condition: pin the parity on rows where netPnl is present, and
 * surface the fallback rows separately. Disposition: net_pnl is `default("0")`
 * non-null by schema, so there are NO null rows — the fallback is a documented
 * no-op bridge; both cases (present netPnl, and the theoretical fallback) are
 * asserted below to prove the identity holds either way.
 */
import { describe, it, expect } from 'vitest';
import { computeByAssetClass, num } from '../../services/dashboard-metrics.js';

/** The exact headline expression from routes.ts analytics (OBJ-3). */
function headlineNetPnl(trades: any[]): number {
  return trades.reduce((sum, t) => sum + num(t.netPnl ?? t.pnl), 0);
}

describe('P19-B8.3b OBJ-3 (#415) — headline netPnl reconciles with byAssetClass', () => {
  it('Σ byAssetClass.netPnl === headline netPnl on the canonical net basis (present netPnl rows)', () => {
    const trades = [
      { assetClass: 'crypto_spot', pnl: '12.00', netPnl: '10.40' },  // fee-bearing: net < gross
      { assetClass: 'crypto_spot', pnl: '-4.00', netPnl: '-4.80' },
      { assetClass: 'xstock_spot', pnl: '7.00', netPnl: '6.10' },
      { assetClass: 'xstock_spot', pnl: '3.00', netPnl: '2.20' },
    ];
    const headline = headlineNetPnl(trades);
    const byClass = computeByAssetClass(trades as any);
    const classTotal = Object.values(byClass).reduce((s, r) => s + r.netPnl, 0);
    expect(classTotal).toBeCloseTo(headline, 8);
    // and it is the NET basis, not gross — proves the OBJ-3 fix actually changed the basis
    const grossHeadline = trades.reduce((s, t) => s + num(t.pnl), 0);
    expect(headline).toBeCloseTo(13.9, 8);   // 10.40 - 4.80 + 6.10 + 2.20
    expect(grossHeadline).toBeCloseTo(18.0, 8); // 12 - 4 + 7 + 3 — the old (wrong) headline
    expect(headline).not.toBeCloseTo(grossHeadline, 4);
  });

  it('the ?? pnl fallback is a no-op bridge — identity still holds if a legacy row lacked netPnl', () => {
    // net_pnl is default("0") non-null in prod, so this row shape does not occur;
    // asserted only to prove the fallback keeps headline==byAssetClass identical.
    const trades = [
      { assetClass: 'crypto_spot', pnl: '5.00', netPnl: '4.50' },
      { assetClass: 'crypto_spot', pnl: '2.00' },                    // no netPnl → ?? pnl bridge
    ];
    const headline = headlineNetPnl(trades);
    const byClass = computeByAssetClass(trades as any);
    const classTotal = Object.values(byClass).reduce((s, r) => s + r.netPnl, 0);
    expect(classTotal).toBeCloseTo(headline, 8);
    expect(headline).toBeCloseTo(6.5, 8);   // 4.50 + 2.00(bridge)
  });

  it('empty set → both zero, reconciled', () => {
    expect(headlineNetPnl([])).toBe(0);
    expect(Object.values(computeByAssetClass([])).reduce((s, r) => s + r.netPnl, 0)).toBe(0);
  });
});
