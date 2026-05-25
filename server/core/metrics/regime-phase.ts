/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B67.2 — Phase Dimension (EARLY / PRIME / LATE)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Sub-classifies the existing 5 canonical regimes by regime AGE.
 * Per BATCH_67_2_SCOPE.md (Langston-approved cc-inbox #844, 2026-04-28).
 *
 * Why this exists: the per-pair regime classifier has no notion of regime age.
 * A pair that just entered TFS (impulse capture phase) is treated identically
 * to a pair that's been TFS for 12+ hours (exhaustion-prone). The 04-22 hostile
 * day cohort showed strong-bull-trend trades on aged TFS regimes catastrophically
 * underperforming fresh-entry TFS — the canonical exhaustion failure mode.
 *
 * Architecture: phase is computed alongside regime (NOT inside the classifier).
 * Phase preference modulates each strategy's effective regime confidence on
 * signal admission via a per-(strategy, phase) weight from a 54-cell table
 * approved cc-inbox #843 with the range_trade tweak applied.
 *
 * Continuous-scoring invariant: phase preference is a multiplier, NOT a hard
 * gate. A signal in slightly-off phase still admits if other inputs are
 * strong.
 *
 * Per Kyle directive 2026-04-29: no shadow flag, no fallbacks. Modifier always
 * computed and always applied. Missing weight key throws hard.
 *
 * ── State ─────────────────────────────────────────────────────────────────
 *
 * Per-pair regime age tracked by `regimePhaseStore` singleton (this module).
 * In-memory only for v1 (cold-start warmup acceptable). Pattern matches
 * directional-bias-store from B63 Item 16.
 *
 * Lifecycle:
 *   regimePhaseStore.tick(symbol, currentRegime, now)  → returns ageMs
 *   computePhase(ageMs, earlyMaxHours, primeMaxHours)  → 'EARLY' | 'PRIME' | 'LATE'
 *   applyPhasePreference(strategy, phase, weights, baseConf)  → modulated confidence
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import type { OHLCData, RegimeConfig } from '../../types/market-regime.types';
import { calculatePairRegime } from './market-regime';
// B79.0n.MCE: AssetClass threaded through BackfillContext so the backfill
// walk re-runs calculatePairRegime with the pair's real asset class.
import type { AssetClass } from '../../../shared/asset-classes';

export type RegimePhase = 'EARLY' | 'PRIME' | 'LATE';

/**
 * B67.3.5 — Minimum candles required by `calculatePairRegime` to produce a
 * stable label. ADX needs period+1 = 15; momentum needs lookback ≥ 5;
 * volatility needs ≥ 2. Conservatively require 30 candles for the backfill
 * walk, matching `computeMomentum`'s lookback ceiling.
 */
const BACKFILL_MIN_CANDLES = 30;

/** Default 60-min windows × 12 = 12h (LATE-phase ceiling). */
const BACKFILL_DEFAULT_WINDOWS = 12;
const BACKFILL_DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/**
 * B67.3.5 — Optional context passed into `regimePhaseStore.tick` to enable
 * historical-OHLC backfill on first observation. Caller (MCE) supplies the
 * pair's recent OHLC + current DBS + resolved RegimeConfig. If omitted,
 * `tick` falls back to legacy behavior (`enteredAt = now`).
 */
export interface BackfillContext {
  /** Recent OHLC for the pair, most-recent-last. ≥ 30 candles required. */
  ohlcData: OHLCData[];
  /** Current DBS score (used as approximation for historical windows). */
  dbsScore: number;
  /** Resolved regime config from module_constants. */
  regimeConfig: RegimeConfig;
  /**
   * B79.0n.MCE: REQUIRED — the pair's asset class. The backfill walk re-runs
   * `calculatePairRegime`, which now requires an explicit asset class so the
   * historical re-classification uses the correct per-class regime thresholds.
   */
  assetClass: AssetClass;
  /** Optional: number of windows to walk backward (default 12). */
  windowsToWalk?: number;
  /** Optional: window size in ms (default 60min). */
  windowSizeMs?: number;
}

/**
 * Per-symbol entry tracked by the store. Reset whenever the regime changes.
 */
interface PairPhaseEntry {
  /** Last-observed regime label for this pair. */
  regime: string;
  /** Epoch ms when this regime label was first observed (ageMs anchor). */
  enteredAt: number;
  /** Epoch ms of the most recent tick (for stale-eviction if added later). */
  lastSeenAt: number;
}

// B67.2.1 follow-up 2026-04-29 (Kyle directive): persistence for survival
// across restarts. Writing through to /tmp matches the trailing-state file
// pattern (server/services/trailing-exit-controller.ts). Written
// synchronously on each tick (low cost — Map is bounded by pair count).
// Read at module load so a fresh process inherits accumulated regime ages
// from the prior process. Without this, every PM2 restart resets every
// pair's age to 0 → all pairs show EARLY for the first 2h, the dashboard
// is uninformative.
const PERSIST_FILE = '/tmp/regime-phase-store.json';
const STALE_HARD_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h: drop entries older than this

class RegimePhaseStore {
  private entries: Map<string, PairPhaseEntry> = new Map();
  private dirty: boolean = false;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, PairPhaseEntry>;
      const now = Date.now();
      let loaded = 0;
      let expired = 0;
      for (const [symbol, entry] of Object.entries(data)) {
        if (entry && entry.regime && Number.isFinite(entry.enteredAt)) {
          // Drop entries whose lastSeenAt is older than 24h — they're
          // probably stale from a long-ago run, not relevant to current state.
          if (entry.lastSeenAt && now - entry.lastSeenAt > STALE_HARD_EXPIRY_MS) {
            expired++;
            continue;
          }
          this.entries.set(symbol, entry);
          loaded++;
        }
      }
      console.log(
        `[B67.2][regimePhaseStore] Loaded ${loaded} pairs from ${PERSIST_FILE} (expired ${expired})`,
      );
    } catch (err) {
      console.warn(
        '[B67.2][regimePhaseStore] Failed to load persisted state:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private saveToDisk(): void {
    try {
      const data: Record<string, PairPhaseEntry> = {};
      for (const [symbol, entry] of this.entries) {
        data[symbol] = entry;
      }
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(data));
      this.dirty = false;
    } catch (err) {
      console.warn(
        '[B67.2][regimePhaseStore] Failed to persist state:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Record a per-pair tick. Returns the regime age in milliseconds.
   *
   * - First time we see a symbol: create entry with `enteredAt = now`.
   * - Same regime as last tick: keep `enteredAt`; update `lastSeenAt`.
   * - Different regime than last tick: reset `enteredAt = now` (regime
   *   transition); update both timestamps. Caller can detect transitions
   *   by comparing the returned ageMs to the prior tick's value (a near-zero
   *   ageMs after a previously larger value indicates transition).
   */
  tick(
    symbol: string,
    currentRegime: string,
    now: number,
    backfillCtx?: BackfillContext,
  ): number {
    const existing = this.entries.get(symbol);
    if (existing && existing.regime === currentRegime) {
      existing.lastSeenAt = now;
      this.dirty = true;
      // Throttle disk writes — only persist if 60s+ since last write.
      // Implementation: write every 60th tick. Cheap heuristic. Alternative
      // is a setInterval timer but that adds another lifecycle to manage.
      if (Math.random() < 0.02) this.saveToDisk(); // ~2% of ticks
      return now - existing.enteredAt;
    }
    // First observation OR regime transition.
    //
    // B67.3.5 backfill: only on FIRST observation (no existing entry). Regime
    // transitions get the standard `enteredAt = now` because the transition
    // moment IS when the pair entered the new regime. Cold pairs need backfill
    // because we missed the actual entry boundary.
    let enteredAt = now;
    if (!existing && backfillCtx) {
      enteredAt = this.backfillFromHistory(symbol, currentRegime, backfillCtx, now);
    }
    this.entries.set(symbol, {
      regime: currentRegime,
      enteredAt,
      lastSeenAt: now,
    });
    this.saveToDisk();
    return now - enteredAt;
  }

  /**
   * B67.3.5 — Walk backward through historical OHLC to find when the pair
   * actually entered the current regime. Returns an epoch-ms timestamp for
   * `enteredAt`.
   *
   * Mechanism: for each backward window, slice the OHLC up to that window's
   * end-time, re-run `calculatePairRegime`, and check the regime label. The
   * most recent window where the label DIFFERS from the current regime marks
   * the boundary; `enteredAt` = that window's end-time (i.e. the start of the
   * first window where the pair was in the current regime).
   *
   * Approximations (Langston cc-inbox #850 Q2):
   * - DBS at the historical window time uses CURRENT DBS (we don't have
   *   historical DBS). The regime label is fairly robust because vol +
   *   momentum + ADX carry most of the classification signal.
   *
   * Edge cases:
   * - If no different regime found within the walk window: `enteredAt = now -
   *   (windowsToWalk × windowSizeMs)` — caps age at the walk depth, so the
   *   pair lands in LATE phase immediately. `computePhase` already handles
   *   this correctly.
   * - If insufficient candles for a stable classification: emit structured
   *   warning + return `now`. Pair starts as EARLY and accrues age normally.
   */
  private backfillFromHistory(
    symbol: string,
    currentRegime: string,
    ctx: BackfillContext,
    now: number,
  ): number {
    const ohlc = ctx.ohlcData;
    const windows = ctx.windowsToWalk ?? BACKFILL_DEFAULT_WINDOWS;
    const windowMs = ctx.windowSizeMs ?? BACKFILL_DEFAULT_WINDOW_MS;

    if (!ohlc || ohlc.length < BACKFILL_MIN_CANDLES) {
      console.warn(
        `[regime-phase][backfill] insufficient_history pair=${symbol} ` +
          `candles=${ohlc?.length ?? 0} (min=${BACKFILL_MIN_CANDLES})`,
      );
      return now;
    }

    // OHLC is most-recent-last. The "current" window ends at the last candle's
    // timestamp; each step back is one window earlier.
    // Walk: for w = 1..windows, slice OHLC up to (now - w × windowMs) and
    // classify. The first (most recent) walk where label != currentRegime is
    // the boundary.
    for (let w = 1; w <= windows; w++) {
      const cutoffMs = now - w * windowMs;
      const slice = ohlc.filter((c) => c.timestamp <= cutoffMs);
      if (slice.length < BACKFILL_MIN_CANDLES) {
        // Not enough history at this depth — stop walking; cap age here.
        const enteredAt = now - (w - 1) * windowMs;
        console.log(
          `[regime-phase][backfill] applied pair=${symbol} regime=${currentRegime} ` +
            `age_minutes=${Math.floor(((w - 1) * windowMs) / 60000)} (history-cap)`,
        );
        return enteredAt;
      }
      const result = calculatePairRegime(
        slice,
        ctx.dbsScore,
        0,   // B68.5: identity dbsSlope — backfill is for label, not gating;
             // historical DBS slope unavailable so use 0 (Path B admit).
             // RegimeConfig.b68_5DbsSlopeMin = 0 means slope=0 admits.
        1.0, // identity macro modifier — backfill is for label, not modulation
        ctx.regimeConfig,
        ctx.assetClass, // B79.0n.MCE: pair's asset class threaded via BackfillContext.
      );
      if (result.regime !== currentRegime) {
        // Found the boundary: pair was in a different regime at window w,
        // so it entered the current regime between window w-1 and w. Use the
        // start of window w-1 (i.e. cutoff at w-1 windows back) as enteredAt.
        const enteredAt = now - (w - 1) * windowMs;
        console.log(
          `[regime-phase][backfill] applied pair=${symbol} regime=${currentRegime} ` +
            `age_minutes=${Math.floor(((w - 1) * windowMs) / 60000)} (boundary-found)`,
        );
        return enteredAt;
      }
    }
    // Walked the full window without finding a different regime — pair has
    // been in this regime for at least `windows × windowMs`. Cap at that
    // depth; pair lands in LATE phase per existing computePhase logic.
    const enteredAt = now - windows * windowMs;
    console.log(
      `[regime-phase][backfill] applied pair=${symbol} regime=${currentRegime} ` +
        `age_minutes=${Math.floor((windows * windowMs) / 60000)} (window-cap)`,
    );
    return enteredAt;
  }

  /** Returns the current entry for a symbol (or undefined). Test/diagnostic only. */
  peek(symbol: string): PairPhaseEntry | undefined {
    return this.entries.get(symbol);
  }

  /**
   * B68.4 (cheap-tier bundle, 2026-05-01) — Read-only age accessor.
   *
   * Returns the symbol's current regime age in milliseconds, OR undefined if
   * the pair is untracked. Used by signal-orchestrator + vts-runner to
   * compute the B68.4 freshness factor without requiring a full `tick` (which
   * would mutate state).
   *
   * Caller passes `now` for testability; production passes `Date.now()`.
   */
  peekAgeMs(symbol: string, now: number): number | undefined {
    const entry = this.entries.get(symbol);
    if (!entry) return undefined;
    return now - entry.enteredAt;
  }

  /** Returns the number of tracked symbols. Diagnostic. */
  size(): number {
    return this.entries.size;
  }

  /** Test-only: reset all state. */
  clear(): void {
    this.entries.clear();
  }
}

/** Singleton instance, exported for MCE consumption + tests. */
export const regimePhaseStore = new RegimePhaseStore();

/**
 * Compute phase from regime age and configured boundaries.
 *
 * Boundaries from `module_constants.regime_phase.b67_2_early_phase_max_hours`
 * (default 2.0) and `b67_2_prime_phase_max_hours` (default 12.0). Both
 * required — caller resolves and passes in. No fallbacks.
 */
export function computePhase(
  ageMs: number,
  earlyMaxHours: number,
  primeMaxHours: number,
): RegimePhase {
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < earlyMaxHours) return 'EARLY';
  if (ageHours < primeMaxHours) return 'PRIME';
  return 'LATE';
}

/**
 * Apply phase preference weight to a base confidence value.
 *
 * Lookup key: `<strategy>_<phase>` (e.g. `vwap_pullback_PRIME`,
 * `strong_bull_trend_LATE`). Hard-fail on missing key per Kyle directive
 * 2026-04-29. The migration MUST seed all 54 cells; if a future batch adds a
 * new canonical strategy, that batch's migration must seed its 3 phase rows.
 *
 * Returned value is the strategy's effective regime confidence used at signal
 * admission. NOT FinalScore. NOT a hard gate.
 *
 * Shared utility called from both signal-orchestrator (active path) and
 * vts-runner (VTS mirror path). Inlining the same lookup + multiplication
 * logic in two files would drift; the shared function makes lockstep
 * enforcement automatic.
 */
export function applyPhasePreference(
  strategy: string,
  phase: RegimePhase,
  weights: Record<string, number>,
  baseConfidence: number,
  assetClass: AssetClass,
): number {
  const key = `${strategy}_${phase}`;
  const weight = weights[key];
  if (weight === undefined) {
    throw new Error(
      `[B67.2][missing-weight] no entry for ${key} in strategy_phase_weights blob ` +
      `for asset_class=${assetClass}. B79.0n.CONFIDENCE-CHAIN: per-class blob — ` +
      `migration must seed all (strategy × phase) cells for this asset class. ` +
      `Add to module_constants and redeploy.`,
    );
  }
  return baseConfidence * weight;
}

// ─── B76 (2026-05-06) — Phase preference ablation builder ─────────────────

import type { FactorAlternate, RegimeDecision } from '../../services/factor-ablation-emitter.js';

/**
 * Build the B67.2 phase-preference ablation alternate row.
 *
 * **B76 contract (chain-final):** caller MUST pass `realConfidenceFinal` =
 * the chain-final modulated confidence (post-clamp). Counterfactual
 * "as-if-phase-preference-absent" =
 *   alt.confidence = realConfidenceFinal × (1 / phaseWeight)
 * because phase preference is a multiplicative factor on the chain
 * (`baseConf × weight × ...other factors...`). Dividing by weight recovers
 * "what the chain-final value would have been without this multiplier".
 *
 * Edge case: weight === 0 → return realConfidenceFinal unchanged (no division).
 *
 * Replaces the inline ablation block previously duplicated in
 * `signal-orchestrator.ts:733` and `vts-runner.ts:1517`.
 */
export function buildB67_2Alternate(
  realConfidenceFinal: number,
  realRegimeLabel: string,
  phase: RegimePhase,
  phaseAgeSeconds: number,
  strategy: string,
  phaseWeight: number,
  assetClass: AssetClass,
): FactorAlternate {
  const confidenceWithoutFactor =
    phaseWeight > 0 ? realConfidenceFinal / phaseWeight : realConfidenceFinal;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      // B76: chain-final reference + counterfactual
      confidence_with_factor: realConfidenceFinal,
      confidence_without_factor: confidenceWithoutFactor,
      phase,
      phase_age_seconds: phaseAgeSeconds,
      strategy_phase_weight: phaseWeight,
      regime_label: realRegimeLabel,
      // B79.0n.CONFIDENCE-CHAIN: stamp asset class for dashboard / replay filterability.
      asset_class: assetClass,
    },
  };

  return {
    factorName: 'b67_2_phase_preference',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}
