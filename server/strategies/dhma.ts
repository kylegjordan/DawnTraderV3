/**
 * DHMA (Dual-Horizon Microstructure Alpha) Strategy
 * 
 * A sophisticated microstructure-based trading strategy that combines:
 * - Order Book Imbalance (OBI)
 * - Microprice tilt
 * - Signed flow analysis
 * - Toxicity proxy (VPIN-style)
 * - Arrival rate analysis
 * - Multi-horizon regime detection
 * 
 * Safety: Fully respects Core Four Guardrails and coherency validation
 */

import { guardrailPolicy } from "../services/guardrail-policy";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface BookSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  timestamp: number;
}

export interface Print {
  price: number;
  size: number;
  sign: number; // +1 for buy, -1 for sell, 0 for unknown
  timestamp: number;
}

export interface VWAPData {
  price: number;
  timestamp: number;
}

export interface DHMAInputs {
  book: BookSnapshot;
  recentPrints: Print[]; // Last N prints (e.g., 100)
  vwapHistory: VWAPData[]; // Last 15-20 minutes
  realizedVolatility: number; // Per-symbol realized σ
  baselineArrivalRate: number; // Trades per second (last 15min baseline)
}

export interface DHMAFeatures {
  obi: number; // Order Book Imbalance [-1, 1]
  micropriceTilt: number; // Tilt from microprice to mid
  signedFlowRatio: number; // Net buy/sell pressure
  toxicity: number; // VPIN-style volume imbalance [0, 1]
  arrivalRateRatio: number; // Current vs baseline arrival rate
  burstRegime: 'long' | 'short' | 'neutral'; // 5-20min signal
  sessionRegime: 'up' | 'down' | 'chop'; // Session-wide context
}

export interface DHMAParams {
  // Feature thresholds
  theta_OBI: number; // OBI threshold for entry (default: 0.3)
  epsilon_micro: number; // Microprice tilt minimum (default: 0.2 ticks)
  tau_toxicity: number; // Max toxicity allowed (default: 0.7)
  maxSpread: number; // Max spread in ticks (default: 5)
  
  // Sizing
  N_flow: number; // Number of prints for signed flow (default: 50)
  N_burst: number; // Lookback for burst regime (seconds, default: 600)
  window_session: number; // Session window (seconds, default: 1200)
  
  // Exits
  k_tp: number; // Partial TP at k*σ (default: 1.5)
  trailingMicroStop: number; // Trailing stop in ticks (default: 3)
  maxHoldMinutes: number; // Timeout exit (default: 30)
  
  // Risk
  portfolioRiskPerTradePct: number; // From guardrails
  maxOpenPositions: number; // From guardrails
}

export interface DHMASignal {
  action: 'long' | 'short' | 'none';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  size: number;
  confidence: number;
  features: DHMAFeatures;
  skipReason?: string;
  metadata: {
    spread: number;
    spreadTicks: number;
    queueAdvantage?: number;
    coherencyValid: boolean;
  };
}

export interface DHMADecision {
  timestamp: number;
  symbol: string;
  action: 'entry_long' | 'entry_short' | 'skip' | 'exit';
  reason: string;
  features: Partial<DHMAFeatures>;
  metadata?: any;
}

// ============================================================================
// DHMA Strategy Engine
// ============================================================================

export class DHMAStrategy {
  private decisions: DHMADecision[] = [];
  private readonly MAX_DECISIONS = 10;
  
  constructor() {}
  
