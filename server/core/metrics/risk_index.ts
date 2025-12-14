/**
 * Phase 8.8.4-C: Enhanced Risk Metric (Task 2)
 * 
 * Computes risk with stop distance and correlation penalty:
 * Risk = (StopDistance / ATR) × CorrPenalty
 * 
 * CorrPenalty = 1 + max(0, Corr_adj - 0.8)
 * Corr_adj = Corr_prev × e^(-0.05 × Age_minutes)
 * 
 * Execution constraints:
 * - Uses cached OHLCV buffers (no Kraken API calls)
 * - Updates correlation matrix every 30s for Tier A pairs
 * - Decays correlation weights if data > 10 min old
 * 
 * Log tag: [C][ENHANCED_RISK]
 */

interface CorrelationEntry {
  symbolA: string;
  symbolB: string;
  correlation: number;
  timestamp: number;
}

interface PriceDataPoint {
  timestamp: number;
  close: number;
}

const CORRELATION_DECAY_RATE = 0.05;
const CORRELATION_THRESHOLD = 0.8;
const MAX_DATA_AGE_MINUTES = 10;
const TIER_A_UPDATE_INTERVAL_MS = 30 * 1000;

class CorrelationMatrix {
  private correlations: Map<string, CorrelationEntry> = new Map();
  private priceHistory: Map<string, PriceDataPoint[]> = new Map();
  private lastTierAUpdate: number = 0;
  private tierASymbols: Set<string> = new Set(['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD']);
  
  private getKey(symbolA: string, symbolB: string): string {
    return [symbolA, symbolB].sort().join('|');
  }
  
  addPriceData(symbol: string, close: number, timestamp: number = Date.now()): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol)!;
    history.push({ timestamp, close });
    
    const cutoff = Date.now() - MAX_DATA_AGE_MINUTES * 60 * 1000;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
    
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }
  
  private computeCorrelation(pricesA: number[], pricesB: number[]): number {
    if (pricesA.length < 5 || pricesB.length < 5) {
      return 0;
    }
    
    const minLength = Math.min(pricesA.length, pricesB.length);
    const a = pricesA.slice(-minLength);
    const b = pricesB.slice(-minLength);
    
    const meanA = a.reduce((sum, x) => sum + x, 0) / a.length;
    const meanB = b.reduce((sum, x) => sum + x, 0) / b.length;
    
    let numerator = 0;
    let sumSqA = 0;
    let sumSqB = 0;
    
    for (let i = 0; i < a.length; i++) {
      const diffA = a[i] - meanA;
      const diffB = b[i] - meanB;
      numerator += diffA * diffB;
      sumSqA += diffA * diffA;
      sumSqB += diffB * diffB;
    }
    
    const denominator = Math.sqrt(sumSqA * sumSqB);
    if (denominator === 0) {
      return 0;
    }
    
    return numerator / denominator;
  }
  
  updateCorrelation(symbolA: string, symbolB: string): number {
    const historyA = this.priceHistory.get(symbolA);
    const historyB = this.priceHistory.get(symbolB);
    
    if (!historyA || !historyB || historyA.length < 5 || historyB.length < 5) {
      return 0;
    }
    
    const pricesA = historyA.map(p => p.close);
    const pricesB = historyB.map(p => p.close);
    
    const correlation = this.computeCorrelation(pricesA, pricesB);
    const key = this.getKey(symbolA, symbolB);
    
    this.correlations.set(key, {
      symbolA,
      symbolB,
      correlation,
      timestamp: Date.now(),
    });
    
    return correlation;
  }
  
  getAdjustedCorrelation(symbolA: string, symbolB: string): number {
    const key = this.getKey(symbolA, symbolB);
    const entry = this.correlations.get(key);
    
    if (!entry) {
      return 0;
    }
    
    const ageMinutes = (Date.now() - entry.timestamp) / (60 * 1000);
    
    if (ageMinutes > MAX_DATA_AGE_MINUTES) {
      return 0;
    }
    
    const decay = Math.exp(-CORRELATION_DECAY_RATE * ageMinutes);
    const adjustedCorr = entry.correlation * decay;
    
    return adjustedCorr;
  }
  
  getMaxCorrelationWithOpenPositions(
    symbol: string,
    openPositionSymbols: string[]
  ): number {
    if (openPositionSymbols.length === 0) {
      return 0;
    }
    
    let maxCorr = 0;
    
    for (const openSymbol of openPositionSymbols) {
      if (openSymbol === symbol) continue;
      
      const corr = this.getAdjustedCorrelation(symbol, openSymbol);
      maxCorr = Math.max(maxCorr, Math.abs(corr));
    }
    
    return maxCorr;
  }
  
  updateTierACorrelations(): void {
    const now = Date.now();
    if (now - this.lastTierAUpdate < TIER_A_UPDATE_INTERVAL_MS) {
      return;
    }
    
    const symbols = Array.from(this.tierASymbols);
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        this.updateCorrelation(symbols[i], symbols[j]);
      }
    }
    
    this.lastTierAUpdate = now;
    console.log(`[C][ENHANCED_RISK] Updated Tier A correlations for ${symbols.length} symbols`);
  }
  
  setTierASymbols(symbols: string[]): void {
    this.tierASymbols = new Set(symbols);
  }
  
  getStats(): {
    symbolCount: number;
    correlationPairCount: number;
    priceHistorySymbols: string[];
  } {
    return {
      symbolCount: this.priceHistory.size,
      correlationPairCount: this.correlations.size,
      priceHistorySymbols: Array.from(this.priceHistory.keys()),
    };
  }
  
  reset(): void {
    this.correlations.clear();
    this.priceHistory.clear();
    this.lastTierAUpdate = 0;
    console.log('[C][ENHANCED_RISK] Correlation matrix reset');
  }
}

