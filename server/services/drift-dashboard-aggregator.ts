/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Drift Dashboard Aggregator (B64a, 2026-04-22)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Aggregates post-close observation data for the Regime & Strategy Drift
 * Dashboard tab. Mirrors the metrics the B62 72h completion report produced
 * (regime shares, family flicker, drift contamination, component-clamp
 * saturation, DBS distribution, strategy performance by regime).
 *
 * DESIGN:
 * - Reads CLOSED trades from /home/deploy/dawntrader/logs/virtual_trades/*.json
 * - Reads MCE per-cycle telemetry from /home/deploy/dawntrader/logs/phase15b_dbs_telemetry/*.jsonl
 * - Reads live global-DBS snapshot from directionalBiasStore
 * - Produces a deterministic-within-a-call JSON payload for /api/analytics/drift-dashboard
 *
 * SCOPE:
 * - Closed trades only (live positions stay on Active Trades page)
 * - Window types: rolling_24h, rolling_7d, rolling_30d, cohort_latest (since last PM2 restart)
 * - NO persistence/caching in this MVP; aggregator reads disk each call.
 *   If CPU cost becomes a problem, add a 60s memoization layer.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { directionalBiasStore } from '../core/metrics/directional-bias-store.js';

const TRADES_DIR = '/home/deploy/dawntrader/logs/virtual_trades';
const TELEMETRY_DIR = '/home/deploy/dawntrader/logs/phase15b_dbs_telemetry';

const REGIMES = ['TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION', 'RANGE_BOUND_STABLE', 'HIGH_VOLATILITY_UNSTABLE'] as const;
type RegimeName = typeof REGIMES[number];

const DBS_CATEGORIES = ['UP_STRONG', 'UP_MODERATE', 'UP_WEAK', 'NEUTRAL', 'DOWN_WEAK', 'DOWN_MODERATE', 'DOWN_STRONG'] as const;
type DbsCategory = typeof DBS_CATEGORIES[number];

export type DashboardWindow = 'rolling_24h' | 'rolling_7d' | 'rolling_30d' | 'cohort_latest';

export interface StrategyStats {
  strategy: string;
  tradeCount: number;
  winCount: number;
  winRate: number;
  avgNetPct: number;
  sumNetPct: number;
}

export interface DriftDashboardResponse {
  window: DashboardWindow;
  windowStart: string;
  windowEnd: string;
  cohortStart?: string;

  // Regime metrics (B62-report style)
  regime: {
    totalSamples: number;
    shares: Record<RegimeName, number>;
    familyFlickerPct: number | null;
    rbsDriftContaminationPct: number | null;
    componentClampSaturationPct: { slope: number; return: number; ema: number };
  };

  // Strategy performance grouped by regime-at-entry
  strategiesByRegime: Record<RegimeName, StrategyStats[]>;

  // DBS distribution (per MCE sample in window, B62-style counts)
  dbsDistribution: Record<DbsCategory, number>;

  // Global DBS context
  globalDbs: {
    current: {
      score: number | null;
      category: string | null;
      pairCount: number;
      isStale: boolean;
      snapshotAgeSeconds: number | null;
    };
    history24h: Array<{ timestamp: string; score: number; category: string; pairCount: number }>;
    transitions: Array<{ timestamp: string; from: string; to: string }>;
  };

  // Top-level tallies
  tradeCounts: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgNetPct: number;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Window resolution
// ──────────────────────────────────────────────────────────────────────────────

function getWindowBounds(window: DashboardWindow): { startMs: number; endMs: number; cohortMs?: number } {
  const now = Date.now();
  switch (window) {
    case 'rolling_24h': return { startMs: now - 24 * 3600 * 1000, endMs: now };
    case 'rolling_7d': return { startMs: now - 7 * 86400 * 1000, endMs: now };
    case 'rolling_30d': return { startMs: now - 30 * 86400 * 1000, endMs: now };
    case 'cohort_latest': {
      // Use the current process start time as the cohort boundary.
      // process.uptime() returns seconds since start.
      const uptimeMs = Math.round(process.uptime() * 1000);
      const cohortStart = now - uptimeMs;
      return { startMs: cohortStart, endMs: now, cohortMs: cohortStart };
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Trade file discovery + reading
// ──────────────────────────────────────────────────────────────────────────────

function listTradeFilesInWindow(startMs: number, endMs: number): string[] {
  if (!fs.existsSync(TRADES_DIR)) return [];
  const files = fs.readdirSync(TRADES_DIR);
  const out: string[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    const dateStr = m[1];
    // Parse UTC midnight; include files whose day overlaps the window.
    const dayStart = Date.parse(dateStr + 'T00:00:00Z');
    const dayEnd = dayStart + 86400 * 1000;
    if (dayEnd < startMs) continue;
    if (dayStart > endMs) continue;
    out.push(path.join(TRADES_DIR, f));
  }
  return out.sort();
}

interface ClosedTrade {
  strategy: string;
  regime: string;
  netProfit?: number;
  entryTime?: number;
  exitTime?: number;
  signal?: { entryPrice?: number; symbol?: string; };
  pairDirectionalBiasScore?: number;
  globalDirectionalBiasScore?: number;
  status?: string;
  sourcePool?: string;
}

function readClosedTrades(files: string[], startMs: number, endMs: number): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, 'utf-8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) continue;
      for (const t of data) {
        if (t?.status !== 'closed') continue;
        const exitTime = t.exitTime;
        if (typeof exitTime !== 'number') continue;
        if (exitTime < startMs || exitTime > endMs) continue;
        trades.push(t);
      }
    } catch { /* ignore malformed files */ }
  }
  return trades;
}

