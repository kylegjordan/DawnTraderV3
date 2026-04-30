/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B73 — Exit-Strategy Ablation Framework: Variant Replay
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Pure-function replay of 12 exit-strategy variants against a closed trade's
 * 1-min OHLC bars. Observation only — does not affect actual exit behavior.
 *
 * Per BATCH_73_SCOPE.md + BATCH_73_PRE_AUDIT.md (Langston-approved Step 1
 * cc-inbox #861, Step 2 cc-inbox #862).
 *
 * ── Variants ─────────────────────────────────────────────────────────────────
 *   BE-stop:
 *     A — current BE-stop (baseline, anchors on b73_baseline_* constants)
 *     B — ATR-padded BE+ (BE + b73_variant_b_be_atr_pad × ATR)
 *     C — Higher trigger (b73_variant_c_be_trigger_r × ATR favorable to latch)
 *     D — Trailing instead of BE
 *     E — Vol-conditional skip (skip BE if pair vol > P75 threshold)
 *     F — NO BE-stop (pure original SL only)
 *
 *   Trailing-stop:
 *     G — Current trailing (baseline = b73_baseline_trail_distance_atr × ATR)
 *     H — Tighter trail (b73_variant_h_trail_distance_atr × ATR)
 *     I — Looser trail (b73_variant_i_trail_distance_atr × ATR)
 *     J — NO trailing (let target/SL fire)
 *
 *   Combined:
 *     K — NO BE + NO trail (pure target/SL — minimum-intervention baseline)
 *     L — ATR-padded BE+ AND looser trail (best-of-both candidate)
 *
 * ── Convention ───────────────────────────────────────────────────────────────
 *   1-min OHLC granularity. Within-bar precision lost — convention: any bar
 *   where low ≤ exit_level (BUY) or high ≥ exit_level (SELL) → triggered.
 *   Conservative; matches real-stop semantics.
 *
 *   Trailing-stop replay is stateful (peak + level + ATR multiplier).
 *   Moonbag/ladder replay deferred to v2 per Langston cc-inbox #859.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData } from '../types/market-regime.types';

export type VariantId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export type VariantExitReason =
  | 'TP_target_hit'
  | 'SL_hit'
  | 'BE_stop'
  | 'TRAIL_hit'
  | 'TIMEOUT'
  | 'INSUFFICIENT_DATA';

export interface VirtualExit {
  variantId: VariantId;
  variantName: string;
  exitPrice: number | null;
  exitReason: VariantExitReason;
  exitTime: number | null;
  pnlPct: number | null;
  durationMin: number | null;
  metadata: Record<string, unknown>;
}

export interface ReplayConfig {
  // Variant A baseline (snapshot at deploy; NOT live trailing_exit values per Langston Q1)
  baselineBeTriggerR: number;
  baselineTrailDistanceAtr: number;
  // Variant params
  variantBBeAtrPad: number;
  variantCBeTriggerR: number;
  variantHTrailDistanceAtr: number;
  variantITrailDistanceAtr: number;
  variantEVolP75Threshold: number;
  // Global
  maxHoldMs: number;
}

export interface ReplayInputs {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  entryTime: number;
  target: number;
  originalStopPrice: number;
  atr: number;
  volatility: number;
  ohlcBars: OHLCData[];
  config: ReplayConfig;
  // B73.1 (2026-04-30): realized-trade pass-through fields. Per Langston
  // cc-inbox #864 Q2(b)+(c):
  //   - Variant A (current_BE_stop_baseline) IS live truth. No re-simulation.
  //     The baseline anchor must equal what actually happened, otherwise the
  //     paired-diff Sharpe vs A is meaningless.
  //   - When a variant's logic doesn't fire any level within the OHLC replay
  //     window (TIMEOUT case), inherit the realized exit values rather than
  //     emitting a synthetic last-bar mid. Non-firing variants then register
  //     zero diff vs A — clean signal, real differentiation only when the
  //     variant actually fires a different exit.
  actualExitPrice: number;
  actualExitTime: number;
  actualExitReason: 'TP_target_hit' | 'SL_hit' | 'BE_stop' | 'TRAIL_hit' | 'TIMEOUT';
  actualPnlPct: number;
  // B73.2 (2026-04-30, Langston cc-inbox #866): ATR validation metadata.
  // `atr` (above) is the value used for trigger thresholds (bar-derived
  // post-B73.2). `atrLive` is the value computed by the live MCE indicator
  // pipeline at trade open. Logging both per variant lets post-hoc analysis
  // quantify the live↔bar ATR divergence — diagnostic for understanding why
  // variants do or don't fire.
  atrLive?: number;
  atrBarDerived?: number;
}

const VARIANT_NAMES: Record<VariantId, string> = {
  A: 'current_BE_stop_baseline',
  B: 'atr_padded_BE_plus',
  C: 'higher_BE_trigger',
  D: 'trailing_instead_of_BE',
  E: 'vol_conditional_skip',
  F: 'no_BE_stop',
  G: 'current_trailing_baseline',
  H: 'tighter_trail',
  I: 'looser_trail',
  J: 'no_trailing',
  K: 'no_BE_no_trail',
  L: 'BE_plus_and_looser_trail',
};

/**
 * Run all 12 variants on a closed trade. Returns 12 VirtualExit records.
 */
export function replayAllVariants(inputs: ReplayInputs): VirtualExit[] {
  if (!inputs.ohlcBars || inputs.ohlcBars.length === 0) {
    return (Object.keys(VARIANT_NAMES) as VariantId[]).map(id =>
      mkInsufficient(id),
    );
  }
  return [
    // B73.1 (2026-04-30): Variant A copies realized truth — no re-simulation.
    // Per Langston cc-inbox #864 Q2(b).
    mkVariantAFromRealized(inputs),
    replayBe(inputs, 'B', { trigger: inputs.config.baselineBeTriggerR, atrPad: inputs.config.variantBBeAtrPad }),
    replayBe(inputs, 'C', { trigger: inputs.config.variantCBeTriggerR, atrPad: 0 }),
    replayTrailOnly(inputs, 'D', inputs.config.baselineTrailDistanceAtr),
    replayBeConditional(inputs, 'E'),
    replayPureSlTp(inputs, 'F', { allowBe: false, trailMultiplier: null }),
    replayTrailing(inputs, 'G', inputs.config.baselineTrailDistanceAtr),
    replayTrailing(inputs, 'H', inputs.config.variantHTrailDistanceAtr),
    replayTrailing(inputs, 'I', inputs.config.variantITrailDistanceAtr),
    replayPureSlTp(inputs, 'J', { allowBe: true, trailMultiplier: null }),
    replayPureSlTp(inputs, 'K', { allowBe: false, trailMultiplier: null }),
    replayCombined(inputs, 'L'),
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * B73.1 (2026-04-30): Variant A pass-through. A is the live baseline — its
 * outcome IS the actual realized trade outcome, not a re-simulation. Per
 * Langston cc-inbox #864 Q2(b).
 */
function mkVariantAFromRealized(inputs: ReplayInputs): VirtualExit {
  return {
    variantId: 'A',
    variantName: VARIANT_NAMES.A,
    exitPrice: inputs.actualExitPrice,
    exitReason: inputs.actualExitReason,
    exitTime: inputs.actualExitTime,
    pnlPct: inputs.actualPnlPct,
    durationMin: durationMin(inputs.entryTime, inputs.actualExitTime),
    metadata: withAtrMetadata(inputs, { source: 'realized_truth' }),
  };
}

function mkInsufficient(id: VariantId): VirtualExit {
  return {
    variantId: id,
    variantName: VARIANT_NAMES[id],
    exitPrice: null,
    exitReason: 'INSUFFICIENT_DATA',
    exitTime: null,
    pnlPct: null,
    durationMin: null,
    metadata: { reason: 'no_ohlc_bars' },
  };
}

function pnlPct(side: 'BUY' | 'SELL', entry: number, exit: number): number {
  return side === 'BUY' ? ((exit / entry) - 1) * 100 : ((entry / exit) - 1) * 100;
}

function durationMin(entryMs: number, exitMs: number): number {
  return Math.round((exitMs - entryMs) / 60000);
}

function isTimedOut(barTs: number, entryMs: number, maxHoldMs: number): boolean {
  return barTs - entryMs > maxHoldMs;
}

/**
 * B73.1 (2026-04-30): When a variant's logic doesn't fire any level within the
 * OHLC replay window, inherit the realized exit values rather than emitting a
 * synthetic last-bar mid. This eliminates the artificial 12-way tie that made
 * the data un-decision-grade — non-firing variants register zero diff vs A,
 * and real differentiation only shows up when a variant actually changes the
 * exit. Per Langston cc-inbox #864 Q2(c).
 *
 * The reason is preserved as the realized reason (typically TIMEOUT, but can
 * be BE_stop, TRAIL_hit, etc. when a real exit fired but the variant's
 * threshold structure wouldn't have triggered the same level).
 */
function timeoutExit(id: VariantId, inputs: ReplayInputs, meta: Record<string, unknown> = {}): VirtualExit {
  return {
    variantId: id,
    variantName: VARIANT_NAMES[id],
    exitPrice: inputs.actualExitPrice,
    exitReason: inputs.actualExitReason,
    exitTime: inputs.actualExitTime,
    pnlPct: inputs.actualPnlPct,
    durationMin: durationMin(inputs.entryTime, inputs.actualExitTime),
    metadata: withAtrMetadata(inputs, { ...meta, source: 'realized_inherited' }),
  };
}

/**
 * Hit-checks for a BUY trade (level-crossing semantics):
 *   target hit  : bar.high >= target
 *   sl hit      : bar.low  <= sl
 * Inverted for SELL.
 */
function checkTargetHit(side: 'BUY' | 'SELL', bar: OHLCData, level: number): boolean {
  return side === 'BUY' ? bar.high >= level : bar.low <= level;
}
function checkStopHit(side: 'BUY' | 'SELL', bar: OHLCData, level: number): boolean {
  return side === 'BUY' ? bar.low <= level : bar.high >= level;
}

// ─── Variant evaluators ───────────────────────────────────────────────────────

/**
 * BE-stop variants (A, B, C). Latch BE when favorable move ≥ triggerR × ATR.
 * After latch, exit at BE level (with optional ATR pad above BE for B).
 */
function replayBe(
  inputs: ReplayInputs,
  id: VariantId,
  params: { trigger: number; atrPad: number },
): VirtualExit {
  const { side, entryPrice, target, originalStopPrice, atr, ohlcBars, config } = inputs;
  const triggerOffset = atr * params.trigger;
  const triggerLevel = side === 'BUY' ? entryPrice + triggerOffset : entryPrice - triggerOffset;
  const beLevel = side === 'BUY' ? entryPrice + atr * params.atrPad : entryPrice - atr * params.atrPad;
  let beLatched = false;

  for (const bar of ohlcBars) {
    if (isTimedOut(bar.timestamp, inputs.entryTime, config.maxHoldMs)) {
      return timeoutExit(id, inputs, { be_latched: beLatched });
    }
    // Check TP first (would have hit target before any stop)
    if (checkTargetHit(side, bar, target)) {
      return mkExit(id, inputs, target, 'TP_target_hit', bar.timestamp, { be_latched: beLatched });
    }
    // Check SL
    if (checkStopHit(side, bar, originalStopPrice)) {
      // If BE latched, the BE stop applies (above original SL for BUY, below for SELL)
      if (beLatched) {
        return mkExit(id, inputs, beLevel, 'BE_stop', bar.timestamp, { be_latched: true });
      }
      return mkExit(id, inputs, originalStopPrice, 'SL_hit', bar.timestamp, { be_latched: false });
    }
    // Check BE stop (only if latched and price retraces)
    if (beLatched && checkStopHit(side, bar, beLevel)) {
      return mkExit(id, inputs, beLevel, 'BE_stop', bar.timestamp, { be_latched: true });
    }
    // Latch BE if not yet latched and trigger hit
    if (!beLatched && checkTargetHit(side, bar, triggerLevel)) {
      beLatched = true;
    }
  }
  return timeoutExit(id, inputs, { be_latched: beLatched, partial_window: true });
}

/**
 * Variant D: trailing instead of BE. Activate trail when triggerR × ATR
 * favorable move; trail at baselineTrailDistanceAtr × ATR.
 */
function replayTrailOnly(inputs: ReplayInputs, id: VariantId, trailMultiplier: number): VirtualExit {
  return runTrailingMachine(inputs, id, {
    triggerR: inputs.config.baselineBeTriggerR,
    trailMultiplier,
    allowBe: false,
  });
}

/**
 * Variant E: vol-conditional skip. If pair vol > P75 threshold, skip BE
 * entirely (run as no-BE). Otherwise run as Variant A.
 */
function replayBeConditional(inputs: ReplayInputs, id: VariantId): VirtualExit {
  if (inputs.volatility > inputs.config.variantEVolP75Threshold) {
    return replayPureSlTp(inputs, id, { allowBe: false, trailMultiplier: null });
  }
  return replayBe(inputs, id, { trigger: inputs.config.baselineBeTriggerR, atrPad: 0 });
}

/**
 * Variants F, J, K: pure target/SL with optional BE latch and optional trail.
 * If allowBe=false, no BE-latch logic. If trailMultiplier=null, no trailing.
 */
function replayPureSlTp(
  inputs: ReplayInputs,
  id: VariantId,
  params: { allowBe: boolean; trailMultiplier: number | null },
): VirtualExit {
  const { side, entryPrice, target, originalStopPrice, ohlcBars, config } = inputs;

  for (const bar of ohlcBars) {
    if (isTimedOut(bar.timestamp, inputs.entryTime, config.maxHoldMs)) {
      return timeoutExit(id, inputs);
    }
    if (checkTargetHit(side, bar, target)) {
      return mkExit(id, inputs, target, 'TP_target_hit', bar.timestamp, {});
    }
    if (checkStopHit(side, bar, originalStopPrice)) {
      return mkExit(id, inputs, originalStopPrice, 'SL_hit', bar.timestamp, {});
    }
  }
  return timeoutExit(id, inputs);
}

/**
 * Trailing-stop variants (G, H, I). Activate trail at baseline trigger R,
 * then trail at variant-specific multiplier × ATR.
 */
function replayTrailing(inputs: ReplayInputs, id: VariantId, trailMultiplier: number): VirtualExit {
  return runTrailingMachine(inputs, id, {
    triggerR: inputs.config.baselineBeTriggerR,
    trailMultiplier,
    allowBe: false,
  });
}

/**
 * Variant L: ATR-padded BE+ AND looser trail. Latch BE+pad first; if price
 * continues higher and target_lock_r is reached, flip to trailing.
 */
function replayCombined(inputs: ReplayInputs, id: VariantId): VirtualExit {
  // BE+pad first
  const { side, entryPrice, target, originalStopPrice, atr, ohlcBars, config } = inputs;
  const triggerOffset = atr * config.baselineBeTriggerR;
  const triggerLevel = side === 'BUY' ? entryPrice + triggerOffset : entryPrice - triggerOffset;
  const beLevel = side === 'BUY' ? entryPrice + atr * config.variantBBeAtrPad : entryPrice - atr * config.variantBBeAtrPad;
  const trailMultiplier = config.variantITrailDistanceAtr;
  let phase: 'pre' | 'be_latched' | 'trailing' = 'pre';
  let peak = entryPrice;
  const targetLockR = 1.5; // mirror tec-evaluator DEFAULTS
  const targetLockOffset = atr * targetLockR;

  for (const bar of ohlcBars) {
    if (isTimedOut(bar.timestamp, inputs.entryTime, config.maxHoldMs)) {
      return timeoutExit(id, inputs, { phase });
    }
    // Track peak (favorable extreme)
    peak = side === 'BUY' ? Math.max(peak, bar.high) : Math.min(peak, bar.low);
    // TP check
    if (checkTargetHit(side, bar, target)) {
      return mkExit(id, inputs, target, 'TP_target_hit', bar.timestamp, { phase });
    }
    // Original SL check (only when not BE-latched)
    if (phase === 'pre' && checkStopHit(side, bar, originalStopPrice)) {
      return mkExit(id, inputs, originalStopPrice, 'SL_hit', bar.timestamp, { phase: 'pre' });
    }
    // BE+ check (when latched)
    if (phase === 'be_latched' && checkStopHit(side, bar, beLevel)) {
      return mkExit(id, inputs, beLevel, 'BE_stop', bar.timestamp, { phase: 'be_latched' });
    }
    // Trail check (when trailing)
    if (phase === 'trailing') {
      const trailLevel = side === 'BUY' ? peak - atr * trailMultiplier : peak + atr * trailMultiplier;
      if (checkStopHit(side, bar, trailLevel)) {
        return mkExit(id, inputs, trailLevel, 'TRAIL_hit', bar.timestamp, { phase: 'trailing', peak });
      }
    }
    // Phase transitions (after exit checks so we don't latch on the same bar that retraces)
    if (phase === 'pre' && checkTargetHit(side, bar, triggerLevel)) {
      phase = 'be_latched';
    }
    if (phase === 'be_latched') {
      const targetLockLevel = side === 'BUY' ? entryPrice + targetLockOffset : entryPrice - targetLockOffset;
      if (checkTargetHit(side, bar, targetLockLevel)) {
        phase = 'trailing';
      }
    }
  }
  return timeoutExit(id, inputs, { phase });
}

/**
 * Trailing-only state machine (used by D, G, H, I).
 * Activate trail at triggerR × ATR favorable move, then trail at trailMultiplier × ATR
 * from peak.
 */
function runTrailingMachine(
  inputs: ReplayInputs,
  id: VariantId,
  params: { triggerR: number; trailMultiplier: number; allowBe: boolean },
): VirtualExit {
  const { side, entryPrice, target, originalStopPrice, atr, ohlcBars, config } = inputs;
  const triggerOffset = atr * params.triggerR;
  const triggerLevel = side === 'BUY' ? entryPrice + triggerOffset : entryPrice - triggerOffset;
  let trailActive = false;
  let peak = entryPrice;

  for (const bar of ohlcBars) {
    if (isTimedOut(bar.timestamp, inputs.entryTime, config.maxHoldMs)) {
      return timeoutExit(id, inputs, { trail_active: trailActive });
    }
    peak = side === 'BUY' ? Math.max(peak, bar.high) : Math.min(peak, bar.low);
    if (checkTargetHit(side, bar, target)) {
      return mkExit(id, inputs, target, 'TP_target_hit', bar.timestamp, { trail_active: trailActive });
    }
    if (!trailActive && checkStopHit(side, bar, originalStopPrice)) {
      return mkExit(id, inputs, originalStopPrice, 'SL_hit', bar.timestamp, { trail_active: false });
    }
    if (trailActive) {
      const trailLevel = side === 'BUY' ? peak - atr * params.trailMultiplier : peak + atr * params.trailMultiplier;
      if (checkStopHit(side, bar, trailLevel)) {
        return mkExit(id, inputs, trailLevel, 'TRAIL_hit', bar.timestamp, { trail_active: true, peak });
      }
    }
    if (!trailActive && checkTargetHit(side, bar, triggerLevel)) {
      trailActive = true;
    }
  }
  return timeoutExit(id, inputs, { trail_active: trailActive });
}

function mkExit(
  id: VariantId,
  inputs: ReplayInputs,
  exitPrice: number,
  reason: VariantExitReason,
  exitTime: number,
  metadata: Record<string, unknown>,
): VirtualExit {
  return {
    variantId: id,
    variantName: VARIANT_NAMES[id],
    exitPrice,
    exitReason: reason,
    exitTime,
    pnlPct: pnlPct(inputs.side, inputs.entryPrice, exitPrice),
    durationMin: durationMin(inputs.entryTime, exitTime),
    metadata: withAtrMetadata(inputs, metadata),
  };
}

/**
 * B73.2 (2026-04-30, Langston cc-inbox #866): inject ATR validation metadata
 * onto every variant emit so post-hoc analysis can diagnose live↔bar ATR
 * divergence. Helper centralizes the merge so future metadata fields stay
 * additive without touching call sites.
 */
function withAtrMetadata(
  inputs: ReplayInputs,
  meta: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...meta,
    atr_live: inputs.atrLive ?? null,
    atr_bar_derived: inputs.atrBarDerived ?? null,
    atr_used_for_triggers: inputs.atr,
  };
}
