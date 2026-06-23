import { Trade, TradingSettings, PriceData } from '@shared/schema';
import { storage } from '../storage';
import { detectRange, detectStopZone, type RangeDetectionResult, type StopZoneResult } from './strategy-filters';
import { telemetryService } from './telemetry-service.js';
import { confirmMultiTimeframe } from './strategy-features.js';
// Directive 12.3.2: Import 8 new strategy modules
import { detectMorningStar } from '../strategies/morning-star.js';
import { detectInsideBarReversal } from '../strategies/inside-bar-reversal.js';
import { detectSupportBounce } from '../strategies/support-bounce.js';
import { detectPivotShift } from '../strategies/pivot-shift.js';
import { detectReverseImpulse } from '../strategies/reverse-impulse.js';
import { detectDefensiveHedge } from '../strategies/defensive-hedge.js';
import { detectAdaptiveFlow } from '../strategies/adaptive-flow.js';
import { detectVolatilityEdge } from '../strategies/volatility-edge.js';
// B63: Strong Bull Trend (Path D) QUANT strategy
import { detectStrongBullTrend } from '../strategies/strong-bull-trend.js';
import { detectORB } from '../strategies/orb.js';
import type { PatternInput } from '../strategies/strategy-helpers.js';
import { applyGlobalGuards, clampEffectiveATR } from '../strategies/strategy-helpers.js';
import { getPerClassTargetGate } from '../core/calculations/expectancy.js';
import { recordGuardEval } from '../strategies/guard-eval-tracker.js';
import { setNullReason } from '../utils/null-reason-tracker.js';
// B72.2: In-class quant strategies read tunable params from module_constants.
import { getCachedNumbersForModule, getCachedConstant } from './module-constants-service.js';
import type { AssetClass } from '@shared/asset-classes';

// B79.0n.STRATEGY (2026-05-24): REQUIRED assetClass parameter. Was wildcard `'*'`
// pre-batch — every detect method silently inherited crypto-scoped wildcard rows
// regardless of actual asset class. Now per-class scoped at the resolver layer;
// xStock callers route to xstock_spot rows (when seeded) or wildcard fallback.
// Caller surface: 7 files / 66 sites (compile-driven enumeration captured at
// B79_0n_STRATEGY_PRE_AUDIT.md §3.2). TypeScript REQUIRED signature is the
// forcing function — every caller must pass an explicit AssetClass.
const _SE_KEY = (strategy: string, assetClass: AssetClass) => ({
  exchange: '*', assetClass, strategy, regime: '*',
});

// W2.1 (2026-06-06): unit-explicit max-holding default. Used as the documented
// fallback EVERYWHERE the per-strategy hold is resolved but absent from the DB.
// 24h in milliseconds = 24 * 60 * 60 * 1000. Chosen to preserve status quo (the
// crypto wildcard rows resolved to 24h via the old 60-min era bar-count of 24).
export const DEFAULT_MAX_HOLDING_MS = 24 * 60 * 60 * 1000; // 86_400_000

/**
 * W2.1 (2026-06-06) — SHARED max-holding-ms stamp.
 *
 * THE single component both the VTS path (`callStrategyDetect` in vts-runner.ts)
 * and the active path (`buildSizedSignalForStrategy` in signal-orchestrator.ts)
 * call after a strategy detect returns a signal. Guarantees every emitted signal
 * carries an unambiguous, unit-explicit `metadata.maxHoldingMs` (milliseconds).
 *
 * If a strategy's own builder already stamped `metadata.maxHoldingMs` (e.g.
 * vwap_pullback / breakout, which now resolve `max_holding_ms` directly), this is
 * a no-op for that signal. For every other strategy that does not set a hold, it
 * resolves the strategy's `max_holding_ms` from module_constants for the cycle's
 * asset class (most-specific-wins), falling back to DEFAULT_MAX_HOLDING_MS.
 *
 * CRITICAL INVARIANT: forward-prep only. VTS enforces holds via the 7-day global
 * MAX_HOLD_MS valve in tec-evaluator/vts-runner, NOT via metadata.maxHoldingMs;
 * the only consumer of metadata.maxHoldingMs is the (currently dormant)
 * active-paper enforcer in paper-execution-engine.ts. Stamping the field changes
 * no live behavior — it just makes the field present and unit-consistent.
 */
export function stampMaxHoldingMs(
  signal: StrategySignal | null,
  assetClass: AssetClass,
): StrategySignal | null {
  if (!signal) return signal;
  if (!signal.metadata || typeof signal.metadata !== 'object') {
    signal.metadata = {};
  }
  // Already stamped by the strategy's own builder — leave as-is.
  if (typeof signal.metadata.maxHoldingMs === 'number' && isFinite(signal.metadata.maxHoldingMs)) {
    return signal;
  }
  let resolved: number | undefined;
  try {
    resolved = getCachedConstant<number>(
      `strategy.${signal.strategy}`,
      'max_holding_ms',
      { exchange: '*', assetClass, strategy: signal.strategy, regime: '*' },
    );
  } catch {
    // Cold cache or module not warmed — fall back to the documented default.
    resolved = undefined;
  }
  signal.metadata.maxHoldingMs =
    typeof resolved === 'number' && isFinite(resolved) ? resolved : DEFAULT_MAX_HOLDING_MS;
  return signal;
}

/**
 * Compute ATR (Average True Range) from PriceData array.
 * Added in Batch 18H for crypto-calibrated dynamic thresholds.
 * @param priceHistory - Array of price data (OHLCV strings)
 * @param period - ATR period (default: 14)
 * @returns ATR value in price units
 */
