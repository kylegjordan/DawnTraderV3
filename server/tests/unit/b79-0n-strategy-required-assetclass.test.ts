/**
 * B79.0n.STRATEGY (2026-05-24) — REQUIRED-AssetClass type-lock regression test
 *
 * Per scope §4 test #1: every detect method on `StrategyEngine` + every file-based
 * `detectXxx` function + `callStrategyDetect` dispatcher MUST be a TypeScript
 * compile error when called without `assetClass`. The `@ts-expect-error`
 * assertions below verify the compile error.
 *
 * Pattern (type-only test): we use a `typeCheck` helper that's never actually
 * called at runtime — it exists so the `@ts-expect-error` directives have a
 * statement to attach to. TypeScript validates the directives during compile
 * (this file's tsc check is part of CI). Vitest just runs the no-op test
 * functions to confirm the file loads. Discipline: if any `@ts-expect-error`
 * stops producing an error (e.g. someone reverts a signature), tsc compile
 * fails (TS18004: "Unused @ts-expect-error directive").
 *
 * This is the same forcing-function pattern STORAGE + MCE established.
 */

// COINGECKO_API_TIER required by external-macro-feed (transitive import). Set BEFORE imports.
process.env.COINGECKO_API_TIER = process.env.COINGECKO_API_TIER ?? 'demo';

import { describe, it, expect } from 'vitest';
import type { StrategyEngine } from '../../services/strategy-engine';
import type * as MorningStarMod from '../../strategies/morning-star';
import type * as AdaptiveFlowMod from '../../strategies/adaptive-flow';
import type * as DefensiveHedgeMod from '../../strategies/defensive-hedge';
import type * as InsideBarReversalMod from '../../strategies/inside-bar-reversal';
import type * as PivotShiftMod from '../../strategies/pivot-shift';
import type * as ReverseImpulseMod from '../../strategies/reverse-impulse';
import type * as SupportBounceMod from '../../strategies/support-bounce';
import type * as VolatilityEdgeMod from '../../strategies/volatility-edge';
import type * as StrongBullTrendMod from '../../strategies/strong-bull-trend';
import type * as ORBMod from '../../strategies/orb';
import type * as VtsRunnerMod from '../../services/vts-runner';

// Helper: never actually called at runtime — just gives @ts-expect-error directives
// a target. Type-system only. TS compiler verifies the directives during typecheck.
function typeCheck(_: () => unknown): void { /* no-op */ }

