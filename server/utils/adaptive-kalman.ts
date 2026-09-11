/**
 * Directive 9.3 — Adaptive Kalman Filter (Efficiency Ratio Model)
 * 
 * Dynamically adjusts smoothing responsiveness based on:
 * - Efficiency Ratio (ER): Measures trend directional integrity
 * - Volatility Noise (VolNoise): Measures price noise vs smoothness
 * 
 * Purpose:
 * - Suppress false signals during "chop" regimes
 * - Amplify responsiveness during sustained directional integrity
 * - Provide smoothed, latency-controlled prices to Orchestrator and signal evaluators
 */

export interface KalmanState {
  x: number | null;
  P: number;
  lastER: number;
  lastVolNoise: number;
  lastR: number;
  lastQ: number;
  lastK: number;
  updateCount: number;
}

export interface KalmanDiagnostics {
  symbol: string;
  state: number | null;
  P: number;
  lastER: number;
  lastVolNoise: number;
  lastR: number;
  lastQ: number;
  lastK: number;
  updateCount: number;
  isInitialized: boolean;
  /** B-PRICE-SIDE-BY-JOB r5 P-7j (SIM S26): bar closes absorbed by the last explicit re-warm; 0 = seeded raw or not started. */
  warmedFromCloses: number;
}

/**
 * B-PRICE-SIDE-BY-JOB r5 P-7j r2 (Langston chunk-2 BLOCKER-1): the gain the FIRST live observation receives after an
 * explicit re-warm.
 * The re-warm feeds the orchestrator's 60-MINUTE bar closes (up to Kraken's 720-candle batch,
 * `ohlcCache.getOHLCData(symbol, 60)`) through a process model with NO elapsed-time term: `Q` is charged per step, so an
 * hour between two closes is modelled as one live tick. After a few hundred closes `P` sits at that model's steady state
 * (`P^2 = Q(P + R)`, K about 0.05-0.13), so the warmed estimate is an average of roughly the last 10-20 HOURLY closes
 * that presents as confident, and it would shed its distance from the live price by only a few percent per advance.
 * Inflating `P` at the end of the warm states the un-modelled gap honestly: the first live read carries this share of
 * the weight, the prior keeps the rest, and the gain then decays on its own as live observations arrive.
 * A model constant, like the R clip (1..50) and the Q floor (0.1) below; not a tuning knob.
 * r3 (Langston chunk-2 r2 conditions 1-3):
 * - THE DERIVATION, AND ITS CADENCE DEPENDENCE. A model-consistent warm would charge each hourly step
 *   `Q_warm = Q_live x (3600 / t)`, where `t` is the live observation cadence. At R 26 and Q 0.5 that gives a first live
 *   gain of 0.85 at t = 15 s, 0.75 at 30 s and 0.64 at 60 s; 0.9 corresponds to t of about 8.5 s. Today's crypto
 *   re-serve cadence is the `#951` sawtooth (14.3 / 29.3 / 44.3 / 59.3 s), so the model implies 0.64-0.85, and 0.9
 *   over-weights the live read by 5-26 points. That is the fail-safe direction, because the prior is a known-stale
 *   average of hourly closes. FALSIFIER: wiring the 2 s `openTrade` lane (`#977`) pushes the derived gain to about 0.97
 *   and makes 0.9 conservative; a longer cadence makes it more aggressive. One constant is exact at one (R, Q, t) only.
 * - THE DECAY LENGTH, as a number: from the inflated P the gain runs 0.900, 0.479, 0.333, 0.260 and so on, and is within
 *   10% of the steady-state gain (0.129 at R 26, Q 0.5) only at the 12th live observation (test 12). At today's cadence
 *   that is 3-12 minutes of a lightly smoothed filter after every restart.
 * - LAZY: the warm only FLAGS the inflation, and the next `applyObservation` applies it with ITS OWN R, so the first live
 *   gain is exactly this constant whatever ER the warm used (test 14).
 * - `updateCount` includes the warm's steps (up to 720). Diagnostics only; no production reader.
 */
export const REWARM_FIRST_LIVE_GAIN = 0.9;

/** 9.3.C measurement noise, `R_t = clip(1 + (1 - ER) x 50, 1, 50)`. ONE definition, shared by the update and the re-warm. */
function measurementNoise(ER: number): number {
  return Math.max(1, Math.min(50, 1 + (1 - ER) * 50));
}

export class AdaptiveKalmanFilter {
  private x: number | null = null;
  private P = 1;
  private lastER = 0;
  private lastVolNoise = 0;
  private lastR = 1;
  private lastQ = 0.1;
  private lastK = 0;
  private updateCount = 0;
  private symbol: string;
  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7j (decision D7; PR-A6): the key of the last OBSERVATION the state absorbed.
   * `getSmoothedPrice` is called on every signal evaluation, but its input is a cached price that is rewritten
   * only when the cache refreshes — so the filter was advancing again and again on the SAME observation, as if
   * each repeated read were new market information. A read carrying the same key returns the current estimate
   * untouched; only a new observation moves the state.
   */
  private lastObservationKey: string | number | null = null;
  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7j (decision D7; SIM S26): how many bar closes the last EXPLICIT RE-WARM absorbed.
   * 0 = the state was seeded from one raw observation (the legacy cold start) or has not started. Carried in the
   * diagnostics so a cold filter never presents as a warm one.
   */
  private warmedFromCloses = 0;
  /** P-7j r3 (Langston chunk-2 r2 condition 3): set by the re-warm; the next observation applies the inflation with its own R. */
  private pendingRewarmInflation = false;