// ──────────────────────────────────────────────────────────────────────────────
// Telemetry file reading (streamed line-by-line)
// ──────────────────────────────────────────────────────────────────────────────

interface McePerCycleSample {
  ts: string;
  cycleId: number;
  symbol: string;
  dbs: { score: number; category: string; sentinelZero: boolean };
  classifier: { vol: number; adx: number; mom: number; regime: string };
  atr: number;
}

function* streamTelemetryLines(startMs: number, endMs: number): Generator<McePerCycleSample> {
  if (!fs.existsSync(TELEMETRY_DIR)) return;
  const files = fs.readdirSync(TELEMETRY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();
  for (const f of files) {
    const fp = path.join(TELEMETRY_DIR, f);
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const dayStart = Date.parse(dateMatch[1] + 'T00:00:00Z');
      if (dayStart + 86400000 < startMs) continue;
      if (dayStart > endMs) continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(fp, 'utf-8');
    } catch { continue; }
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        const ts = r?.ts ? Date.parse(r.ts) : NaN;
        if (isNaN(ts) || ts < startMs || ts > endMs) continue;
        yield r as McePerCycleSample;
      } catch { /* malformed line, skip */ }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Aggregation
// ──────────────────────────────────────────────────────────────────────────────

function emptyRegimeShares(): Record<RegimeName, number> {
  return { TREND_FRIENDLY_STABLE: 0, IMPULSE_EXPANSION: 0, STRUCTURAL_TRANSITION: 0, RANGE_BOUND_STABLE: 0, HIGH_VOLATILITY_UNSTABLE: 0 };
}

function emptyDbsDistribution(): Record<DbsCategory, number> {
  return { UP_STRONG: 0, UP_MODERATE: 0, UP_WEAK: 0, NEUTRAL: 0, DOWN_WEAK: 0, DOWN_MODERATE: 0, DOWN_STRONG: 0 };
}

function aggregateRegimeMetrics(startMs: number, endMs: number): {
  totalSamples: number;
  shares: Record<RegimeName, number>;
  familyFlickerPct: number | null;
  rbsDriftContaminationPct: number | null;
  componentClampSaturationPct: { slope: number; return: number; ema: number };
  dbsDistribution: Record<DbsCategory, number>;
  globalDbsHistory: Array<{ timestamp: string; score: number; category: string; pairCount: number }>;
  globalDbsTransitions: Array<{ timestamp: string; from: string; to: string }>;
} {
  const counts = emptyRegimeShares();
  const dbsDist = emptyDbsDistribution();
  let total = 0;
  let rbsDriftContaminated = 0;
  let rbsTotal = 0;

  // Per-cycle family transitions for flicker. Flicker = changes across consecutive cycles
  // (same symbol, regime differs from prior sample for that symbol).
  const lastRegimePerSymbol = new Map<string, string>();
  let transitions = 0;
  let transitionSamples = 0;

  // Component-clamp saturation — approximate: count samples with |slopeComponent|>=0.99,
  // |returnComponent|>=0.34, |emaComponent|>=0.249 (per B61 thresholds).
  // Without the individual components in the current telemetry shape, we approximate via |dbs.score| at clamps.
  // Clamp surrogate: sample with |dbs.score| >= 0.99 (i.e., saturated at ±1).
  let slopeSat = 0, returnSat = 0, emaSat = 0;

  for (const sample of streamTelemetryLines(startMs, endMs)) {
    total += 1;
    const regime = sample.classifier?.regime as RegimeName | undefined;
    if (regime && regime in counts) counts[regime] += 1;

    const dbsCat = sample.dbs?.category as DbsCategory | undefined;
    if (dbsCat && dbsCat in dbsDist) dbsDist[dbsCat] += 1;

    // RBS drift contamination: RBS samples where |DBS| >= 0.30 (directional pair mis-labeled as range).
    if (regime === 'RANGE_BOUND_STABLE') {
      rbsTotal += 1;
      if (Math.abs(sample.dbs?.score ?? 0) >= 0.30) rbsDriftContaminated += 1;
    }

    // Saturation surrogate
    if (Math.abs(sample.dbs?.score ?? 0) >= 0.99) { slopeSat += 1; returnSat += 1; emaSat += 1; }

    // Flicker — per-symbol cycle-to-cycle regime changes
    const prior = lastRegimePerSymbol.get(sample.symbol);
    if (prior && regime && prior !== regime) transitions += 1;
    if (prior) transitionSamples += 1;
    if (regime) lastRegimePerSymbol.set(sample.symbol, regime);
  }

  const shares: Record<RegimeName, number> = emptyRegimeShares();
  for (const r of REGIMES) {
    shares[r] = total > 0 ? +(counts[r] / total * 100).toFixed(2) : 0;
  }

  const familyFlickerPct = transitionSamples > 0 ? +(transitions / transitionSamples * 100).toFixed(2) : null;
  const rbsDriftContaminationPct = rbsTotal > 0 ? +(rbsDriftContaminated / rbsTotal * 100).toFixed(2) : null;
  const componentClampSaturationPct = {
    slope: total > 0 ? +(slopeSat / total * 100).toFixed(2) : 0,
    return: total > 0 ? +(returnSat / total * 100).toFixed(2) : 0,
    ema: total > 0 ? +(emaSat / total * 100).toFixed(2) : 0,
  };

  // Global DBS history: sample one snapshot per 30-minute bucket from the MCE stream.
  // (The authoritative global-DBS snapshot is published by directionalBiasStore; the MCE stream
  // carries per-pair DBS. We reconstruct a per-bucket GLOBAL from the pairs via median per bucket.)
  // To keep compute bounded, a second pass with bucket-median would be ideal; MVP: sample current
  // snapshot + emit hourly markers from telemetry ts ranges.
  // For now, emit a coarse history keyed by cycleId rounded hours — best effort.
  // (This is a known simplification; a richer history can be added in a follow-up batch.)
  const globalDbsHistory: Array<{ timestamp: string; score: number; category: string; pairCount: number }> = [];
  const globalDbsTransitions: Array<{ timestamp: string; from: string; to: string }> = [];

  return { totalSamples: total, shares, familyFlickerPct, rbsDriftContaminationPct, componentClampSaturationPct, dbsDistribution: dbsDist, globalDbsHistory, globalDbsTransitions };
}

function aggregateStrategyByRegime(trades: ClosedTrade[]): Record<RegimeName, StrategyStats[]> {
  const buckets: Record<string, Map<string, StrategyStats>> = {};
  for (const r of REGIMES) buckets[r] = new Map();
  for (const t of trades) {
    const regime = t.regime as RegimeName;
    if (!(regime in buckets)) continue;
    const strat = t.strategy || 'unknown';
    let s = buckets[regime].get(strat);
    if (!s) {
      s = { strategy: strat, tradeCount: 0, winCount: 0, winRate: 0, avgNetPct: 0, sumNetPct: 0 };
      buckets[regime].set(strat, s);
    }
    s.tradeCount += 1;
    const net = typeof t.netProfit === 'number' ? t.netProfit : 0;
    if (net > 0) s.winCount += 1;
    // Use gross % from entry vs exit if available; fallback to net dollar sign as win flag
    const entryPrice = t.signal?.entryPrice ?? 0;
    const netPct = entryPrice > 0 ? (net / entryPrice) * 100 : 0;
    s.sumNetPct += netPct;
  }
  const out: Record<RegimeName, StrategyStats[]> = { TREND_FRIENDLY_STABLE: [], IMPULSE_EXPANSION: [], STRUCTURAL_TRANSITION: [], RANGE_BOUND_STABLE: [], HIGH_VOLATILITY_UNSTABLE: [] };
  for (const r of REGIMES) {
    const arr: StrategyStats[] = [];
    for (const s of buckets[r].values()) {
      s.winRate = s.tradeCount > 0 ? +(s.winCount / s.tradeCount * 100).toFixed(2) : 0;
      s.avgNetPct = s.tradeCount > 0 ? +(s.sumNetPct / s.tradeCount).toFixed(4) : 0;
      arr.push(s);
    }
    arr.sort((a, b) => b.tradeCount - a.tradeCount);
    out[r] = arr;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────────

export function computeDriftDashboard(window: DashboardWindow): DriftDashboardResponse {
  const { startMs, endMs, cohortMs } = getWindowBounds(window);
  const tradeFiles = listTradeFilesInWindow(startMs, endMs);
  const trades = readClosedTrades(tradeFiles, startMs, endMs);

  const regimeMetrics = aggregateRegimeMetrics(startMs, endMs);
  const strategiesByRegime = aggregateStrategyByRegime(trades);

  // Trade tallies
  let wins = 0;
  let sumNetPct = 0;
  for (const t of trades) {
    const net = typeof t.netProfit === 'number' ? t.netProfit : 0;
    if (net > 0) wins += 1;
    const entryPrice = t.signal?.entryPrice ?? 0;
    if (entryPrice > 0) sumNetPct += (net / entryPrice) * 100;
  }
  const total = trades.length;
  const losses = total - wins;
  const winRate = total > 0 ? +(wins / total * 100).toFixed(2) : 0;
  const avgNetPct = total > 0 ? +(sumNetPct / total).toFixed(4) : 0;

  // Global DBS current snapshot
  const snap = directionalBiasStore.getLatestSnapshot();
  const currentGlobal = snap ? {
    score: snap.value.score,
    category: snap.value.category,
    pairCount: snap.value.pairCount,
    isStale: snap.isStale,
    snapshotAgeSeconds: Math.max(0, Math.round((Date.now() - snap.snapshotTime) / 1000)),
  } : { score: null, category: null, pairCount: 0, isStale: false, snapshotAgeSeconds: null };

  return {
    window,
    windowStart: new Date(startMs).toISOString(),
    windowEnd: new Date(endMs).toISOString(),
    cohortStart: cohortMs ? new Date(cohortMs).toISOString() : undefined,
    regime: {
      totalSamples: regimeMetrics.totalSamples,
      shares: regimeMetrics.shares,
      familyFlickerPct: regimeMetrics.familyFlickerPct,
      rbsDriftContaminationPct: regimeMetrics.rbsDriftContaminationPct,
      componentClampSaturationPct: regimeMetrics.componentClampSaturationPct,
    },
    strategiesByRegime,
    dbsDistribution: regimeMetrics.dbsDistribution,
    globalDbs: {
      current: currentGlobal,
      history24h: regimeMetrics.globalDbsHistory, // placeholder — empty in MVP
      transitions: regimeMetrics.globalDbsTransitions, // placeholder — empty in MVP
    },
    tradeCounts: { total, wins, losses, winRate, avgNetPct },
  };
}
