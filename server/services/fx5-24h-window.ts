/**
 * REB 2.8.5A: FX5-Native 24h Window & Cycles Per Hour Tracking
 * 
 * This module replaces the legacy scan24hAggregator with a lightweight,
 * FX5-specific implementation that:
 * - Tracks 24h metrics ONLY for ACTIVE trading cycles
 * - Computes real cyclesPerHour from recent scan history
 * - Provides clean REST-based aggregation
 * 
 * Key differences from legacy aggregator:
 * - No engine state polling (relies on explicit isEngineActive parameter)
 * - No WebSocket emissions
 * - No systemConfigService dependencies
 * - Pure data aggregation for REST endpoints
 */

type Mode = 'paper' | 'live';

interface Scan24hEntry {
  cycleId: string;
  completedAt: number;       // ms timestamp
  evaluatedCount: number;
  eligibleCount: number;
  evaluatedSymbols: string[]; // symbols touched in this cycle
  survivedSymbols: string[];  // symbols that passed filters
}

interface Scan24hResponse {
  mode: Mode;
  totalCycles: number;
  totalEvaluated: number;
  totalSurvived: number;
  uniqueEvaluated: number;
  uniqueSurvived: number;
  windowStart: string;
  windowEnd: string;
}

// Separate windows for 24h metrics (ACTIVE cycles only)
const window24hByMode = new Map<Mode, Scan24hEntry[]>();

// Separate history for cyclesPerHour tracking (all cycles, ACTIVE or passive)
interface ScanHistory {
  timestamps: number[]; // completion timestamps in ms
}
const scanHistoryByMode = new Map<Mode, ScanHistory>();

/**
 * Record a completed FX5 scan for 24h aggregation
 * 
 * @param mode - paper or live
 * @param entry - scan cycle data
 * @param isEngineActive - whether trading engine is ACTIVE for this mode
 * 
 * Rules:
 * - Only records when isEngineActive=true (no passive learning cycles)
 * - Maintains rolling 24h window (auto-trims old entries)
 * - Deduplicates symbols per cycle
 */
export function recordScanFor24h(
  mode: Mode,
  entry: Scan24hEntry,
  isEngineActive: boolean
): void {
  if (!isEngineActive) {
    // REB 2.8.5A: 24h metrics must only track ACTIVE trading cycles
    console.log(`[FX5-24h] Skipped recording ${mode} cycle ${entry.cycleId} - engine STOPPED`);
    return;
  }

  const now = entry.completedAt;
  const window = window24hByMode.get(mode) ?? [];
  window.push(entry);

  // Keep only last 24 hours
  const cutoff = now - 24 * 60 * 60 * 1000;
  const trimmed = window.filter(e => e.completedAt >= cutoff);

  window24hByMode.set(mode, trimmed);

  console.log(`[FX5-24h] Recorded ${mode} cycle ${entry.cycleId} - window size: ${trimmed.length} cycles`);
}

/**
 * Record scan completion timestamp for cyclesPerHour tracking
 * REB 2.8.5B: Updated to use current timestamp
 * 
 * @param mode - paper or live
 * 
 * Note: This tracks ALL scans (ACTIVE and passive) to give accurate
 * cyclesPerHour metric reflecting actual FX5 performance
 */
export function recordScanCompletion(mode: Mode): void {
  const now = Date.now();
  const history = scanHistoryByMode.get(mode) ?? { timestamps: [] };
  history.timestamps.push(now);

  // Remove anything older than 3600 seconds (1 hour)
  history.timestamps = history.timestamps.filter(t => now - t <= 3600000);

  scanHistoryByMode.set(mode, history);
}

/**
 * Get cycles per hour for a mode
 * REB 2.8.5B: Returns count of scans in last hour
 * 
 * @param mode - paper or live
 * @returns Number of scan cycles completed in the last hour
 * 
 * Returns 0 if no scans in last hour (e.g., fresh start)
 */
export function getCyclesPerHour(mode: Mode): number {
  const history = scanHistoryByMode.get(mode);
  if (!history || history.timestamps.length === 0) {
    return 0;
  }
  // REB 2.8.5B: Simple count of scans in last hour
  return history.timestamps.length;
}

/**
 * Get 24h aggregation summary for a mode
 * 
 * @param mode - paper or live
 * @returns Aggregated 24h metrics from ACTIVE cycles only
 * 
 * Returns zeros when:
 * - No ACTIVE cycles in last 24h
 * - Engine has been STOPPED (window is empty)
 * - Fresh start with no history
 */
export function get24hSummary(mode: Mode): Scan24hResponse {
  const window = window24hByMode.get(mode) ?? [];
  
  if (window.length === 0) {
    return {
      mode,
      totalCycles: 0,
      totalEvaluated: 0,
      totalSurvived: 0,
      uniqueEvaluated: 0,
      uniqueSurvived: 0,
      windowStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      windowEnd: new Date().toISOString(),
    };
  }

  const totalCycles = window.length;
  const totalEvaluated = window.reduce((sum, e) => sum + e.evaluatedCount, 0);
  const totalSurvived = window.reduce((sum, e) => sum + e.eligibleCount, 0);

  // Deduplicate symbols across all cycles
  const evaluatedSet = new Set<string>();
  const survivedSet = new Set<string>();
  for (const e of window) {
    e.evaluatedSymbols.forEach(s => evaluatedSet.add(s));
    e.survivedSymbols.forEach(s => survivedSet.add(s));
  }

  const uniqueEvaluated = evaluatedSet.size;
  const uniqueSurvived = survivedSet.size;

  const windowStart = new Date(window[0].completedAt).toISOString();
  const windowEnd = new Date(window[window.length - 1].completedAt).toISOString();

  return {
    mode,
    totalCycles,
    totalEvaluated,
    totalSurvived,
    uniqueEvaluated,
    uniqueSurvived,
    windowStart,
    windowEnd,
  };
}

/**
 * Clear all 24h data for a mode
 * 
 * @param mode - paper or live
 * 
 * Called when:
 * - Engine transitions from ACTIVE → STOPPED
 * - User explicitly resets trading session
 */
export function clear24hWindow(mode: Mode): void {
  window24hByMode.delete(mode);
  console.log(`[FX5-24h] Cleared ${mode} 24h window`);
}

/**
 * Clear cycles per hour history for a mode
 * 
 * @param mode - paper or live
 */
export function clearCyclesHistory(mode: Mode): void {
  scanHistoryByMode.delete(mode);
  console.log(`[FX5-24h] Cleared ${mode} cycles history`);
}

/**
 * Get diagnostic info for debugging
 */
export function getDiagnostics(mode: Mode): {
  window24hSize: number;
  cyclesHistorySize: number;
  cyclesPerHour: number;
} {
  const window = window24hByMode.get(mode) ?? [];
  const history = scanHistoryByMode.get(mode);
  
  return {
    window24hSize: window.length,
    cyclesHistorySize: history?.timestamps.length ?? 0,
    cyclesPerHour: getCyclesPerHour(mode),
  };
}