  constructor(symbol: string = 'UNKNOWN') {
    this.symbol = symbol;
  }

  /**
   * 9.3.C: Update filter with new price observation
   * 
   * Mathematical Specification:
   * - R_t = clip(1 + (1 - ER) × 50, 1, 50) — measurement noise (adaptive)
   * - Q_t = max(0.1, VolNoise × 0.5) — process noise (adaptive)
   * - K_t = P_{t|t-1} / (P_{t|t-1} + R_t) — Kalman gain
   * - x_t = x_{t|t-1} + K_t × (y_t - x_{t|t-1}) — state update
   * - P_t = max(10^-8, (1 - K_t) × P_{t|t-1} + Q_t) — covariance update
   */
  update(price: number, ER: number, VolNoise: number): number {
    return this.applyObservation(price, ER, VolNoise, false);
  }

  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7j: advance ONLY for a new observation. A repeated read (same key) returns the
   * current estimate without touching x, P, or the counters. The first observation always seeds.
   */
  updateIfNew(observationKey: string | number, price: number, ER: number, VolNoise: number): number {
    if (this.x !== null && observationKey === this.lastObservationKey) {
      return this.x;
    }
    const out = this.update(price, ER, VolNoise);
    this.lastObservationKey = observationKey;
    return out;
  }

  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7j (decision D7; SIM S26): EXPLICIT RE-WARM of a COLD filter from bar closes the caller
   * already holds. The registry is in-memory and never persisted, so every restart used to re-seed each symbol from
   * ONE raw observation: the level basis jumped at every deploy while the filter reported itself initialised.
   * Runs only when the filter is cold; absorbs the valid closes in order, QUIETLY (no per-step [9.3][KALMAN] lines,
   * which would pollute the gain distribution those lines are read for), and emits ONE [9.3][REWARM] line.
   * Returns the number of closes absorbed; 0 leaves the filter cold, so the caller's observation seeds it as before.
   * r2 (Langston chunk-2 BLOCKER-1): the closes are 60-minute bars fed through a per-step `Q`, so at the end of the warm
   * `P` is inflated until the first live observation receives `REWARM_FIRST_LIVE_GAIN` (see its docblock). The
   * `[9.3][REWARM]` line carries `rawPrice` (the live observation about to be absorbed) and
   * `gapFrac = |x - rawPrice| / rawPrice`, so every deploy measures how far the warmed estimate sat from the live price.
   */
  warmFromHistory(closes: readonly number[], ER: number, VolNoise: number, liveObservation?: number): number {
    if (this.x !== null) return 0;
    let n = 0;
    for (const c of closes) {
      if (!Number.isFinite(c) || c <= 0) continue;
      this.applyObservation(c, ER, VolNoise, true);
      n++;
    }
    // Read back through getState(): the early return above narrowed `this.x` to null for the rest of this method.
    const warmed = this.getState();
    if (n > 0 && warmed !== null) {
      this.warmedFromCloses = n;
      // r3: FLAG, do not compute. The next observation inflates P with its own R (K = P / (P + R), so P = R * g / (1 - g)).
      this.pendingRewarmInflation = true;
      const live = liveObservation !== undefined && Number.isFinite(liveObservation) && liveObservation > 0 ? liveObservation : null;
      const rawText = live === null ? 'n/a' : live.toFixed(4);
      const gapText = live === null ? 'n/a' : (Math.abs(warmed - live) / live).toFixed(6);
      console.log(`[9.3][REWARM] ${this.symbol} re-warmed from ${n} bar closes x=${warmed.toFixed(4)} rawPrice=${rawText} gapFrac=${gapText} firstLiveGain=${REWARM_FIRST_LIVE_GAIN}`);
    }
    return n;
  }

  private applyObservation(price: number, ER: number, VolNoise: number, quiet: boolean): number {
    this.updateCount++;

    if (this.x === null) {
      this.x = price;
      this.lastER = ER;
      this.lastVolNoise = VolNoise;
      if (!quiet) console.log(`[9.3][INIT] ${this.symbol} seeding Kalman with first price ${price.toFixed(4)}`);
      return price;
    }

    const R = measurementNoise(ER);
    if (this.pendingRewarmInflation) {
      // P-7j r3: the re-warm's inflation, applied with THIS observation's R, so the first live gain is exactly the constant.
      // Never LOWERS P.
      this.P = Math.max(this.P, (R * REWARM_FIRST_LIVE_GAIN) / (1 - REWARM_FIRST_LIVE_GAIN));
      this.pendingRewarmInflation = false;
    }

    const Q = Math.max(0.1, VolNoise * 0.5);

    const K = this.P / (this.P + R);
    this.x = this.x + K * (price - this.x);
    this.P = Math.max(1e-8, (1 - K) * this.P + Q);

    this.lastER = ER;
    this.lastVolNoise = VolNoise;
    this.lastR = R;
    this.lastQ = Q;
    this.lastK = K;

    if (!quiet) console.log(`[9.3][KALMAN] ${this.symbol} ER=${ER.toFixed(2)} R=${R.toFixed(2)} Q=${Q.toFixed(3)} K=${K.toFixed(4)} x=${this.x.toFixed(4)}`);

    return this.x;
  }