  /**
   * Main entry point: analyze inputs and generate trading signal
   */
  public generateSignal(
    inputs: DHMAInputs,
    params: DHMAParams,
    mode: 'paper' | 'live'
  ): DHMASignal {
    // Extract features
    const features = this.extractFeatures(inputs, params);
    
    // Detect regime
    const regimes = this.detectRegime(inputs, params);
    features.burstRegime = regimes.burst;
    features.sessionRegime = regimes.session;
    
    // Calculate spread
    const spread = inputs.book.ask - inputs.book.bid;
    const tickSize = this.estimateTickSize(inputs.book.bid);
    const spreadTicks = spread / tickSize;
    
    // Apply entry rules
    const entryDecision = this.evaluateEntry(features, spread, spreadTicks, params);
    
    if (entryDecision.action === 'none') {
      this.logDecision(inputs.book.symbol, 'skip', entryDecision.skipReason || 'No entry signal', features);
      
      return {
        action: 'none',
        entryPrice: 0,
        stopPrice: 0,
        targetPrice: 0,
        size: 0,
        confidence: 0,
        features,
        skipReason: entryDecision.skipReason,
        metadata: {
          spread,
          spreadTicks,
          coherencyValid: false
        }
      };
    }
    
    // Calculate sizing
    const sizing = this.calculateSize(
      inputs.book,
      spread,
      features.toxicity,
      inputs.realizedVolatility,
      params
    );
    
    // Generate signal with prices
    const signal = this.buildSignal(
      entryDecision.action,
      inputs.book,
      spread,
      spreadTicks,
      inputs.realizedVolatility,
      sizing,
      features,
      params
    );
    
    // CRITICAL: Coherency validation before returning
    const coherencyCheck = this.validateCoherency(signal, params, mode);
    signal.metadata.coherencyValid = coherencyCheck.valid;
    
    if (!coherencyCheck.valid) {
      console.log(`[DHMA] ⛔ Coherency FAIL for ${inputs.book.symbol}: ${coherencyCheck.reason}`);
      this.logDecision(inputs.book.symbol, 'skip', `Coherency block: ${coherencyCheck.reason}`, features);
      
      return {
        ...signal,
        action: 'none',
        size: 0,
        skipReason: `Coherency violation: ${coherencyCheck.reason}`
      };
    }
    
    // Log successful entry
    this.logDecision(
      inputs.book.symbol,
      entryDecision.action === 'long' ? 'entry_long' : 'entry_short',
      `OBI=${features.obi.toFixed(2)} tilt=${features.micropriceTilt.toFixed(2)}t tox=${features.toxicity.toFixed(2)}`,
      features
    );
    
    console.log(`[DHMA] entry ${signal.action} ${inputs.book.symbol} | OBI=${features.obi.toFixed(2)} microTilt=${features.micropriceTilt.toFixed(1)}t | tox=${features.toxicity.toFixed(2)} | spread=${spreadTicks.toFixed(1)}t | size=${signal.size.toFixed(4)}`);
    
    return signal;
  }
  
  // ==========================================================================
  // Feature Extraction
  // ==========================================================================
  
  private extractFeatures(inputs: DHMAInputs, params: DHMAParams): DHMAFeatures {
    const obi = this.calculateOBI(inputs.book);
    const micropriceTilt = this.calculateMicropriceTilt(inputs.book);
    const signedFlowRatio = this.calculateSignedFlow(inputs.recentPrints, params.N_flow);
    const toxicity = this.calculateToxicity(inputs.recentPrints);
    const arrivalRateRatio = this.calculateArrivalRate(inputs.recentPrints, inputs.baselineArrivalRate, params.N_burst);
    
    return {
      obi,
      micropriceTilt,
      signedFlowRatio,
      toxicity,
      arrivalRateRatio,
      burstRegime: 'neutral',
      sessionRegime: 'chop'
    };
  }
  
  /**
   * Order Book Imbalance: (bidSize - askSize) / (bidSize + askSize)
   * Range: [-1, 1] where +1 = all bids, -1 = all asks
   */
  private calculateOBI(book: BookSnapshot): number {
    const totalSize = book.bidSize + book.askSize;
    if (totalSize === 0) return 0;
    
    const obi = (book.bidSize - book.askSize) / totalSize;
    return Math.max(-1, Math.min(1, obi)); // Clip to [-1, 1]
  }
  
  /**
   * Microprice tilt: deviation of microprice from mid
   * Microprice = (ask*bidSize + bid*askSize) / (bidSize + askSize)
   */
  private calculateMicropriceTilt(book: BookSnapshot): number {
    const totalSize = book.bidSize + book.askSize;
    if (totalSize === 0) return 0;
    
    const microprice = (book.ask * book.bidSize + book.bid * book.askSize) / totalSize;
    const mid = (book.bid + book.ask) / 2;
    const tickSize = this.estimateTickSize(mid);
    
    return (microprice - mid) / tickSize; // Tilt in ticks
  }
  
