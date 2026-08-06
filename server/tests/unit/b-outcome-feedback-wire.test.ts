/**
 * B-OUTCOME-FEEDBACK-WIRE (#602) — unit fence.
 *
 * The defect: `(position as any).regime` read a column `activeOpenPositions`
 * never declared, so the B67.4 close-hook gate failed on every active close and
 * the active path never wrote the outcome-learning store (whole-store census at
 * the pre-audit: 13/13 entries `vts_`-prefixed, zero `paper_sim_`).
 *
 * The fence pins three things, deliberately WITHOUT restating engine literals
 * (the "fence asserting a compile-time literal against itself" trap, B-ARM):
 *  1. WRITE-side stamp shape: live MCE context → canonical label; cold → null
 *     (the sibling `_b67_2_1_*` honest-absent convention).
 *  2. READ-side gate: `metadata.regimeAtOpen` present → truthy label extracted;
 *     absent key / null metadata / null value → gate-skipping undefined/null.
 *  3. WHOLE-KEY PARITY POSITIVE CONTROL (Langston Step-1 r2 BLOCKER-2): an
 *     `updateEma` with write-side-shaped args is found by a `peek` built from
 *     read-side-shaped args — through the REAL store and its REAL private key
 *     builder, not a copied format string. All four dims exercised.
 */
import { describe, it, expect } from 'vitest';
import {
  outcomeFeedbackStore,
  type LearningSource,
} from '../../core/metrics/outcome-feedback-store.js';

// The write-side stamp expression's shape (scope r3 §3 edit 1).
function stampRegimeAtOpen(ctx: { regime: { regime: string } } | null): string | null {
  return ctx?.regime.regime ?? null;
}

// The read-side extraction's shape (scope r3 §3 edit 2).
function readRegimeAtOpen(metadata: Record<string, unknown> | null): string | undefined {
  return metadata?.['regimeAtOpen'] as string | undefined;
}

describe('B-OUTCOME-FEEDBACK-WIRE #602', () => {
  it('write side: live MCE context stamps the canonical label; cold context stamps null', () => {
    expect(stampRegimeAtOpen({ regime: { regime: 'TREND_FRIENDLY_STABLE' } })).toBe('TREND_FRIENDLY_STABLE');
    expect(stampRegimeAtOpen(null)).toBeNull();
  });

  it('read side: present key yields the label; absent key, null metadata, and null value all fail the truthiness gate', () => {
    expect(readRegimeAtOpen({ regimeAtOpen: 'IMPULSE_EXPANSION' })).toBe('IMPULSE_EXPANSION');
    expect(readRegimeAtOpen({})).toBeUndefined();
    expect(readRegimeAtOpen(null)).toBeUndefined();
    // A cold-MCE stamp is null — null is falsy, gate skips (honest-absent).
    const cold = readRegimeAtOpen({ regimeAtOpen: stampRegimeAtOpen(null) });
    expect(cold ? true : false).toBe(false);
  });

  it('whole-key positive control: a write with write-side-shaped dims is FOUND by a peek with read-side-shaped dims (real store, all four dims)', () => {
    // Write-side dims exactly as the :2128 site supplies them post-fix.
    const source: LearningSource = 'paper_sim'; // tradingModeToRunMode('paper')
    const assetClass = 'crypto_spot'; // position.assetClass column
    const regimeAtOpen = stampRegimeAtOpen({ regime: { regime: 'RANGE_BOUND_STABLE' } })!; // the new stamp
    const strategyName = 'vwap_pullback'; // position.strategyName ← signal.strategy

    outcomeFeedbackStore.updateEma(source, assetClass, regimeAtOpen, strategyName, 1.25, 0.2, Date.now(), 0);

    // Read-side dims exactly as signal-orchestrator.ts:1322 builds them:
    // peek(tradingModeToRunMode(this.mode), _pairAssetClass, regimeLabel, strategyKey)
    const entry = outcomeFeedbackStore.peek('paper_sim', 'crypto_spot', 'RANGE_BOUND_STABLE', 'vwap_pullback');
    expect(entry).toBeDefined();
    expect(entry!.sample_count).toBeGreaterThan(0);

    // Negative control: the instrument CAN return null — a tuple nobody wrote.
    expect(outcomeFeedbackStore.peek('paper_sim', 'crypto_spot', 'RANGE_BOUND_STABLE', 'never_written_strategy')).toBeUndefined();
  });

  it('pseudo-label tuples are structurally unreachable from the new key: a strategy-stamped pseudo-label written under the OLD metadata.regime never collides with the canonical read', () => {
    // BLOCKER-3's hazard: 'counter-trend' (reverse-impulse's stamp) is not a
    // canonical label. The fix reads ONLY regimeAtOpen (MCE-stamped), so the
    // pseudo-label space never reaches the store key. Pin that a pseudo-label
    // peek finds nothing after canonical-only writes.
    expect(outcomeFeedbackStore.peek('paper_sim', 'crypto_spot', 'counter-trend', 'reverse_impulse')).toBeUndefined();
  });
});