function computeATR(priceHistory: PriceData[], period: number = 14): number {
  if (priceHistory.length < period + 1) return 0;
  const recent = priceHistory.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high = parseFloat(recent[i].high);
    const low = parseFloat(recent[i].low);
    const prevClose = parseFloat(recent[i - 1].close);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Directive 12.3.2: Expanded to 17 canonical strategies
 * Original 9: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma
 * New 8: morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
 * B63: +1: strong_bull_trend
 */
export interface StrategySignal {
  symbol: string;
  strategy:
    | 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout'
    | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma'
    | 'morning_star' | 'inside_bar_reversal' | 'support_bounce' | 'pivot_shift'
    | 'reverse_impulse' | 'defensive_hedge' | 'adaptive_flow' | 'volatility_edge'
    | 'strong_bull_trend' | 'orb';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  metadata: any;
}

export interface TechnicalIndicators {
  vwap: number;
  sma: number;
  currentPrice: number;
  volume: number;
  high24h: number;
  low24h: number;
  atr?: number;             // ATR, used by multiple strategies. Historically accessed via loose indexing.
  // B63: DBS propagated from FX5 scanner pre-filter. Required for Path D + 5 self-exclusion guards.
  dbsScore?: number;        // Directional Bias Score [-1, 1]
  dbsCategory?: string;     // 'UP_STRONG' | 'UP_MODERATE' | 'NEUTRAL' | 'DOWN_MODERATE' | 'DOWN_STRONG'
  dbsSlope?: number;        // DBS slope (current - 3-bar-prior), positive = rising
  // B63 Item 12: Strong-trend lane geometry override. Populated by vts-runner ONLY when
  // the pair is routed through quant-strong_trend sourcePool. Detectors that support the
  // override (currently vwap_pullback for Item 11 promotion) consume these multipliers
  // in place of their default geometry. Detectors that do not consume it simply ignore it.
  strongTrendGeometryOverride?: {
    stopAtrMultiplier: number;   // e.g. 4.0 for Variant E (stop = entry - 4*ATR)
    targetAsRMultiple: number;   // e.g. 3.0 for Variant E (target = entry + 3*R, where R = stopDistance)
  };
}

export class StrategyEngine {
  
  // VWAP Pullback Strategy
  detectVWAPPullback(
    indicators: TechnicalIndicators,
    settings: TradingSettings,
    priceHistory: PriceData[] | undefined,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B63 Item 11: vwap_pullback PROMOTED into strong-trend lane. The prior B63 Item 6
    // `dbs >= 0.35` exclusion has been REMOVED — vwap_pullback is now eligible on both:
    //   (a) its original trend/reversal context (low-DBS pairs), with default geometry
    //   (b) the strong-trend lane (|DBS|>=0.35 positive, via MULTI_FAMILY_ELIGIBILITY), with
    //       geometry override per Item 12 (4×ATR stop, 3R target = Variant E from audit).
    //
    // B63 Item 10: Counter-trend LONG guard (mirror-defect fix). vwap_pullback is LONG-only
    // (pullback-resumption on bullish setups). Firing on strong NEGATIVE DBS pairs means
    // entering LONG against a strong downtrend. 15 mirror-defect trades in B62 72h window
    // per BATCH_63_COUNTERFACTUAL_AUDIT. Block here.
    // B72.2: levers resolved from module_constants 'strategy.vwap_pullback'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.vwap_pullback', _SE_KEY('vwap_pullback', assetClass));
    if ((indicators.dbsScore ?? 0) <= c['counter_trend_long_dbs_floor']) {
      setNullReason('b63b_counter_trend_long_exclusion');
      return null;
    }
    const { currentPrice, vwap, high24h, low24h, volume } = indicators;

    // User-configured settings with defaults (defaults sourced from module_constants).
    const pullbackThreshold = parseFloat(settings.vwapPullbackThreshold || c['pullback_threshold_pct_default'].toString()) / 100;
    const volumeMultiplier = parseFloat(settings.vwapVolumeMultiplier || c['volume_multiplier_default'].toString());
    // W2.1 (2026-06-06): max holding is now resolved as an explicit MILLISECONDS
    // value from module_constants (`max_holding_ms`), removing the old ambiguous
    // bar-count key. The legacy per-user override `settings.vwapMaxHoldingPeriod`
    // was a BAR COUNT set in the 60-min era — convert it via 60 min/bar so its
    // original wall-clock intent is preserved.
    const maxHoldingMs = settings.vwapMaxHoldingPeriod
      ? settings.vwapMaxHoldingPeriod * 60 * 60 * 1000
      : (c['max_holding_ms'] ?? DEFAULT_MAX_HOLDING_MS);

    console.log(`[VWAP Strategy] Using settings: pullback=${(pullbackThreshold*100).toFixed(1)}%, volumeMultiplier=${volumeMultiplier}x, maxHold=${maxHoldingMs} ms`);
    
    // Rules: Price above VWAP; pullback to VWAP within threshold; volume confirmation; bullish reversal
    const priceAboveVWAP = currentPrice > vwap;
    const nearVWAP = Math.abs(currentPrice - vwap) / vwap <= pullbackThreshold; // ✅ Using user setting
    const hasReversalPattern = this.detectBullishReversal(indicators, assetClass);

    // ✅ Volume confirmation using user setting (volumeMultiplier)
    // Calculate average volume from prior candles (minimum required for reliable comparison)
    if (!priceHistory || priceHistory.length < c['volume_confirm_min_history']) {
      console.log('[VWAP Strategy] ❌ Insufficient history for volume confirmation (need 10+ candles)');
      setNullReason('insufficient_data');
      return null;
    }

    // Use up to N prior candles for average volume calculation
    const lookbackPeriod = Math.min(c['volume_avg_lookback'], priceHistory.length);
    const recentCandles = priceHistory.slice(-lookbackPeriod);
    const totalVolume = recentCandles.reduce((sum, candle) => {
      const vol = parseFloat(candle.volume || '0');
      return sum + (isFinite(vol) && vol > 0 ? vol : 0);
    }, 0);
    
    if (totalVolume === 0) {
      console.log('[VWAP Strategy] ❌ Invalid volume data in history');
      setNullReason('insufficient_data');
      return null;
    }
    
    const avgVolume = totalVolume / lookbackPeriod;
    // B3.1b: per-class volume-confirmation toggle. xstock_spot=off — the ws-equities
    // volume is the underlying-equity's, not the token's (no honest signal); crypto=on.
    const volConfirmEnabled = (c['volume_confirmation_enabled'] ?? 1) !== 0;
    const hasVolumeConfirmation = !volConfirmEnabled || (volume >= avgVolume * volumeMultiplier);

    console.log(`[VWAP Strategy] Volume check: current=${volume.toFixed(0)}, avg=${avgVolume.toFixed(0)}, multiplier=${volumeMultiplier}x, confirmed=${hasVolumeConfirmation}, volGateEnabled=${volConfirmEnabled}`);

    if (priceAboveVWAP && nearVWAP && hasReversalPattern && hasVolumeConfirmation) {
      // Batch 45: ATR-relative entry/stop/target
      const atr = indicators.atr ?? (high24h - low24h) * c['atr_fallback_daily_range_frac']; // Fallback: 10% of daily range
      const entryPrice = currentPrice + atr * c['entry_atr_premium'];

      // B63 Item 12: strong-trend geometry override (Variant E from counterfactual audit).
      // When vts-runner routes this detector via quant-strong_trend sourcePool, it attaches
      // { stopAtrMultiplier, targetAsRMultiple } to indicators. Use those in place of the
      // default vwap_pullback geometry. Default path (no override) preserves prior behavior.
      // B79.0n.STRATEGY note: assetClass is in scope for any downstream helper calls below.
      const override = indicators.strongTrendGeometryOverride;
      let stopPrice: number;
      let finalTarget: number;
      if (override && atr > 0) {
        stopPrice = entryPrice - atr * override.stopAtrMultiplier;
        const riskDistance = entryPrice - stopPrice;
        finalTarget = entryPrice + riskDistance * override.targetAsRMultiple;
        console.log(`[VWAP Strategy] [B63 Item 12] Using strong-trend geometry override: stop=${override.stopAtrMultiplier}×ATR, target=${override.targetAsRMultiple}R`);
      } else {
        // Default (pre-B63-Item-12) geometry for low-DBS pullback context
        stopPrice = Math.min(vwap - atr * c['stop_atr_mult_vwap'], low24h + atr * c['stop_atr_mult_low24h']);
        const targetPrice = high24h - atr * c['target_atr_offset_high24h'];
        // B3 FIX: For long trades, use Math.max to pick the HIGHER of the two targets (not the lower)
        const riskDistance = entryPrice - stopPrice;
        const twoRTarget = entryPrice + (riskDistance * c['target_r_multiple_default']);
        finalTarget = Math.max(targetPrice, twoRTarget);
      }

      // B3: Safety validation - reject signal if target is not above entry
      if (finalTarget <= entryPrice) {
        console.log(`[VWAP Strategy] ❌ Target validation failed - target (${finalTarget.toFixed(2)}) <= entry (${entryPrice.toFixed(2)})`);
        setNullReason('target_validation');
        return null;
      }
      
      console.log(`[VWAP Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${finalTarget.toFixed(2)}`);
      
      const signal = {
        symbol: '', // Will be set by caller
        strategy: 'vwap_pullback' as const,
        entryPrice,
        stopPrice,
        targetPrice: finalTarget,
        confidence: c['base_confidence'] + (hasReversalPattern ? c['reversal_confidence_bonus'] : 0),
        metadata: {
          vwap,
          nearVWAPPercent: Math.abs(currentPrice - vwap) / vwap * 100,
          reversalConfirmed: hasReversalPattern,
          volumeMultiplier,
          maxHoldingMs,
          appliedPullbackThreshold: pullbackThreshold * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: signal.symbol || "(pending)",
        strategy: "vwap_pullback",
        inputSnapshot: { currentPrice, vwap, high24h, low24h, volume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: per-class shared guard (RR + reachability) at signal generation, consolidated
      // from the downstream normalizer; record the suppression instrumentation (#372/#371). effectiveATR =
      // the guard's clamp on this strategy's own ATR. Dominates the single signal return below.
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(atr, entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, finalTarget, _effATR, _gate);
        recordGuardEval('vwap_pullback', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }
    
    console.log(`[VWAP Strategy] ❌ No signal - priceAboveVWAP=${priceAboveVWAP}, nearVWAP=${nearVWAP}, reversal=${hasReversalPattern}, volume=${hasVolumeConfirmation}`);
    setNullReason('price_position');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "vwap_pullback",
      inputSnapshot: { currentPrice, vwap, high24h, low24h, volume },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // ABCD Long Strategy
  detectABCDLong(
    priceHistory: PriceData[],
    settings: TradingSettings,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.abcd_long'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.abcd_long', _SE_KEY('abcd_long', assetClass));
    const exitTypeDefault = getCachedConstant<string>('strategy.abcd_long', 'exit_type_default', _SE_KEY('abcd_long', assetClass)) ?? 'target';
    // User-configured settings with defaults (defaults sourced from module_constants).
    const minConsolidation = settings.abcdMinConsolidation || c['min_consolidation_bars_default'];
    const breakoutThreshold = parseFloat(settings.abcdBreakoutThreshold || c['breakout_threshold_pct_default'].toString()) / 100;
    const volumeMultiplier = parseFloat(settings.abcdVolumeMultiplier || c['volume_multiplier_default'].toString());
    const exitType = settings.abcdExitType || exitTypeDefault;
    const targetPercent = parseFloat(settings.abcdTargetPercent || c['target_percent_default'].toString()) / 100;
    const trailingStopPercent = parseFloat(settings.abcdTrailingStopPercent || c['trailing_stop_pct_default'].toString()) / 100;
    
    console.log(`[ABCD Strategy] Using settings: minConsolidation=${minConsolidation} bars, breakout=${(breakoutThreshold*100).toFixed(1)}%, volumeMultiplier=${volumeMultiplier}x, exitType=${exitType}`);
    
    if (priceHistory.length < minConsolidation + 10) { setNullReason('insufficient_data'); return null; }
    
    const recent = priceHistory.slice(-(minConsolidation + 10));
    const current = recent[recent.length - 1];
    
    // Simplified ABCD pattern detection
    // A = spike, B = pullback, C = higher low above VWAP, D = breakout
    
    const aPoint = this.findSpike(recent.slice(0, c['a_point_search_window']));
    if (!aPoint) { setNullReason('abcd_structure_not_found'); return null; }

    const bPoint = this.findPullback(recent.slice(c['b_point_search_start'], c['b_point_search_end']), aPoint);
    if (!bPoint) { setNullReason('abcd_structure_not_found'); return null; }
    
    // ✅ Using user-configured consolidation period
    const cPoint = this.findHigherLow(recent.slice(10, 10 + minConsolidation), bPoint);
    if (!cPoint || !current.vwap || parseFloat(cPoint.close) < parseFloat(current.vwap)) { setNullReason('price_position'); return null; }
    
    // Batch 45: ATR-relative breakout threshold
    const abcdAtr = computeATR(priceHistory);
    const cHigh = parseFloat(cPoint.high);
    const currentPrice = parseFloat(current.close);
    const currentVolume = parseFloat(current.volume);
    const atrBreakoutThreshold = cHigh > 0 ? Math.max(breakoutThreshold, abcdAtr / cHigh) : breakoutThreshold;
    const isBreakout = currentPrice > cHigh * (1 + atrBreakoutThreshold);
    
    // Batch 45: Volume confirmation against AVERAGE volume, not spike max.
    // The A-point is the max-volume bar by definition (findSpike), so comparing
    // against 1.5x spike is nearly impossible. Use average volume of the lookback instead.
    const lookbackVolumes = recent.map(p => parseFloat(p.volume)).filter(v => v > 0);
    const avgVolume = lookbackVolumes.length > 0
      ? lookbackVolumes.reduce((s, v) => s + v, 0) / lookbackVolumes.length
      : parseFloat(aPoint.volume);
    const hasVolumeConfirmation = currentVolume >= avgVolume * volumeMultiplier;
    
    if (isBreakout && hasVolumeConfirmation) {
      // Batch 45: ATR-relative entry and stop
      const entryPrice = cHigh + abcdAtr * c['entry_atr_buffer']; // Entry: C-high + ATR buffer
      const stopPrice = parseFloat(cPoint.low) - abcdAtr * c['stop_atr_buffer']; // Stop: below C-low by ATR buffer
      
      let targetPrice: number;
      
      // ✅ Exit type logic: Fixed Target vs Trailing Stop
      if (exitType === 'target') {
        // Fixed target based on user-configured percentage
        targetPrice = entryPrice * (1 + targetPercent);
        console.log(`[ABCD Strategy] Using FIXED TARGET exit: ${(targetPercent * 100).toFixed(1)}%`);
      } else {
        // Trailing stop - use measured move as initial target
        const abDistance = parseFloat(aPoint.high) - parseFloat(bPoint.low);
        const measuredTarget = entryPrice + abDistance;
        
        // Alternative: +NR target (R-multiple from module_constants)
        const riskDistance = entryPrice - stopPrice;
        const twoRTarget = entryPrice + (riskDistance * c['trailing_target_r_multiple']);
        targetPrice = Math.min(measuredTarget, twoRTarget);
        
        console.log(`[ABCD Strategy] Using TRAILING STOP exit: ${(trailingStopPercent * 100).toFixed(1)}%`);
      }
      
      console.log(`[ABCD Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'abcd_long' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          aPoint: { price: aPoint.high, time: aPoint.timestamp },
          bPoint: { price: bPoint.low, time: bPoint.timestamp },
          cPoint: { price: cPoint.close, time: cPoint.timestamp },
          breakoutLevel: cHigh,
          consolidationBars: minConsolidation,
          breakoutThreshold: breakoutThreshold * 100,
          volumeMultiplier,
          exitType,
          trailingStopPercent: exitType === 'trailing' ? trailingStopPercent * 100 : null
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "abcd_long",
        inputSnapshot: { currentPrice, cHigh, currentVolume, avgVolume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: per-class shared guard (RR + reachability) at signal generation, consolidated
      // from the downstream normalizer; record the suppression instrumentation (#372/#371). effectiveATR =
      // the guard's clamp on this strategy's own ATR. Dominates the single signal return below.
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(abcdAtr, entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
        recordGuardEval('abcd_long', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }

    setNullReason('breakout_fail');
    console.log(`[ABCD Strategy] ❌ No signal - breakout=${isBreakout}, volumeConfirmed=${hasVolumeConfirmation}`);
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "abcd_long",
      inputSnapshot: { currentPrice: current ? parseFloat(current.close) : null, cHigh: cHigh || null },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // SMA Trend Ride Strategy
  detectSMATrendRide(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    settings: TradingSettings,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B63 Item 10: Counter-trend LONG guard (mirror-defect fix). sma_trend_ride is a
    // LONG-only trend-riding strategy; firing on strong NEGATIVE DBS pairs means entering
    // LONG against a strong downtrend. 1 mirror-defect trade in B62 72h window per
    // BATCH_63_COUNTERFACTUAL_AUDIT. Block here. (No paired positive-DBS guard needed —
    // high-positive-DBS pairs are routed exclusively to Path D per B63 Item 4 and do not
    // reach sma_trend_ride's quant family.)
    // B72.2: levers resolved from module_constants 'strategy.sma_trend_ride'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.sma_trend_ride', _SE_KEY('sma_trend_ride', assetClass));
    const entryConditionDefault = getCachedConstant<string>('strategy.sma_trend_ride', 'entry_condition_default', _SE_KEY('sma_trend_ride', assetClass)) ?? 'above';
    const exitConditionDefault = getCachedConstant<string>('strategy.sma_trend_ride', 'exit_condition_default', _SE_KEY('sma_trend_ride', assetClass)) ?? 'break';
    if (((indicators as any).dbsScore ?? 0) <= c['counter_trend_long_dbs_floor']) {
      setNullReason('b63b_counter_trend_long_exclusion');
      return null;
    }

    const { currentPrice, sma, volume } = indicators;

    // User-configured settings with defaults (defaults sourced from module_constants).
    const entryCondition = settings.smaEntryCondition || entryConditionDefault;
    const exitCondition = settings.smaExitCondition || exitConditionDefault;
    const trailingStopPercent = parseFloat(settings.smaTrailingStopPercent || c['trailing_stop_pct_default'].toString()) / 100;
    const smaLength = settings.smaLength || c['sma_length_default'];
    
    console.log(`[SMA Strategy] Using settings: smaLength=${smaLength}, entryCondition=${entryCondition}, exitCondition=${exitCondition}, trailingStop=${(trailingStopPercent*100).toFixed(1)}%`);
    
    if (!sma || priceHistory.length < c['min_history_bars']) { setNullReason('insufficient_data'); return null; }
    
    const recentPrices = priceHistory.slice(-10).map(p => parseFloat(p.close));
    const previousPrice = recentPrices[recentPrices.length - 2];
    const isUptrend = this.detectUptrend(recentPrices, sma);
    
    let entrySignal = false;
    
    // ✅ Entry condition logic: Above vs Crossover
    if (entryCondition === 'above') {
      // Entry when price is above SMA and near it
      // Using trailing stop percent as proximity threshold (repurposed setting)
      const nearSMAThreshold = trailingStopPercent; // e.g., 2% trailing stop = 2% proximity threshold
      const nearSMA = Math.abs(currentPrice - sma) / sma <= nearSMAThreshold;
      const bounceConfirmation = currentPrice > sma && this.hasBouncePattern(priceHistory.slice(-5));
      entrySignal = isUptrend && nearSMA && bounceConfirmation;
      
      console.log(`[SMA Strategy] Entry condition ABOVE: uptrend=${isUptrend}, nearSMA=${nearSMA} (threshold=${(nearSMAThreshold*100).toFixed(1)}%), bounce=${bounceConfirmation}`);
    } else {
      // Entry when price crosses above SMA
      const crossedAbove = previousPrice <= sma && currentPrice > sma;
      entrySignal = isUptrend && crossedAbove;
      
      console.log(`[SMA Strategy] Entry condition CROSSOVER: uptrend=${isUptrend}, crossedAbove=${crossedAbove}`);
    }
    
    if (entrySignal) {
      const entryPrice = currentPrice * c['entry_premium_mult']; // Small premium for entry
      const priorSwingLow = Math.min(...recentPrices.slice(-5));
      const stopPrice = Math.min(priorSwingLow * c['swing_low_stop_mult'], sma * c['sma_stop_mult']); // Below swing low or SMA

      let targetPrice: number;

      // ✅ Exit condition determines target calculation
      if (exitCondition === 'trailing') {
        // Trailing stop exit - set wider initial target
        const trendStrength = this.calculateTrendStrength(recentPrices);
        targetPrice = entryPrice * (1 + trendStrength * c['trailing_strength_factor']);

        console.log(`[SMA Strategy] Using TRAILING STOP exit: ${(trailingStopPercent * 100).toFixed(1)}%`);
      } else {
        // Break below SMA exit - use fixed NR target
        const riskDistance = entryPrice - stopPrice;
        targetPrice = entryPrice + (riskDistance * c['break_target_r_multiple']);
        
        console.log(`[SMA Strategy] Using BREAK exit: 2R target`);
      }
      
      console.log(`[SMA Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'sma_trend_ride' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          sma,
          smaLength,
          entryCondition,
          exitCondition,
          trailingStopPercent: exitCondition === 'trailing' ? trailingStopPercent * 100 : null,
          distanceFromSMA: Math.abs(currentPrice - sma) / sma * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "sma_trend_ride",
        inputSnapshot: { currentPrice, sma, volume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: reachability ATR via computeATR(priceHistory) — this strategy's geometry is
      // non-ATR (SMA/VWAP/realizedVol), so the pair ATR is the path-invariant feasibility input
      // (reachability is a property of the PAIR, not the strategy). #371 covers the computeATR-vs-
      // mceContext.atr divergence for ALL guard-wired in-class incl. these 3 non-ATR-geometry strategies.
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(computeATR(priceHistory), entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
        recordGuardEval('sma_trend_ride', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }

    setNullReason('indicator_filter');
    console.log(`[SMA Strategy] ❌ No signal - entryCondition=${entryCondition}, entrySignal=${entrySignal}`);
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "sma_trend_ride",
      inputSnapshot: { currentPrice, sma, volume },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Breakout Strategy
  detectBreakout(
    priceHistory: PriceData[],
    params: any,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.breakout'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.breakout', _SE_KEY('breakout', assetClass));
    const minConsolidationBars = params.minConsolidationBars || c['min_consolidation_bars'];
    const breakoutBuffer = (params.breakoutBuffer || c['breakout_buffer_pct']) / 100;
    const volumeMultiplier = params.volumeMultiplier || c['volume_multiplier'];
    // W2.1 (2026-06-06): hold is now an explicit MILLISECONDS value from
    // module_constants (`max_holding_ms`), unifying with vwap_pullback (the two
    // strategies previously used different units — bars vs hours — for the same
    // concept). The legacy per-call override `params.maxHoldingHours` is still
    // honored, converted hours → ms.
    const maxHoldingMs = params.maxHoldingHours
      ? params.maxHoldingHours * 60 * 60 * 1000
      : (c['max_holding_ms'] ?? DEFAULT_MAX_HOLDING_MS);

    if (priceHistory.length < minConsolidationBars + 5) { setNullReason('insufficient_data'); return null; }

    // Batch 18H: ATR-based dynamic range width for crypto markets
    const atr = computeATR(priceHistory);
    const refPrice = parseFloat(priceHistory[priceHistory.length - 1].close);
    const atrPct = refPrice > 0 ? (atr / refPrice) * 100 : 0;
    const maxRangeWidth = params.maxRangeWidth || Math.max(c['max_range_width_floor_pct'], c['max_range_width_atr_mult'] * atrPct); // Crypto ceiling
    const touchTolerance = refPrice > 0 ? atr / (c['touch_tolerance_atr_divisor'] * refPrice) : c['touch_tolerance_fallback']; // ATR/N tolerance zone

    // Use Range Detection filter to find consolidation
    const rangeResult = detectRange(priceHistory, minConsolidationBars, maxRangeWidth, c['min_boundary_touches'], touchTolerance);
    
    if (!rangeResult.isRange) {
      console.log('[Breakout] No valid consolidation range detected');
      setNullReason('range_not_found');
      return null;
    }
    
    const current = priceHistory[priceHistory.length - 1];
    const currentPrice = parseFloat(current.close);
    const currentVolume = parseFloat(current.volume);
    
    // Check for breakout above resistance
    const breakoutLevel = rangeResult.rangeHigh * (1 + breakoutBuffer);
    const isBreakout = currentPrice > breakoutLevel;
    
    // Volume confirmation - calculate average from recent bars.
    // B3.1b: per-class toggle (xstock_spot=off — underlying-equity volume, no honest signal).
    const recentBars = priceHistory.slice(-Math.min(c['volume_avg_lookback'], priceHistory.length));
    const avgVolume = recentBars.reduce((sum, p) => sum + parseFloat(p.volume), 0) / recentBars.length;
    const volConfirmEnabled = (c['volume_confirmation_enabled'] ?? 1) !== 0;
    const hasVolumeSpike = !volConfirmEnabled || (currentVolume >= avgVolume * volumeMultiplier);

    if (isBreakout && hasVolumeSpike) {
      const entryPrice = breakoutLevel * c['entry_premium_mult']; // Entry slightly above breakout
      const stopPrice = rangeResult.rangeLow * c['stop_below_low_mult']; // Below range support
      const rangeHeight = rangeResult.rangeHigh - rangeResult.rangeLow;
      const targetPrice = entryPrice + rangeHeight; // Measured move target
      
      console.log(`[Breakout] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'breakout' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          rangeSupport: rangeResult.rangeLow,
          rangeResistance: rangeResult.rangeHigh,
          consolidationBars: rangeResult.durationBars,
          breakoutLevel,
          volumeRatio: currentVolume / avgVolume,
          maxHoldingMs
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "breakout",
        inputSnapshot: { currentPrice, breakoutLevel, currentVolume, avgVolume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: per-class shared guard (RR + reachability) at signal generation, consolidated
      // from the downstream normalizer; record the suppression instrumentation (#372/#371). effectiveATR =
      // the guard's clamp on this strategy's own ATR. Dominates the single signal return below.
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(atr, entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
        recordGuardEval('breakout', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }

    setNullReason('breakout_fail');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "breakout",
      inputSnapshot: { currentPrice, breakoutLevel: rangeResult?.rangeHigh || null, isRange: rangeResult?.isRange || false },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Mean Reversion Strategy
  detectMeanReversion(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    params: any,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.mean_reversion'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.mean_reversion', _SE_KEY('mean_reversion', assetClass));
    const meanTypeDefault = getCachedConstant<string>('strategy.mean_reversion', 'mean_type_default', _SE_KEY('mean_reversion', assetClass)) ?? 'vwap';
    const meanType = params.meanType || meanTypeDefault;
    const smaLength = params.smaLength || c['sma_length_default'];
    // Batch 18H: ATR-based dynamic deviation for crypto markets — max(floor, mult×ATR/price)
    const atr = computeATR(priceHistory);
    const deviationThreshold = params.deviationThreshold
      ? params.deviationThreshold / 100
      : Math.max(c['deviation_threshold_floor'], indicators.currentPrice > 0 ? c['deviation_threshold_atr_mult'] * atr / indicators.currentPrice : c['deviation_threshold_floor']);
    const partialExitPercent = params.partialExitPercent || c['partial_exit_percent'];
    const stopLossBuffer = (params.stopLossBuffer || c['stop_loss_buffer_pct']) / 100;

    if (priceHistory.length < c['min_history_bars']) { setNullReason('insufficient_data'); return null; }
    
    const { currentPrice, vwap } = indicators;
    
    // Determine mean reference
    let meanValue: number;
    if (meanType === 'sma') {
      meanValue = this.calculateSMA(priceHistory, smaLength);
    } else if (meanType === 'midpoint') {
      const rangeResult = detectRange(priceHistory, c['midpoint_range_min_bars'], c['midpoint_range_max_pct'], c['midpoint_range_min_touches']);
      if (!rangeResult.isRange) { setNullReason('range_not_found'); return null; }
      meanValue = (rangeResult.rangeLow + rangeResult.rangeHigh) / 2;
    } else {
      meanValue = vwap;
    }
    
    if (!meanValue || meanValue === 0) { setNullReason('insufficient_data'); return null; }
    
    // Check for oversold condition (price below mean)
    const deviation = (currentPrice - meanValue) / meanValue;
    const isOversold = deviation < -deviationThreshold;
    
    // Reversal confirmation
    const hasReversal = this.detectBullishReversal(indicators, assetClass);
    
    if (isOversold && hasReversal) {
      const entryPrice = currentPrice * c['entry_premium_mult'];
      const stopPrice = currentPrice * (1 - stopLossBuffer);
      const targetPrice = meanValue * c['target_below_mean_mult']; // Target slightly below mean
      
      console.log(`[MeanReversion] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'mean_reversion' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          meanType,
          meanValue,
          deviation: deviation * 100,
          partialExitPercent,
          oversoldLevel: -deviationThreshold * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "mean_reversion",
        inputSnapshot: { currentPrice, vwap, meanValue, deviation: deviation * 100 },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: per-class shared guard (RR + reachability) at signal generation, consolidated
      // from the downstream normalizer; record the suppression instrumentation (#372/#371). effectiveATR =
      // the guard's clamp on this strategy's own ATR. Dominates the single signal return below.
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(atr, entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
        recordGuardEval('mean_reversion', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }

    setNullReason('indicator_filter');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "mean_reversion",
      inputSnapshot: { currentPrice, vwap, meanValue: meanValue || null },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Range Trading Strategy
  detectRangeTrading(
    priceHistory: PriceData[],
    params: any,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.range_trade'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.range_trade', _SE_KEY('range_trade', assetClass));
    const minRangeDurationHours = params.minRangeDurationHours || c['min_range_duration_hours'];
    const minBoundaryTouches = params.minBoundaryTouches || c['min_boundary_touches'];
    // Batch 45: Entry zone proportional to range width — bottom 25% of range instead of fixed %.
    const entryZoneWidthParam = (params.entryZoneWidth || c['entry_zone_width_pct']) / 100; // Kept as minimum floor
    const stopLossBeyond = (params.stopLossBeyond || c['stop_loss_beyond_pct']) / 100;

    if (priceHistory.length < c['min_history_bars']) { setNullReason('insufficient_data'); return null; }

    // Batch 18H: ATR-based dynamic range width for crypto markets
    const atr = computeATR(priceHistory);
    const refPrice = parseFloat(priceHistory[priceHistory.length - 1].close);
    const atrPct = refPrice > 0 ? atr / refPrice : 0;
    const minRangeWidth = params.minRangeWidth
      ? params.minRangeWidth / 100
      : Math.max(c['min_range_width_floor'], c['min_range_width_atr_mult'] * atrPct);
    const touchTolerance = refPrice > 0 ? atr / (c['touch_tolerance_atr_divisor'] * refPrice) : 0.003; // ATR/N tolerance zone

    // Convert hours to bars (assuming 1h bars)
    const minBars = minRangeDurationHours;

    // Detect established range
    const rangeResult = detectRange(priceHistory, minBars, c['range_detection_max_width'], minBoundaryTouches, touchTolerance);
    
    if (!rangeResult.isRange) { setNullReason('range_not_found'); return null; }
    
    // Check range width meets minimum
    const rangeWidth = (rangeResult.rangeHigh - rangeResult.rangeLow) / rangeResult.rangeLow;
    if (rangeWidth < minRangeWidth) {
      console.log(`[RangeTrading] Range too narrow: ${(rangeWidth * 100).toFixed(2)}% < ${(minRangeWidth * 100).toFixed(2)}%`);
      setNullReason('range_not_found');
      return null;
    }
    
    const current = priceHistory[priceHistory.length - 1];
    const currentPrice = parseFloat(current.close);
    
    // Batch 45: Entry zone = bottom fraction of range, with ATR as minimum width, capped at fraction of range.
    const rangeAbsolute = rangeResult.rangeHigh - rangeResult.rangeLow;
    const entryZoneRaw = Math.max(rangeAbsolute * c['entry_zone_bottom_frac'], atr, rangeResult.rangeLow * entryZoneWidthParam);
    const entryZoneWidth = Math.min(entryZoneRaw, rangeAbsolute * c['entry_zone_cap_frac']); // Cap: never more than this fraction of range
    const supportEntryZone = rangeResult.rangeLow + entryZoneWidth;
    const isNearSupport = currentPrice >= rangeResult.rangeLow && currentPrice <= supportEntryZone;

    if (isNearSupport) {
      // Batch 45: ATR-relative entry/stop/target
      const entryPrice = currentPrice + atr * c['entry_atr_premium'];
      const stopPrice = rangeResult.rangeLow - atr * c['stop_atr_below_low'];
      const targetPrice = rangeResult.rangeHigh - atr * c['target_atr_below_high'];
      
      console.log(`[RangeTrading] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'range_trading' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          rangeSupport: rangeResult.rangeLow,
          rangeResistance: rangeResult.rangeHigh,
          rangeWidth: rangeWidth * 100,
          rangeDuration: rangeResult.durationBars,
          entryZoneWidth: entryZoneWidth * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "range_trading",
        inputSnapshot: { currentPrice, rangeHigh: rangeResult.rangeHigh, rangeLow: rangeResult.rangeLow },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: per-class shared guard (RR + reachability) at signal generation, consolidated
      // from the downstream normalizer; record the suppression instrumentation (#372/#371). effectiveATR =
      // the guard's clamp on this strategy's own ATR. Dominates the single signal return below.
      // recordGuardEval name = 'range_trade' per canonical SSOT (method is detectRangeTrading).
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(atr, entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
        recordGuardEval('range_trade', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }

    setNullReason('price_position');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "range_trading",
      inputSnapshot: { currentPrice, isRange: rangeResult?.isRange || false },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // VWAP Bounce Strategy
  detectVWAPBounce(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    params: any,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.vwap_bounce'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.vwap_bounce', _SE_KEY('vwap_bounce', assetClass));
    const vwapProximity = (params.vwapProximity || c['vwap_proximity_pct']) / 100;
    const minVWAPSlope = (params.minVWAPSlope || c['min_vwap_slope_pct']) / 100;
    const volumeMultiplier = params.volumeMultiplier || c['volume_multiplier'];
    const maxPullbackBars = params.maxPullbackBars || c['max_pullback_bars'];
    const partialExitR = params.partialExitR || c['partial_exit_r'];

    if (priceHistory.length < c['min_history_bars']) { setNullReason('insufficient_data'); return null; }

    const { currentPrice, vwap, volume } = indicators;

    if (!vwap || vwap === 0) { setNullReason('insufficient_data'); return null; }

    // Check VWAP is trending up
    const vwapHistory = priceHistory.slice(-c['vwap_slope_lookback']).map(p => parseFloat(p.vwap || '0'));
    const vwapSlope = (vwapHistory[vwapHistory.length - 1] - vwapHistory[0]) / vwapHistory[0];
    
    if (vwapSlope < minVWAPSlope) {
      console.log(`[VWAPBounce] VWAP not trending up: slope ${(vwapSlope * 100).toFixed(2)}%`);
      setNullReason('indicator_filter');
      return null;
    }
    
    // Check price is near VWAP
    const distanceFromVWAP = Math.abs(currentPrice - vwap) / vwap;
    const isNearVWAP = distanceFromVWAP <= vwapProximity;
    
    // Check for bounce (price touched or went below VWAP recently, now above)
    const recentPrices = priceHistory.slice(-maxPullbackBars);
    const touchedVWAP = recentPrices.some(p => parseFloat(p.low) <= vwap);
    const nowAboveVWAP = currentPrice > vwap;
    
    // Volume confirmation. B3.1b: per-class toggle (xstock_spot=off — underlying-equity volume, no honest signal).
    const avgVolume = recentPrices.reduce((sum, p) => sum + parseFloat(p.volume), 0) / recentPrices.length;
    const volConfirmEnabled = (c['volume_confirmation_enabled'] ?? 1) !== 0;
    const hasVolume = !volConfirmEnabled || (volume >= avgVolume * volumeMultiplier);

    if (isNearVWAP && touchedVWAP && nowAboveVWAP && hasVolume) {
      const entryPrice = currentPrice * c['entry_premium_mult'];
      const stopPrice = vwap * c['stop_below_vwap_mult']; // Slightly below VWAP
      const riskDistance = entryPrice - stopPrice;
      const targetPrice = entryPrice + (riskDistance * c['target_r_multiple']); // NR target
      
      console.log(`[VWAPBounce] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'vwap_bounce' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          vwap,
          vwapSlope: vwapSlope * 100,
          distanceFromVWAP: distanceFromVWAP * 100,
          partialExitR,
          volumeRatio: volume / avgVolume
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "vwap_bounce",
        inputSnapshot: { currentPrice, vwap, volume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: reachability ATR via computeATR(priceHistory) — this strategy's geometry is
      // non-ATR (SMA/VWAP/realizedVol), so the pair ATR is the path-invariant feasibility input
      // (reachability is a property of the PAIR, not the strategy). #371 covers the computeATR-vs-
      // mceContext.atr divergence for ALL guard-wired in-class incl. these 3 non-ATR-geometry strategies.
      {
        const _gate = getPerClassTargetGate(assetClass);
        const _effATR = clampEffectiveATR(computeATR(priceHistory), entryPrice);
        const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
        recordGuardEval('vwap_bounce', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
        if (!_gr.pass) { setNullReason('guard_fail'); return null; }
      }

      return signal;
    }

    setNullReason('price_position');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "vwap_bounce",
      inputSnapshot: { currentPrice, vwap, volume },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Liquidity Trap Strategy
  detectLiquidityTrap(
    priceHistory: PriceData[],
    params: any,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope (Q-C C-2: shape consistency)
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.liquidity_trap'.
    // B79.0n.STRATEGY: per-class resolver scope (strategy is disabled at orchestrator/VTS per Batch 70.3
    // but REQUIRED-assetClass kept for shape consistency across all 19 detect methods).
    const c = getCachedNumbersForModule('strategy.liquidity_trap', _SE_KEY('liquidity_trap', assetClass));
    const minStopZoneSizeDefault = getCachedConstant<string>('strategy.liquidity_trap', 'min_stop_zone_size', _SE_KEY('liquidity_trap', assetClass)) ?? 'medium';
    const maxTrapExtension = (params.maxTrapExtension || c['max_trap_extension_pct']) / 100;
    const trapReturnBars = params.trapReturnBars || c['trap_return_bars'];
    const minStopZoneSize = params.minStopZoneSize || minStopZoneSizeDefault;
    const minLevelTouches = params.minLevelTouches || c['min_level_touches'];
    const volumeRatio = params.volumeRatio || c['volume_ratio'];

    if (priceHistory.length < c['min_history_bars']) { setNullReason('insufficient_data'); return null; }

    // First, detect a range
    const rangeResult = detectRange(priceHistory.slice(0, -5), c['range_detection_min_bars'], c['range_detection_max_pct'], minLevelTouches);

    if (!rangeResult.isRange) { setNullReason('range_not_found'); return null; }

    // Check for stop zone near resistance
    const currentPrice = parseFloat(priceHistory[priceHistory.length - 1].close);
    const stopZone = detectStopZone(priceHistory, currentPrice, c['stop_zone_lookback'], minLevelTouches);
    
    const minClusterStrength = minStopZoneSize === 'small' ? 'weak' : minStopZoneSize === 'large' ? 'strong' : 'medium';
    if (!stopZone.hasStopZone) { setNullReason('range_not_found'); return null; }
    
    // Check for false breakout and return
    const recentBars = priceHistory.slice(-trapReturnBars - 2);
    const breakoutBar = recentBars[0];
    const currentBar = recentBars[recentBars.length - 1];
    
    const breakoutHigh = parseFloat(breakoutBar.high);
    const breakoutVolume = parseFloat(breakoutBar.volume);
    const currentBarPrice = parseFloat(currentBar.close);
    const currentVolume = parseFloat(currentBar.volume);
    
    // False breakout: went above resistance, then returned
    const brokeAbove = breakoutHigh > rangeResult.rangeHigh;
    const trapExtension = (breakoutHigh - rangeResult.rangeHigh) / rangeResult.rangeHigh;
    const returnedToRange = currentBarPrice <= rangeResult.rangeHigh;
    const hasVolumeReversal = currentVolume >= breakoutVolume * volumeRatio;
    
    if (brokeAbove && trapExtension <= maxTrapExtension && returnedToRange && hasVolumeReversal) {
      const entryPrice = currentBarPrice * c['entry_on_return_mult']; // Enter on return
      const stopPrice = breakoutHigh * c['stop_above_trap_mult']; // Above trap high
      const targetPrice = rangeResult.rangeLow * c['target_range_low_mult']; // Target range support
      
      console.log(`[LiquidityTrap] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'liquidity_trap' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: c['base_confidence'],
        metadata: {
          trapLevel: rangeResult.rangeHigh,
          trapExtension: trapExtension * 100,
          stopZoneStrength: stopZone.clusterStrength,
          returnBars: trapReturnBars,
          volumeReversal: currentVolume / breakoutVolume
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "liquidity_trap",
        inputSnapshot: { currentPrice: currentBarPrice, rangeHigh: rangeResult.rangeHigh, breakoutHigh },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      // reorg-B2.1 OBJ-4: SKIP guard wiring — disabled + inverted (short) geometry, see the disable note
      // in this method's header (disabled at orchestrator/VTS per Batch 70.3). Omission is intentional.
      return signal;
    }
    
    setNullReason('breakout_fail');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "liquidity_trap",
      inputSnapshot: { currentPrice: priceHistory.length > 0 ? parseFloat(priceHistory[priceHistory.length - 1].close) : null },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Exit condition checking
  async checkExitConditions(
    trade: Trade, 
    currentPrice: number, 
    settings: TradingSettings
  ): Promise<boolean> {
    const entryPrice = parseFloat(trade.entryPrice);
    const stopPrice = parseFloat(trade.stopPrice);
    const targetPrice = parseFloat(trade.targetPrice);
    
    // Basic stop/target exits
    if (currentPrice <= stopPrice || currentPrice >= targetPrice) {
      return true;
    }
    
    // Strategy-specific exits
    switch (trade.strategy) {
      case 'vwap_pullback':
        return await this.checkVWAPPullbackExit(trade, currentPrice);
      
      case 'abcd_long':
        return await this.checkABCDExit(trade, currentPrice);
      
      case 'sma_trend_ride':
        return await this.checkSMATrendRideExit(trade, currentPrice);
      
      case 'breakout':
        return await this.checkBreakoutExit(trade, currentPrice);
      
      case 'mean_reversion':
        return await this.checkMeanReversionExit(trade, currentPrice);
      
      case 'range_trading':
        return await this.checkRangeTradingExit(trade, currentPrice);
      
      case 'vwap_bounce':
        return await this.checkVWAPBounceExit(trade, currentPrice);
      
      case 'liquidity_trap':
        return await this.checkLiquidityTrapExit(trade, currentPrice);
      
      default:
        return false;
    }
  }

  private async checkVWAPPullbackExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Get current VWAP for the symbol
    const recentData = await storage.getPriceData(trade.symbol);
    if (recentData.length === 0) return false;
    
    const latestData = recentData[recentData.length - 1];
    const currentVWAP = parseFloat(latestData.vwap || '0');
    
    // Exit if price closes below VWAP
    return currentPrice < currentVWAP;
  }

  private async checkABCDExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // ABCD typically exits on measured move or +2R
    // Additional exit: if pattern fails and goes back below entry
    const entryPrice = parseFloat(trade.entryPrice);
    return currentPrice < entryPrice * 0.995; // 0.5% below entry
  }

  private async checkSMATrendRideExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Get current SMA
    const recentData = await storage.getPriceData(trade.symbol);
    if (recentData.length === 0) return false;
    
    const latestData = recentData[recentData.length - 1];
    const currentSMA = parseFloat(latestData.sma || '0');
    
    // Exit if price closes below SMA
    return currentPrice < currentSMA;
  }

  private async checkBreakoutExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Breakout exits if price returns below the breakout level
    const metadata = trade.metadata as any;
    const breakoutLevel = metadata?.breakoutLevel;
    
    if (!breakoutLevel) return false;
    
    // Exit if price closes below breakout level
    return currentPrice < breakoutLevel * 0.995;
  }

  private async checkMeanReversionExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Mean reversion exits if price reaches the mean (target)
    // Already handled by target price check, no additional logic needed
    return false;
  }

  private async checkRangeTradingExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Range trading exits if price breaks above resistance (range invalidated)
    const metadata = trade.metadata as any;
    const rangeResistance = metadata?.rangeResistance;
    
    if (!rangeResistance) return false;
    
    // Exit if price breaks above resistance
    return currentPrice > rangeResistance * 1.002;
  }

  private async checkVWAPBounceExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // VWAP bounce exits if price closes below VWAP (trend broken)
    const recentData = await storage.getPriceData(trade.symbol);
    if (recentData.length === 0) return false;
    
    const latestData = recentData[recentData.length - 1];
    const currentVWAP = parseFloat(latestData.vwap || '0');
    
    // Exit if price closes below VWAP
    return currentPrice < currentVWAP;
  }

  private async checkLiquidityTrapExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Liquidity trap exits if price returns above the trap level (setup invalidated)
    const metadata = trade.metadata as any;
    const trapLevel = metadata?.trapLevel;
    
    if (!trapLevel) return false;
    
    // Exit if price goes back above trap level
    return currentPrice > trapLevel * 1.002;
  }

  // Helper methods
  // B79.0n.STRATEGY (2026-05-24): assetClass threaded from callers (detectVWAPPullback
  // + detectMeanReversion). Helper reads strategy.vwap_pullback levers — needs the
  // caller's resolved asset class to scope the row lookup correctly.
  private detectBullishReversal(indicators: TechnicalIndicators, assetClass: AssetClass): boolean {
    // Batch 45: ATR-relative pullback depth check.
    // B72.2: thresholds resolved from module_constants 'strategy.vwap_pullback'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.vwap_pullback', _SE_KEY('vwap_pullback', assetClass));
    const { currentPrice, vwap, low24h, high24h } = indicators;
    const atr = indicators.atr ?? (high24h - low24h) * c['atr_fallback_daily_range_frac'];
    if (atr <= 0 || vwap <= 0) return false;
    // Pullback depth: price is within N ATR below a recent high (VWAP acts as anchor)
    const pullbackFromVwap = currentPrice - vwap;
    const pullbackDepthATR = Math.abs(pullbackFromVwap) / atr;
    // Price should be near VWAP and not too far above it
    const nearVwap = pullbackDepthATR <= c['bullish_reversal_near_vwap_atr'];
    // Price should be in a pullback, not a free-fall (above low by at least N ATR)
    const aboveLowByAtr = (currentPrice - low24h) >= atr * c['bullish_reversal_above_low_atr'];
    return nearVwap && aboveLowByAtr;
  }

  private findSpike(data: PriceData[]): PriceData | null {
    if (data.length < 3) return null;
    
    let maxVolume = 0;
    let spikePoint: PriceData | null = null;
    
    for (const point of data) {
      const volume = parseFloat(point.volume);
      if (volume > maxVolume) {
        maxVolume = volume;
        spikePoint = point;
      }
    }
    
    return spikePoint;
  }

  private findPullback(data: PriceData[], aPoint: PriceData): PriceData | null {
    let minPrice = Infinity;
    let pullbackPoint: PriceData | null = null;
    
    for (const point of data) {
      const price = parseFloat(point.low);
      if (price < minPrice && new Date(point.timestamp) > new Date(aPoint.timestamp)) {
        minPrice = price;
        pullbackPoint = point;
      }
    }
    
    return pullbackPoint;
  }

  private findHigherLow(data: PriceData[], bPoint: PriceData): PriceData | null {
    const bLow = parseFloat(bPoint.low);
    
    for (const point of data) {
      const pointLow = parseFloat(point.low);
      if (pointLow > bLow && new Date(point.timestamp) > new Date(bPoint.timestamp)) {
        return point;
      }
    }
    
    return null;
  }

  private detectUptrend(prices: number[], sma: number): boolean {
    if (prices.length < 5) return false;
    
    const recent5 = prices.slice(-5);
    const allAboveSMA = recent5.every(price => price > sma);
    const risingTrend = recent5[recent5.length - 1] > recent5[0];
    
    return allAboveSMA && risingTrend;
  }

  private hasBouncePattern(data: PriceData[]): boolean {
    if (data.length < 3) return false;
    
    const closes = data.map(d => parseFloat(d.close));
    const hasLow = Math.min(...closes.slice(0, -1));
    const currentClose = closes[closes.length - 1];
    
    return currentClose > hasLow;
  }

  private calculateTrendStrength(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    let strength = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) strength++;
    }
    
    return strength / (prices.length - 1);
  }

  // Calculate technical indicators
  calculateVWAP(data: PriceData[]): number {
    if (data.length === 0) return 0;
    
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    for (const candle of data) {
      const typical = (parseFloat(candle.high) + parseFloat(candle.low) + parseFloat(candle.close)) / 3;
      const volume = parseFloat(candle.volume);
      
      totalVolumePrice += typical * volume;
      totalVolume += volume;
    }
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  calculateSMA(data: PriceData[], period: number): number {
    if (data.length < period) return 0;
    
    const recentData = data.slice(-period);
    const sum = recentData.reduce((acc, candle) => acc + parseFloat(candle.close), 0);
    
    return sum / period;
  }

  // Phase 27.F.14: Filter signals by confidence threshold
  filterByConfidence(signals: StrategySignal[], confidenceThreshold: number): StrategySignal[] {
    if (!signals || signals.length === 0) return [];
    
    const threshold = confidenceThreshold / 100; // Convert percentage to decimal
    const filtered = signals.filter(signal => signal.confidence >= threshold);
    
    const rejected = signals.length - filtered.length;
    if (rejected > 0) {
      console.log(`[27.F.14][StrategyEngine] Confidence threshold ${confidenceThreshold}% filtered out ${rejected} signal(s)`);
      signals.forEach(signal => {
        const passed = signal.confidence >= threshold ? '✅' : '❌';
        console.log(`  ${passed} ${signal.strategy} (${signal.symbol}): confidence ${(signal.confidence * 100).toFixed(0)}%`);
      });
    }
    
    return filtered;
  }

  // Phase 30: DHMA (Dual-Horizon Microstructure Alpha) Strategy
  detectDHMA(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    params: any,
    assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  ): StrategySignal | null {
    // B72.2: levers resolved from module_constants 'strategy.dhma'.
    // B79.0n.STRATEGY: per-class resolver scope.
    const c = getCachedNumbersForModule('strategy.dhma', _SE_KEY('dhma', assetClass));
    const theta_OBI = params.theta_OBI || c['theta_obi'];
    const epsilon_micro = params.epsilon_micro || c['epsilon_micro'];
    const tau_toxicity = params.tau_toxicity || c['tau_toxicity'];
    const maxSpread = params.maxSpread || c['max_spread_ticks'];
    const k_tp = params.k_tp || c['k_tp'];
    const N_flow = params.N_flow || c['n_flow'];
    const N_burst = params.N_burst || c['n_burst']; // Candles for burst regime
    const window_session = params.window_session || c['window_session']; // Candles for session regime
    
    if (!priceHistory || priceHistory.length < window_session) {
      console.log('[DHMA] Insufficient price history');
      setNullReason('insufficient_data');
      return null;
    }
    
    const { currentPrice, vwap, volume } = indicators;
    
    // Simplified microstructure features using OHLCV data
    // In production, these would use real order book + print data
    
    // 1. Order Book Imbalance (simulated from volume and price action)
    const recentCandles = priceHistory.slice(-c['obi_lookback_bars']);
    let buyPressure = 0;
    let sellPressure = 0;
    
    for (const candle of recentCandles) {
      const close = parseFloat(candle.close);
      const open = parseFloat(candle.open);
      const vol = parseFloat(candle.volume);
      
      if (close > open) {
        buyPressure += vol;
      } else {
        sellPressure += vol;
      }
    }
    
    const totalPressure = buyPressure + sellPressure;
    const obi = totalPressure > 0 ? (buyPressure - sellPressure) / totalPressure : 0;
    
    // 2. Microprice tilt (simulated as deviation from mid-range)
    const recentHigh = Math.max(...recentCandles.map(c => parseFloat(c.high)));
    const recentLow = Math.min(...recentCandles.map(c => parseFloat(c.low)));
    const mid = (recentHigh + recentLow) / 2;
    const micropriceTilt = (currentPrice - mid) / (recentHigh - recentLow) * c['microprice_tilt_norm']; // Normalized
    
    // 3. Signed flow ratio (simulated from volume-weighted price movement)
    let signedFlow = 0;
    const flowCandles = priceHistory.slice(-N_flow);
    
    for (const candle of flowCandles) {
      const close = parseFloat(candle.close);
      const open = parseFloat(candle.open);
      const vol = parseFloat(candle.volume);
      
      if (close > open) {
        signedFlow += vol;
      } else if (close < open) {
        signedFlow -= vol;
      }
    }
    
    const totalFlowVol = flowCandles.reduce((sum, c) => sum + parseFloat(c.volume), 0);
    const signedFlowRatio = totalFlowVol > 0 ? signedFlow / totalFlowVol : 0;
    
    // 4. Toxicity (simulated as volatility ratio - higher vol = higher toxicity)
    const recentVolatility = this.calculateVolatility(priceHistory.slice(-c['recent_vol_lookback']));
    const baselineVolatility = this.calculateVolatility(priceHistory.slice(-window_session));
    const toxicity = baselineVolatility > 0 ? Math.min(1, recentVolatility / baselineVolatility) : 0.5;
    
    // 5. Spread (simulated as percentage of price)
    const spread = (recentHigh - recentLow) / mid;
    const spreadTicks = spread * 100; // Approximate ticks
    
    // 6. Burst regime (short-term: last N_burst candles)
    const burstCandles = priceHistory.slice(-N_burst);
    const burstStart = parseFloat(burstCandles[0].close);
    const burstEnd = parseFloat(burstCandles[burstCandles.length - 1].close);
    const burstReturn = (burstEnd - burstStart) / burstStart;
    
    let burstRegime: 'long' | 'short' | 'neutral';
    if (burstReturn > c['burst_return_threshold']) burstRegime = 'long';
    else if (burstReturn < -c['burst_return_threshold']) burstRegime = 'short';
    else burstRegime = 'neutral';
    
    // 7. Session regime (longer-term: last window_session candles)
    const sessionCandles = priceHistory.slice(-window_session);
    const sessionVWAP = this.calculateVWAP(sessionCandles);
    const sessionStart = parseFloat(sessionCandles[0].close);
    const sessionEnd = parseFloat(sessionCandles[sessionCandles.length - 1].close);
    const sessionSlope = (sessionEnd - sessionStart) / sessionStart;
    const sessionVolSlope = this.calculateVolatility(sessionCandles.slice(-10)) - 
                            this.calculateVolatility(sessionCandles.slice(0, 10));
    
    let sessionRegime: 'up' | 'down' | 'chop';
    if (sessionSlope > c['session_slope_threshold'] && currentPrice > sessionVWAP) sessionRegime = 'up';
    else if (sessionSlope < -c['session_slope_threshold'] && currentPrice < sessionVWAP) sessionRegime = 'down';
    else sessionRegime = 'chop';
    
    console.log(`[DHMA] Features: OBI=${obi.toFixed(2)}, microTilt=${micropriceTilt.toFixed(2)}, flow=${signedFlowRatio.toFixed(2)}, tox=${toxicity.toFixed(2)}, burst=${burstRegime}, session=${sessionRegime}`);
    
    // Entry rules: block if toxicity too high or spread too wide
    if (toxicity > tau_toxicity) {
      console.log(`[DHMA] ❌ High toxicity ${toxicity.toFixed(2)} > ${tau_toxicity}`);
      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "dhma",
        inputSnapshot: { currentPrice, toxicity, tau_toxicity },
        output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null, rejectionReason: "high_toxicity" }
      }));
      setNullReason('toxicity_high');
      return null;
    }
    
    if (spreadTicks > maxSpread) {
      console.log(`[DHMA] ❌ Wide spread ${spreadTicks.toFixed(1)}t > ${maxSpread}t`);
      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "dhma",
        inputSnapshot: { currentPrice, spreadTicks, maxSpread },
        output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null, rejectionReason: "wide_spread" }
      }));
      setNullReason('spread_wide');
      return null;
    }
    
    // Long entry: burst & session agree, OBI positive, microprice tilt positive
    const longSignal = (
      burstRegime === 'long' &&
      sessionRegime === 'up' &&
      obi > theta_OBI &&
      micropriceTilt > epsilon_micro &&
      signedFlowRatio > c['signed_flow_long_threshold']
    );

    // Short entry: burst & session agree, OBI negative, microprice tilt negative
    const shortSignal = (
      burstRegime === 'short' &&
      sessionRegime === 'down' &&
      obi < -theta_OBI &&
      micropriceTilt < -epsilon_micro &&
      signedFlowRatio < c['signed_flow_short_threshold']
    );
    
    // Batch 45: Block short signals — system is long-only
    if (!longSignal) {
      setNullReason(shortSignal ? 'short_disabled_long_only' : 'regime_alignment');
      console.log(`[DHMA] ❌ ${shortSignal ? 'Short signal blocked (long-only system)' : 'No regime alignment'}`);
      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "dhma",
        inputSnapshot: { currentPrice, obi, micropriceTilt, burstRegime, sessionRegime },
        output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
      }));
      return null;
    }

    // Calculate entry/stop/target (long only)
    const realizedVol = recentVolatility;
    const entryPrice = currentPrice * c['entry_premium_mult'];
    const stopPrice = currentPrice - k_tp * realizedVol;
    const targetPrice = currentPrice + k_tp * realizedVol;

    // Confidence calculation
    let confidence = c['base_confidence'];
    confidence += Math.abs(obi) * c['confidence_weight_obi'];
    confidence += Math.abs(signedFlowRatio) * c['confidence_weight_flow'];
    confidence -= toxicity * c['confidence_penalty_toxicity'];
    confidence = Math.max(c['confidence_floor'], Math.min(c['confidence_ceiling'], confidence));
    
    // REB 2.12D: Multi-timeframe confirmation for DHMA
    // This is called synchronously since we need the adjustment immediately
    // Note: In production, this would be async but for now we log the intent
    console.log(`[REB2.12D][DHMA] Pre-MTF confidence: ${(confidence * 100).toFixed(0)}%`);
    
    // Apply MTF adjustment based on trend direction matching
    // If burst/session regimes agree with 15m/1h trends, boost confidence
    const mtfAdjustment = (burstRegime === 'long' && sessionRegime === 'up') ||
                          (burstRegime === 'short' && sessionRegime === 'down') ? c['mtf_confidence_adjustment'] : -c['mtf_confidence_adjustment'];
    confidence += mtfAdjustment;
    confidence = Math.max(c['confidence_floor'], Math.min(c['post_mtf_confidence_ceiling'], confidence));

    const direction = longSignal ? 'long' : 'short';
    const valid = confidence >= c['valid_confidence_threshold'];
    
    console.log(`[REB2.12D][DHMA] { symbol: "${indicators.currentPrice.toFixed(2)}", confidence: ${(confidence * 100).toFixed(0)}%, direction: "${direction}", valid: ${valid} }`);
    console.log(`[DHMA] ✅ Signal ${direction} - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%`);
    
    const signal: StrategySignal = {
      symbol: '',
      strategy: 'dhma' as const,
      entryPrice,
      stopPrice,
      targetPrice,
      confidence,
      metadata: {
        obi,
        micropriceTilt,
        signedFlowRatio,
        toxicity,
        spreadTicks,
        burstRegime,
        sessionRegime,
        k_tp,
        realizedVolatility: realizedVol
      }
    };

    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "dhma",
      inputSnapshot: { currentPrice, obi, micropriceTilt, burstRegime, sessionRegime },
      output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
    }));
    
    // Phase 41F-I: Record signal emission metric (non-blocking)
    telemetryService.recordTradeMetric('signal_emit', {
      strategy: 'dhma',
      strength: confidence,
      direction: longSignal ? 'long' : 'short'
    }).catch(err => console.error('[Strategy] Telemetry error:', err));

    // reorg-B2.1 OBJ-4: reachability ATR via computeATR(priceHistory) — this strategy's geometry is
    // non-ATR (SMA/VWAP/realizedVol), so the pair ATR is the path-invariant feasibility input
    // (reachability is a property of the PAIR, not the strategy). #371 covers the computeATR-vs-
    // mceContext.atr divergence for ALL guard-wired in-class incl. these 3 non-ATR-geometry strategies.
    {
      const _gate = getPerClassTargetGate(assetClass);
      const _effATR = clampEffectiveATR(computeATR(priceHistory), entryPrice);
      const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
      recordGuardEval('dhma', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
      if (!_gr.pass) { setNullReason('guard_fail'); return null; }
    }

    return signal;
  }

  // ═══════════════════════════════════════════════════════════════
  // Directive 12.3.2: 8 New Strategy Detection Methods (file-based wrappers)
  // Each delegates to its corresponding module in server/strategies/
  //
  // B79.0n.STRATEGY (2026-05-24): all wrappers gain REQUIRED `assetClass: AssetClass`
  // parameter, threaded into the file-based detect function's matching parameter.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Directive 12.3.2: Morning Star / Evening Star (PATTERN)
   * 3-bar reversal pattern with volume confirmation
   */
  detectMorningStar(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectMorningStar(indicators, candles, patternSignal, assetClass);
  }

  /**
   * Directive 12.3.2: Inside Bar Reversal (PATTERN)
   * Compression breakout with BUY/SELL support
   */
  detectInsideBarReversal(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectInsideBarReversal(indicators, candles, patternSignal, assetClass);
  }

  /**
   * Directive 12.3.2: Support Bounce (PATTERN)
   * Multi-touch support level with pinbar confirmation
   */
  detectSupportBounce(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectSupportBounce(indicators, candles, patternSignal, assetClass);
  }

  /**
   * Directive 12.3.2: Pivot Shift (HYBRID)
   * RSI neutral zone + ADX acceleration with MORNING_STAR pattern
   */
  detectPivotShift(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectPivotShift(indicators, candles, patternSignal, assetClass);
  }

  /**
   * Directive 12.3.2: Reverse Impulse (HYBRID)
   * Counter-trend bounce after momentum exhaustion
   */
  detectReverseImpulse(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectReverseImpulse(indicators, candles, patternSignal, assetClass);
  }

  /**
   * Directive 12.3.2: Defensive Hedge (HYBRID)
   * Decorrelated asset selection in bear volatile regime
   */
  detectDefensiveHedge(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    btcCandles: PriceData[] | undefined,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectDefensiveHedge(indicators, candles, patternSignal, assetClass, btcCandles);
  }

  /**
   * Directive 12.3.2: Adaptive Flow (HYBRID)
   * Momentum inversion detection in low-vol chop
   */
  detectAdaptiveFlow(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectAdaptiveFlow(indicators, candles, patternSignal, assetClass);
  }

  /**
   * Directive 12.3.2: Volatility Edge (HYBRID)
   * ABCD pattern with volatility premium in high-vol impulse
   */
  detectVolatilityEdge(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectVolatilityEdge(indicators, candles, patternSignal, assetClass);
  }

  /**
   * B63: Strong Bull Trend (QUANT, LONG-only)
   * Donchian N-bar breakout on confirmed strong positive DBS (|DBS| >= 0.35).
   * Exclusive lane via sourcePool='quant-strong_trend' routing.
   */
  detectStrongBullTrend(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    assetClass: AssetClass,
  ): StrategySignal | null {
    return detectStrongBullTrend(indicators, candles, patternSignal, assetClass);
  }

  /**
   * B79.0d: Opening Range Breakout (ORB) — xstock_spot only, 14:30–17:00 UTC active window.
   * Triple-defense asset-class guard (detect-internal + this method's caller in
   * signal-orchestrator + SQE whitelist).
   *
   * B79.0n.STRATEGY (2026-05-24): ctx promoted to REQUIRED (was optional with default
   * `'xstock_spot'` for back-compat). All callers now pass explicit ctx.assetClass.
   */
  detectORB(
    symbol: string,
    candles: PriceData[],
    indicators: TechnicalIndicators,
    ctx: { assetClass: AssetClass; symbol: string; now?: Date },
  ): StrategySignal | null {
    return detectORB(symbol, candles, indicators, ctx);
  }

  private calculateVolatility(data: PriceData[]): number {
    if (data.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < data.length; i++) {
      const r = (parseFloat(data[i].close) - parseFloat(data[i-1].close)) / parseFloat(data[i-1].close);
      returns.push(r);
    }
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
}