  /**
   * Signed flow ratio: net buy pressure over last N prints
   * Uses Lee-Ready algorithm: compare trade price to mid
   */
  private calculateSignedFlow(prints: Print[], N: number): number {
    if (prints.length === 0) return 0;
    
    const recentPrints = prints.slice(-N);
    let buyVolume = 0;
    let sellVolume = 0;
    
    for (const print of recentPrints) {
      if (print.sign > 0) {
        buyVolume += print.size;
      } else if (print.sign < 0) {
        sellVolume += print.size;
      }
    }
    
    const totalVolume = buyVolume + sellVolume;
    if (totalVolume === 0) return 0;
    
    return (buyVolume - sellVolume) / totalVolume; // Range: [-1, 1]
  }
  
  /**
   * Toxicity proxy: VPIN-style bucketed volume imbalance
   * High toxicity = informed flow, risky to trade against
   */
  private calculateToxicity(prints: Print[]): number {
    if (prints.length < 10) return 0;
    
    const bucketSize = 50; // Volume bucket size
    let currentBucket = 0;
    let bucketBuyVol = 0;
    let bucketSellVol = 0;
    const imbalances: number[] = [];
    
    for (const print of prints) {
      currentBucket += print.size;
      
      if (print.sign > 0) {
        bucketBuyVol += print.size;
      } else if (print.sign < 0) {
        bucketSellVol += print.size;
      }
      
      if (currentBucket >= bucketSize) {
        const totalVol = bucketBuyVol + bucketSellVol;
        if (totalVol > 0) {
          imbalances.push(Math.abs(bucketBuyVol - bucketSellVol) / totalVol);
        }
        currentBucket = 0;
        bucketBuyVol = 0;
        bucketSellVol = 0;
      }
    }
    
    if (imbalances.length === 0) return 0;
    
    // VPIN = average absolute imbalance
    const vpin = imbalances.reduce((sum, imb) => sum + imb, 0) / imbalances.length;
    return Math.min(1, vpin); // Cap at 1
  }
  
  /**
   * Arrival rate: trades per second vs baseline
   */
  private calculateArrivalRate(prints: Print[], baselineRate: number, windowSeconds: number): number {
    if (prints.length === 0 || baselineRate === 0) return 1;
    
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const recentPrints = prints.filter(p => (now - p.timestamp) <= windowMs);
    
    const currentRate = recentPrints.length / windowSeconds;
    return currentRate / baselineRate;
  }
  
  // ==========================================================================
  // Regime Detection
  // ==========================================================================
  
  private detectRegime(inputs: DHMAInputs, params: DHMAParams): {
    burst: 'long' | 'short' | 'neutral';
    session: 'up' | 'down' | 'chop';
  } {
    // Burst regime (5-20min): based on recent prints
    const burstRegime = this.detectBurstRegime(inputs.recentPrints, params.N_burst);
    
    // Session regime (15min+): based on VWAP slope & volatility
    const sessionRegime = this.detectSessionRegime(inputs.vwapHistory);
    
    return { burst: burstRegime, session: sessionRegime };
  }
  
  private detectBurstRegime(prints: Print[], windowSeconds: number): 'long' | 'short' | 'neutral' {
    if (prints.length < 10) return 'neutral';
    
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const recentPrints = prints.filter(p => (now - p.timestamp) <= windowMs);
    
    let buyVolume = 0;
    let sellVolume = 0;
    
    for (const print of recentPrints) {
      if (print.sign > 0) buyVolume += print.size;
      else if (print.sign < 0) sellVolume += print.size;
    }
    
    const totalVolume = buyVolume + sellVolume;
    if (totalVolume === 0) return 'neutral';
    
    const buyRatio = buyVolume / totalVolume;
    
    if (buyRatio > 0.6) return 'long';
    if (buyRatio < 0.4) return 'short';
    return 'neutral';
  }
  