  /**
   * Reset filter to initial state
   */
  reset(): void {
    this.x = null;
    this.P = 1;
    this.lastER = 0;
    this.lastVolNoise = 0;
    this.lastR = 1;
    this.lastQ = 0.1;
    this.lastK = 0;
    this.updateCount = 0;
    this.lastObservationKey = null;
    this.warmedFromCloses = 0;
    this.pendingRewarmInflation = false;
    console.log(`[9.3][RESET] ${this.symbol} filter reset`);
  }

  /**
   * Get current filtered state estimate
   */
  getState(): number | null {
    return this.x;
  }

  /**
   * Get full internal state for persistence
   */
  getInternalState(): KalmanState {
    return {
      x: this.x,
      P: this.P,
      lastER: this.lastER,
      lastVolNoise: this.lastVolNoise,
      lastR: this.lastR,
      lastQ: this.lastQ,
      lastK: this.lastK,
      updateCount: this.updateCount
    };
  }

  /**
   * Restore internal state from persistence
   */
  restoreState(state: KalmanState): void {
    this.x = state.x;
    this.P = state.P;
    this.lastER = state.lastER;
    this.lastVolNoise = state.lastVolNoise;
    this.lastR = state.lastR;
    this.lastQ = state.lastQ;
    this.lastK = state.lastK;
    this.updateCount = state.updateCount;
    console.log(`[9.3][RESTORE] ${this.symbol} filter restored (updateCount=${state.updateCount})`);
  }

  /**
   * Get diagnostics for telemetry
   */
  getDiagnostics(): KalmanDiagnostics {
    return {
      symbol: this.symbol,
      state: this.x,
      P: this.P,
      lastER: this.lastER,
      lastVolNoise: this.lastVolNoise,
      lastR: this.lastR,
      lastQ: this.lastQ,
      lastK: this.lastK,
      updateCount: this.updateCount,
      isInitialized: this.x !== null,
      warmedFromCloses: this.warmedFromCloses,
    };
  }

  /**
   * Check if filter is initialized
   */
  isInitialized(): boolean {
    return this.x !== null;
  }
}

/**
 * 9.3.A: Filter Registry for managing multiple symbol filters
 */
const filterRegistry = new Map<string, AdaptiveKalmanFilter>();

/**
 * Get or create a Kalman filter for a symbol
 */
export function getKalmanFilter(symbol: string): AdaptiveKalmanFilter {
  let filter = filterRegistry.get(symbol);
  if (!filter) {
    filter = new AdaptiveKalmanFilter(symbol);
    filterRegistry.set(symbol, filter);
  }
  return filter;
}

/**
 * Get smoothed price for a symbol
 */
export function getSmoothedPrice(
  symbol: string,
  price: number,
  ER: number,
  VolNoise: number,
  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7j: identifies the OBSERVATION `price` came from (e.g. the cache row's
   * `lastUpdatedAt`). When given, a repeated read of the same observation does not advance the filter.
   * Omitted = the legacy behaviour (every call advances), kept for any caller that genuinely feeds new prices.
   */
  observationKey?: string | number,
  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7j (decision D7; SIM S26): the recent bar closes the caller already holds. When the
   * filter is COLD (a restart wiped the registry, or the symbol is new) it re-warms explicitly from these before
   * absorbing `price`, so the first post-restart estimate is smoothed rather than the raw observation.
   * Omitted = the legacy cold start.
   */
  warmHistory?: readonly number[],
): number {
  const filter = getKalmanFilter(symbol);
  if (warmHistory !== undefined && !filter.isInitialized()) {
    filter.warmFromHistory(warmHistory, ER, VolNoise, price);
  }
  return observationKey === undefined
    ? filter.update(price, ER, VolNoise)
    : filter.updateIfNew(observationKey, price, ER, VolNoise);
}

/**
 * Clear filter for a symbol
 */
export function clearKalmanFilter(symbol: string): void {
  const filter = filterRegistry.get(symbol);
  if (filter) {
    filter.reset();
    filterRegistry.delete(symbol);
    console.log(`[9.3][CLEAR] ${symbol} filter removed`);
  }
}

/**
 * Get all filter diagnostics
 */
export function getAllKalmanDiagnostics(): KalmanDiagnostics[] {
  return Array.from(filterRegistry.values()).map(f => f.getDiagnostics());
}

/**
 * Export filter count for telemetry
 */
export function getActiveFilterCount(): number {
  return filterRegistry.size;
}