describe('B79.0n.STRATEGY — REQUIRED-AssetClass type-lock', () => {
  const indicators = {} as any;
  const settings = {} as any;
  const priceHistory: any[] = [];
  const patternSignal = null;
  const engine = null as unknown as StrategyEngine;

  it('detect methods on StrategyEngine REQUIRE assetClass at compile time', () => {
    typeCheck(() => {
      // @ts-expect-error — detectVWAPPullback requires assetClass (4th positional)
      engine.detectVWAPPullback(indicators, settings, priceHistory);
    });
    typeCheck(() => {
      // @ts-expect-error — detectABCDLong requires assetClass (3rd positional)
      engine.detectABCDLong(priceHistory, settings);
    });
    typeCheck(() => {
      // @ts-expect-error — detectSMATrendRide requires assetClass (4th positional)
      engine.detectSMATrendRide(indicators, priceHistory, settings);
    });
    typeCheck(() => {
      // @ts-expect-error — detectBreakout requires assetClass (3rd positional)
      engine.detectBreakout(priceHistory, {});
    });
    typeCheck(() => {
      // @ts-expect-error — detectMeanReversion requires assetClass (4th positional)
      engine.detectMeanReversion(indicators, priceHistory, {});
    });
    typeCheck(() => {
      // @ts-expect-error — detectRangeTrading requires assetClass (3rd positional)
      engine.detectRangeTrading(priceHistory, {});
    });
    typeCheck(() => {
      // @ts-expect-error — detectVWAPBounce requires assetClass (4th positional)
      engine.detectVWAPBounce(indicators, priceHistory, {});
    });
    typeCheck(() => {
      // @ts-expect-error — detectLiquidityTrap requires assetClass (3rd positional)
      engine.detectLiquidityTrap(priceHistory, {});
    });
    typeCheck(() => {
      // @ts-expect-error — detectDHMA requires assetClass (4th positional)
      engine.detectDHMA(indicators, priceHistory, {});
    });
    typeCheck(() => {
      // @ts-expect-error — detectMorningStar wrapper requires assetClass
      engine.detectMorningStar(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectInsideBarReversal wrapper requires assetClass
      engine.detectInsideBarReversal(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectSupportBounce wrapper requires assetClass
      engine.detectSupportBounce(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectPivotShift wrapper requires assetClass
      engine.detectPivotShift(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectReverseImpulse wrapper requires assetClass
      engine.detectReverseImpulse(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectDefensiveHedge wrapper requires assetClass
      engine.detectDefensiveHedge(indicators, priceHistory, patternSignal, undefined);
    });
    typeCheck(() => {
      // @ts-expect-error — detectAdaptiveFlow wrapper requires assetClass
      engine.detectAdaptiveFlow(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectVolatilityEdge wrapper requires assetClass
      engine.detectVolatilityEdge(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectStrongBullTrend wrapper requires assetClass
      engine.detectStrongBullTrend(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — detectORB wrapper requires ctx (REQUIRED, not optional)
      engine.detectORB('SYM/USD', priceHistory, indicators);
    });
    expect(true).toBe(true);  // satisfy vitest's expect requirement
  });

  it('file-based detect functions REQUIRE assetClass at compile time', () => {
    const ms = null as unknown as typeof MorningStarMod;
    const af = null as unknown as typeof AdaptiveFlowMod;
    const dh = null as unknown as typeof DefensiveHedgeMod;
    const ib = null as unknown as typeof InsideBarReversalMod;
    const ps = null as unknown as typeof PivotShiftMod;
    const ri = null as unknown as typeof ReverseImpulseMod;
    const sb = null as unknown as typeof SupportBounceMod;
    const ve = null as unknown as typeof VolatilityEdgeMod;
    const sbt = null as unknown as typeof StrongBullTrendMod;
    const orb = null as unknown as typeof ORBMod;

    typeCheck(() => {
      // @ts-expect-error — file-based detectMorningStar requires assetClass (4th positional)
      ms.detectMorningStar(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectAdaptiveFlow requires assetClass
      af.detectAdaptiveFlow(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectDefensiveHedge requires assetClass
      dh.detectDefensiveHedge(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectInsideBarReversal requires assetClass
      ib.detectInsideBarReversal(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectPivotShift requires assetClass
      ps.detectPivotShift(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectReverseImpulse requires assetClass
      ri.detectReverseImpulse(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectSupportBounce requires assetClass
      sb.detectSupportBounce(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectVolatilityEdge requires assetClass
      ve.detectVolatilityEdge(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectStrongBullTrend requires assetClass
      sbt.detectStrongBullTrend(indicators, priceHistory, patternSignal);
    });
    typeCheck(() => {
      // @ts-expect-error — file-based detectORB requires ctx (REQUIRED, not optional)
      orb.detectORB('SYM/USD', priceHistory, indicators);
    });
    expect(true).toBe(true);
  });

  it('callStrategyDetect dispatcher REQUIRES symbol + assetClass at compile time', () => {
    const vts = null as unknown as typeof VtsRunnerMod;
    typeCheck(() => {
      // @ts-expect-error — callStrategyDetect requires symbol + assetClass (5th + 6th positional)
      vts.callStrategyDetect('vwap_pullback', indicators, priceHistory, null);
    });
    typeCheck(() => {
      // @ts-expect-error — symbol alone (no assetClass) not enough
      vts.callStrategyDetect('vwap_pullback', indicators, priceHistory, null, 'BTC/USD');
    });
    expect(true).toBe(true);
  });
});