export const correlationMatrix = new CorrelationMatrix();

export interface EnhancedRiskInput {
  entryPrice: number;
  stopPrice: number;
  atr?: number;
  symbol: string;
  openPositionSymbols?: string[];
}

export interface EnhancedRiskResult {
  risk: number;
  stopDistance: number;
  stopDistancePercent: number;
  atrRatio: number;
  correlationPenalty: number;
  maxCorrelation: number;
  breakdown: {
    baseRisk: number;
    correlationAdjustment: number;
  };
}

/**
 * Calculate Enhanced Risk Metric
 * 
 * Risk = (StopDistance / ATR) × CorrPenalty
 * 
 * Per Directive 8.8.4-C:
 * - StopDistance = |Entry – Stop| / Entry
 * - ATR = current average true range (cached)
 * - CorrPenalty = 1 + max(0, Corr_adj - 0.8)
 * 
 * @param input - Risk calculation inputs
 * @returns Enhanced risk result with breakdown
 */
export function calculateEnhancedRisk(input: EnhancedRiskInput): EnhancedRiskResult {
  const stopDistance = Math.abs(input.entryPrice - input.stopPrice);
  const stopDistancePercent = (stopDistance / input.entryPrice) * 100;
  
  let atrRatio: number;
  if (input.atr && input.atr > 0) {
    atrRatio = stopDistance / input.atr;
  } else {
    atrRatio = stopDistancePercent / 2.0;
  }
  
  const maxCorrelation = input.openPositionSymbols && input.openPositionSymbols.length > 0
    ? correlationMatrix.getMaxCorrelationWithOpenPositions(input.symbol, input.openPositionSymbols)
    : 0;
  
  const correlationPenalty = 1 + Math.max(0, maxCorrelation - CORRELATION_THRESHOLD);
  
  const risk = atrRatio * correlationPenalty;
  
  console.log(
    `[C][ENHANCED_RISK] ${input.symbol}: stopDist=${stopDistancePercent.toFixed(2)}%, ` +
    `atrRatio=${atrRatio.toFixed(3)}, maxCorr=${maxCorrelation.toFixed(3)}, ` +
    `penalty=${correlationPenalty.toFixed(3)}, risk=${risk.toFixed(4)}`
  );
  
  return {
    risk,
    stopDistance,
    stopDistancePercent,
    atrRatio,
    correlationPenalty,
    maxCorrelation,
    breakdown: {
      baseRisk: atrRatio,
      correlationAdjustment: correlationPenalty - 1,
    },
  };
}

/**
 * Feed price data to correlation matrix
 * Call this when receiving price updates from WebSocket or FX5
 */
export function feedPriceData(symbol: string, close: number, timestamp?: number): void {
  correlationMatrix.addPriceData(symbol, close, timestamp);
}

/**
 * Trigger Tier A correlation updates
 * Call this periodically (e.g., from scanner tick)
 */
export function updateTierACorrelations(): void {
  correlationMatrix.updateTierACorrelations();
}

/**
 * Set which symbols are Tier A (updated every 30s)
 */
export function setTierASymbols(symbols: string[]): void {
  correlationMatrix.setTierASymbols(symbols);
}

/**
 * Get correlation matrix stats for diagnostics
 */
export function getCorrelationStats(): ReturnType<typeof correlationMatrix.getStats> {
  return correlationMatrix.getStats();
}

/**
 * Reset correlation matrix
 */
export function resetCorrelationMatrix(): void {
  correlationMatrix.reset();
}
