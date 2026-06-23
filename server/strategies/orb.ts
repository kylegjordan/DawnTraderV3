/**
 * B79.0d — Opening Range Breakout (ORB) strategy — REAL IMPLEMENTATION.
 *
 * Type:      EQUITY-MICROSTRUCTURE
 * Direction: BUY only (LONG-only system — B79.0m.b2 2026-05-11; down-break
 *            returns null with `setNullReason('sell_disabled_long_only')`,
 *            mirrors `inside-bar-reversal.ts:131-134` pattern)
 * Key:       orb
 * Asset:     xstock_spot only (24/5 names — explicitly NOT 24/7 names which have no "open bell")
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DESIGN (Langston B79.0d Q1-Q7 lock 2026-05-09)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   Q1: Open-range window = calendar-fixed 14:30–15:00 UTC (US RTH first 30min).
 *   Q2: Breakout buffer = 0.15 × ATR (regime-adaptive, mirrors SBT pattern).
 *   Q3: Active breakout window = 15:00–17:00 UTC (2 hours; late-day filtered out).
 *   Q4: Confidence = clamp(0.65 + 0.20*min(range/atr, 3.0) + 0.10*(volMult-1), [0.55, 0.90]).
 *   Q5: Regime mapping = IMPULSE_EXPANSION + STRUCTURAL_TRANSITION (vol-discovery natural fits).
 *   Q6: Triple-defense asset-class guard: detect-internal + dispatch-block + SQE whitelist.
 *   Q7: B73 ablation auto-included — the replay-service (`exit-strategy-
 *       replay-service.ts`) is strategy-agnostic; ORB trades flow through
 *       automatically once `persistRealPriceTrade` runs with strategy='orb'.
 *       No registration code required (Langston B79.0d Step 4 F2 confirmation).
 *
 * Layer-1 thresholds in module_constants `strategy.orb` (xstock_spot scope):
 *   open_range_minutes        = 30
 *   breakout_buffer_atr_mult  = 0.15
 *   target_range_multiple     = 2.0   (multiplier of rangeHeight for target
 *                                      distance — i.e. targetPrice = entry ±
 *                                      target_range_multiple × rangeHeight.
 *                                      NOT a realized reward-to-risk ratio.
 *                                      Realized R:R drifts ~1.3:1 because
 *                                      actual risk = entry−rangeLow >
 *                                      rangeHeight once breakout has cleared.
 *                                      Renamed from `risk_reward_ratio` in
 *                                      B79.0j 2026-05-10; resolves
 *                                      RUNNING_ISSUES #90, Langston B79.0d
 *                                      Step 4 F1.)
 *   volume_multiple_min       = 1.5
 *   confidence_base           = 0.65
 *   range_atr_clamp_max       = 3.0  (Q4 nit lock)
 *   active_window_hours       = 2     (15:00–17:00 UTC)
 *
 * GATE: `module_constants.strategy_gates.xstock_spot.orb.enabled` — flipped TRUE in B79.0d.
 *
 * ROLLBACK: DB-only. `UPDATE module_constants SET value=false WHERE strategy='orb' AND constant_name='enabled'`
 * neutralizes ORB on next tick (cached sync API picks up the change). No code revert needed.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { StrategySignal, TechnicalIndicators } from '../services/strategy-engine';
import type { PriceData } from '@shared/schema';
import type { AssetClass } from '@shared/asset-classes';
import {
  getCachedConstant,
  getCachedNumbersForModule,
} from '../services/module-constants-service.js';
import { setNullReason } from '../utils/null-reason-tracker.js';
import { applyGlobalGuards, clampEffectiveATR } from './strategy-helpers.js';
import { getPerClassTargetGate } from '../core/calculations/expectancy.js';
import { recordGuardEval } from './guard-eval-tracker.js';

const STRATEGY_KEY = 'orb';
const LOG_PREFIX = '[B79.0d][ORB]';

// Calendar-fixed UTC window constants (Q1+Q3 lock).
// 14:30 UTC = NYSE open in winter (EST UTC-5); 1h after NYSE open in summer
// (EDT UTC-4 → NYSE opens 13:30 UTC). Calendar-fixed UTC chosen per Q1
// (avoids per-symbol first-tick state); seasonal NYSE drift accepted as
// Layer-1 noise to be calibrated in B79.x. (Langston B79.0d Step 4 F3 fix.)
const RTH_OPEN_HOUR_UTC = 14;
const RTH_OPEN_MINUTE_UTC = 30;
const ACTIVE_WINDOW_END_HOUR_UTC = 17; // 17:00 UTC end of active breakout window

let _disabledLogCount = 0;
let _outsideWindowLogCount = 0;

interface OrbContext {
  assetClass: AssetClass;  // B79.0n.STRATEGY — was `string`; now typed to AssetClass union
  symbol: string;
  now?: Date; // injectable for tests; defaults Date.now()
}

/** Returns true if `now` is inside the 30-min open-range formation window. */
function isInOpenRangeFormation(now: Date, openRangeMinutes: number): boolean {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const totalMins = h * 60 + m;
  const openTotalMins = RTH_OPEN_HOUR_UTC * 60 + RTH_OPEN_MINUTE_UTC;
  return totalMins >= openTotalMins && totalMins < openTotalMins + openRangeMinutes;
}

