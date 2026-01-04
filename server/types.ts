/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 SERVER TYPES — Shared Dictionary
 * ══════════════════════════════════════════════════════════════════════════════
 * Centralized type definitions for server-side services.
 * All services that need to share data structures should import from here.
 * ══════════════════════════════════════════════════════════════════════════════
 */

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
  | 'THREE_SOLDIERS';  // Trend Birth (3 Strong Bulls)

/**
 * Raw candle data structure for pattern recognition.
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
