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

export type RegimePhase = 'EARLY' | 'PRIME' | 'LATE';

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

class RegimePhaseStore {
  private entries: Map<string, PairPhaseEntry> = new Map();

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
  tick(symbol: string, currentRegime: string, now: number): number {
    const existing = this.entries.get(symbol);
    if (existing && existing.regime === currentRegime) {
      existing.lastSeenAt = now;
      return now - existing.enteredAt;
    }
    // New symbol or regime change → reset.
    this.entries.set(symbol, {
      regime: currentRegime,
      enteredAt: now,
      lastSeenAt: now,
    });
    return 0;
  }

  /** Returns the current entry for a symbol (or undefined). Test/diagnostic only. */
  peek(symbol: string): PairPhaseEntry | undefined {
    return this.entries.get(symbol);
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
): number {
  const key = `${strategy}_${phase}`;
  const weight = weights[key];
  if (weight === undefined) {
    throw new Error(
      `[B67.2][missing-weight] no entry for ${key} in strategy_phase_weights blob. ` +
      `Migration must seed all 54 cells. Add to module_constants and redeploy.`,
    );
  }
  return baseConfidence * weight;
}