/** Returns true if `now` is inside the post-formation active breakout window. */
function isInActiveBreakoutWindow(now: Date, openRangeMinutes: number, activeWindowHours: number): boolean {
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  const totalMins = h * 60 + m;
  const formationEnd = RTH_OPEN_HOUR_UTC * 60 + RTH_OPEN_MINUTE_UTC + openRangeMinutes;
  const activeEnd = formationEnd + activeWindowHours * 60;
  return totalMins >= formationEnd && totalMins < activeEnd;
}

/** Compute high/low range from 1m candles inside the open-range formation window. */
function computeOpeningRange(
  candles: PriceData[],
  now: Date,
  openRangeMinutes: number,
): { high: number; low: number; volSum: number } | null {
  if (!candles || candles.length === 0) return null;

  const today = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    RTH_OPEN_HOUR_UTC, RTH_OPEN_MINUTE_UTC, 0, 0,
  ));
  const startMs = today.getTime();
  const endMs = startMs + openRangeMinutes * 60 * 1000;

  let high = -Infinity;
  let low = Infinity;
  let volSum = 0;
  let bars = 0;

  for (const bar of candles) {
    const ts = new Date(bar.timestamp).getTime();
    if (ts < startMs || ts >= endMs) continue;
    const bh = parseFloat(bar.high as unknown as string);
    const bl = parseFloat(bar.low as unknown as string);
    const bv = parseFloat(bar.volume as unknown as string);
    if (Number.isFinite(bh)) high = Math.max(high, bh);
    if (Number.isFinite(bl)) low = Math.min(low, bl);
    if (Number.isFinite(bv)) volSum += bv;
    bars++;
  }

  if (bars === 0 || !Number.isFinite(high) || !Number.isFinite(low)) return null;
  return { high, low, volSum };
}

/**
 * B79.0d ORB detect — REAL IMPLEMENTATION.
 *
 * @param symbol - canonical xstock_spot symbol (e.g. 'AMZN/USD')
 * @param priceData - 1m candle history (chronological, latest last)
 * @param indicators - TechnicalIndicators with atr + volume + currentPrice
 * @param ctx - optional context for asset-class guard + injected clock for tests
 */
