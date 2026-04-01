/**
 * REB 2.8.5A: FX5-Native 24h Window & Cycles Per Hour Tracking
 * REB 2.8.6B: Simplified gating - uses ONLY isEngineActive (no SystemConfig checks)
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
 * - REB 2.8.6B: Single-gate pattern (isEngineActive only, no SystemConfig)
 * - Pure data aggregation for REST endpoints
 */

import fs from 'fs';
import path from 'path';

type Mode = 'paper' | 'live';

// Batch 46: Persistence for 24h window data
const FX5_WINDOW_STATE_DIR = path.join(process.cwd(), 'logs', 'fx5_state');
const FX5_WINDOW_STATE_FILE = path.join(FX5_WINDOW_STATE_DIR, 'window_24h.json');
let persistTimer: ReturnType<typeof setInterval> | null = null;

interface Scan24hEntry {
  cycleId: string;
  completedAt: number;       // ms timestamp
  evaluatedCount: number;
  eligibleCount: number;
  evaluatedSymbols: string[]; // symbols touched in this cycle
  survivedSymbols: string[];  // symbols that passed filters
  ineligibleSymbols: string[]; // REB 2.8.8: symbols that failed at least one filter
  filterFailures: Record<string, number>; // REB 2.8.8: count of failures per filter ID
}

interface Breakdown24h {
  survived: number;           // total passed all filters across 24h
  ineligible: number;         // total failed at least one filter across 24h
  byFilter: Record<string, {
    name: string;
    failedCount: number;
    survivedCount: number;
  }>;
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
  breakdown24h: Breakdown24h; // REB 2.8.8: Filter-level breakdown over 24h
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
  // REB 2.8.6B: Single-gate pattern - check ONLY isEngineActive
  // Passive learning is derived (!isEngineActive), not a separate flag
  if (!isEngineActive) {
    // REB 2.8.5A: 24h metrics must only track ACTIVE trading cycles
    console.log(`[FX5-24h] Skipped recording ${mode} cycle ${entry.cycleId} - engine STOPPED (passive learning)`);
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
 * REB 2.8.5C: Changed semantics to TRADING-ONLY (not FX5 health)
 * 
 * @param mode - paper or live
 * @param isEngineActive - whether trading engine is ACTIVE for this mode
 * 
 * Note: This now tracks ONLY ACTIVE trading scans (changed from 2.8.5B)
 * to reflect trading activity, not FX5 scanner health
 */
export function recordScanCompletion(mode: Mode, isEngineActive: boolean): void {
  // REB 2.8.6B: Single-gate pattern - check ONLY isEngineActive
  // Passive learning is derived (!isEngineActive), not a separate flag
  if (!isEngineActive) {
    // REB 2.8.5C: cyclesPerHour must represent trading activity only
    // Do not record STOPPED (passive learning) scans
    return;
  }

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
      breakdown24h: {
        survived: 0,
        ineligible: 0,
        byFilter: {},
      },
    };
  }

  const totalCycles = window.length;
  const totalEvaluated = window.reduce((sum, e) => sum + e.evaluatedCount, 0);
  const totalSurvived = window.reduce((sum, e) => sum + e.eligibleCount, 0);

  // Deduplicate symbols across all cycles
  const evaluatedSet = new Set<string>();
  const survivedSet = new Set<string>();
  const ineligibleSet = new Set<string>(); // REB 2.8.8: Track ineligible symbols
  for (const e of window) {
    e.evaluatedSymbols.forEach(s => evaluatedSet.add(s));
    e.survivedSymbols.forEach(s => survivedSet.add(s));
    e.ineligibleSymbols?.forEach(s => ineligibleSet.add(s)); // REB 2.8.8: Aggregate ineligible
  }

  const uniqueEvaluated = evaluatedSet.size;
  const uniqueSurvived = survivedSet.size;

  const windowStart = new Date(window[0].completedAt).toISOString();
  const windowEnd = new Date(window[window.length - 1].completedAt).toISOString();

  // REB 2.8.8: Compute filter-level breakdown over 24h window
  // 10.9C: Added failed_correlation for Correlation Guard (ρ ≤ 0.75)
  const filterNameMap: Record<string, string> = {
    failed_min_volume: 'Minimum Volume',
    failed_spread: 'Bid-Ask Spread',
    failed_daily_range: 'Daily Range',
    failed_min_price: 'Minimum Price',
    failed_stablecoin: 'Stablecoin Filter',
    failed_quote_currency: 'Quote Currency',
    failed_history: 'Insufficient History',
    failed_market_cap: 'Market Cap',
    failed_guardrail_risk: 'Guardrail Risk',
    failed_correlation: 'Correlation Guard (ρ ≤ 0.75)', // 10.9C
    already_active: 'Already Active',
    passed_all_filters: 'Passed All Filters',
  };

