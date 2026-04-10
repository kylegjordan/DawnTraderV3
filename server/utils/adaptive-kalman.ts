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
    this.updateCount++;

    if (this.x === null) {
      this.x = price;
      this.lastER = ER;
      this.lastVolNoise = VolNoise;
      console.log(`[9.3][INIT] ${this.symbol} seeding Kalman with first price ${price.toFixed(4)}`);
      return price;
    }

    const R = Math.max(1, Math.min(50, 1 + (1 - ER) * 50));

    const Q = Math.max(0.1, VolNoise * 0.5);

    const K = this.P / (this.P + R);
    this.x = this.x + K * (price - this.x);
    this.P = Math.max(1e-8, (1 - K) * this.P + Q);

    this.lastER = ER;
    this.lastVolNoise = VolNoise;
    this.lastR = R;
    this.lastQ = Q;
    this.lastK = K;

    console.log(`[9.3][KALMAN] ${this.symbol} ER=${ER.toFixed(2)} R=${R.toFixed(2)} Q=${Q.toFixed(3)} K=${K.toFixed(4)} x=${this.x.toFixed(4)}`);

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
      isInitialized: this.x !== null
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
export function getSmoothedPrice(symbol: string, price: number, ER: number, VolNoise: number): number {
  const filter = getKalmanFilter(symbol);
  return filter.update(price, ER, VolNoise);
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