export function detectORB(
  symbol: string,
  priceData: PriceData[],
  indicators: TechnicalIndicators,
  ctx: OrbContext,  // B79.0n.STRATEGY — REQUIRED (was optional with 'xstock_spot' back-compat default)
): StrategySignal | null {
  // ── Defense guard (Q6) — detect-internal layer ──────────────────────────
  // Asset-class: xstock_spot only.
  // B79.0n.STRATEGY: ctx now REQUIRED; no back-compat default. Caller surface
  // (signal-orchestrator dispatch block + vts-runner callStrategyDetect + xstock_spot
  // eval-cycle) all pass explicit ctx.assetClass.
  const assetClass = ctx.assetClass;
  if (assetClass !== 'xstock_spot') return null;

  // B-NEW-36 sub-batch (c) (2026-05-20): removed the per-symbol weekend-bypass
  // branch that short-circuited the 10 designated "24/7" names. Empirical
  // Q9 verification showed those 10 names share identical hours with the
  // other ~255 (Sun 8PM ET → Fri 8PM ET open; Fri 8PM ET → Sun 8PM ET
  // closed). The bypass would have caused ORB to skip those 10 names every
  // day at NYSE-open even though they HAVE the same opening bell as the
  // others. Since ORB is currently disabled (`enabled=false` per B-NEW-34)
  // the branch was dead-code; but it was also wrong-by-empirics — removed
  // both for that reason and because re-enabling ORB without the empirical
  // fix would have silently broken the strategy on the 10 names.

  // ── DB gate (cached sync API; B79.0d flipped to true) ───────────────────
  // B79.0n.STRATEGY: resolver-key uses ctx.assetClass instead of hardcoded 'xstock_spot'
  // for shape consistency across all 19 strategies. Behavior unchanged — the asset-class
  // guard above already returned null for non-xstock_spot callers.
  let enabled: boolean | undefined;
  try {
    enabled = getCachedConstant<boolean>(
      'strategy_gates', 'enabled',
      { exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*' },
    );
  } catch {
    enabled = undefined;
  }
  if (enabled !== true) {
    _disabledLogCount++;
    if (_disabledLogCount === 1) {
      console.log(`${LOG_PREFIX} dormant — DB flag strategy_gates.xstock_spot.orb.enabled !== true`);
    }
    return null;
  }

  // ── Time-window check (Q1+Q3) — uses injectable clock for tests ─────────
  const now = ctx.now ?? new Date();

  // Read Layer-1 thresholds in bulk (B72 pattern).
  // B79.0n.STRATEGY: resolver-key uses ctx.assetClass for shape consistency.
  let c: Record<string, number>;
  try {
    c = getCachedNumbersForModule('strategy.orb', {
      exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
    });
  } catch {
    return null; // module not warm — fail-soft
  }

  const ORB_OPEN_RANGE_MINUTES   = c['open_range_minutes'] ?? 30;
  const ORB_BREAKOUT_BUFFER_ATR  = c['breakout_buffer_atr_mult'] ?? 0.15;
  const ORB_TARGET_RANGE_MULT    = c['target_range_multiple'] ?? 2.0;
  const ORB_VOL_MULT_MIN         = c['volume_multiple_min'] ?? 1.5;
  const ORB_CONF_BASE            = c['confidence_base'] ?? 0.65;
  const ORB_RANGE_ATR_CLAMP_MAX  = c['range_atr_clamp_max'] ?? 3.0;
  const ORB_ACTIVE_WINDOW_HOURS  = c['active_window_hours'] ?? 2;

  // Range-formation phase: no signals (range still being established).
  if (isInOpenRangeFormation(now, ORB_OPEN_RANGE_MINUTES)) {
    return null;
  }
  // Outside active window: no signals.
  if (!isInActiveBreakoutWindow(now, ORB_OPEN_RANGE_MINUTES, ORB_ACTIVE_WINDOW_HOURS)) {
    _outsideWindowLogCount++;
    if (_outsideWindowLogCount % 100 === 1) {
      console.log(`${LOG_PREFIX} ${symbol} outside active window (now ${now.toISOString()}; count=${_outsideWindowLogCount})`);
    }
    return null;
  }

  // ── Compute opening range from candles ──────────────────────────────────
  const orRange = computeOpeningRange(priceData, now, ORB_OPEN_RANGE_MINUTES);
  if (!orRange) return null;

  const { high: rangeHigh, low: rangeLow, volSum: orVolume } = orRange;
  const rangeHeight = rangeHigh - rangeLow;
  if (rangeHeight <= 0) return null;

  const atr = indicators.atr ?? 0;
  if (atr <= 0) return null;
  const buffer = ORB_BREAKOUT_BUFFER_ATR * atr;

  // ── Breakout detection ──────────────────────────────────────────────────
  const currentPrice = indicators.currentPrice;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const upBreak = currentPrice > rangeHigh + buffer;
  const downBreak = currentPrice < rangeLow - buffer;
  if (!upBreak && !downBreak) return null;

  // ── Volume confirmation ─────────────────────────────────────────────────
  // B.1.5 (2026-05-30): re-source `currentVolume` from the LAST OHLC BAR's
  // volume (per-bar unit, same stream as `orVolume`) rather than
  // `indicators.volume` (which carries the MCE 24h field — for xStock that's
  // the UNDERLYING equity's share volume, ~700× the token's; for crypto the
  // 24h is the token's real volume but still a denominator mismatch vs a per-
  // minute average). This restores unit coherence so the `volumeMultiple`
  // ratio is meaningful. Fix scope: ORB is xstock_spot-only via the gate at
  // line 157, so this change cannot bleed to crypto. Threshold recalibration
  // (`ORB_VOL_MULT_MIN`) is a separate Phase 25 / B.3 calibration concern.
  // NOTE: ORB is currently disabled (`strategy_gates.enabled=false` per
  // B-NEW-34); this fix is forward-looking for when it's re-enabled.
  // Pre-audit §2 Row-6 + Langston Q3 option (b).
  const currentVolume = priceData.length > 0 ? Number(priceData[priceData.length - 1].volume ?? 0) : 0;
  // Estimate the "normal" 1m volume across the open-range window for a relative multiple.
  const orMinutes = Math.max(1, ORB_OPEN_RANGE_MINUTES);
  const avgOrBarVol = orVolume / orMinutes;
  const volumeMultiple = avgOrBarVol > 0 ? currentVolume / avgOrBarVol : 0;
  if (volumeMultiple < ORB_VOL_MULT_MIN) return null;

  // ── Geometry (entry/stop/target) ────────────────────────────────────────
  // B79.0m.b2: LONG-only enforcement. Down-break (SELL) returns null with
  // setNullReason. Mirrors inside-bar-reversal.ts:131-134 pattern. The system
  // is long-only (capital constraint, post-audit roadmap "Short trading
  // DEFERRED INDEFINITELY"); any SELL leak would produce SHORT trades which
  // the rest of the pipeline isn't designed for.
  if (!upBreak) {
    setNullReason('sell_disabled_long_only');
    return null;
  }
  const direction: 'BUY' = 'BUY';
  const entryPrice = currentPrice;
  const stopPrice = rangeLow;                                              // opposite range extreme
  const targetPrice = entryPrice + ORB_TARGET_RANGE_MULT * rangeHeight;    // target distance = mult × rangeHeight

  // ── Confidence (Q4 with Langston nit: clamp range/atr term) ─────────────
  const rangeAtrNormRaw = rangeHeight / atr;
  const rangeAtrNorm = Math.min(rangeAtrNormRaw, ORB_RANGE_ATR_CLAMP_MAX);
  const confRaw = ORB_CONF_BASE + 0.20 * rangeAtrNorm + 0.10 * Math.max(0, volumeMultiple - 1);
  const confidence = Math.max(0.55, Math.min(0.90, confRaw));

  console.log(`${LOG_PREFIX} ${symbol} ${direction} signal | range=[${rangeLow.toFixed(4)},${rangeHigh.toFixed(4)}] (h=${rangeHeight.toFixed(4)}, atr=${atr.toFixed(4)}, n=${rangeAtrNorm.toFixed(2)}) | px=${currentPrice.toFixed(4)} buf=${buffer.toFixed(4)} | volMult=${volumeMultiple.toFixed(2)} | conf=${confidence.toFixed(3)} | stop=${stopPrice.toFixed(4)} tp=${targetPrice.toFixed(4)}`);

  // reorg-B2.1 OBJ-4: per-class shared guard (RR + reachability) at signal generation, consolidated
  // from the downstream normalizer; record the suppression instrumentation (#372/#371). effectiveATR =
  // the guard's clamp on this strategy's own ATR. Dominates the single signal return below.
  {
    const _gate = getPerClassTargetGate(assetClass);
    const _effATR = clampEffectiveATR(atr, entryPrice);
    const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, _effATR, _gate);
    recordGuardEval('orb', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
    if (!_gr.pass) { setNullReason('guard_fail'); return null; }
  }

  return {
    symbol,
    strategy: STRATEGY_KEY as any, // 'orb' added to enum in strategy-engine.ts
    entryPrice,
    stopPrice,
    targetPrice,
    confidence,
    metadata: {
      direction,
      rangeHigh,
      rangeLow,
      rangeHeight,
      buffer,
      atr,
      volumeMultiple,
      rangeAtrNorm,
      windowStart: `${RTH_OPEN_HOUR_UTC}:${RTH_OPEN_MINUTE_UTC.toString().padStart(2,'0')} UTC`,
      activeUntilHourUTC: ACTIVE_WINDOW_END_HOUR_UTC,
    },
  };
}

/** Convenience alias matching the file/index export pattern. */
export const detect = detectORB;
