/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B6.5b — F5 (audit H14): ATR-zero exit FLOOR in evaluateTECExit
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The trailing engine (step 5) engages ONLY when `atr > 0`. The legacy hard
 * stop/target short-circuit (step 3/4) ran ONLY when `useTrailing === false`.
 * Paper always passes `useTrailing: true`, so a position opened with a missing /
 * zero `atr_at_open` fell through BOTH branches → it could NEVER close on stop
 * or target (only the MAX_HOLD timeout could close it = unbounded exposure to the
 * stop). F5 makes the hard stop/target a FLOOR that always runs when ATR is
 * unavailable, regardless of `useTrailing`. These tests force `atr = 0` and assert
 * the stop/target still fires; the control confirms the legacy non-trailing path
 * and the no-over-fire (price between stop and target) behavior are intact.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, vi } from 'vitest';

// Stub the trailing-exit-controller so resolveTECConstants -> resolveTECConfig is a cheap sync
// lookup with no DB/cache dependency. The trailing primitives are never reached in these tests
// (every case uses atr=0 or useTrailing=false, which both skip the trailing block) but must exist
// as named exports for the import to resolve.
vi.mock('../../services/trailing-exit-controller.js', () => ({
  resolveTECConfig: () => ({ breakEvenTriggerR: 1.0, targetLockR: 1.5, trailDistanceAtrMultiplier: 1.0 }),
  updatePosition: () => ({ shouldClose: false }),
  shouldClosePosition: () => ({ shouldClose: false, reason: null }),
  isMoonbagQualifier: () => false,
  canEnterMoonbag: () => false,
  getConcurrentMoonbagCount: () => 0,
}));
vi.mock('../../services/price-discontinuity-detector.js', () => ({
  isDiscontinuityActive: () => ({ active: false }),
}));

import { evaluateTECExit } from '../../services/tec-evaluator';

const baseCtx = { assetClass: 'crypto_spot' as const, exchange: 'kraken', strategy: 'breakout', regime: 'strong_bull_trend' };
const baseInput = {
  tradeId: 't-b65b', symbol: 'BTC/USD', entryPrice: 100, stopPrice: 95, targetPrice: 110,
  holdDurationMs: 1000, maxHoldMs: Number.POSITIVE_INFINITY, context: baseCtx,
};

describe('P19-B6.5b F5 — ATR-zero exit floor (audit H14)', () => {
  it('useTrailing=true + atr=0 + price<=stop → stop_hit via the floor (THE FIX)', async () => {
    const d = await evaluateTECExit({ ...baseInput, currentPrice: 90, atr: 0, useTrailing: true });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('stop_hit');
    expect(d.exitPrice).toBe(95);
  });

  it('useTrailing=true + atr=0 + price>=target → target_hit via the floor (THE FIX)', async () => {
    const d = await evaluateTECExit({ ...baseInput, currentPrice: 112, atr: 0, useTrailing: true });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(d.exitPrice).toBe(110);
  });

  it('useTrailing=true + atr=0 + stop<price<target → no exit (floor does NOT over-fire)', async () => {
    const d = await evaluateTECExit({ ...baseInput, currentPrice: 102, atr: 0, useTrailing: true });
    expect(d.shouldExit).toBe(false);
    expect(d.exitReason).toBeNull();
  });

  it('useTrailing=false + atr>0 + price<=stop → stop_hit (legacy non-trailing path unchanged)', async () => {
    const d = await evaluateTECExit({ ...baseInput, currentPrice: 90, atr: 5, useTrailing: false });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('stop_hit');
  });
});