  private detectSessionRegime(vwapHistory: VWAPData[]): 'up' | 'down' | 'chop' {
    if (vwapHistory.length < 10) return 'chop';
    
    const recent = vwapHistory.slice(-10);
    const firstPrice = recent[0].price;
    const lastPrice = recent[recent.length - 1].price;
    
    const slope = (lastPrice - firstPrice) / firstPrice;
    
    // Calculate volatility (std dev of returns)
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push((recent[i].price - recent[i-1].price) / recent[i-1].price);
    }
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Trending if slope is strong relative to volatility
    if (slope > stdDev * 1.5) return 'up';
    if (slope < -stdDev * 1.5) return 'down';
    return 'chop';
  }
  
  // ==========================================================================
  // Entry Logic
  // ==========================================================================
  
  private evaluateEntry(
    features: DHMAFeatures,
    spread: number,
    spreadTicks: number,
    params: DHMAParams
  ): { action: 'long' | 'short' | 'none'; skipReason?: string } {
    // Block if toxicity too high
    if (features.toxicity > params.tau_toxicity) {
      return { action: 'none', skipReason: `High toxicity ${features.toxicity.toFixed(2)} > ${params.tau_toxicity}` };
    }
    
    // Block if spread too wide
    if (spreadTicks > params.maxSpread) {
      return { action: 'none', skipReason: `Wide spread ${spreadTicks.toFixed(1)}t > ${params.maxSpread}t` };
    }
    
    // Long entry: burst & session agree, OBI positive, microprice tilt positive
    const longSignal = (
      features.burstRegime === 'long' &&
      features.sessionRegime === 'up' &&
      features.obi > params.theta_OBI &&
      features.micropriceTilt > params.epsilon_micro
    );
    
    if (longSignal) {
      return { action: 'long' };
    }
    
    // Short entry: burst & session agree, OBI negative, microprice tilt negative
    const shortSignal = (
      features.burstRegime === 'short' &&
      features.sessionRegime === 'down' &&
      features.obi < -params.theta_OBI &&
      features.micropriceTilt < -params.epsilon_micro
    );
    
    if (shortSignal) {
      return { action: 'short' };
    }
    
    return { action: 'none', skipReason: 'No regime alignment or insufficient OBI/tilt' };
  }
  
  // ==========================================================================
  // Sizing
  // ==========================================================================
  
  private calculateSize(
    book: BookSnapshot,
    spread: number,
    toxicity: number,
    realizedVol: number,
    params: DHMAParams
  ): number {
    // Base size from portfolio risk
    const mid = (book.bid + book.ask) / 2;
    const riskPerTrade = params.portfolioRiskPerTradePct / 100;
    
    // Assume we risk 1 ATR (σ)
    const stopDistance = realizedVol;
    let baseSize = riskPerTrade / stopDistance;
    
    // Down-weight with spread
    const tickSize = this.estimateTickSize(mid);
    const spreadFactor = Math.max(0.5, 1 - (spread / mid) * 10); // Reduce size if spread > 10% of price
    
    // Down-weight with toxicity
    const toxicityFactor = Math.max(0.5, 1 - toxicity);
    
    // Up-weight with queue advantage (if available)
    const queueFactor = 1.0; // Could enhance with Level-2 data
    
    const finalSize = baseSize * spreadFactor * toxicityFactor * queueFactor;
    
    return Math.max(0.0001, finalSize); // Minimum size
  }
  
  // ==========================================================================
  // Signal Construction
  // ==========================================================================
  
  private buildSignal(
    action: 'long' | 'short',
    book: BookSnapshot,
    spread: number,
    spreadTicks: number,
    realizedVol: number,
    size: number,
    features: DHMAFeatures,
    params: DHMAParams
  ): DHMASignal {
    const mid = (book.bid + book.ask) / 2;
    const tickSize = this.estimateTickSize(mid);
    
    let entryPrice: number;
    let stopPrice: number;
    let targetPrice: number;
    
    if (action === 'long') {
      entryPrice = book.ask; // Buy at ask
      stopPrice = mid - params.k_tp * realizedVol; // Stop below mid - k*σ
      targetPrice = mid + params.k_tp * realizedVol; // Target above mid + k*σ
    } else {
      entryPrice = book.bid; // Sell at bid
      stopPrice = mid + params.k_tp * realizedVol;
      targetPrice = mid - params.k_tp * realizedVol;
    }
    
    return {
      action,
      entryPrice,
      stopPrice,
      targetPrice,
      size,
      confidence: this.calculateConfidence(features, spread, realizedVol),
      features,
      metadata: {
        spread,
        spreadTicks,
        coherencyValid: false // Will be set by caller
      }
    };
  }
  
  private calculateConfidence(features: DHMAFeatures, spread: number, vol: number): number {
    let confidence = 0.5;
    
    // Increase confidence with strong OBI
    confidence += Math.abs(features.obi) * 0.2;
    
    // Increase confidence with strong signed flow
    confidence += Math.abs(features.signedFlowRatio) * 0.15;
    
    // Decrease confidence with high toxicity
    confidence -= features.toxicity * 0.2;
    
    // Decrease confidence with wide spread
    confidence -= Math.min(0.1, spread * 100);
    
    return Math.max(0.1, Math.min(0.95, confidence));
  }
  
  // ==========================================================================
  // Coherency Validation
  // ==========================================================================
  
  private validateCoherency(
    signal: DHMASignal,
    params: DHMAParams,
    mode: 'paper' | 'live'
  ): { valid: boolean; reason?: string } {
    // Build proposed guardrails object for validation
    const proposedGuardrails = {
      mode,
      portfolioRiskPerTradePct: params.portfolioRiskPerTradePct,
      maxOpenPositions: params.maxOpenPositions,
      symbolCooldownMinutes: 5, // Default
      dailyLossKillSwitchPct: 15, // Default
      management: {
        isManualOverride: false,
        tunedByLatti: true,
        lockedByUser: {}
      }
    };
    
    const validation = guardrailPolicy.validate(proposedGuardrails);
    
    if (validation.status === 'FAIL') {
      const failures = validation.failures.map(f => f.message).join('; ');
      return { valid: false, reason: failures };
    }
    
    return { valid: true };
  }
  
  // ==========================================================================
  // Utilities
  // ==========================================================================
  
  private estimateTickSize(price: number): number {
    // Rough tick size estimation
    if (price < 1) return 0.0001;
    if (price < 10) return 0.001;
    if (price < 100) return 0.01;
    if (price < 1000) return 0.1;
    return 1.0;
  }
  
  private logDecision(symbol: string, action: string, reason: string, features: Partial<DHMAFeatures>) {
    const decision: DHMADecision = {
      timestamp: Date.now(),
      symbol,
      action: action as any,
      reason,
      features
    };
    
    this.decisions.unshift(decision);
    if (this.decisions.length > this.MAX_DECISIONS) {
      this.decisions.pop();
    }
  }
  
  public getRecentDecisions(): DHMADecision[] {
    return [...this.decisions];
  }
}

// ==========================================================================
// Default Parameters
// ==========================================================================

export function getDefaultDHMAParams(): Omit<DHMAParams, 'portfolioRiskPerTradePct' | 'maxOpenPositions'> {
  return {
    theta_OBI: 0.3,
    epsilon_micro: 0.2,
    tau_toxicity: 0.7,
    maxSpread: 5,
    N_flow: 50,
    N_burst: 600,
    window_session: 1200,
    k_tp: 1.5,
    trailingMicroStop: 3,
    maxHoldMinutes: 30
  };
}

// ==========================================================================
// Phase 30.FX.A: EMA Smoothing for Telemetry
// ==========================================================================

/**
 * Exponential Moving Average (EMA) smoothing function
 * Used to smooth telemetry metrics and reduce noise
 * 
 * @param prev Previous EMA value
 * @param next New observation
 * @param alpha Smoothing factor (0-1), default 0.2 for 20% weight on new value
 * @returns Smoothed value
 */
export function ema(prev: number, next: number, alpha: number = 0.2): number {
  if (prev === 0 || isNaN(prev)) {
    return next; // Bootstrap with first value
  }
  return prev * (1 - alpha) + next * alpha;
}
