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
// B64a: regime names imported from the canonical SSOT to satisfy the
// regime_mapping_integrity test ("no hardcoded regime strings outside config/tests").
import { CANONICAL_REGIMES, REGIMES, type CanonicalRegimeType } from '../config/canonical-regime-strategy-map.js';

const TRADES_DIR = '/home/deploy/dawntrader/logs/virtual_trades';
const TELEMETRY_DIR = '/home/deploy/dawntrader/logs/phase15b_dbs_telemetry';

const REGIMES = CANONICAL_REGIMES;
type RegimeName = CanonicalRegimeType;

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
  avgNetValue: number;  // dollar average per trade
  sumNetValue: number;  // dollar total across trades
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
  // Build dynamically from CANONICAL_REGIMES so we never hardcode regime names here.
  const out = {} as Record<RegimeName, number>;
  for (const r of REGIMES) out[r] = 0;
  return out;
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
    if (regime === REGIMES.RANGE_BOUND_STABLE) {
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

  // Global DBS history + transitions come from the store's ring buffers (B64a follow-up).
  // Store persists up to 96 snapshots (24h at 15-min cadence) + last 50 category transitions.
  // We filter by the caller's window here so the aggregator's window toggle is honored even
  // when the store's history is longer than the requested window.
  const rawHistory = directionalBiasStore.getHistory();
  const rawTransitions = directionalBiasStore.getTransitions();
  const globalDbsHistory = rawHistory
    .filter(h => h.timestamp >= startMs && h.timestamp <= endMs)
    .map(h => ({ timestamp: new Date(h.timestamp).toISOString(), score: h.score, category: h.category, pairCount: h.pairCount }));
  const globalDbsTransitions = rawTransitions
    .filter(t => t.timestamp >= startMs && t.timestamp <= endMs)
    .map(t => ({ timestamp: new Date(t.timestamp).toISOString(), from: t.from, to: t.to }));

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
      s = { strategy: strat, tradeCount: 0, winCount: 0, winRate: 0, avgNetPct: 0, sumNetPct: 0, avgNetValue: 0, sumNetValue: 0 };
      buckets[regime].set(strat, s);
    }
    s.tradeCount += 1;
    const net = typeof t.netProfit === 'number' ? t.netProfit : 0;
    if (net > 0) s.winCount += 1;
    // Use gross % from entry vs exit if available; fallback to net dollar sign as win flag
    const entryPrice = t.signal?.entryPrice ?? 0;
    const netPct = entryPrice > 0 ? (net / entryPrice) * 100 : 0;
    s.sumNetPct += netPct;
    s.sumNetValue += net;
  }
  const out = {} as Record<RegimeName, StrategyStats[]>;
  for (const r of REGIMES) out[r] = [];
  for (const r of REGIMES) {
    const arr: StrategyStats[] = [];
    for (const s of buckets[r].values()) {
      s.winRate = s.tradeCount > 0 ? +(s.winCount / s.tradeCount * 100).toFixed(2) : 0;
      s.avgNetPct = s.tradeCount > 0 ? +(s.sumNetPct / s.tradeCount).toFixed(4) : 0;
      s.avgNetValue = s.tradeCount > 0 ? +(s.sumNetValue / s.tradeCount).toFixed(2) : 0;
      s.sumNetValue = +s.sumNetValue.toFixed(2);
      s.sumNetPct = +s.sumNetPct.toFixed(2);
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

// ────────────────────────────────────────────────────────────────────────────
// B67.0 — Ablation comparison aggregator (extends drift-dashboard panel)
//
// Reads the regime_factor_alternates table populated by factor-ablation-emitter
// (B67.0) and the nightly replay-ablation job. Per-factor: counts pending vs
// replayed rows, computes "real WR vs alternate WR" deltas where the
// counterfactual is computable (admit/admit and admit/reject cases — see
// replay-ablation.ts header for the four-quadrant taxonomy).
//
// At B67.0 ship time (no factor producers yet), this returns zero rows for
// every metric. When B67.1+ producers begin emitting alternates, the panel
// populates automatically.
//
// Reference: BATCH_67_SCOPE.md §4.5 / §4.7
// ────────────────────────────────────────────────────────────────────────────

export interface AblationFactorStats {
  factorName: string;
  totalRows: number;
  pendingReplay: number;
  replayed: number;
  unreplayable: number;
  /** Where both real & alternate ADMIT — outcome unchanged. Always ~equal. */
  bothAdmitCount: number;
  /** Where real ADMIT, alternate REJECT — counterfactual is no-trade. */
  realAdmitAltRejectCount: number;
  realAdmitAltRejectAvgPnlUsdLost: number; // sum of (-realPnl) across these rows / count
  /** Where both REJECT — both produce no trade. */
  bothRejectCount: number;
  /**
   * Where real REJECTED but alternate would have ADMITTED. These can't be
   * replayed (no actual trade exists). Counted for analyst awareness.
   */
  realRejectAltAdmitCount: number;
}

export interface AblationComparisonResponse {
  window: DashboardWindow;
  windowStart: string;
  windowEnd: string;
  /** Per-factor breakdown. Empty array until B67.1+ producers ship. */
  factors: AblationFactorStats[];
  /** Total alternate rows in window across all factors. */
  totalRows: number;
  /** Whether replay job has produced any outcomes yet. */
  hasReplayedRows: boolean;
}

export async function computeAblationComparison(
  window: DashboardWindow,
): Promise<AblationComparisonResponse> {
  // Lazy-import db to avoid coupling this aggregator's other (file-based)
  // paths to the Drizzle/pg dependency at module-load time.
  const { db } = await import('../db.js');
  const { regimeFactorAlternates } = await import('../../shared/schema.js');
  const { gte, sql, isNotNull, isNull } = await import('drizzle-orm');

  const now = Date.now();
  const windowMs = WINDOW_TO_MS[window];
  const windowStart = new Date(now - windowMs);
  const windowEnd = new Date(now);

  // Aggregate per factor. Using raw sql for the GROUP BY + counts because the
  // typed Drizzle helpers would fight us on the conditional aggregations.
  const rows = await db.execute(sql`
    SELECT
      factor_name AS "factorName",
      COUNT(*)::int AS "totalRows",
      SUM(CASE WHEN replay_completed_at IS NULL THEN 1 ELSE 0 END)::int AS "pendingReplay",
      SUM(CASE WHEN replay_completed_at IS NOT NULL THEN 1 ELSE 0 END)::int AS "replayed",
      -- 'unreplayable' is a forward-looking catch-all for any alternateOutcome
      -- prefixed 'unreplayable_*'. Today only one variant exists
      -- ('unreplayable_real_rejected'); future outcome types may add more.
      -- LIKE-prefix match keeps this field meaningful as the taxonomy grows.
      -- B67.0.1 (2026-04-30): the replay-ablation script writes outcomes via
      -- 'outcome' + notes='pre_b67_5_both_admit' (admit/admit case pre-Kelly
      -- wiring), not alternateOutcome/'admit_admit_no_delta'. Aligning the
      -- aggregator to actual emitter shape per Kyle observation that UI
      -- showed 0 counts despite replays succeeding.
      SUM(CASE WHEN replay_outcome->>'outcome' LIKE 'unreplayable_%' THEN 1 ELSE 0 END)::int AS "unreplayable",
      SUM(CASE WHEN replay_outcome->>'notes' = 'pre_b67_5_both_admit' THEN 1 ELSE 0 END)::int AS "bothAdmitCount",
      SUM(CASE WHEN replay_outcome->>'notes' = 'alternate_would_have_rejected' THEN 1 ELSE 0 END)::int AS "realAdmitAltRejectCount",
      SUM(CASE WHEN replay_outcome->>'notes' = 'reject_reject_no_delta' THEN 1 ELSE 0 END)::int AS "bothRejectCount",
      -- realRejectAltAdmitCount specifically counts the real-rejected-but-
      -- alternate-would-admit case. Today this overlaps with 'unreplayable'
      -- (it's the only unreplayable variant) but the two fields stay separate
      -- so the meaning is explicit and survives future outcome additions.
      SUM(CASE WHEN replay_outcome->>'outcome' = 'unreplayable_real_rejected' THEN 1 ELSE 0 END)::int AS "realRejectAltAdmitCount",
      AVG(CASE WHEN replay_outcome->>'notes' = 'alternate_would_have_rejected'
               THEN -COALESCE((replay_outcome->>'pnlDeltaUsd')::numeric, 0)
               ELSE NULL END)::float AS "realAdmitAltRejectAvgPnlUsdLost"
    FROM regime_factor_alternates
    WHERE evaluated_at >= ${windowStart}
      -- B76 (2026-05-06): legacy frozen factor-name filter REMOVED.
      -- After the chain-final refactor, b67_1_macro_modifier (pre-split) and
      -- b67_2_phase_dimension (pre-rename) rows are pre-B76 by construction
      -- and have shift = 0 by structural bug (FIRST in chain). They no longer
      -- contaminate the post-B76 dashboard because the per-factor predictive-
      -- lift query (computeFactorCalibration) version-filters them.
      -- This summary query is replay-status counts (pending/replayed/unreplayable);
      -- legacy factor-name rows showing up here is expected forensic data.
    GROUP BY factor_name
    ORDER BY factor_name ASC
  `);

  // Drizzle .execute returns a result whose row shape varies by driver.
  // node-postgres returns { rows: [...] }; pg-pool returns array directly.
  // Normalize.
  const factorRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
    factorName: string;
    totalRows: number;
    pendingReplay: number;
    replayed: number;
    unreplayable: number;
    bothAdmitCount: number;
    realAdmitAltRejectCount: number;
    bothRejectCount: number;
    realRejectAltAdmitCount: number;
    realAdmitAltRejectAvgPnlUsdLost: number | null;
  }>;

  const factors: AblationFactorStats[] = factorRows.map((r) => ({
    factorName: r.factorName,
    totalRows: r.totalRows,
    pendingReplay: r.pendingReplay,
    replayed: r.replayed,
    unreplayable: r.unreplayable,
    bothAdmitCount: r.bothAdmitCount,
    realAdmitAltRejectCount: r.realAdmitAltRejectCount,
    realAdmitAltRejectAvgPnlUsdLost: r.realAdmitAltRejectAvgPnlUsdLost ?? 0,
    bothRejectCount: r.bothRejectCount,
    realRejectAltAdmitCount: r.realRejectAltAdmitCount,
  }));

  const totalRows = factors.reduce((sum, f) => sum + f.totalRows, 0);
  const hasReplayedRows = factors.some((f) => f.replayed > 0);

  return {
    window,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    factors,
    totalRows,
    hasReplayedRows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// B67 Factor Calibration Analysis (added 2026-04-30 per Kyle)
// ═══════════════════════════════════════════════════════════════════════════
//
// The Factor Ablation Comparison panel above (computeAblationComparison) is a
// substrate view: total/replayed/pending counts + admission-flip statistics
// that only become meaningful once B67.5 wires confidence into downstream
// consumer gates. Pre-B67.5, it correctly shows "no admission flips" because
// no consumer gates on confidence value — by design.
//
// This function provides the analysis Kyle expected from day one of the 14d
// observation window: per-factor scenario comparison using the confidence
// VALUES that ARE captured (with vs without each factor), independent of any
// consumer gating. Three views per factor:
//
//   1. Confidence-shift distribution: avg / max abs |REAL - ALT| confidence
//      delta. Tells whether the factor materially moves the confidence number.
//      Factors stuck at 0 shift across all trades are decorative; factors with
//      meaningful shift are doing real work.
//
//   2. Tertile WR analysis on REAL confidence: closed VTS trades sorted by
//      their REAL confidence at entry, split into 3 equal-size buckets, win
//      rate per bucket. If high-tertile WR > low-tertile WR (with adequate n
//      and statistical separation), confidence is predictive of outcomes.
//      This is the canonical calibration check.
//
//   3. Per-factor predictive lift: spread = WR(top tertile) - WR(bottom
//      tertile). Compare REAL spread (with all factors) to ALT spread
//      (without this factor). Positive lift = factor adds predictive value.
//      Zero or negative lift = factor is decorative or actively misleading.
//
// Statistical thresholds (per Langston cc-inbox #856 calibration check):
//   - n >= 150 per bucket for tertile WR to be considered decision-grade
//   - WR spread >= 7pp for "predictive" signal
//   - p < 0.05 (Wilson confidence intervals on tertile WR comparisons)
//
// Below those thresholds, panel reports ACCUMULATING. Reaching them is the
// primary signal for whether B67.5 should ship.

export interface FactorCalibrationStats {
  factorName: string;
  nReplayed: number;
  // Confidence-shift distribution
  avgRealConfidence: number;
  avgAltConfidence: number;
  avgConfidenceShift: number;       // mean(real - alt). Sign = factor's net push direction.
  avgAbsConfidenceShift: number;    // mean(|real - alt|). Magnitude of factor's impact.
  maxAbsConfidenceShift: number;    // single-trade maximum shift in window.
  shiftIsZeroFraction: number;      // fraction of trades where real == alt (factor at clamp / no contribution)
  // Tertile WR analysis (REAL confidence-based)
  realTertileLow: TertileBucket;
  realTertileMid: TertileBucket;
  realTertileHigh: TertileBucket;
  realSpreadPP: number;             // (high.winRatePct - low.winRatePct), in percentage points
  // Tertile WR analysis (ALT confidence-based, factor disabled scenario)
  altTertileLow: TertileBucket;
  altTertileMid: TertileBucket;
  altTertileHigh: TertileBucket;
  altSpreadPP: number;
  // Per-factor predictive lift
  predictiveLiftPP: number;         // realSpreadPP - altSpreadPP. Positive = factor adds predictive value.
  // Decision-grade gate
  isDecisionGrade: boolean;         // n >= MIN_N_PER_BUCKET in all 3 buckets
  readinessNote: string;
}

export interface TertileBucket {
  n: number;
  avgConfidence: number;
  avgPnlUsd: number;
  winRatePct: number;
}

export interface FactorCalibrationResponse {
  window: DashboardWindow;
  windowStart: string;
  windowEnd: string;
  factors: FactorCalibrationStats[];
  minNPerBucket: number;            // threshold for isDecisionGrade gate
  totalReplayed: number;
}

const MIN_N_PER_BUCKET = 150;       // Langston calibration check threshold (cc-inbox #856)

// ═══════════════════════════════════════════════════════════════════════════
// B74 — Passive Archive Capture Monitor (added 2026-04-30 per Kyle directive)
// ═══════════════════════════════════════════════════════════════════════════
//
// Per-universe stats for the passive archive pipeline:
//   1. Configured: how many symbols are in the universe config (static for
//      equity, dynamic for crypto)
//   2. Active in window: count(DISTINCT symbol) with at least 1 row in the
//      rolling window (24h default)
//   3. OHLC rows + ticker rows in window: count of rows persisted in the
//      window. This is the "confirmed stored" metric.
//   4. Cumulative scanned (v2): in-process counters that increment on every
//      WS message received; "data observed" before DB write. Reset on PM2
//      restart. Difference between scanned and stored = drops, batches that
//      hit insert errors, rows lost during partition-routing failures, etc.
//
// Read-only DB queries + per-archiver stats getters; no admission impact.

// B70.2 (2026-05-05) — pretty bytes formatter, shared by passive + data archive panels
function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 bytes';
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

export interface PassiveArchiveUniverseStats {
  universe: 'equity_spot' | 'equity_perp' | 'crypto_spot';
  // Universe sizing
  configuredSymbols: number;          // from archiver in-memory config
  activeSymbolsInWindow: number;      // count(DISTINCT symbol) in window
  // Stored (DB)
  ohlcRowsInWindow: number;
  tickerRowsInWindow: number;
  // Scanned (in-process counters; reset on PM2 restart)
  cumulativeOhlcScanned: number;
  cumulativeTickerScanned: number;
  // Connection state
  wsConnected: boolean;
  // Drift indicator: scanned-but-not-stored fraction
  ohlcStoreFraction: number | null;   // stored / scanned, null when scanned=0
  tickerStoreFraction: number | null;
  // Health note
  status: 'OK' | 'NO_OHLC_DATA' | 'NO_TICKER_DATA' | 'DISCONNECTED' | 'STARTING';
  // B70.2 — disk usage per universe (sum of OHLC + ticker partition sizes)
  diskBytes: number;
  diskPretty: string;
}

export interface PassiveArchiveResponse {
  window: DashboardWindow;
  windowStart: string;
  windowEnd: string;
  universes: PassiveArchiveUniverseStats[];
  pidStartedAt: string;               // when current PM2 process began (counter reset reference)
  totalDiskBytes: number;
  totalDiskPretty: string;
}

/**
 * B70 — Data Archive status aggregator (parallel to passive-archive-status)
 *
 * Returns per-table row counts within the requested window + in-process
 * batch-writer stats (buffer depth, overflow drops, total flushed, last
 * error). Powers the Drift Dashboard `DataArchiveSection` panel.
 */
export interface DataArchiveStatusResponse {
  window: DashboardWindow;
  windowStart: string;
  windowEnd: string;
  tables: Array<{
    name: string;
    rowsInWindow: number;
    totalRows: number;
    diskBytes: number;
    diskPretty: string;
    lastWriteAt: string | null;
    timedOut: boolean;
  }>;
  totalDiskBytes: number;
  totalDiskPretty: string;
  batchWriter: Record<
    string,
    {
      bufferDepth: number;
      overflowDrops: number;
      totalFlushed: number;
      lastFlushAt: number | null;
      lastError: string | null;
    }
  >;
  config: {
    pairScanEnabled: boolean;
    signalEvalEnabled: boolean;
    signalEvalPreFilterEnabled: boolean;
    exitDecisionEnabled: boolean;
    macroFeedEnabled: boolean;
    parquetExportEnabled: boolean;
    retentionDays: number;
    archiveWriterQueueMax: number;
  };
  currentMode: 'vts' | 'paper_sim' | 'live';
}

export async function computeDataArchiveStatus(
  window: DashboardWindow,
): Promise<DataArchiveStatusResponse> {
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');
  const { getArchiveStats } = await import('./data-archive/archive-batch-writer.js');
  const { getArchiveConfig } = await import('./data-archive/archive-config.js');
  const { getCurrentMode } = await import('./run-mode-controller.js');

  const now = Date.now();
  const windowMs = WINDOW_TO_MS[window];
  const windowStart = new Date(now - windowMs);
  const windowEnd = new Date(now);

  const TABLES = [
    'pair_scan_archive',
    'signal_eval_archive',
    'exit_decision_archive',
    'macro_feed_archive',
  ];

  const tables: DataArchiveStatusResponse['tables'] = [];
  let totalDiskBytes = 0;
  for (const t of TABLES) {
    let rowsInWindow = 0;
    let totalRows = 0;
    let diskBytes = 0;
    let diskPretty = '0 bytes';
    let lastWriteAt: string | null = null;
    let timedOut = false;
    try {
      // Counts + last-write timestamp + total-relation-size (includes all
      // monthly partitions). Partitioned-parent size walks every partition
      // via pg_partition_tree, summing pg_total_relation_size on each child.
      const stmt = `SELECT
          (SELECT count(*)::int FROM ${t} WHERE captured_at >= '${windowStart.toISOString()}') AS rows_in_window,
          (SELECT count(*)::int FROM ${t}) AS total_rows,
          (SELECT max(captured_at) FROM ${t}) AS last_write_at,
          COALESCE((
            SELECT sum(pg_total_relation_size(p.relid))::bigint
            FROM pg_partition_tree('${t}'::regclass) p
          ), pg_total_relation_size('${t}'::regclass)) AS disk_bytes`;
      const r = await db.execute(sql.raw(stmt));
      const rows = (Array.isArray(r) ? r : (r as any).rows ?? []) as Array<{
        rows_in_window: number | string | null;
        total_rows: number | string | null;
        last_write_at: string | Date | null;
        disk_bytes: number | string | null;
      }>;
      const row = rows[0];
      if (row) {
        rowsInWindow = row.rows_in_window != null ? Number(row.rows_in_window) : 0;
        totalRows = row.total_rows != null ? Number(row.total_rows) : 0;
        diskBytes = row.disk_bytes != null ? Number(row.disk_bytes) : 0;
        diskPretty = formatBytes(diskBytes);
        totalDiskBytes += diskBytes;
        lastWriteAt =
          row.last_write_at instanceof Date
            ? row.last_write_at.toISOString()
            : (row.last_write_at as string | null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[B70][archive-status] query failed for ${t}:`, msg);
    }
    tables.push({ name: t, rowsInWindow, totalRows, diskBytes, diskPretty, lastWriteAt, timedOut });
  }

  const cfg = getArchiveConfig();
  return {
    window,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    tables,
    totalDiskBytes,
    totalDiskPretty: formatBytes(totalDiskBytes),
    batchWriter: getArchiveStats(),
    config: {
      pairScanEnabled: cfg.pairScanEnabled,
      signalEvalEnabled: cfg.signalEvalEnabled,
      signalEvalPreFilterEnabled: cfg.signalEvalPreFilterEnabled,
      exitDecisionEnabled: cfg.exitDecisionEnabled,
      macroFeedEnabled: cfg.macroFeedEnabled,
      parquetExportEnabled: cfg.parquetExportEnabled,
      retentionDays: cfg.retentionDays,
      archiveWriterQueueMax: cfg.archiveWriterQueueMax,
    },
    currentMode: getCurrentMode(),
  };
}

export async function computePassiveArchiveStatus(
  window: DashboardWindow,
): Promise<PassiveArchiveResponse> {
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');
  const { getEquitySpotStats } = await import('./passive-archive/equity-spot-archiver.js');
  const { getEquityPerpStats } = await import('./passive-archive/equity-perp-archiver.js');
  const { getCryptoSpotStats } = await import('./passive-archive/crypto-spot-archiver.js');

  const now = Date.now();
  const windowMs = WINDOW_TO_MS[window];
  const windowStart = new Date(now - windowMs);
  const windowEnd = new Date(now);

  // Per-universe DB queries via raw SQL (3 OHLC + 3 ticker tables share
  // identical column shape; query each pair).
  const universeConfigs = [
    { name: 'xstock_spot' as const, ohlcTable: 'xstock_spot_ohlc_1m', tickerTable: 'xstock_spot_ticker_snap', stats: getEquitySpotStats() },
    { name: 'xstock_perp' as const, ohlcTable: 'xstock_perp_ohlc_1m', tickerTable: 'xstock_perp_ticker_snap', stats: getEquityPerpStats() },
    { name: 'crypto_spot' as const, ohlcTable: 'crypto_spot_ohlc_1m', tickerTable: 'crypto_spot_ticker_snap', stats: getCryptoSpotStats() },
  ];

  // 2026-05-01: count + COUNT(DISTINCT) on ~400k-row partitioned crypto_spot_*
  // tables takes 50s+ each on Supabase remote (verified via psql timing). Six
  // queries × 50s = endpoint times out. Wrap each query in a per-statement
  // timeout (4s) with a graceful fallback that flags the row "unknown" and
  // surfaces in-process counters instead. UI then renders cumulative counts +
  // a `db_query_timeout: true` flag rather than spinning forever.
  const PASSIVE_QUERY_TIMEOUT_MS = 4000;
  async function safeCount(
    sqlText: string,
  ): Promise<{ rowCount: number; symCount: number; timedOut: boolean }> {
    try {
      // Wrap in explicit transaction so SET LOCAL scopes to this query only
      // and is reset on COMMIT (won't leak to other queries on the same
      // pooled connection).
      const wrapped = `BEGIN; SET LOCAL statement_timeout = ${PASSIVE_QUERY_TIMEOUT_MS}; ${sqlText}; COMMIT;`;
      const rows = await db.execute(sql.raw(wrapped));
      const result = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as Array<{ row_count: number; sym_count: number }>;
      return {
        rowCount: result[0]?.row_count ?? 0,
        symCount: result[0]?.sym_count ?? 0,
        timedOut: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('statement timeout') || msg.includes('canceling statement')) {
        return { rowCount: 0, symCount: 0, timedOut: true };
      }
      // Real error — log + fail gracefully; aggregator should still return.
      console.warn(`[PassiveArchive] Aggregator count query failed: ${msg}`);
      return { rowCount: 0, symCount: 0, timedOut: true };
    }
  }

  // B70.2 — disk-size lookup helper. Sums all monthly partitions for a parent.
  async function diskBytesForParent(parent: string): Promise<number> {
    try {
      const r = await db.execute(
        sql.raw(`SELECT COALESCE((
          SELECT sum(pg_total_relation_size(p.relid))::bigint
          FROM pg_partition_tree('${parent}'::regclass) p
        ), pg_total_relation_size('${parent}'::regclass)) AS bytes`),
      );
      const rows = (Array.isArray(r) ? r : (r as any).rows ?? []) as Array<{ bytes: number | string | null }>;
      return rows[0]?.bytes != null ? Number(rows[0].bytes) : 0;
    } catch {
      return 0;
    }
  }

  const universes: PassiveArchiveUniverseStats[] = [];
  let passiveTotalDiskBytes = 0;
  for (const cfg of universeConfigs) {
    const ohlc = await safeCount(
      `SELECT count(*)::int AS row_count, count(DISTINCT symbol)::int AS sym_count
       FROM ${cfg.ohlcTable}
       WHERE interval_begin >= '${windowStart.toISOString()}'`,
    );
    const ohlcCount = ohlc.rowCount;
    const ohlcSyms = ohlc.symCount;

    const ticker = await safeCount(
      `SELECT count(*)::int AS row_count, count(DISTINCT symbol)::int AS sym_count
       FROM ${cfg.tickerTable}
       WHERE captured_at >= '${windowStart.toISOString()}'`,
    );
    const tickerCount = ticker.rowCount;
    const tickerSyms = ticker.symCount;

    // Active = max of OHLC + ticker symbol counts
    const activeSymbols = Math.max(ohlcSyms, tickerSyms);

    // Store fractions (DB rows / in-process scanned)
    const ohlcStoreFraction = cfg.stats.cumulativeOhlcRows > 0
      ? Math.min(1, ohlcCount / cfg.stats.cumulativeOhlcRows)
      : null;
    const tickerStoreFraction = cfg.stats.cumulativeTickerSnaps > 0
      ? Math.min(1, tickerCount / cfg.stats.cumulativeTickerSnaps)
      : null;

    // Status determination
    let status: PassiveArchiveUniverseStats['status'] = 'OK';
    if (!cfg.stats.connected) {
      status = cfg.stats.configuredSymbols === 0 ? 'STARTING' : 'DISCONNECTED';
    } else if (ohlcCount === 0 && cfg.stats.cumulativeOhlcRows === 0) {
      status = 'NO_OHLC_DATA';
    } else if (tickerCount === 0 && cfg.stats.cumulativeTickerSnaps === 0) {
      status = 'NO_TICKER_DATA';
    }

    // B70.2 — disk usage = sum of OHLC + ticker partition sizes for this universe
    const [ohlcBytes, tickerBytes] = await Promise.all([
      diskBytesForParent(cfg.ohlcTable),
      diskBytesForParent(cfg.tickerTable),
    ]);
    const universeBytes = ohlcBytes + tickerBytes;
    passiveTotalDiskBytes += universeBytes;

    universes.push({
      universe: cfg.name,
      configuredSymbols: cfg.stats.configuredSymbols,
      activeSymbolsInWindow: activeSymbols,
      ohlcRowsInWindow: ohlcCount,
      tickerRowsInWindow: tickerCount,
      cumulativeOhlcScanned: cfg.stats.cumulativeOhlcRows,
      cumulativeTickerScanned: cfg.stats.cumulativeTickerSnaps,
      wsConnected: cfg.stats.connected,
      ohlcStoreFraction,
      tickerStoreFraction,
      status,
      diskBytes: universeBytes,
      diskPretty: formatBytes(universeBytes),
    });
  }

  // PM2 process start reference (counters reset on restart)
  const pidStartedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();

  return {
    window,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    universes,
    pidStartedAt,
    totalDiskBytes: passiveTotalDiskBytes,
    totalDiskPretty: formatBytes(passiveTotalDiskBytes),
  };
}

interface RawCalibrationRow {
  factorName: string;
  realConfidence: number;
  altConfidence: number;
  pnlUsd: number;
  outcome: string;
}

function bucketWinRate(rows: RawCalibrationRow[]): TertileBucket {
  if (rows.length === 0) {
    return { n: 0, avgConfidence: 0, avgPnlUsd: 0, winRatePct: 0 };
  }
  const wins = rows.filter(r => r.outcome === 'admitted_won').length;
  return {
    n: rows.length,
    avgConfidence: rows.reduce((s, r) => s + r.realConfidence, 0) / rows.length,
    avgPnlUsd: rows.reduce((s, r) => s + r.pnlUsd, 0) / rows.length,
    winRatePct: (wins / rows.length) * 100,
  };
}

/**
 * Split rows into 3 equal-size tertiles by `confidenceField`. With small N the
 * boundaries can land such that buckets have unequal counts; we use percentile
 * cutoffs (33.3%, 66.7%) on the sorted values.
 */
function splitTertiles(
  rows: RawCalibrationRow[],
  confidenceField: 'realConfidence' | 'altConfidence',
): { low: RawCalibrationRow[]; mid: RawCalibrationRow[]; high: RawCalibrationRow[] } {
  if (rows.length === 0) return { low: [], mid: [], high: [] };
  const sorted = [...rows].sort((a, b) => a[confidenceField] - b[confidenceField]);
  const n = sorted.length;
  const lowEnd = Math.floor(n / 3);
  const midEnd = Math.floor((2 * n) / 3);
  return {
    low: sorted.slice(0, lowEnd),
    mid: sorted.slice(lowEnd, midEnd),
    high: sorted.slice(midEnd),
  };
}

export async function computeFactorCalibration(
  window: DashboardWindow,
): Promise<FactorCalibrationResponse> {
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');

  const now = Date.now();
  const windowMs = WINDOW_TO_MS[window];
  const windowStart = new Date(now - windowMs);
  const windowEnd = new Date(now);

  const rows = await db.execute(sql`
    SELECT
      factor_name AS "factorName",
      (real_decision->>'confidence')::float AS "realConfidence",
      (alternate_decision->>'confidence')::float AS "altConfidence",
      COALESCE((replay_outcome->>'pnl_usd')::float, 0) AS "pnlUsd",
      COALESCE(replay_outcome->>'outcome', '') AS "outcome"
    FROM regime_factor_alternates
    WHERE evaluated_at >= ${windowStart}
      AND replay_completed_at IS NOT NULL
      AND asset_class = 'crypto_spot'
      -- B76 (2026-05-06): legacy frozen-factor filter REMOVED. Per Langston
      -- review revision: for b67_1 per-input rows and b67_2 phase rows
      -- (legacy b67_2_phase_dimension and current b67_2_phase_preference) we
      -- instead version-filter to chain-final rows so pre-B76 structurally-
      -- biased rows do not contaminate post-B76 lift measurements. Other 7
      -- factors do not need the filter — predictive-lift cancels first-order bias.
      AND (
        factor_name NOT IN (
          'b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
          'b67_1_macro_modifier', 'b67_2_phase_preference', 'b67_2_phase_dimension'
        )
        OR real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
      )
      AND real_decision->>'confidence' IS NOT NULL
      AND alternate_decision->>'confidence' IS NOT NULL
    ORDER BY factor_name, evaluated_at
  `);

  const dataRows = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as RawCalibrationRow[];

  // Group by factor.
  const byFactor = new Map<string, RawCalibrationRow[]>();
  for (const r of dataRows) {
    if (!byFactor.has(r.factorName)) byFactor.set(r.factorName, []);
    byFactor.get(r.factorName)!.push(r);
  }

  const factors: FactorCalibrationStats[] = [];
  for (const [factorName, factorRows] of byFactor.entries()) {
    const n = factorRows.length;
    const shifts = factorRows.map(r => r.realConfidence - r.altConfidence);
    const absShifts = shifts.map(s => Math.abs(s));
    const realTertiles = splitTertiles(factorRows, 'realConfidence');
    const altTertiles = splitTertiles(factorRows, 'altConfidence');
    const realLow = bucketWinRate(realTertiles.low);
    const realMid = bucketWinRate(realTertiles.mid);
    const realHigh = bucketWinRate(realTertiles.high);
    const altLow = bucketWinRate(altTertiles.low);
    const altMid = bucketWinRate(altTertiles.mid);
    const altHigh = bucketWinRate(altTertiles.high);

    const realSpreadPP = realHigh.winRatePct - realLow.winRatePct;
    const altSpreadPP = altHigh.winRatePct - altLow.winRatePct;
    const minBucketN = Math.min(realLow.n, realMid.n, realHigh.n);
    const isDecisionGrade = minBucketN >= MIN_N_PER_BUCKET;
    const readinessNote = isDecisionGrade
      ? `Decision-grade (min bucket n=${minBucketN} ≥ ${MIN_N_PER_BUCKET})`
      : `Accumulating (min bucket n=${minBucketN}; need ${MIN_N_PER_BUCKET})`;

    factors.push({
      factorName,
      nReplayed: n,
      avgRealConfidence: factorRows.reduce((s, r) => s + r.realConfidence, 0) / n,
      avgAltConfidence: factorRows.reduce((s, r) => s + r.altConfidence, 0) / n,
      avgConfidenceShift: shifts.reduce((s, x) => s + x, 0) / n,
      avgAbsConfidenceShift: absShifts.reduce((s, x) => s + x, 0) / n,
      maxAbsConfidenceShift: Math.max(...absShifts),
      shiftIsZeroFraction: absShifts.filter(s => s < 1e-9).length / n,
      realTertileLow: realLow,
      realTertileMid: realMid,
      realTertileHigh: realHigh,
      realSpreadPP,
      altTertileLow: altLow,
      altTertileMid: altMid,
      altTertileHigh: altHigh,
      altSpreadPP,
      predictiveLiftPP: realSpreadPP - altSpreadPP,
      isDecisionGrade,
      readinessNote,
    });
  }

  factors.sort((a, b) => a.factorName.localeCompare(b.factorName));

  return {
    window,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    factors,
    minNPerBucket: MIN_N_PER_BUCKET,
    totalReplayed: dataRows.length,
  };
}

// Window-to-ms helper for ablation aggregator. Mirrors the constants in the
// drift-dashboard aggregator above. cohort_latest is treated as 24h here
// because ablation rows don't carry a "since-restart" marker; cohort_latest
// granularity adds little value over rolling_24h for this panel and can be
// added later if needed.
const WINDOW_TO_MS: Record<DashboardWindow, number> = {
  rolling_24h: 24 * 60 * 60 * 1000,
  rolling_7d: 7 * 24 * 60 * 60 * 1000,
  rolling_30d: 30 * 24 * 60 * 60 * 1000,
  cohort_latest: 24 * 60 * 60 * 1000,
};
