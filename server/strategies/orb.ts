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
import {
  getCachedConstant,
  getCachedNumbersForModule,
} from '../services/module-constants-service.js';
import { XSTOCK_SPOT_24_7_SYMBOLS } from '../../shared/asset-classes.js';
import { setNullReason } from '../utils/null-reason-tracker.js';

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
let _no24_7LogCount = 0;
let _outsideWindowLogCount = 0;

interface OrbContext {
  assetClass: string;
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
  ctx?: OrbContext,
): StrategySignal | null {
  // ── Triple-defense guard (Q6) — detect-internal layer ───────────────────
  // (a) Asset-class: xstock_spot only.
  const assetClass = ctx?.assetClass ?? 'xstock_spot'; // dispatch passes; default for back-compat
  if (assetClass !== 'xstock_spot') return null;

  // (b) Extended-hours names have no daily opening bell (Langston scope review
  // concern #1). Per B79.0L correction 2026-05-10: these names aren't actually
  // 24/7 — they trade Sun 8PM ET → Fri 8PM ET continuously (120 hours/week).
  // No opening bell within the open window means ORB doesn't apply to them.
  // The constant name XSTOCK_SPOT_24_7_SYMBOLS is preserved from B79.0c for
  // stability across many call sites; cosmetic rename queued.
  if (XSTOCK_SPOT_24_7_SYMBOLS.has(symbol)) {
    _no24_7LogCount++;
    if (_no24_7LogCount === 1 || _no24_7LogCount % 1000 === 0) {
      console.log(`${LOG_PREFIX} ${symbol} skipped — extended-hours name has no daily opening bell (count=${_no24_7LogCount})`);
    }
    return null;
  }

  // ── DB gate (cached sync API; B79.0d flipped to true) ───────────────────
  let enabled: boolean | undefined;
  try {
    enabled = getCachedConstant<boolean>(
      'strategy_gates', 'enabled',
      { exchange: '*', assetClass: 'xstock_spot', strategy: STRATEGY_KEY, regime: '*' },
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
  const now = ctx?.now ?? new Date();

  // Read Layer-1 thresholds in bulk (B72 pattern).
  let c: Record<string, number>;
  try {
    c = getCachedNumbersForModule('strategy.orb', {
      exchange: '*', assetClass: 'xstock_spot', strategy: STRATEGY_KEY, regime: '*',
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
  const currentVolume = indicators.volume ?? 0;
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