  // Aggregate all filter IDs that appear in any cycle
  const allFilterIds = new Set<string>();
  for (const entry of window) {
    const failures = entry.filterFailures ?? {};
    for (const filterId of Object.keys(failures)) {
      allFilterIds.add(filterId);
    }
  }

  // Compute totals per filter across all cycles
  const byFilter: Record<string, { name: string; failedCount: number; survivedCount: number }> = {};
  let totalIneligible = 0;

  for (const filterId of allFilterIds) {
    // Skip passed_all_filters - it's handled separately below
    if (filterId === 'passed_all_filters') {
      continue;
    }

    let failedCount = 0;
    
    for (const entry of window) {
      const failures = entry.filterFailures ?? {};
      failedCount += failures[filterId] ?? 0;
    }

    // survivedCount = symbols that PASSED this filter in each cycle
    // For a given filter, survivedCount = totalEvaluated - failedCount
    // This is correct because each symbol either passes or fails each filter
    const survivedCount = totalEvaluated - failedCount;

    byFilter[filterId] = {
      name: filterNameMap[filterId] || filterId,
      failedCount,
      survivedCount,
    };
  }

  // Compute total ineligible symbols (failed at least one filter)
  for (const entry of window) {
    totalIneligible += entry.ineligibleSymbols?.length ?? 0;
  }

  // Always set passed_all_filters explicitly (special case with inverted semantics)
  // For this filter, "survivedCount" = totalSurvived (symbols that passed ALL filters)
  // and "failedCount" = totalEvaluated - totalSurvived (symbols that failed at least one)
  byFilter.passed_all_filters = {
    name: 'Passed All Filters',
    failedCount: totalEvaluated - totalSurvived,
    survivedCount: totalSurvived,
  };

  return {
    mode,
    totalCycles,
    totalEvaluated,
    totalSurvived,
    uniqueEvaluated,
    uniqueSurvived,
    windowStart,
    windowEnd,
    breakdown24h: {
      survived: totalSurvived,
      ineligible: totalIneligible,
      byFilter,
    },
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

// REB 2.8.5C: Directive-specified function names for reset operations
/**
 * Reset 24h window for a mode (REB 2.8.5C directive name)
 * Alias for clear24hWindow()
 */
export function reset24hWindow(mode: Mode): void {
  clear24hWindow(mode);
}

/**
 * Reset hourly scan history for a mode (REB 2.8.5C directive name)
 * Alias for clearCyclesHistory()
 */
export function resetHourlyScanHistory(mode: Mode): void {
  clearCyclesHistory(mode);
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

// ═══════════════════════════════════════════════════════════════════════════
// Batch 46: Persistence — survive PM2 restarts
// ═══════════════════════════════════════════════════════════════════════════

function persistWindowState(): void {
  try {
    if (!fs.existsSync(FX5_WINDOW_STATE_DIR)) {
      fs.mkdirSync(FX5_WINDOW_STATE_DIR, { recursive: true });
    }
    const state: Record<string, any> = { version: 1, savedAt: Date.now() };
    for (const mode of ['paper', 'live'] as Mode[]) {
      state[`window_${mode}`] = window24hByMode.get(mode) ?? [];
      state[`history_${mode}`] = scanHistoryByMode.get(mode) ?? { timestamps: [] };
    }
    fs.writeFileSync(FX5_WINDOW_STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('[46][FX5-24h] Failed to persist window state:', err);
  }
}

function rehydrateWindowState(): void {
  try {
    if (!fs.existsSync(FX5_WINDOW_STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(FX5_WINDOW_STATE_FILE, 'utf-8'));
    const now = Date.now();
    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const cutoff1h = now - 60 * 60 * 1000;

    for (const mode of ['paper', 'live'] as Mode[]) {
      const entries: Scan24hEntry[] = data[`window_${mode}`] ?? [];
      const filtered = entries.filter(e => e.completedAt >= cutoff24h);
      if (filtered.length > 0) {
        window24hByMode.set(mode, filtered);
      }
      const hist = data[`history_${mode}`];
      if (hist?.timestamps) {
        const filteredTs = hist.timestamps.filter((t: number) => t >= cutoff1h);
        if (filteredTs.length > 0) {
          scanHistoryByMode.set(mode, { timestamps: filteredTs });
        }
      }
    }
    const totalEntries = (window24hByMode.get('paper')?.length ?? 0) + (window24hByMode.get('live')?.length ?? 0);
    if (totalEntries > 0) {
      console.log(`[46][FX5-24h] Rehydrated ${totalEntries} scan entries from disk`);
    }
  } catch (err) {
    console.error('[46][FX5-24h] Failed to rehydrate window state:', err);
  }
}

// Auto-rehydrate on module load
rehydrateWindowState();

// Auto-persist every 5 minutes
persistTimer = setInterval(persistWindowState, 5 * 60 * 1000);

export { persistWindowState };
