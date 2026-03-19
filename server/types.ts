/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 SERVER TYPES — Shared Dictionary
 * ══════════════════════════════════════════════════════════════════════════════
 * Centralized type definitions for server-side services.
 * All services that need to share data structures should import from here.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// --------------------------------------------------------------------------
// DIRECTIVE 10.7: MULTI-TIMEFRAME TYPES
// --------------------------------------------------------------------------

/**
 * Supported timeframe intervals for multi-timeframe analysis.
 * - 1h: Global trend context (macro layer)
 * - 15m: Tactical pattern setup layer
 * - 5m: Precision entry confirmation layer
 */
export type Timeframe = '1h' | '15m' | '5m';

// --------------------------------------------------------------------------
// PHASE 10: HYBRID SIGNAL TYPES
// --------------------------------------------------------------------------

/**
 * The "Three Lanes" of the DawnTrader Engine.
 * - QUANT: Pure math (Phase 9 standard).
 * - PATTERN: Pure psychology/shape (Directive 10.2).
 * - HYBRID: The intersection of Math + Pattern (Directive 10.4).
 */
export type SignalType = 'QUANT' | 'PATTERN' | 'HYBRID';

/**
 * The specific candlestick formations the "Eyes" of the system can see.
 */
export type PatternType =
  | 'PINBAR'           // Rejection (Wick > Body)
  | 'ENGULFING'        // Momentum (Body engulfs previous)
  | 'INSIDE_BAR'       // Compression (Coiling energy)
  | 'MORNING_STAR'     // Reversal (Bear -> Doji -> Bull)
  | 'THREE_SOLDIERS'   // Trend Birth (3 Strong Bulls)
  | 'ABCD';            // Batch 19F: Harmonic Measured-Move

/**
 * Raw candle data structure for pattern recognition.
 * Directive 10.7: Optional timeframe field for multi-timeframe analysis.
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe?: Timeframe;
}

/**
 * The Output of the Pattern Recognizer Service.
 * This is the object that gets passed to the Orchestrator and VTS.
 */
export interface PatternSignal {
  symbol: string;
  pattern: PatternType;
  direction: 'BUY' | 'SELL';
  
  /**
   * Visual Clarity Score (0.0 - 1.0)
   * How "perfect" is this pattern? 
   * (e.g., a Pinbar with a massive wick is 0.9; a stubby one is 0.6)
   */
  strength: number;
  
  timestamp: number;

  /**
   * PREDICTIVE HOOK (Phase 10.6)
   * This field will eventually hold the Machine Learning confidence score.
   * We define it now so we don't have to refactor the database later.
   */
  predictiveConfidence?: number;
  
  /**
   * Directive 10.5: Effective strength after temporal decay applied.
   * This is the strength used in ensemble scoring after age-based decay.
   */
  effectiveStrength?: number;
  
  /**
   * Extra context for debugging (e.g., "wickSize": 1.2%)
   */
  metadata?: Record<string, any>;
}

// --------------------------------------------------------------------------
// EXISTING INTERFACE EXTENSIONS
// --------------------------------------------------------------------------

/**
 * Extended trade signal with hybrid signal type support.
 * When signalType is undefined, defaults to 'QUANT'.
 */
export interface HybridTradeSignal {
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  signalType?: SignalType;
  patternType?: PatternType;
  patternStrength?: number;
  metadata?: Record<string, any>;
}

/**
 * Directive 10.3: TradeSignal interface extension
 * This interface extends the base trade signal with signal type fields
 * for historical persistence and analytics segmentation.
 */
export interface TradeSignalContext {
  signalType?: SignalType;          // 'QUANT' | 'PATTERN' | 'HYBRID' (defaults to 'QUANT')
  patternType?: PatternType;        // Pattern category (if PATTERN/HYBRID)
  patternStrength?: number;         // 0.0-1.0 clarity rating (if PATTERN/HYBRID)
}

// --------------------------------------------------------------------------
// DIRECTIVE 10.4: HYBRID INTEGRATION TYPES
// --------------------------------------------------------------------------

/**
 * Named hybrid strategy playbooks for DSS routing.
 * Each represents a distinct confluence pattern.
 */
export type HybridStrategyType =
  | 'H1_TREND_SNIPER'     // Trend-following with pattern confirmation
  | 'H2_SLINGSHOT'        // Momentum breakout with pattern setup
  | 'H3_GATECRASHER'      // Mean-reversion with reversal pattern
  | 'H4_MOMENTUM_LINK';   // Directional momentum with pattern alignment

/**
 * Component scores for hybrid signal explainability.
 * Enables debugging and ML calibration by exposing individual contributions.
 */
export interface ComponentScores {
  quant: number;      // Quant signal expectancy/confidence (0-1)
  pattern: number;    // Pattern strength (0-1)
  ml: number;         // ML predictive confidence (0-1), defaults to 0.5 when unavailable
}

/**
 * Extended TradeSignal with Directive 10.4 hybrid fields.
 * All hybrid trades carry these for full transparency and calibration.
 */
export interface HybridTradeFields {
  hybridScore?: number;                    // Ensemble weighted score (0-1)
  componentScores?: ComponentScores;       // Individual signal contributions
  hybridStrategy?: HybridStrategyType;     // Named hybrid playbook
  predictiveConfidence?: number;           // ML confidence hook (Phase 10.6)
  effectivePatternStrength?: number;       // Directive 10.5: Decayed pattern strength
  decayAge?: number;                       // Directive 10.5: Age in candle units (Δt)
}

// --------------------------------------------------------------------------
// DIRECTIVE 11.0E.2: ML CALIBRATION TYPES (Phase-10)
// --------------------------------------------------------------------------

/**
 * Phase-10 extended metrics for calibration - Directive 11.0E.2
 */
export interface Phase10CalibrationMetrics {
  avgFinalScore: number;
  avgEdgeDelta: number;       // expectedEdge - realizedPnL average
  performanceScore: number;   // Composite: 0.5*finalScore + 0.3*confidence + 0.2*regime
  sampleCount: number;
}

/**
 * Individual calibration recommendation for a pattern type.
 * Directive 11.0E.2: Extended with Phase-10 metrics
 */
export interface CalibrationRecommendation {
  pattern: PatternType | 'UNKNOWN';
  winRate: number;                              // Percentage (0-100)
  avgExpectancy: number;                        // Average P&L per trade
  suggestion: 'INCREASE' | 'DECREASE' | 'HOLD';
  adjustment: number;                           // Suggested weight adjustment (+/-0.05)
  phase10Metrics?: Phase10CalibrationMetrics;   // Directive 11.0E.2: Extended metrics
}

/**
 * Complete calibration report from ML analysis.
 * Returned by MLCalibrationService.analyzePerformance()
 */
export interface CalibrationReport {
  success: boolean;
  reason?: string;                              // Error message if success=false
  recommendations?: CalibrationRecommendation[];
  analyzedTrades?: number;                      // Number of trades analyzed
  timestamp?: number;                           // Report generation time
}
