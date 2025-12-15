/**
 * LEGACY CODE ARCHIVE - Directive 8.8.4-C.3
 * 
 * This file contains the original implementations of deprecated trade creation paths
 * that have been disabled by Directive 8.8.4-C.3.
 * 
 * These paths were bypassing the proper pipeline:
 *   FX5 → SignalOrchestrator → SQE → RTB → TCL → processSignal()
 * 
 * Instead, they created trades directly via:
 *   scanForSignals() → checkSymbolForSignal() → executeSimulatedTrade()
 * 
 * This led to "ghost trades" being created without proper quality metrics (CWQI, NGC).
 * 
 * DO NOT RE-ENABLE without explicit approval.
 * 
 * @deprecated Phase 8.8.3-I7 legacy trade path
 * @archived 2024-12-15
 */

/**
 * The original scanForSignals() implementation has been archived.
 * See: server/legacy/scanForSignals.legacy.txt
 * 
 * What it did:
 * - Ran every 1.5 seconds via monitoringInterval
 * - Got Active Filtered Pool pairs
 * - Called checkSymbolForSignal() for each pair
 * - Directly created trades via executeSimulatedTrade()
 * 
 * Why deprecated:
 * - Bypassed SignalOrchestrator which computes NGC, CWQI metrics
 * - Bypassed SQE quality filter
 * - Bypassed RTB queue
 * - Led to low-quality "ghost trades"
 */

/**
 * The original checkSymbolForSignal() implementation has been archived.
 * See: server/legacy/checkSymbolForSignal.legacy.txt
 * 
 * What it did:
 * - Fetched market data for a symbol
 * - Ran all 9 strategies directly (vwap_pullback, abcd_long, etc.)
 * - Picked best signal by confidence
 * - Called executeSimulatedTrade() directly
 * 
 * Why deprecated:
 * - Strategy evaluation now handled by SignalOrchestrator.evaluateSymbol()
 * - No NGC normalization
 * - No SQE quality check
 * - No CWQI computation
 */

/**
 * The original injectForcedTrade() implementation.
 * 
 * What it did:
 * - Allowed forcing a trade for a symbol via PAPER_FORCE_TRADE_SYMBOL env var
 * - Created a vwap_pullback signal with 75% confidence
 * - Bypassed all quality filters
 * 
 * Why deprecated:
 * - Completely bypassed the quality pipeline
 * - Used for testing but created phantom trades in production
 * - PAPER_FORCE_TRADE_SYMBOL env var no longer honored
 */

// To re-enable legacy mode (NOT RECOMMENDED):
// Set ENABLE_LEGACY_MODE=true in environment
// This will allow injectForcedTrade to run (but not scanForSignals/checkSymbolForSignal)

export const LEGACY_ARCHIVE_INFO = {
  directive: '8.8.4-C.3',
  archivedAt: '2024-12-15',
  reason: 'Ghost trades created without quality metrics',
  affectedFunctions: [
    'scanForSignals',
    'checkSymbolForSignal', 
    'injectForcedTrade'
  ],
  correctPipeline: 'FX5 → SignalOrchestrator → SQE → RTB → TCL → processSignal()'
};
