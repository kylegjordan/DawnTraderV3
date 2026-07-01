import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssetClassBadge } from "@/components/ui/asset-class-badge";
import { getAssetName, setXstockNameOverlay, setCryptoNameOverlay } from "@shared/asset-names";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, Download, TrendingUp, TrendingDown, Clock, Target, AlertTriangle, Sliders, Activity, ArrowUpDown, ArrowUp, ArrowDown, Filter, LineChart } from "lucide-react";
// B79.0i.a: dedicated xStocks observation tab
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { apiFetch } from "@/lib/api";
import { ensureValidToken } from "@/lib/auth";
import { format } from "date-fns";
import { getFrictionLabel } from "@/utils/frictionColor";
import { formatEntryFeeMode } from "@/lib/utils";

interface OpenTrade {
  symbol: string;
  // B69.1 (2026-05-04): asset class column on Open Simulated Trades.
  assetClass?: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  sourcePool?: string;    // Batch 19F Phase 2: Filter path origin (quant/pattern)
  dollarValue: number;    // Directive 11.6H: Fixed USD exposure
  quantity: number;       // Directive 11.6H: Variable coin units
  entryPrice: number;
  exitPrice: null;
  target: number;
  stopLoss: number;
  currentPrice: number | null;
  distanceToTarget: string;
  distanceToStop: string;
  grossProfitValue: number;
  grossProfitPercent: string;
  costs: number;
  netProfitValue: number;
  netProfitPercent: string;
  rankingScore?: number; // Batch 47f15: Cross-family desirability score
  finalScore: number;
  hybridScore: number;
  expectedEdge: number;
  regimeWeight: number;
  entryTime: string;
  durationOpenMinutes: number;
  globalRegime: string | null;
  pairFriction: number | null;
  globalFriction: number | null;
  pairDirectionalBias: string | null;
  globalDirectionalBias: string | null;
  // B61 (2026-04-15): numeric DBS scores alongside categories
  pairDirectionalBiasScore: number | null;
  globalDirectionalBiasScore: number | null;
  // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation
  pairIdHash?: number | null;
  // B67.2.1 (2026-04-29): regime classifier confidence + macro modifier + phase
  // captured at trade-open. NULL on trades opened pre-B67.2.1.
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: 'EARLY' | 'PRIME' | 'LATE' | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  // B.2.UI (2026-06-02): entry-liquidity captured at trade-open for the
  // "Volume / Order Book" column. xStock = ask-side order-book depth USD
  // (kind 'depth_usd'); crypto = native 24h coin-unit volume (kind 'volume_qty').
  // null/undefined on trades opened before B.2.UI (no backfill → renders "—").
  entryLiquidityValue?: number | null;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty' | null;
  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the VTS trade opened on.
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
}

interface ClosedTrade {
  symbol: string;
  // B69.1 (2026-05-04): asset class column on Closed Simulated Trades.
  assetClass?: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  sourcePool?: string;    // Batch 19F Phase 2: Filter path origin (quant/pattern)
  dollarValue: number;    // Directive 11.6H: Fixed USD exposure
  quantity: number;       // Directive 11.6H: Variable coin units
  entryPrice: number;
  exitPrice: number;
  target: number;
  stopLoss: number;
  resultType: string;
  grossProfitValue: number;
  grossProfitPercent: string;
  costs: number;
  netProfitValue: number;
  netProfitPercent: string;
  rankingScore?: number; // Batch 47f15: Cross-family desirability score
  finalScore: number;
  hybridScore: number;
  expectedEdge: number;
  regimeWeight: number;
  entryTime: string;
  exitTime: string;
  durationMinutes: number;
  globalRegime: string | null;
  pairFriction: number | null;
  globalFriction: number | null;
  pairDirectionalBias: string | null;
  globalDirectionalBias: string | null;
  // B61 (2026-04-15): numeric DBS scores alongside categories
  pairDirectionalBiasScore: number | null;
  globalDirectionalBiasScore: number | null;
  // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation
  pairIdHash?: number | null;
  // B67.2.1 (2026-04-29): regime classifier confidence + macro modifier + phase
  // captured at trade-open. NULL on trades opened pre-B67.2.1.
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: 'EARLY' | 'PRIME' | 'LATE' | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  // B.2.UI (2026-06-02): entry-liquidity captured at trade-open for the
  // "Volume / Order Book" column. xStock = ask-side order-book depth USD
  // (kind 'depth_usd'); crypto = native 24h coin-unit volume (kind 'volume_qty').
  // null/undefined on trades opened before B.2.UI (no backfill → renders "—").
  entryLiquidityValue?: number | null;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty' | null;
  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the VTS trade opened on.
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
}

type AdjustmentType =
  | "lifecycle"
  | "model_calibration"
  | "weight_adjustment"
  | "risk_adjustment"
  | "filter_adjustment";

type Reversibility = "automatic" | "manual" | "irreversible";

// Batch 19H: Filter Pipeline Diagnostics types
interface ScanDiagnostics {
  timestamp: string;
  mode: string;
  totalPairsScanned: number;
  allSymbolsScanned: string[];
  quant: {
    global: Record<string, number>;
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number; benchmarkBypassed: number };
    survivors: number;
  };
  pattern: {
    global: Record<string, number> | null;
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number; benchmarkBypassed: number } | null;
    survivors: number;
  };
  destination: string;
  destinationCount: number;
}

interface FilterDiagnosticsData {
  ok: boolean;
  lastScan: (ScanDiagnostics & { b63Dbs?: B63DbsSnapshot; familyPaths?: Record<string, any> }) | null;
  rolling24h: {
    totalScans: number;
    totalPairsScanned: number;
    uniquePairsScanned: number;
    b63Dbs?: B63DbsAggregate;
    aggregated: {
      quant: ScanDiagnostics['quant'];
      pattern: ScanDiagnostics['pattern'];
      familyPaths?: Record<string, { imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number }; survivors: number }>;
    };
  };
  // B-DIAG-387 (#387): now optional. The crypto endpoint still emits a populated
  // signalRejections (from getSkippedSignalsSummary); the xStock endpoint dropped
  // it (it was always-empty dead scaffolding — see DELETED_COMPONENTS_LOG). No
  // component reads this field for either tab; kept optional only for the crypto
  // payload shape.
  signalRejections?: {
    total: number;
    byReason: Record<string, number>;
    byRegime: Record<string, number>;
  };
  vtsEvaluation?: any;
  lastCycleVtsEval?: any;
  // reorg-B2.2 OBJ-B: per-class reward-vs-risk / reachability guard-drop stats, keyed by strategy and
  // scoped to THIS tab's asset class (crypto tab → crypto_spot, xStock tab → xstock_spot). Absent/empty =
  // no guard evaluations recorded for this class yet (rendered as a distinct "no evaluations" state).
  guardDrops?: Record<string, GuardDropRecord>;
  trackerStartedAt?: string | null;
}

// reorg-B2.2 OBJ-B: one strategy's shared-guard suppression for a single asset class. Raw counters + the
// two derived ratios (computed server-side from raw — never re-derived in the UI).
interface GuardDropRecord {
  evals: number;        // total guard evaluations (the suppression denominator)
  passes: number;
  atrDrops: number;     // dropped by invalid ATR
  stopDrops: number;    // dropped by stop-distance
  rrDrops: number;      // dropped by RR < per-class minRR (the #372 suppression signal)
  reachDrops: number;   // dropped by reachability > per-class reachAtrMax
  rrEvals: number;      // evals that reached the RR check (meanRR denominator)
  rrSum: number;
  rrMin: number;
  rrMax: number;
  meanRR: number;
  rrSuppressionRate: number; // rrDrops / total evals
}

interface B63DbsSnapshot {
  // B63.4: Pre-global stage (the TRUE high-DBS count before any filter)
  preGlobalDbsComputed?: number;
  preGlobalStrongDbs?: number;
  preGlobalStrongDbsSymbols?: string[];
  // Post-global stage
  totalClassified: number;
  strongDbsPairs: number;
  strongDbsPct: number;
  strongTrendPoolPassed: number;
  strongTrendPoolPct: number;
  strongDbsSymbols: string[];
}

interface B63DbsAggregate {
  totalClassified: number;
  strongDbsPairs: number;
  strongDbsPct: number;
  strongTrendPoolPassed: number;
  strongTrendPoolPct: number;
  uniqueStrongDbsSymbols: string[];
}

interface PredictiveAdjustment {
  _schema: string;
  timestamp: string;
  category: string;
  adjustmentType?: AdjustmentType;
  parameter: string;
  oldValue: number;
  newValue: number;
  delta: number;
  impact: number | null;
  regime?: string;
  strategy?: string;
  reason: string;
  affectedSubsystem?: string;
  expectedEffect?: string;
  reversibility?: Reversibility;
}

interface AdjustmentSummary {
  totalAdjustments: number;
  byCategory: Record<string, number>;
  byRegime: Record<string, number>;
  avgImpact: number;
  highImpactCount: number;
  lastAdjustment: string | null;
}

interface CurrentValues {
  dynamicROI: number | null;
  confidence: number | null;
  weights: Record<string, number>;
  lastUpdated: string | null;
}

interface RegimeArchiveRecord {
  _schema: string;
  timestamp: string;
  source: string;
  windowDays: number;
  regime: string;
  strategy: string;
  metrics: {
    winRate: number;
    avgPnL: number;
    skipRatio: number;
    confidence: number;
    dynamicROI: number;
    momentumWeight: number;
    volatilityWeight: number;
    trendWeight: number;
  };
  checksum: string;
  _metadata: {
    telemetryVersion: number;
    canonicalVersion: number;
    recordCount: number;
    avgConfidence: number;
  };
}

interface ArchiveSummary {
  totalEntries: number;
  avgConfidence: number;
  avgPnL: number;
  regimeCount: number;
  strategyCount: number;
  oldestArchive: string | null;
  newestArchive: string | null;
}

interface ManifestEntry {
  filename: string;
  entries: number;
  checksum: string;
  createdAt: string;
  version: number;
  compressed: boolean;
  compressedAt?: string;
}

interface TriggerContext {
  learningSystem: string;
  evaluationWindow: string;
  sampleSize: number;
  evaluationPeriod?: string;
}

interface PerformanceRationale {
  triggerMetric: string;
  metricValue: number | string;
  direction: 'improved' | 'degraded' | 'stable' | 'unknown';
  regimesInvolved: string[];
  additionalMetrics?: Record<string, number | string>;
}

interface AdjustmentExplanation {
  triggerContext: TriggerContext;
  performanceRationale: PerformanceRationale;
  intentSummary: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  isLifecycleEvent: boolean;
}

interface ExplainedAdjustment extends PredictiveAdjustment {
  explanation?: AdjustmentExplanation;
}

interface ParameterTouchHistory {
  parameter: string;
  lastAdjusted: string;
  adjustmentCount24h: number;
  adjustmentCount7d: number;
  consecutiveAdjustments: number;
  totalDelta24h: number;
  direction: 'increasing' | 'decreasing' | 'oscillating' | 'stable';
  withinCooldown: boolean;
  cooldownRemainingMs?: number;
}

interface BurstyPeriod {
  startTime: string;
  endTime: string;
  adjustmentCount: number;
  parameters: string[];
}

interface StabilityMetrics {
  adjustmentsPerHour: number;
  adjustmentsPerDay: number;
  burstyPeriods: BurstyPeriod[];
  parameterTouchHistory: ParameterTouchHistory[];
  stabilityScore: number;
}

interface SafetySignal {
  type: 'rapid_adjustment' | 'regime_instability' | 'poor_performance' | 'oscillation';
  severity: 'info' | 'warning' | 'alert';
  parameter: string;
  description: string;
  timestamp: string;
  isAdvisoryOnly: true;
}

const getRegimeBadgeColor = (regime: string) => {
  if (regime.includes('TREND_FRIENDLY_STABLE') || regime.includes('BULL_STABLE')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (regime.includes('IMPULSE_EXPANSION') || regime.includes('HIGH_VOL_IMPULSE') || regime.includes('BULL_VOLATILE')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (regime.includes('HIGH_VOLATILITY_UNSTABLE') || regime.includes('BEAR_VOLATILE') || regime.includes('BEAR_STABLE')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  if (regime.includes('RANGE_BOUND_STABLE') || regime.includes('LOW_VOL_CHOP')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  if (regime === 'EXTREME_NOISE') return 'bg-red-600/30 text-red-300 border-red-600/50';
  if (regime.includes('STRUCTURAL_TRANSITION') || regime.includes('TRANSITION')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

const normalizeRegimeDisplay = (regime: string): string => {
  const displayMap: Record<string, string> = {
    // Old canonical → new canonical
    BULL_STABLE: 'TREND_FRIENDLY_STABLE',
    BEAR_VOLATILE: 'HIGH_VOLATILITY_UNSTABLE',
    LOW_VOL_CHOP: 'RANGE_BOUND_STABLE',
    HIGH_VOL_IMPULSE: 'IMPULSE_EXPANSION',
    TRANSITION: 'STRUCTURAL_TRANSITION',
    // Ghost regimes → new canonical
    BULL_VOLATILE: 'IMPULSE_EXPANSION',
    BEAR_STABLE: 'HIGH_VOLATILITY_UNSTABLE',
    EXTREME_NOISE: 'RANGE_BOUND_STABLE',
    HIGH_VOL_CHOP: 'IMPULSE_EXPANSION',
    MIXED_TRANSITION: 'STRUCTURAL_TRANSITION',
  };
  return displayMap[regime] ?? regime;
};

const getPoolBadgeColor = (pool: string) => {
  if (pool === 'IDEAL') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (pool === 'ROTATIONAL') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

// Batch 19F Phase 2: Source pool badge colors
const getSourcePoolBadgeColor = (sourcePool: string) => {
  if (sourcePool?.startsWith('QUANT-') || sourcePool?.startsWith('quant-')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  const sp = sourcePool?.toUpperCase() ?? 'QUANT';
  if (sp === 'QUANT') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (sp === 'PATTERN') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (sp === 'HYBRID') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

const getResultBadgeColor = (result: string) => {
  // B65.2-HF3 (2026-04-24): distinct colors for B65.2 exit outcomes:
  // TRAIL STOP (emerald) = genuine moonbag trailing close, real upside past target
  // MOONBAG CAP (amber) = moonbag held past 4h duration cap
  // BE PROTECT (slate blue) = break-even lock ratcheted stop was hit, near-breakeven exit
  // TAKE PROFIT (green) = static target hit, no trailing
  // STOP LOSS (red) = original stop hit, real loss
  if (result === 'TRAILING_STOP_HIT') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (result === 'MOONBAG_TIMEOUT') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (result === 'BREAK_EVEN_STOP') return 'bg-slate-500/20 text-slate-300 border-slate-400/40';
  if (result.includes('TARGET') || result.includes('PROFIT')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (result.includes('STOP')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

// B65.2: human-friendly label for the expanded result set.
const getResultLabel = (result: string): string => {
  if (result === 'TRAILING_STOP_HIT') return 'TRAIL STOP';
  if (result === 'MOONBAG_TIMEOUT') return 'MOONBAG CAP';
  if (result === 'BREAK_EVEN_STOP') return 'BE PROTECT';
  if (result === 'TAKE_PROFIT' || result === 'TARGET_HIT') return 'TAKE PROFIT';
  if (result === 'STOP_LOSS' || result === 'STOP_HIT') return 'STOP LOSS';
  return result;
};

const getProfitColor = (value: number) => {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

// B.2.UI (2026-06-02): format the asset-aware entry-liquidity cell.
//   xStock (kind 'depth_usd')  → "$6,309 · OB"  (ask-side order-book depth USD)
//   crypto (kind 'volume_qty') → "1,234.56 QTY" (native 24h coin-unit volume, no $)
// Returns "—" when the value wasn't captured (trade opened before B.2.UI, or kind/value missing).
function formatEntryLiquidity(value?: number | null, kind?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (kind === 'depth_usd') return `$${Math.round(value).toLocaleString()} · OB`;
  if (kind === 'volume_qty') return `${Math.round(value).toLocaleString()} QTY`;
  return '—';
}

// Client-side benchmark detection matching server-side benchmark-regex.ts
const BENCHMARK_BASE_COINS = ['BTC', 'XBT', 'ETH', 'SOL', 'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'];
function isBenchmarkSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const upper = symbol.toUpperCase().trim();
  const base = upper.split(/[-_/]/)[0];
  return BENCHMARK_BASE_COINS.includes(base);
}

type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
type SortDirection = 'asc' | 'desc';

function SortableHeader({
  label,
  field,
  currentSort,
  direction,
  onSort,
  align = 'left',
  extraClass = ''
}: {
  label: string;
  field: string;
  currentSort: string | null;
  direction: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
  extraClass?: string;
}) {
  const isActive = currentSort === field;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      className={`px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${extraClass}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </th>
  );
}

function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [sortField, setSortField] = useState<OpenSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as OpenSortField);
      setSortDirection('desc');
    }
  }, [sortField]);

  const sortedTrades = useMemo(() => {
    if (!sortField) return trades;
    return [...trades].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      switch (sortField) {
        case 'symbol': aVal = a.symbol; bVal = b.symbol; break;
        case 'regime': aVal = a.regime; bVal = b.regime; break;
        case 'strategy': aVal = a.strategy; bVal = b.strategy; break;
        case 'pool': aVal = a.pool; bVal = b.pool; break;
        case 'dollarValue': aVal = a.dollarValue ?? 0; bVal = b.dollarValue ?? 0; break;
        case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
        case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
        case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
        case 'entryTime': aVal = new Date(a.entryTime).getTime(); bVal = new Date(b.entryTime).getTime(); break;
        case 'durationOpenMinutes': aVal = a.durationOpenMinutes; bVal = b.durationOpenMinutes; break;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [trades, sortField, sortDirection]);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const handleTopScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  // HF7: Sync top scrollbar width to match actual table content width
  useEffect(() => {
    if (scrollRef.current && topScrollRef.current) {
      const spacer = topScrollRef.current.firstElementChild as HTMLElement;
      if (spacer) spacer.style.width = `${scrollRef.current.scrollWidth}px`;
    }
  });

  return (
    <div className="relative">
      <div 
        ref={topScrollRef}
        className="overflow-x-auto scrollbar-thin mb-1"
        onScroll={handleTopScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div style={{ width: '2300px', height: '1px' }} />
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin max-h-[calc(100vh-13rem)]"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* B-NEW-31 (2026-05-14): outer container now scrolls both axes with bounded
            max-height so the sticky thead + sticky first-column work correctly. Header
            stays pinned on vertical scroll; Symbol column stays pinned on horizontal
            scroll. Top-left corner uses z-30 so it sits above both axes. */}
        <table className="w-full min-w-[2400px] text-sm">
          <thead className="sticky top-0 bg-card z-20">
            <tr className="border-b border-border">
              {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
                  B-NEW-31 (2026-05-14): first-column header sticky-left + z-30 (top-left corner). */}
              <SortableHeader label="Symbol" field="symbol" currentSort={sortField} direction={sortDirection} onSort={handleSort} extraClass="sticky left-0 z-30 bg-card text-left" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">B/S</th>
              <SortableHeader label="Regime" field="regime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Strategy" field="strategy" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <SortableHeader label="Pool (I/R)" field="pool" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source Pool</th>
              {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="The maker/taker entry fee-mode this trade opened on (entry-side fee only). '—' for trades opened before this column existed.">Entry Fee Mode</th>
              {/* B65.2: TEC State column — trade mode + latch flags from trailing engine */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Trailing-exit engine state: TARGET = aiming at original target; TRAILING = moonbag (trailing for more upside after target hit). BE = break-even stop locked at 1×ATR gain.">TEC State</th>
              {/* B.2.UI (2026-06-02): entry-liquidity captured at trade-open.
                  xStock → ask-side order-book depth USD ("$… · OB");
                  crypto → native 24h coin-unit volume ("… QTY"). */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Liquidity at trade-open. xStock: ask-side order-book depth in USD ($… · OB). Crypto: native 24h volume in coin units (… QTY). '—' for trades opened before this column existed.">Volume / Order Book</th>
              <SortableHeader label="$ Value / Qty" field="dollarValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Entry/Current" field="entryPrice" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dist. T/S</th>
              <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
              <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />

              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rank</th>
              <SortableHeader label="Final/Hybrid" field="finalScore" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Edge" field="expectedEdge" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Regime Wt" field="regimeWeight" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl Regime</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Pair Fric.</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Glbl Fric.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pair DBS</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
              <SortableHeader label="Entry Time" field="entryTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Duration" field="durationOpenMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={28} className="px-3 py-8 text-center text-muted-foreground">
                  No open simulated trades
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.entryTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  {/* B69.1 (2026-05-04): symbol + asset class badge stacked vertically.
                      BATCH_80 (2026-05-13): added asset-name line BETWEEN symbol and
                      full asset-class badge per Kyle directive 2026-05-13 (revised:
                      asset NAME not category). Lookup from shared/asset-names.ts:
                        BTC → Bitcoin, ETH → Ethereum, SOL → Solana,
                        AAPL → Apple, BABA → Alibaba, NIO → NIO, MRNA → Moderna, ...
                      Renders nothing if symbol isn't in the map (maintain by adding
                      entries in shared/asset-names.ts as new pairs enter universe).
                      B-NEW-31 (2026-05-14): sticky-left + bg-card so column stays
                      visible during horizontal scroll. z-10 keeps it above body cells
                      but below the sticky thead (z-20) and top-left corner (z-30). */}
                  <td className="px-3 py-2 sticky left-0 z-10 bg-card">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{trade.symbol}</span>
                      {getAssetName(trade.symbol, trade.assetClass) && (
                        <span className="text-[10px] text-muted-foreground">
                          {getAssetName(trade.symbol, trade.assetClass)}
                        </span>
                      )}
                      <AssetClassBadge assetClass={trade.assetClass} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${isBenchmarkSymbol(trade.symbol) ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                      {isBenchmarkSymbol(trade.symbol) ? 'Benchmark' : 'Standard'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {/* B67.2.1 (2026-04-29): regime label + confidence + phase in the
                        SAME column per Kyle directive. Confidence shows post-modulation
                        (raw × macro_modifier × strategy_phase_weight) effective number;
                        phase badge surfaces EARLY/PRIME/LATE for age awareness. */}
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                        {normalizeRegimeDisplay(trade.regime)}
                      </Badge>
                      {trade.regimeConfidenceModulated != null && (
                        <span className="text-[10px] text-muted-foreground" title={`raw=${trade.regimeConfidenceRaw?.toFixed(3) ?? '—'} × modifier=${trade.macroModifierValue?.toFixed(3) ?? '—'} × phase_w=${trade.strategyPhaseWeight?.toFixed(3) ?? '—'}`}>
                          conf {trade.regimeConfidenceModulated.toFixed(3)}
                        </span>
                      )}
                      {trade.phase && (
                        <Badge variant="outline" className={`text-[10px] w-fit ${
                          trade.phase === 'EARLY' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' :
                          trade.phase === 'PRIME' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                          'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`} title={`age ${trade.phaseAgeSeconds != null ? Math.floor(trade.phaseAgeSeconds / 60) : '?'}m`}>
                          {trade.phase}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{trade.strategy}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs">{trade.signalType}</span>
                      <span className="text-xs text-muted-foreground">{trade.patternType || '-'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getPoolBadgeColor(trade.pool)}`}>
                      {trade.pool}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getSourcePoolBadgeColor(trade.sourcePool ?? 'unknown')}`}>
                      {(trade.sourcePool ?? 'unknown').toUpperCase()}
                    </Badge>
                  </td>
                  {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {formatEntryFeeMode(trade.chosenEntryMode, trade.entryFeeRate)}
                  </td>
                  {/* B65.2: TEC State — moonbag mode + break-even lock visibility */}
                  {/* B65.4 (2026-04-25): MOONBAG badge shows live ladder rung count (MB×N) */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <Badge
                        variant="outline"
                        className={`text-xs ${(trade as any).tradeMode === 'TRAILING_TAKE' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
                        title={(trade as any).tradeMode === 'TRAILING_TAKE'
                          ? `Target reached — now in moonbag (trailing) mode. Ratcheted through ${(trade as any).ladderRungsHit ?? 1} ladder rung${((trade as any).ladderRungsHit ?? 1) === 1 ? '' : 's'} so far.`
                          : 'Aiming for original target price'}
                      >
                        {(trade as any).tradeMode === 'TRAILING_TAKE'
                          ? `🌙 MB×${(trade as any).ladderRungsHit ?? 1}`
                          : 'TARGET'}
                      </Badge>
                      {(trade as any).breakEvenLatched && (trade as any).tradeMode !== 'TRAILING_TAKE' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-blue-500/15 text-blue-300 border-blue-500/40"
                          title="Break-even lock engaged: stop has been ratcheted to cover entry + costs. Trade cannot become a net loser."
                        >
                          🔒 BE LOCKED
                        </Badge>
                      )}
                    </div>
                  </td>
                  {/* B.2.UI (2026-06-02): entry-liquidity at trade-open.
                      xStock → "$… · OB" (ask-side order-book depth USD);
                      crypto → "… QTY" (native 24h coin-unit volume). */}
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground whitespace-normal break-words">
                      {formatEntryLiquidity(trade.entryLiquidityValue, trade.entryLiquidityKind)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-blue-400">${trade.dollarValue?.toFixed(2) ?? '0.00'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.quantity?.toFixed(4) ?? '0'} units</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
                      <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-green-400">${trade.target.toFixed(4)}</span>
                      <span className="font-mono text-xs text-red-400">${trade.stopLoss.toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-green-400">${(trade.target - trade.entryPrice).toFixed(4)}</span>
                      <span className="font-mono text-xs text-red-400">${(trade.entryPrice - trade.stopLoss).toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {trade.currentPrice !== null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                          ${trade.grossProfitValue.toFixed(2)}
                        </span>
                        <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                          {trade.grossProfitPercent}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    ${trade.costs.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {trade.currentPrice !== null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
                          ${trade.netProfitValue.toFixed(2)}
                        </span>
                        <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                          {trade.netProfitPercent}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-purple-400">{(trade.rankingScore ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{(trade.finalScore * 100).toFixed(0)}%</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.hybridScore.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{trade.pairDirectionalBias || '\u2014'}</span>
                      {trade.pairDirectionalBiasScore != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trade.pairDirectionalBiasScore >= 0 ? '+' : ''}{trade.pairDirectionalBiasScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{trade.globalDirectionalBias || <span className="text-muted-foreground italic">pending</span>}</span>
                      {trade.globalDirectionalBiasScore != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trade.globalDirectionalBiasScore >= 0 ? '+' : ''}{trade.globalDirectionalBiasScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {format(new Date(trade.entryTime), 'MM/dd HH:mm')}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {formatDuration(trade.durationOpenMinutes)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ClosedSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'resultType' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'exitTime' | 'durationMinutes';

function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [sortField, setSortField] = useState<ClosedSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as ClosedSortField);
      setSortDirection('desc');
    }
  }, [sortField]);

  const sortedTrades = useMemo(() => {
    if (!sortField) return trades;
    return [...trades].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      switch (sortField) {
        case 'symbol': aVal = a.symbol; bVal = b.symbol; break;
        case 'regime': aVal = a.regime; bVal = b.regime; break;
        case 'strategy': aVal = a.strategy; bVal = b.strategy; break;
        case 'pool': aVal = a.pool; bVal = b.pool; break;
        case 'dollarValue': aVal = a.dollarValue ?? 0; bVal = b.dollarValue ?? 0; break;
        case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
        case 'resultType': aVal = a.resultType; bVal = b.resultType; break;
        case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
        case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
        case 'exitTime': aVal = new Date(a.exitTime).getTime(); bVal = new Date(b.exitTime).getTime(); break;
        case 'durationMinutes': aVal = a.durationMinutes; bVal = b.durationMinutes; break;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [trades, sortField, sortDirection]);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const handleTopScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  // HF7: Sync top scrollbar width to match actual table content width
  useEffect(() => {
    if (scrollRef.current && topScrollRef.current) {
      const spacer = topScrollRef.current.firstElementChild as HTMLElement;
      if (spacer) spacer.style.width = `${scrollRef.current.scrollWidth}px`;
    }
  });

  return (
    <div className="relative">
      <div 
        ref={topScrollRef}
        className="overflow-x-auto scrollbar-thin mb-1"
        onScroll={handleTopScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div style={{ width: '2300px', height: '1px' }} />
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin max-h-[calc(100vh-13rem)]"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* B-NEW-31 (2026-05-14): outer container scrolls both axes with bounded
            max-height so the sticky thead + sticky first-column work correctly.
            Mirrors the OpenTradesTable freeze logic. */}
        <table className="w-full min-w-[2400px] text-sm">
          <thead className="sticky top-0 bg-card z-20">
            <tr className="border-b border-border">
              {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
                  B-NEW-31 (2026-05-14): first-column header sticky-left + z-30 (top-left corner). */}
              <SortableHeader label="Symbol" field="symbol" currentSort={sortField} direction={sortDirection} onSort={handleSort} extraClass="sticky left-0 z-30 bg-card text-left" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">B/S</th>
              <SortableHeader label="Regime" field="regime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Strategy" field="strategy" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <SortableHeader label="Pool (I/R)" field="pool" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source Pool</th>
              {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="The maker/taker entry fee-mode this trade opened on (entry-side fee only). '—' for trades opened before this column existed.">Entry Fee Mode</th>
              {/* B65.2-HF2c: TEC State column on Closed Simulated Trades for parity with Open table */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Trailing-exit mode the trade ended in. TARGET = closed at static target/stop/timeout; MOONBAG = flipped into trailing mode at target and closed via trailing stop or moonbag-duration cap.">TEC State</th>
              {/* B.2.UI (2026-06-02): entry-liquidity captured at trade-open.
                  xStock → ask-side order-book depth USD ("$… · OB");
                  crypto → native 24h coin-unit volume ("… QTY"). */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Liquidity at trade-open. xStock: ask-side order-book depth in USD ($… · OB). Crypto: native 24h volume in coin units (… QTY). '—' for trades opened before this column existed.">Volume / Order Book</th>
              <SortableHeader label="$ Value / Qty" field="dollarValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Entry/Exit" field="entryPrice" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <SortableHeader label="Result" field="resultType" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="center" />
              <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
              <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />

              <SortableHeader label="Final/Hybrid" field="finalScore" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Edge" field="expectedEdge" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Regime Wt" field="regimeWeight" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl Regime</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Pair Fric.</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Glbl Fric.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pair DBS</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
              <SortableHeader label="Entry/Exit Time" field="exitTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Duration" field="durationMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={27} className="px-3 py-8 text-center text-muted-foreground">
                  No closed trades in the last 7 days
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.exitTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  {/* B69.1 (2026-05-04): symbol + asset class badge stacked vertically.
                      BATCH_80 (2026-05-13): added asset-name line BETWEEN symbol and
                      full asset-class badge per Kyle directive 2026-05-13 (revised:
                      asset NAME not category). Lookup from shared/asset-names.ts:
                        BTC → Bitcoin, ETH → Ethereum, SOL → Solana,
                        AAPL → Apple, BABA → Alibaba, NIO → NIO, MRNA → Moderna, ...
                      Renders nothing if symbol isn't in the map (maintain by adding
                      entries in shared/asset-names.ts as new pairs enter universe).
                      B-NEW-31 (2026-05-14): sticky-left + bg-card so column stays
                      visible during horizontal scroll. z-10 keeps it above body cells
                      but below the sticky thead (z-20) and top-left corner (z-30). */}
                  <td className="px-3 py-2 sticky left-0 z-10 bg-card">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{trade.symbol}</span>
                      {getAssetName(trade.symbol, trade.assetClass) && (
                        <span className="text-[10px] text-muted-foreground">
                          {getAssetName(trade.symbol, trade.assetClass)}
                        </span>
                      )}
                      <AssetClassBadge assetClass={trade.assetClass} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${isBenchmarkSymbol(trade.symbol) ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                      {isBenchmarkSymbol(trade.symbol) ? 'Benchmark' : 'Standard'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {/* B67.2.1 (2026-04-29): regime label + confidence + phase in the
                        SAME column per Kyle directive. Confidence shows post-modulation
                        (raw × macro_modifier × strategy_phase_weight) effective number;
                        phase badge surfaces EARLY/PRIME/LATE for age awareness. */}
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                        {normalizeRegimeDisplay(trade.regime)}
                      </Badge>
                      {trade.regimeConfidenceModulated != null && (
                        <span className="text-[10px] text-muted-foreground" title={`raw=${trade.regimeConfidenceRaw?.toFixed(3) ?? '—'} × modifier=${trade.macroModifierValue?.toFixed(3) ?? '—'} × phase_w=${trade.strategyPhaseWeight?.toFixed(3) ?? '—'}`}>
                          conf {trade.regimeConfidenceModulated.toFixed(3)}
                        </span>
                      )}
                      {trade.phase && (
                        <Badge variant="outline" className={`text-[10px] w-fit ${
                          trade.phase === 'EARLY' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' :
                          trade.phase === 'PRIME' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                          'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`} title={`age ${trade.phaseAgeSeconds != null ? Math.floor(trade.phaseAgeSeconds / 60) : '?'}m`}>
                          {trade.phase}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{trade.strategy}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs">{trade.signalType}</span>
                      <span className="text-xs text-muted-foreground">{trade.patternType || '-'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getPoolBadgeColor(trade.pool)}`}>
                      {trade.pool}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getSourcePoolBadgeColor(trade.sourcePool ?? 'unknown')}`}>
                      {(trade.sourcePool ?? 'unknown').toUpperCase()}
                    </Badge>
                  </td>
                  {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {formatEntryFeeMode(trade.chosenEntryMode, trade.entryFeeRate)}
                  </td>
                  {/* B65.2-HF2c: TEC State column on Closed — TARGET vs MOONBAG end-state */}
                  {/* B65.4 (2026-04-25): MOONBAG badge shows ladder rung count (MB×N) when present */}
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${(trade as any).tradeMode === 'TRAILING_TAKE' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
                      title={(trade as any).tradeMode === 'TRAILING_TAKE'
                        ? `Trade entered moonbag (trailing) mode after hitting target. ${(trade as any).ladderRungsHit > 0 ? `Ratcheted through ${(trade as any).ladderRungsHit} ladder rung target hit${(trade as any).ladderRungsHit === 1 ? '' : 's'} before exiting.` : ''}`
                        : 'Trade closed at static target, stop, or timeout — never entered trailing mode'}
                    >
                      {(trade as any).tradeMode === 'TRAILING_TAKE'
                        ? `🌙 MB×${(trade as any).ladderRungsHit ?? 1}`
                        : 'TARGET'}
                    </Badge>
                  </td>
                  {/* B.2.UI (2026-06-02): entry-liquidity at trade-open.
                      xStock → "$… · OB" (ask-side order-book depth USD);
                      crypto → "… QTY" (native 24h coin-unit volume). */}
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground whitespace-normal break-words">
                      {formatEntryLiquidity(trade.entryLiquidityValue, trade.entryLiquidityKind)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-blue-400">${trade.dollarValue?.toFixed(2) ?? '0.00'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.quantity?.toFixed(4) ?? '0'} units</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
                      <span className="font-mono text-xs text-muted-foreground">${trade.exitPrice.toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-green-400">${trade.target.toFixed(4)}</span>
                      <span className="font-mono text-xs text-red-400">${trade.stopLoss.toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {/* B65.2-HF2c: Moonbag state moved to a dedicated TEC State column.
                        This cell keeps the expanded result mapping (Trail Stop / Moonbag Cap) only. */}
                    <Badge variant="outline" className={`text-xs ${getResultBadgeColor(trade.resultType)}`}>
                      {trade.resultType === 'TRAILING_STOP_HIT' || trade.resultType === 'MOONBAG_TIMEOUT' ? (
                        <TrendingUp className="w-3 h-3 mr-1 inline" />
                      ) : trade.resultType.includes('TARGET') || trade.resultType.includes('PROFIT') ? (
                        <TrendingUp className="w-3 h-3 mr-1 inline" />
                      ) : trade.resultType.includes('STOP') ? (
                        <TrendingDown className="w-3 h-3 mr-1 inline" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 mr-1 inline" />
                      )}
                      {getResultLabel(trade.resultType)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                        ${trade.grossProfitValue.toFixed(2)}
                      </span>
                      <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                        {trade.grossProfitPercent}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    ${trade.costs.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
                        ${trade.netProfitValue.toFixed(2)}
                      </span>
                      <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                        {trade.netProfitPercent}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{(trade.finalScore * 100).toFixed(0)}%</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.hybridScore.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{trade.pairDirectionalBias || '\u2014'}</span>
                      {trade.pairDirectionalBiasScore != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trade.pairDirectionalBiasScore >= 0 ? '+' : ''}{trade.pairDirectionalBiasScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{trade.globalDirectionalBias || <span className="text-muted-foreground italic">pending</span>}</span>
                      {trade.globalDirectionalBiasScore != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trade.globalDirectionalBiasScore >= 0 ? '+' : ''}{trade.globalDirectionalBiasScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{format(new Date(trade.entryTime), 'MM/dd HH:mm')}</span>
                      <span className="text-muted-foreground">{format(new Date(trade.exitTime), 'MM/dd HH:mm')}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {formatDuration(trade.durationMinutes)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const getImpactColor = (impact: number | null) => {
  if (impact === null) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  if (impact >= 0.2) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (impact >= 0.1) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-green-500/20 text-green-400 border-green-500/30';
};

const getAdjustmentTypeBadge = (adjustmentType?: AdjustmentType) => {
  switch (adjustmentType) {
    case 'lifecycle':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    case 'model_calibration':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'weight_adjustment':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'risk_adjustment':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'filter_adjustment':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const formatAdjustmentType = (adjustmentType?: AdjustmentType) => {
  switch (adjustmentType) {
    case 'lifecycle': return 'Lifecycle';
    case 'model_calibration': return 'Calibration';
    case 'weight_adjustment': return 'Weight';
    case 'risk_adjustment': return 'Risk';
    case 'filter_adjustment': return 'Filter';
    default: return 'Unknown';
  }
};

const getCategoryBadgeColor = (category: string) => {
  switch (category) {
    case 'ROI': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Expectancy': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'Confidence': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'Weight': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'Scoring': return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

function RegimeArchivePanel({
  records,
  summary,
  manifest,
  isLoading,
  onTriggerArchive
}: {
  records: RegimeArchiveRecord[];
  summary: ArchiveSummary | null;
  manifest: ManifestEntry[];
  isLoading: boolean;
  onTriggerArchive: () => void;
}) {
  const [selectedRegime, setSelectedRegime] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filteredRecords = selectedRegime 
    ? records.filter(r => r.regime === selectedRegime)
    : records;

  const uniqueRegimes = [...new Set(records.map(r => r.regime))];

  return (
    <div className="space-y-6">
      {summary && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-lg">Archive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{summary.totalEntries}</div>
                <div className="text-xs text-muted-foreground">Total Entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{summary.regimeCount}</div>
                <div className="text-xs text-muted-foreground">Regimes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{summary.strategyCount}</div>
                <div className="text-xs text-muted-foreground">Strategies</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${summary.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${summary.avgPnL.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground">Avg P&L</div>
              </div>
            </div>
            {summary.oldestArchive && summary.newestArchive && (
              <div className="mt-4 flex justify-between text-xs text-muted-foreground border-t pt-3">
                <span>Oldest: {format(new Date(summary.oldestArchive), 'MMM dd, yyyy')}</span>
                <span>Newest: {format(new Date(summary.newestArchive), 'MMM dd, yyyy')}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Archived Regime Metrics</span>
            <div className="flex items-center gap-2">
              <select
                className="text-sm bg-background border rounded px-2 py-1"
                value={selectedRegime || ''}
                onChange={(e) => setSelectedRegime(e.target.value || null)}
              >
                <option value="">All Regimes</option>
                {uniqueRegimes.map(regime => (
                  <option key={regime} value={regime}>{normalizeRegimeDisplay(regime)}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTriggerArchive()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Manual Archive
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Regime</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Strategy</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Win Rate</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Avg P&L</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Confidence</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dynamic ROI</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Window</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No archived records found
                    </td>
                  </tr>
                ) : (
                  filteredRecords.slice(0, 100).map((record, idx) => (
                    <tr key={`${record.regime}-${record.strategy}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(record.timestamp), 'MMM dd HH:mm')}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(record.regime)}`}>
                          {normalizeRegimeDisplay(record.regime)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">{record.strategy}</td>
                      <td className="px-3 py-2 text-right text-xs font-mono">
                        {(record.metrics.winRate * 100).toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-mono ${record.metrics.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${record.metrics.avgPnL.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-mono">
                        {(record.metrics.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-mono">
                        {(record.metrics.dynamicROI * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-center text-xs">
                        {record.windowDays}d
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {manifest.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-lg">Archive Manifest</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Filename</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Entries</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Checksum</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">Compressed</th>
                  </tr>
                </thead>
                <tbody>
                  {manifest.map((entry, idx) => (
                    <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs font-mono">{entry.filename}</td>
                      <td className="px-3 py-2 text-right text-xs">{entry.entries}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                        {entry.checksum.substring(0, 12)}...
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(entry.createdAt), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {entry.compressed ? (
                          <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-gray-500/20 text-gray-400">No</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PredictiveAdjustmentsPanel({ 
  adjustments, 
  summary, 
  currentValues,
  isLoading 
}: { 
  adjustments: PredictiveAdjustment[];
  summary: AdjustmentSummary | null;
  currentValues: CurrentValues | null;
  isLoading: boolean;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: explainedData } = useQuery<{
    ok: boolean;
    adjustments: ExplainedAdjustment[];
  }>({
    queryKey: ['/api/vts/predictive-adjustments/explained'],
    queryFn: () => apiFetch('/api/vts/predictive-adjustments/explained?limit=50'),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: stabilityData } = useQuery<{
    ok: boolean;
    metrics: StabilityMetrics;
  }>({
    queryKey: ['/api/vts/predictive-adjustments/stability'],
    queryFn: () => apiFetch('/api/vts/predictive-adjustments/stability'),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: safetyData } = useQuery<{
    ok: boolean;
    signals: SafetySignal[];
    disclaimer: string;
  }>({
    queryKey: ['/api/vts/predictive-adjustments/safety-signals'],
    queryFn: () => apiFetch('/api/vts/predictive-adjustments/safety-signals'),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const explainedAdjustments = explainedData?.adjustments || [];
  const stabilityMetrics = stabilityData?.metrics;
  const safetySignals = safetyData?.signals || [];

  const filteredAdjustments = useMemo(() => {
    return adjustments.filter(adj => 
      adj.impact !== null && 
      (adj.category === 'Weight' || adj.category === 'Risk')
    );
  }, [adjustments]);

  const lifecycleCount = adjustments.length - filteredAdjustments.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Summary (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {summary ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Adjustments:</span>
                  <span className="font-mono">{summary.totalAdjustments}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">High Impact:</span>
                  <span className="font-mono text-yellow-400">{summary.highImpactCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Impact:</span>
                  <span className="font-mono">{(summary.avgImpact * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last:</span>
                  <span className="font-mono text-xs">
                    {summary.lastAdjustment ? format(new Date(summary.lastAdjustment), 'MM/dd HH:mm') : '-'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Current Values
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {currentValues ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dynamic ROI:</span>
                  <span className="font-mono">
                    {currentValues.dynamicROI !== null ? `${(currentValues.dynamicROI * 100).toFixed(2)}%` : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confidence:</span>
                  <span className="font-mono">
                    {currentValues.confidence !== null ? `${(currentValues.confidence * 100).toFixed(1)}%` : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weight Keys:</span>
                  <span className="font-mono">{Object.keys(currentValues.weights).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated:</span>
                  <span className="font-mono text-xs">
                    {currentValues.lastUpdated ? format(new Date(currentValues.lastUpdated), 'MM/dd HH:mm') : '-'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {summary ? (
              <div className="space-y-1 text-sm">
                {Object.entries(summary.byCategory).map(([cat, count]) => (
                  count > 0 && (
                    <div key={cat} className="flex justify-between">
                      <Badge variant="outline" className={`text-xs ${getCategoryBadgeColor(cat)}`}>
                        {cat}
                      </Badge>
                      <span className="font-mono">{count}</span>
                    </div>
                  )
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Real Learning Adjustments
              {lifecycleCount > 0 && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({lifecycleCount} lifecycle events hidden)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">Color Legend:</span>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span>Increase</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span>Decrease</span>
              </div>
              <span className="text-muted-foreground/50">|</span>
              <span className="italic">Only Weight and Risk adjustments with real impact shown</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="text-sm min-w-max">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Time</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Category</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Parameter</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Old</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">New</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">Delta</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">Impact</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Regime</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdjustments.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      {adjustments.length > 0 
                        ? `No real learning adjustments yet (${adjustments.length} lifecycle events hidden)`
                        : 'No predictive adjustments recorded'}
                    </td>
                  </tr>
                ) : (
                  filteredAdjustments.map((adj, idx) => (
                    <tr key={`${adj.timestamp}-${adj.parameter}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(adj.timestamp), 'MM/dd HH:mm:ss')}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-xs ${getAdjustmentTypeBadge(adj.adjustmentType)}`}>
                          {formatAdjustmentType(adj.adjustmentType)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-xs ${getCategoryBadgeColor(adj.category)}`}>
                          {adj.category}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">{adj.parameter}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {adj.oldValue.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {adj.newValue.toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono text-xs ${adj.delta > 0 ? 'text-green-400' : adj.delta < 0 ? 'text-red-400' : ''}`}>
                        {adj.delta > 0 ? '+' : ''}{adj.delta.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {adj.impact !== null ? (
                          <Badge variant="outline" className={`text-xs ${getImpactColor(adj.impact)}`}>
                            {(adj.impact * 100).toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Lifecycle</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {adj.regime ? (
                          <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(adj.regime)}`}>
                            {normalizeRegimeDisplay(adj.regime)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {adj.reason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Directive 11.7Q Phase B: Learning Stability Visibility */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Learning Stability (11.7Q)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            {stabilityMetrics ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stability Score:</span>
                  <Badge variant="outline" className={`font-mono ${
                    stabilityMetrics.stabilityScore >= 80 ? 'text-green-400 border-green-500/30' :
                    stabilityMetrics.stabilityScore >= 50 ? 'text-yellow-400 border-yellow-500/30' :
                    'text-red-400 border-red-500/30'
                  }`}>
                    {stabilityMetrics.stabilityScore.toFixed(0)}%
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adjustments/Hour:</span>
                  <span className="font-mono">{stabilityMetrics.adjustmentsPerHour.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adjustments/Day:</span>
                  <span className="font-mono">{stabilityMetrics.adjustmentsPerDay.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bursty Periods (7d):</span>
                  <Badge variant="outline" className={`text-xs ${
                    stabilityMetrics.burstyPeriods.length === 0 ? 'text-green-400' :
                    stabilityMetrics.burstyPeriods.length < 3 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {stabilityMetrics.burstyPeriods.length}
                  </Badge>
                </div>
                {stabilityMetrics.parameterTouchHistory.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">Recent Parameter Activity:</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {stabilityMetrics.parameterTouchHistory.slice(0, 5).map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="font-mono truncate max-w-[150px]" title={p.parameter}>
                            {p.parameter.replace('ml.', '').replace('_weight', '')}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${
                              p.direction === 'increasing' ? 'text-green-400' :
                              p.direction === 'decreasing' ? 'text-red-400' :
                              p.direction === 'oscillating' ? 'text-yellow-400' : 'text-gray-400'
                            }`}>
                              {p.direction === 'increasing' ? '↑' : p.direction === 'decreasing' ? '↓' : p.direction === 'oscillating' ? '↕' : '→'}
                            </Badge>
                            <span className="text-muted-foreground">{p.adjustmentCount24h}/24h</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Loading stability metrics...</p>
            )}
          </CardContent>
        </Card>

        {/* Directive 11.7Q Phase D: Safety Signals */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Safety Signals (Advisory Only)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <p className="text-xs text-muted-foreground italic mb-3">
              These signals are advisory only and do not block or alter learning behavior.
            </p>
            {safetySignals.length === 0 ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                No safety concerns detected
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {safetySignals.slice(0, 10).map((signal, i) => (
                  <div key={i} className={`p-2 rounded-md text-xs border ${
                    signal.severity === 'alert' ? 'bg-red-500/10 border-red-500/30' :
                    signal.severity === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' :
                    'bg-blue-500/10 border-blue-500/30'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className={`text-xs ${
                        signal.severity === 'alert' ? 'text-red-400 border-red-500/30' :
                        signal.severity === 'warning' ? 'text-yellow-400 border-yellow-500/30' :
                        'text-blue-400 border-blue-500/30'
                      }`}>
                        {signal.type.replace('_', ' ')}
                      </Badge>
                      <span className="text-muted-foreground">
                        {format(new Date(signal.timestamp), 'MM/dd HH:mm')}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{signal.description}</p>
                    <p className="font-mono text-xs mt-1">{signal.parameter}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Directive 11.7Q Phase A: Explained Adjustments */}
      {explainedAdjustments.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Explained Learning Adjustments (11.7Q)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-96">
              <table className="text-sm min-w-max">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Time</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Parameter</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">Delta</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Learning System</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Intent Summary</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {explainedAdjustments.map((adj, idx) => {
                    const isExpanded = expandedRow === `${adj.timestamp}-${idx}`;
                    return (
                      <>
                        <tr 
                          key={`${adj.timestamp}-${adj.parameter}-${idx}`} 
                          className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedRow(isExpanded ? null : `${adj.timestamp}-${idx}`)}
                        >
                          <td className="px-3 py-2 text-xs">
                            {format(new Date(adj.timestamp), 'MM/dd HH:mm')}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono">
                            {adj.parameter.replace('ml.', '').replace('_weight', '')}
                          </td>
                          <td className={`px-3 py-2 text-center font-mono text-xs ${adj.delta > 0 ? 'text-green-400' : adj.delta < 0 ? 'text-red-400' : ''}`}>
                            {adj.delta > 0 ? '+' : ''}{adj.delta.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {adj.explanation?.triggerContext.learningSystem || 'Unknown'}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground min-w-[400px] max-w-[500px] whitespace-normal break-words">
                            {adj.explanation?.intentSummary || adj.reason}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant="outline" className={`text-xs ${
                              adj.explanation?.confidenceLevel === 'high' ? 'text-green-400 border-green-500/30' :
                              adj.explanation?.confidenceLevel === 'medium' ? 'text-yellow-400 border-yellow-500/30' :
                              'text-gray-400 border-gray-500/30'
                            }`}>
                              {adj.explanation?.confidenceLevel || 'low'}
                            </Badge>
                          </td>
                        </tr>
                        {isExpanded && adj.explanation && (
                          <tr key={`${adj.timestamp}-${idx}-expanded`} className="bg-muted/20">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="font-medium text-muted-foreground mb-1">Trigger Context</p>
                                  <div className="space-y-1 pl-2 border-l-2 border-primary/30">
                                    <p>System: {adj.explanation.triggerContext.learningSystem}</p>
                                    <p>Window: {adj.explanation.triggerContext.evaluationWindow}</p>
                                    <p>Sample Size: {adj.explanation.triggerContext.sampleSize}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground mb-1">Performance Rationale</p>
                                  <div className="space-y-1 pl-2 border-l-2 border-primary/30">
                                    <p>Trigger Metric: {adj.explanation.performanceRationale.triggerMetric}</p>
                                    <p>Direction: <span className={
                                      adj.explanation.performanceRationale.direction === 'improved' ? 'text-green-400' :
                                      adj.explanation.performanceRationale.direction === 'degraded' ? 'text-red-400' : ''
                                    }>{adj.explanation.performanceRationale.direction}</span></p>
                                    <p>Regimes: {adj.explanation.performanceRationale.regimesInvolved.map(normalizeRegimeDisplay).join(', ')}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 p-2 bg-muted/30 rounded text-xs">
                                <p className="font-medium mb-1">Full Explanation:</p>
                                <p className="text-muted-foreground">{adj.explanation.intentSummary}</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// Batch 19H: Filter Pipeline Diagnostics Panel
// B79.0i.a: exported so xstocks-tab can re-render same panel with xstock-scoped data
export type { FilterDiagnosticsData };
export function FilterDiagnosticsPanel({ data, isLoading }: { data: FilterDiagnosticsData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No diagnostics data available. Waiting for first FX5 scan cycle...
      </div>
    );
  }

  const { lastScan, rolling24h } = data;

  const formatFilterName = (key: string): string => {
    const names: Record<string, string> = {
      failed_min_volume: 'Min Volume',
      // B.2.UI (2026-06-02): order-book depth gate (xStock min_depth_usd two-way)
      failed_min_depth: 'Min Depth',
      failed_spread: 'Max Spread',
      failed_daily_range: 'Daily Range',
      failed_min_price: 'Min Price',
      failed_max_price: 'Max Price',
      failed_stablecoin: 'Stablecoin',
      failed_quote_currency: 'Quote Currency',
      failed_history: 'Min History',
      failed_market_cap: 'Market Cap',
      failed_guardrail_risk: 'Guardrail Risk',
      failed_correlation: 'Correlation',
      already_active: 'Already Active',
      passed_all_filters: 'Passed All',
      // reorg-B2.2 OBJ-B: the GuardDropReason enum values (no raw enum key leaks to the UI).
      rr_below_min: 'Reward-vs-Risk',
      unreachable: 'Unreachable',
      stop_distance: 'Stop Distance',
      invalid_atr: 'Invalid ATR',
    };
    return names[key] || key;
  };

  const getRejectionColor = (count: number, total: number): string => {
    if (total === 0) return '';
    const pct = count / total;
    if (pct > 0.5) return 'text-red-500 font-semibold';
    if (pct > 0.2) return 'text-orange-500';
    if (pct > 0) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Batch 19I: Format numbers with comma separators
  const fmt = (n: number | undefined | null): string => {
    if (n === undefined || n === null) return '—';
    return n.toLocaleString();
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Batch 42: Pipeline Summary Table — 24h aggregated */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg">Pipeline Summary (24h)
            {rolling24h && <span className="text-xs font-normal text-muted-foreground ml-2">{fmt(rolling24h.totalScans)} scans · {fmt(rolling24h.totalPairsScanned)} pair evaluations · {fmt(rolling24h.uniquePairsScanned)} unique</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rolling24h && rolling24h.totalScans > 0 ? (() => {
            const r24 = rolling24h.aggregated;
            const quantGlobalPassed = (r24.quant.global as Record<string, number>)['passed_all_filters'] ?? 0;
            const patternGlobalPassed = r24.pattern.global
              ? ((r24.pattern.global as Record<string, number>)['passed_all_filters'] ?? 0)
              : null;
            const pct = (n: number, d: number) => d > 0 ? ` (${Math.round(n / d * 100)}%)` : '';
            const universe = rolling24h.totalPairsScanned;
            const familySurvivorsTotal = r24.familyPaths
              ? ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].reduce((sum, f) => sum + (r24.familyPaths?.[f]?.survivors ?? 0), 0)
              : 0;
            const ve = data?.vtsEvaluation;
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Stage</th>
                    <th className="text-right p-2 font-medium">Quant</th>
                    <th className="text-right p-2 font-medium">Pattern</th>
                    <th className="text-right p-2 font-medium">Total</th>
                    <th className="text-left p-2 font-medium text-muted-foreground text-xs">Counting Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Universe Scanned</td>
                    <td className="p-2 text-right">{fmt(universe)}</td>
                    <td className="p-2 text-right">{fmt(universe)}</td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                    <td className="p-2 text-xs text-muted-foreground">Same universe enters both paths</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Global Filters Passed</td>
                    <td className="p-2 text-right text-blue-500">
                      {fmt(quantGlobalPassed)}<span className="text-xs text-muted-foreground">{pct(quantGlobalPassed, universe)}</span>
                    </td>
                    <td className="p-2 text-right text-blue-500">
                      {patternGlobalPassed !== null
                        ? <>{fmt(patternGlobalPassed)}<span className="text-xs text-muted-foreground">{pct(patternGlobalPassed, universe)}</span></>
                        : '—'}
                    </td>
                    <td className="p-2 text-right text-blue-500">
                      {fmt(quantGlobalPassed + (patternGlobalPassed ?? 0))}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">vs. Universe (not deduped — pair can be in both)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Family IMF Passed <span className="text-[10px] text-muted-foreground">(family-qualified entries)</span></td>
                    <td className="p-2 text-right text-orange-500">
                      {fmt(r24.quant.imf.passed)}<span className="text-xs text-muted-foreground">{pct(r24.quant.imf.passed, quantGlobalPassed * 4)}</span>
                    </td>
                    <td className="p-2 text-right text-orange-500">
                      {r24.pattern.imf
                        ? <>{fmt(r24.pattern.imf.passed)}<span className="text-xs text-muted-foreground">{pct(r24.pattern.imf.passed, patternGlobalPassed ?? 0)}</span></>
                        : '—'}
                    </td>
                    <td className="p-2 text-right text-orange-500">
                      {fmt(r24.quant.imf.passed + (r24.pattern.imf?.passed ?? 0))}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">Quant: sum across 4 families (fan-out). Pattern: passed pattern IMF.</td>
                  </tr>
                  {r24.familyPaths && (
                    <tr className="border-b hover:bg-muted/30">
                      <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Per-Family Breakdown</td>
                      <td className="p-2 text-right text-xs text-orange-400">
                        {['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].map(f =>
                          `${f[0].toUpperCase()}:${fmt(r24.familyPaths?.[f]?.survivors ?? 0)}`
                        ).join(' ')}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">—</td>
                      <td className="p-2 text-right text-muted-foreground">—</td>
                      <td className="p-2 text-xs text-muted-foreground">Each pair counted once per family it passes</td>
                    </tr>
                  )}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ LQ / VN / DI rejections <span className="text-[10px] italic">(aggregate across families)</span></td>
                    <td className="p-2 text-right text-xs text-muted-foreground">
                      {fmt(r24.quant.imf.failedLQ)} / {fmt(r24.quant.imf.failedVN)} / {fmt(r24.quant.imf.failedDI ?? 0)}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">
                      {r24.pattern.imf
                        ? `${fmt(r24.pattern.imf.failedLQ)} / ${fmt(r24.pattern.imf.failedVN)} / ${fmt(r24.pattern.imf.failedDI)}`
                        : '—'}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">—</td>
                    <td className="p-2 text-xs text-muted-foreground">Sum of 4 family rejection counts</td>
                  </tr>
                  {/* Batch 48: Family-Qualified Unique — the true unique pair count after family IMF */}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Family-Qualified (Unique Pairs)</td>
                    <td className="p-2 text-right text-teal-600">
                      {fmt((rolling24h as any).totalFamilyQualifiedUnique ?? 0)}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                    <td className="p-2 text-right text-teal-600">
                      {fmt((rolling24h as any).totalFamilyQualifiedUnique ?? 0)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">Unique pairs passing ≥1 family IMF (before fan-out expansion)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Family Fan-Out (IMF Survivors)</td>
                    <td className="p-2 text-right text-orange-500">{fmt(r24.quant.survivors)}</td>
                    <td className="p-2 text-right text-orange-500">{fmt(r24.pattern.survivors)}</td>
                    <td className="p-2 text-right text-orange-500">{fmt(r24.quant.survivors + r24.pattern.survivors)}</td>
                    <td className="p-2 text-xs text-muted-foreground">1 pair × N families = N entries (expansion for per-family evaluation)</td>
                  </tr>
                  {/* Batch 52: Pipeline flow — survivors → benchmarks removed → VTS destination */}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Benchmarks Removed</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(r24.quant.imf.benchmarkBypassed ?? 0)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(r24.pattern.imf?.benchmarkBypassed ?? 0)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt((r24.quant.imf.benchmarkBypassed ?? 0) + (r24.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-xs text-muted-foreground">Benchmark pairs excluded before VTS (cumulative 24h)</td>
                  </tr>
                  <tr className="bg-green-500/10 font-semibold border-t-2 border-green-500/30">
                    <td className="p-2">→ VTS Destination <span className="text-[10px] text-muted-foreground">(post-benchmark)</span></td>
                    <td className="p-2 text-right text-green-700">{fmt(r24.quant.survivors - (r24.quant.imf.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700">{fmt(r24.pattern.survivors - (r24.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700 font-bold">{fmt((r24.quant.survivors - (r24.quant.imf.benchmarkBypassed ?? 0)) + (r24.pattern.survivors - (r24.pattern.imf?.benchmarkBypassed ?? 0)))}</td>
                    <td className="p-2 text-xs text-muted-foreground">Survivors minus benchmarks (cumulative 24h)</td>
                  </tr>
                  {ve && (
                    <>
                      <tr className="bg-muted/50 border-y">
                        <td colSpan={5} className="p-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">VTS Evaluation Metrics <span className="font-normal">(VTS-side counters — pairs processed after cooldown/skip filters)</span></td>
                      </tr>
                      {/* B-NEW-19 (Kyle directive 2026-05-13): re-ordered pipeline math so it
                          flows subtractively. Order is now:
                            Pair-Pool Evaluations (= VTS Destination = IMF Survivors, lane fan-out)
                              ↓ × strategies-in-regime-pool (asset-class-enabled)
                            Possible Strategy Iterations  (= Pre-Eval Skips + Strategy Evaluations)
                              − Pre-Eval Skips            (family-mismatch / duplicate / max-open /
                                                          regime-no-strats — strategy iterations
                                                          that didn't run detect())
                              = Strategy Evaluations
                                  − Strategy Nulls
                                  = Signals Generated
                          Pre-Eval Skips render WITHOUT leading minus signs per Kyle 2026-05-13. */}
                      <tr className="border-b hover:bg-muted/30 bg-blue-500/5">
                        <td className="p-2 font-medium">Pair-Pool Evaluations</td>
                        <td className="p-2 text-right">{fmt((ve as any).quantPairPoolEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt((ve as any).patternPairPoolEvaluations ?? 0)}</td>
                        <td className="p-2 text-right font-semibold">{fmt(((ve as any).quantPairPoolEvaluations ?? 0) + ((ve as any).patternPairPoolEvaluations ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">Same as VTS Destination — lane fan-out count (a pair passing N families produces N entries here). 24h cumulative.</td>
                      </tr>
                      {(() => {
                        const nr2 = (ve.nullReasons ?? {}) as any;
                        const qDetail = ((ve as any).quantNullReasonDetail ?? {}) as Record<string, number>;
                        const pDetail = ((ve as any).patternNullReasonDetail ?? {}) as Record<string, number>;
                        const noPriceSkip = (ve as any).pairsSkippedNoPrice ?? 0;
                        const ohlcSkip = (ve as any).pairsSkippedInsufficientOHLC ?? 0;
                        const familyMismatch = nr2.familyFilterMismatch ?? 0;
                        const dupPos = nr2.duplicatePosition ?? 0;
                        const maxOpen = nr2.maxOpenTrades ?? 0;
                        const regimeNoStrat = nr2.regimeNoStrategies ?? 0;
                        const qFamily = qDetail['family_filter_mismatch'] ?? 0;
                        const pFamily = pDetail['family_filter_mismatch'] ?? 0;
                        const qDup = qDetail['duplicate_position'] ?? 0;
                        const pDup = pDetail['duplicate_position'] ?? 0;
                        const qMaxOpen = qDetail['max_open_trades'] ?? 0;
                        const pMaxOpen = pDetail['max_open_trades'] ?? 0;
                        const qNoRegime = qDetail['regime_no_strategies'] ?? 0;
                        const pNoRegime = pDetail['regime_no_strategies'] ?? 0;
                        const quantSkips = qFamily + qDup + qMaxOpen + qNoRegime;
                        const patternSkips = pFamily + pDup + pMaxOpen + pNoRegime;
                        const totalSkips24h = noPriceSkip + ohlcSkip + familyMismatch + dupPos + maxOpen + regimeNoStrat;
                        // B-NEW-19: Possible Strategy Iterations = Pre-Eval Skips + Strategy Evaluations
                        const qEvals = (ve as any).quantStrategyEvaluations ?? 0;
                        const pEvals = (ve as any).patternStrategyEvaluations ?? 0;
                        const qPossible = quantSkips + qEvals;
                        const pPossible = patternSkips + pEvals;
                        const totalPossible = totalSkips24h + qEvals + pEvals;
                        return (
                          <>
                            <tr className="border-b hover:bg-muted/30 bg-indigo-500/5">
                              <td className="p-2 font-medium">Possible Strategy Iterations</td>
                              <td className="p-2 text-right text-indigo-600">{fmt(qPossible)}</td>
                              <td className="p-2 text-right text-indigo-600">{fmt(pPossible)}</td>
                              <td className="p-2 text-right text-indigo-600 font-semibold">{fmt(totalPossible)}</td>
                              <td className="p-2 text-xs text-muted-foreground">Each pair-lane entry iterates through every asset-class-enabled strategy in its regime's pool. = Pre-Eval Skips + Strategy Evaluations.</td>
                            </tr>
                            <tr className="border-b hover:bg-muted/30">
                              <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Pre-Evaluation Skips</td>
                              <td className="p-2 text-right text-xs text-orange-500">{fmt(quantSkips)}</td>
                              <td className="p-2 text-right text-xs text-orange-500">{fmt(patternSkips)}</td>
                              <td className="p-2 text-right text-xs text-orange-500">{fmt(totalSkips24h)}</td>
                              <td className="p-2 text-xs text-muted-foreground">Strategy iterations that didn't run detect(). noPrice={fmt(noPriceSkip)}, OHLC={fmt(ohlcSkip)}, familyMismatch={fmt(familyMismatch)}, duplicate={fmt(dupPos)}, maxOpen={fmt(maxOpen)}, regimeNoStrats={fmt(regimeNoStrat)}. Lane cols = per-lane split of family_mismatch+duplicate+maxOpen+regimeNoStrats; pair-level (noPrice/OHLC) fire pre-lane and are in Total only.</td>
                            </tr>
                          </>
                        );
                      })()}
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">= Strategy Evaluations <span className="text-[10px] text-muted-foreground">(since process start)</span></td>
                        <td className="p-2 text-right">{fmt((ve as any).quantStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt((ve as any).patternStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt(((ve as any).quantStrategyEvaluations ?? 0) + ((ve as any).patternStrategyEvaluations ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">Per-strategy per-pair detect() calls. Possible Strategy Iterations minus Pre-Eval Skips. In-memory counter, resets on PM2 restart.</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Strategy Nulls <span className="text-[10px]">(since process start)</span></td>
                        <td className="p-2 text-right text-xs text-red-400">{fmt((ve as any).quantStrategyNulls ?? 0)}</td>
                        <td className="p-2 text-right text-xs text-red-400">{fmt((ve as any).patternStrategyNulls ?? 0)}</td>
                        <td className="p-2 text-right text-xs text-red-400">{fmt(((ve as any).quantStrategyNulls ?? 0) + ((ve as any).patternStrategyNulls ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">In-memory counter, resets on PM2 restart.</td>
                      </tr>
                      <tr className="bg-muted/30 font-semibold border-t-2 border-primary/20">
                        <td className="p-2">Trades Opened <span className="text-[10px] text-muted-foreground">(DB-backed, 24h rolling)</span></td>
                        <td className="p-2 text-right text-green-600">{fmt((ve as any).quantTradesOpened ?? 0)}</td>
                        <td className="p-2 text-right text-green-600">{fmt((ve as any).patternTradesOpened ?? 0)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(((ve as any).quantTradesOpened ?? 0) + ((ve as any).patternTradesOpened ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">After all gates passed (Net EV + pre-open + dedupe). Sourced from vts_open_trades DB row count — scope differs from in-memory Strategy counters above.</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            );
          })() : (
            <div className="p-4 text-muted-foreground text-center">No 24h scan data accumulated yet</div>
          )}
        </CardContent>
      </Card>

      {/* reorg-B2.2 OBJ-B: Reward-vs-Risk / Reachability Gate (per strategy, this asset class).
          The shared post-signal-build guard (RR + reachability + stop-distance + invalid-ATR) lives at
          signal generation — its drops aren't part of the IMF/scan-phase filter breakdown above. Surfaced
          here per class (Kyle's no-hidden-gates). Distinct "no evaluations" state ≠ a misleading 0%. */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Reward-vs-Risk / Reachability Gate</span>
            <span className="text-sm font-normal text-muted-foreground">
              per strategy{data.trackerStartedAt ? ` · since ${new Date(data.trackerStartedAt).toLocaleString()}` : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(() => {
            const gd = data.guardDrops;
            const rows = gd ? Object.entries(gd) : [];
            if (rows.length === 0) {
              return (
                <div className="p-4 text-muted-foreground text-center">
                  No guard evaluations recorded for this asset class yet — the reward-vs-risk / reachability gate hasn't evaluated a signal here.
                </div>
              );
            }
            // Most-suppressed first (the #372 calibration read: which strategies the per-class minRR cuts).
            rows.sort((a, b) => b[1].rrSuppressionRate - a[1].rrSuppressionRate);
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Strategy</th>
                      <th className="text-right p-2 font-medium">Evals</th>
                      <th className="text-right p-2 font-medium">Passed</th>
                      <th className="text-right p-2 font-medium">{formatFilterName('rr_below_min')}</th>
                      <th className="text-right p-2 font-medium">{formatFilterName('unreachable')}</th>
                      <th className="text-right p-2 font-medium">{formatFilterName('stop_distance')}</th>
                      <th className="text-right p-2 font-medium">{formatFilterName('invalid_atr')}</th>
                      <th className="text-right p-2 font-medium">Mean RR</th>
                      <th className="text-right p-2 font-medium">RR Suppression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([strategy, s]) => (
                      <tr key={strategy} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">{strategy}</td>
                        <td className="p-2 text-right">{fmt(s.evals)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(s.passes)}</td>
                        <td className={`p-2 text-right ${getRejectionColor(s.rrDrops, s.evals)}`}>{fmt(s.rrDrops)}</td>
                        <td className={`p-2 text-right ${getRejectionColor(s.reachDrops, s.evals)}`}>{fmt(s.reachDrops)}</td>
                        <td className="p-2 text-right text-muted-foreground">{fmt(s.stopDrops)}</td>
                        <td className="p-2 text-right text-muted-foreground">{fmt(s.atrDrops)}</td>
                        <td className="p-2 text-right">{s.rrEvals > 0 ? s.meanRR.toFixed(2) : '—'}</td>
                        <td className={`p-2 text-right ${getRejectionColor(s.rrDrops, s.evals)}`}>
                          {s.evals > 0 ? `${(s.rrSuppressionRate * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* TABLE 1: Last Scan Stats */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Last Scan — Filter Breakdown</span>
            <span className="text-sm font-normal text-muted-foreground">
              {lastScan ? `${new Date(lastScan.timestamp).toLocaleTimeString()} · ${lastScan.mode} · ${lastScan.totalPairsScanned} pairs scanned` : 'No scan data'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lastScan ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Filter</th>
                    <th className="text-right p-2 font-medium">Quant Global</th>
                    <th className="text-right p-2 font-medium">Pattern Global</th>
                    <th className="text-right p-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastScan.quant.global)
                    // B-NEW-7 (2026-05-12): `applicable` is an object holding
                    // N/A flags for the panel — not a numeric counter. Skip
                    // here so it doesn't render as "[object Object]".
                    .filter(([key, value]) => typeof value === 'number')
                    .map(([key, value]) => (
                    <tr key={key} className="border-b hover:bg-muted/30">
                      <td className="p-2">{formatFilterName(key)}</td>
                      <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor(value as number, lastScan.totalPairsScanned)}`}>
                        {fmt(value as number)}
                      </td>
                      <td className={`p-2 text-right ${lastScan.pattern.global && key in lastScan.pattern.global ? (key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor((lastScan.pattern.global as Record<string, number>)[key] || 0, lastScan.totalPairsScanned)) : 'text-muted-foreground'}`}>
                        {lastScan.pattern.global && key in (lastScan.pattern.global as Record<string, number>)
                          ? fmt((lastScan.pattern.global as Record<string, number>)[key])
                          : '—'}
                      </td>
                      <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : ''}`}>
                        {lastScan.pattern.global && key in (lastScan.pattern.global as Record<string, number>)
                          ? fmt((value as number) + ((lastScan.pattern.global as Record<string, number>)[key] || 0))
                          : fmt(value as number)}
                      </td>
                    </tr>
                  ))}
                  {/* IMF Section Header */}
                  <tr className="border-b bg-muted/50">
                    <td colSpan={4} className="p-2 font-medium text-xs uppercase tracking-wider">Family IMF Metrics (aggregate across 4 families)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed LQ</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedLQ, lastScan.quant.imf.total)}`}>{fmt(lastScan.quant.imf.failedLQ)}</td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedLQ, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedLQ) : '—'}
                    </td>
                    <td className="p-2 text-right">{fmt(lastScan.quant.imf.failedLQ + (lastScan.pattern.imf?.failedLQ ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed VN</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedVN, lastScan.quant.imf.total)}`}>{fmt(lastScan.quant.imf.failedVN)}</td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedVN, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedVN) : '—'}
                    </td>
                    <td className="p-2 text-right">{fmt(lastScan.quant.imf.failedVN + (lastScan.pattern.imf?.failedVN ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed DI</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedDI ?? 0, lastScan.quant.imf.total)}`}>
                      {fmt(lastScan.quant.imf.failedDI ?? 0)}
                    </td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedDI, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedDI) : '—'}
                    </td>
                    <td className="p-2 text-right">{fmt((lastScan.quant.imf.failedDI ?? 0) + (lastScan.pattern.imf?.failedDI ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">Family IMF Passed (fan-out total)</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.imf.passed)}</td>
                    <td className="p-2 text-right text-green-600">{lastScan.pattern.imf ? fmt(lastScan.pattern.imf.passed) : '—'}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.imf.passed + (lastScan.pattern.imf?.passed ?? 0))}</td>
                  </tr>
                  {/* Batch 22: Family Path IMF Results */}
                  {data?.lastScan?.familyPaths && (
                    <>
                      <tr className="bg-muted/30">
                        <td colSpan={4} className="p-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Family Path IMF Breakdown (per-family detail)
                        </td>
                      </tr>
                      {['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].map(family => {
                        const fp = (data.lastScan as any)?.familyPaths?.[family];
                        if (!fp) return null;
                        const familyLabel: Record<string, string> = { trend: 'Trend Family', reversal: 'Reversal Family', breakout: 'Breakout Family', oscillator: 'Oscillator Family' };
                        return (
                          <tr key={family} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{familyLabel[family] ?? family}</td>
                            <td className="p-2 text-right">
                              <span className="text-green-600">{fp.survivors}</span>
                              <span className="text-muted-foreground text-xs ml-1">
                                / {fp.imf?.total ?? 0}
                              </span>
                            </td>
                            <td className="p-2 text-right text-xs text-muted-foreground">
                              LQ:{fp.imf?.failedLQ ?? 0} VN:{fp.imf?.failedVN ?? 0} DI:{fp.imf?.failedDI ?? 0}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {/* Batch 52: Pipeline flow — survivors → benchmarks removed → VTS destination (moved below family breakdown per Kyle/Langston) */}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-2">IMF Survivors (incl. benchmarks)</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.pattern.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.survivors + lastScan.pattern.survivors)}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Benchmarks Removed</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(lastScan.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{lastScan.pattern.imf ? fmt(lastScan.pattern.imf.benchmarkBypassed) : '—'}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(lastScan.quant.imf.benchmarkBypassed + (lastScan.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                  </tr>
                  <tr className="bg-green-500/10 font-semibold border-t-2 border-green-500/30">
                    <td className="p-2">→ VTS Destination <span className="text-[10px] text-muted-foreground">(post-benchmark)</span></td>
                    <td className="p-2 text-right text-green-700">{fmt(lastScan.quant.survivors - lastScan.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-green-700">{fmt(lastScan.pattern.survivors - (lastScan.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700 font-bold text-base">{fmt((lastScan.quant.survivors - lastScan.quant.imf.benchmarkBypassed) + (lastScan.pattern.survivors - (lastScan.pattern.imf?.benchmarkBypassed ?? 0)))}</td>
                  </tr>
                  {/* Batch 51 HF2: Restored VTS Signal Funnel in Last Scan with last-cycle data (Kyle directive)
                      B-NEW-19 (Kyle 2026-05-13): Restructured to match Pipeline Summary 24h order —
                      Pair-Pool Evals first, then Possible Strategy Iterations, then per-lane Pre-Eval
                      Skip breakdown, then Strategy Evaluations. Per-lane Quant/Pattern split wired
                      using lc.quantNullReasonDetail / patternNullReasonDetail emitted by routes.ts
                      (xstock) and vts-runner snapshot (crypto). No leading minus signs. */}
                  {data?.lastCycleVtsEval && (() => {
                    const lc = data.lastCycleVtsEval;
                    const totalEvals = lc.totalStrategyEvaluations || 0;
                    const totalNulls = (lc.quantStrategyNulls || 0) + (lc.patternStrategyNulls || 0);
                    const signals = lc.signalsGenerated || 0;
                    const rejected = lc.signalsRejected || 0;
                    const trades = signals - rejected;
                    const qDetail = ((lc as any).quantNullReasonDetail ?? {}) as Record<string, number>;
                    const pDetail = ((lc as any).patternNullReasonDetail ?? {}) as Record<string, number>;
                    const skippedNoPrice = lc.pairsSkippedNoPrice || 0;
                    const skippedOHLC = lc.pairsSkippedInsufficientOHLC || 0;
                    const skippedMaxTrades = (lc.nullReasons as any)?.maxOpenTrades || (lc.nullReasonDetail as any)?.['max_open_trades'] || 0;
                    const skippedNoRegime = (lc.nullReasons as any)?.regimeNoStrategies || (lc.nullReasonDetail as any)?.['regime_no_strategies'] || 0;
                    const skippedDuplicate = (lc.nullReasons as any)?.duplicatePosition || (lc.nullReasonDetail as any)?.['duplicate_position'] || 0;
                    const skippedFamilyMismatch = (lc.nullReasons as any)?.familyFilterMismatch || (lc.nullReasonDetail as any)?.['family_filter_mismatch'] || 0;
                    const totalPreEvalSkips = skippedNoPrice + skippedOHLC + skippedMaxTrades + skippedNoRegime + skippedDuplicate + skippedFamilyMismatch;
                    // Per-lane split (lane-level reasons only; pair-level noPrice/OHLC go to Total).
                    const qFamily = qDetail['family_filter_mismatch'] ?? 0;
                    const pFamily = pDetail['family_filter_mismatch'] ?? 0;
                    const qDup = qDetail['duplicate_position'] ?? 0;
                    const pDup = pDetail['duplicate_position'] ?? 0;
                    const qMaxOpen = qDetail['max_open_trades'] ?? 0;
                    const pMaxOpen = pDetail['max_open_trades'] ?? 0;
                    const qNoRegime = qDetail['regime_no_strategies'] ?? 0;
                    const pNoRegime = pDetail['regime_no_strategies'] ?? 0;
                    const quantSkips = qFamily + qDup + qMaxOpen + qNoRegime;
                    const patternSkips = pFamily + pDup + pMaxOpen + pNoRegime;
                    // Possible Strategy Iterations = Pre-Eval Skips + Strategy Evaluations
                    const qPairPool = (lc.quantPairPoolEvaluations ?? lc.quantPairsEvaluated) || 0;
                    const pPairPool = (lc.patternPairPoolEvaluations ?? lc.patternPairsEvaluated) || 0;
                    const qEvals = lc.quantStrategyEvaluations || 0;
                    const pEvals = lc.patternStrategyEvaluations || 0;
                    const qPossible = quantSkips + qEvals;
                    const pPossible = patternSkips + pEvals;
                    const totalPossible = totalPreEvalSkips + totalEvals;
                    return (
                      <>
                        <tr className="border-b bg-blue-500/5"><td colSpan={4} className="p-2 font-medium text-xs text-blue-600">VTS Signal Funnel (Last Cycle)</td></tr>
                        <tr className="border-b hover:bg-muted/30 bg-blue-500/5">
                          <td className="p-2 pl-4 font-medium">Pair-Pool Evaluations</td>
                          <td className="p-2 text-right">{fmt(qPairPool)}</td>
                          <td className="p-2 text-right">{fmt(pPairPool)}</td>
                          <td className="p-2 text-right font-semibold">{fmt(qPairPool + pPairPool)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 bg-indigo-500/5">
                          <td className="p-2 pl-4 font-medium">Possible Strategy Iterations</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(qPossible)}</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(pPossible)}</td>
                          <td className="p-2 text-right text-indigo-600 font-semibold">{fmt(totalPossible)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Pre-Evaluation Skips</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(quantSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(patternSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(totalPreEvalSkips)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ No Price Data</td>
                          <td colSpan={2}></td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedNoPrice)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Insufficient OHLC</td>
                          <td colSpan={2}></td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedOHLC)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Family Filter Mismatch</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qFamily)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pFamily)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedFamilyMismatch)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Duplicate Position</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qDup)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pDup)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedDuplicate)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Max Open Trades</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qMaxOpen)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pMaxOpen)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedMaxTrades)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Regime Has No Strategies</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qNoRegime)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pNoRegime)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedNoRegime)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">= Strategy Evaluations</td>
                          <td className="p-2 text-right">{fmt(qEvals)}</td>
                          <td className="p-2 text-right">{fmt(pEvals)}</td>
                          <td className="p-2 text-right">{fmt(totalEvals)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">Strategy Nulls (no setup)</td>
                          <td className="p-2 text-right text-amber-500">{fmt(lc.quantStrategyNulls || 0)}</td>
                          <td className="p-2 text-right text-amber-500">{fmt(lc.patternStrategyNulls || 0)}</td>
                          <td className="p-2 text-right text-amber-500">{fmt(totalNulls)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">Signals Produced</td>
                          <td className="p-2 text-right text-green-600">{fmt(lc.quantSignalsGenerated || 0)}</td>
                          <td className="p-2 text-right text-green-600">{fmt(lc.patternSignalsGenerated || 0)}</td>
                          <td className="p-2 text-right text-green-600">{fmt(signals)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">Post-Signal Rejections</td>
                          <td className="p-2 text-right text-red-500">{fmt(lc.quantSignalsRejected || 0)}</td>
                          <td className="p-2 text-right text-red-500">{fmt(lc.patternSignalsRejected || 0)}</td>
                          <td className="p-2 text-right text-red-500">{fmt(rejected)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 font-semibold">
                          <td className="p-2 pl-4">Trades Opened</td>
                          <td colSpan={3} className="p-2 text-right text-green-700">{fmt(trades >= 0 ? trades : 0)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-muted-foreground text-center">No scan data yet</div>
          )}
        </CardContent>
      </Card>

      {/* TABLE 2: 24-Hour Rolling Aggregates */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>24-Hour Rolling Aggregates</span>
            <span className="text-xs font-normal text-orange-400">(in-memory — resets on restart)</span>
            <span className="text-sm font-normal text-muted-foreground">
              {rolling24h.totalScans} scans · {fmt(rolling24h.totalPairsScanned)} total pairs · {fmt(rolling24h.uniquePairsScanned)} unique
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rolling24h.totalScans > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Filter</th>
                    <th className="text-right p-2 font-medium">Quant Global (24h)</th>
                    <th className="text-right p-2 font-medium">Pattern Global (24h)</th>
                    <th className="text-right p-2 font-medium">Total (24h)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rolling24h.aggregated.quant.global)
                    // B-NEW-7 (2026-05-12): same `applicable`-object-as-string
                    // fix as the Last Scan table above. Skip non-numeric keys.
                    .filter(([key, value]) => typeof value === 'number')
                    .map(([key, value]) => {
                    const patternVal = rolling24h.aggregated.pattern.global && key in (rolling24h.aggregated.pattern.global as Record<string, number>)
                      ? (rolling24h.aggregated.pattern.global as Record<string, number>)[key]
                      : null;
                    const total = (value as number) + (patternVal ?? 0);
                    return (
                      <tr key={key} className="border-b hover:bg-muted/30">
                        <td className="p-2">{formatFilterName(key)}</td>
                        <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor(value as number, rolling24h.totalPairsScanned)}`}>
                          {fmt(value as number)}
                        </td>
                        <td className={`p-2 text-right ${patternVal !== null ? (key === 'passed_all_filters' ? 'text-green-600 font-semibold' : '') : 'text-muted-foreground'}`}>
                          {patternVal !== null ? fmt(patternVal) : '—'}
                        </td>
                        <td className={`p-2 text-right font-medium ${key === 'passed_all_filters' ? 'text-green-600' : ''}`}>
                          {fmt(total)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-b bg-muted/50">
                    <td colSpan={4} className="p-2 font-medium text-xs uppercase tracking-wider">Family IMF Metrics (24h aggregate across families)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed LQ</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedLQ)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedLQ) : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt(rolling24h.aggregated.quant.imf.failedLQ + (rolling24h.aggregated.pattern.imf?.failedLQ ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed VN</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedVN)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedVN) : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt(rolling24h.aggregated.quant.imf.failedVN + (rolling24h.aggregated.pattern.imf?.failedVN ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed DI</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedDI ?? 0)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedDI) : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt((rolling24h.aggregated.quant.imf.failedDI ?? 0) + (rolling24h.aggregated.pattern.imf?.failedDI ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">IMF Passed (fan-out total)</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.quant.imf.passed)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.pattern.imf?.passed ?? 0)}</td>
                    <td className="p-2 text-right text-green-600 font-medium">{fmt(rolling24h.aggregated.quant.imf.passed + (rolling24h.aggregated.pattern.imf?.passed ?? 0))}</td>
                  </tr>
                  {/* Family Path IMF Results — quant only, should reconcile with quant IMF Passed above */}
                  {rolling24h.aggregated.familyPaths && (() => {
                    const familyTotal = ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].reduce((sum, f) =>
                      sum + (rolling24h.aggregated.familyPaths?.[f]?.survivors ?? 0), 0);
                    return (
                    <>
                      <tr className="bg-muted/30">
                        <td colSpan={4} className="p-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Family Path IMF Results (24h — quant families)
                        </td>
                      </tr>
                      {['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].map(family => {
                        const fp = rolling24h.aggregated.familyPaths?.[family];
                        if (!fp) return null;
                        const familyLabel: Record<string, string> = { trend: 'Trend Family', reversal: 'Reversal Family', breakout: 'Breakout Family', oscillator: 'Oscillator Family' };
                        return (
                          <tr key={`24h-${family}`} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{familyLabel[family] ?? family}</td>
                            <td className="p-2 text-right">
                              <span className="text-green-600">{fmt(fp.survivors)}</span>
                              <span className="text-muted-foreground text-xs ml-1">
                                / {fmt(fp.imf?.total ?? 0)}
                              </span>
                            </td>
                            <td className="p-2 text-right text-xs text-muted-foreground">
                              LQ:{fmt(fp.imf?.failedLQ ?? 0)} VN:{fmt(fp.imf?.failedVN ?? 0)} DI:{fmt(fp.imf?.failedDI ?? 0)}
                            </td>
                            <td className="p-2 text-right text-xs text-muted-foreground">—</td>
                          </tr>
                        );
                      })}
                      <tr className="border-b hover:bg-muted/30 font-semibold">
                        <td className="p-2 pl-6 text-xs">↳ Family Total (quant fan-out)</td>
                        <td className="p-2 text-right text-green-600">{fmt(familyTotal)}</td>
                        <td className="p-2 text-right text-muted-foreground">—</td>
                        <td className="p-2 text-right text-green-600">{fmt(familyTotal)}</td>
                      </tr>
                    </>
                    );
                  })()}
                  {/* Pipeline flow: IMF Survivors → Benchmarks Removed → VTS Destination */}
                  <tr className="bg-muted/50 border-y">
                    <td colSpan={4} className="p-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pipeline Flow (24h cumulative)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">IMF Survivors (incl. benchmarks)</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.quant.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.pattern.survivors)}</td>
                    <td className="p-2 text-right text-green-600 font-medium">{fmt(rolling24h.aggregated.quant.survivors + rolling24h.aggregated.pattern.survivors)}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Benchmarks Removed</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(rolling24h.aggregated.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(rolling24h.aggregated.quant.imf.benchmarkBypassed + (rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                  </tr>
                  <tr className="bg-green-500/10 font-semibold border-t-2 border-green-500/30">
                    <td className="p-2">→ VTS Destination <span className="text-[10px] text-muted-foreground">(post-benchmark)</span></td>
                    <td className="p-2 text-right text-green-700">{fmt(rolling24h.aggregated.quant.survivors - rolling24h.aggregated.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-green-700">{fmt(rolling24h.aggregated.pattern.survivors - (rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700 font-bold">{fmt((rolling24h.aggregated.quant.survivors - rolling24h.aggregated.quant.imf.benchmarkBypassed) + (rolling24h.aggregated.pattern.survivors - (rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0)))}</td>
                  </tr>
                  {/* Batch 52 Fix 18: Merged VTS Evaluation Breakdown into this table (was separate card)
                      B-NEW-19 (Kyle 2026-05-13): Restructured to subtractive flow.
                        Pair-Pool Evaluations → Possible Strategy Iterations → Pre-Eval Skips →
                        Strategy Evaluations → Strategy Nulls → Trades Opened.
                      Per-lane split for Pre-Eval Skips now reads ve.quantNullReasonDetail /
                      ve.patternNullReasonDetail (previously rendered noPrice in quant col and
                      OHLC in pattern col — semantically wrong). No leading minus signs. */}
                  {data?.vtsEvaluation && (() => {
                    const ve = data.vtsEvaluation!;
                    const nr3 = (ve.nullReasons ?? {}) as any;
                    const qDetail = ((ve as any).quantNullReasonDetail ?? {}) as Record<string, number>;
                    const pDetail = ((ve as any).patternNullReasonDetail ?? {}) as Record<string, number>;
                    const noPrice = (ve as any).pairsSkippedNoPrice ?? 0;
                    const ohlc = (ve as any).pairsSkippedInsufficientOHLC ?? 0;
                    const qFamily = qDetail['family_filter_mismatch'] ?? 0;
                    const pFamily = pDetail['family_filter_mismatch'] ?? 0;
                    const qDup = qDetail['duplicate_position'] ?? 0;
                    const pDup = pDetail['duplicate_position'] ?? 0;
                    const qMaxOpen = qDetail['max_open_trades'] ?? 0;
                    const pMaxOpen = pDetail['max_open_trades'] ?? 0;
                    const qNoRegime = qDetail['regime_no_strategies'] ?? 0;
                    const pNoRegime = pDetail['regime_no_strategies'] ?? 0;
                    const quantSkips = qFamily + qDup + qMaxOpen + qNoRegime;
                    const patternSkips = pFamily + pDup + pMaxOpen + pNoRegime;
                    const preEvalTotal =
                      noPrice + ohlc +
                      (nr3.familyFilterMismatch ?? 0) +
                      (nr3.duplicatePosition ?? 0) +
                      (nr3.maxOpenTrades ?? 0) +
                      (nr3.regimeNoStrategies ?? 0);
                    const qPairPool = ve.quantPairPoolEvaluations ?? ve.quantPairsEvaluated;
                    const pPairPool = ve.patternPairPoolEvaluations ?? ve.patternPairsEvaluated;
                    const qEvals = (ve as any).quantStrategyEvaluations ?? 0;
                    const pEvals = (ve as any).patternStrategyEvaluations ?? 0;
                    const qPossible = quantSkips + qEvals;
                    const pPossible = patternSkips + pEvals;
                    const totalPossible = preEvalTotal + ve.totalStrategyEvaluations;
                    return (
                      <>
                        <tr className="bg-muted/50 border-y">
                          <td colSpan={4} className="p-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">VTS Evaluation (24h rolling — VTS-side counters)</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 bg-blue-500/5">
                          <td className="p-2 font-medium">Pair-Pool Evaluations</td>
                          <td className="p-2 text-right text-blue-600">{fmt(qPairPool)}</td>
                          <td className="p-2 text-right text-blue-600">{fmt(pPairPool)}</td>
                          <td className="p-2 text-right font-semibold text-blue-600">{fmt(qPairPool + pPairPool)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 bg-indigo-500/5">
                          <td className="p-2 font-medium">Possible Strategy Iterations</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(qPossible)}</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(pPossible)}</td>
                          <td className="p-2 text-right font-semibold text-indigo-600">{fmt(totalPossible)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Pre-Evaluation Skips <span className="text-[10px]">(sum of all pre-detect rejections)</span></td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(quantSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(patternSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(preEvalTotal)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2">= Strategy Evaluations</td>
                          <td className="p-2 text-right">{fmt(qEvals)}</td>
                          <td className="p-2 text-right">{fmt(pEvals)}</td>
                          <td className="p-2 text-right font-semibold">{fmt(ve.totalStrategyEvaluations)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Strategy Nulls</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(ve.quantStrategyNulls)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt((ve as any).patternStrategyNulls ?? 0)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(ve.quantStrategyNulls + ((ve as any).patternStrategyNulls ?? 0))}</td>
                        </tr>
                        <tr className="bg-muted/30 font-semibold border-t-2 border-primary/20">
                          <td className="p-2">Trades Opened <span className="text-[10px] text-muted-foreground">(post-gate)</span></td>
                          <td className="p-2 text-right text-green-600">{fmt((ve as any).quantTradesOpened ?? 0)}</td>
                          <td className="p-2 text-right text-green-600">{fmt((ve as any).patternTradesOpened ?? 0)}</td>
                          <td className="p-2 text-right font-semibold text-green-600">{fmt(((ve as any).quantTradesOpened ?? 0) + ((ve as any).patternTradesOpened ?? 0))}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-muted-foreground text-center">No 24h data accumulated yet</div>
          )}
        </CardContent>
      </Card>

      {/* TABLE 4: VTS Evaluation Detail (Batch 19I) — expanded breakdown */}
      <Card className="max-w-4xl">
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>VTS Evaluation Detail</span>
            <span className="text-sm font-normal text-muted-foreground">
              {data?.vtsEvaluation ? '24-Hour Rolling — Strategy & Null Reason Breakdown' : 'No VTS data yet'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data?.vtsEvaluation ? (() => {
            const ve = data.vtsEvaluation!;
            return (
              <div className="space-y-4">
                {/* Source Pool Summary */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Metric</th>
                        <th className="text-right p-2 font-medium">Quant Pool</th>
                        <th className="text-right p-2 font-medium">Pattern Pool</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Pattern detection, strategy evals, nulls, signals — detail view */}
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Pattern Detection <span className="text-xs text-muted-foreground">(BUY pattern scan results)</span></td>
                        <td className="p-2 text-right">
                          {((ve as any).quantPatternDetected > 0 || (ve as any).quantPatternNoDetection > 0) ? (
                            <>
                              <span className="text-green-600">{fmt((ve as any).quantPatternDetected ?? 0)}</span>
                              {' / '}
                              <span className="text-red-500">{fmt((ve as any).quantPatternNoDetection ?? 0)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {ve.patternPairsEvaluated > 0 ? (
                            <>
                              <span className="text-green-600">{fmt(ve.patternDetected)}</span>
                              {' / '}
                              <span className="text-red-500">{fmt(ve.patternNoDetection)}</span>
                              <span className="text-xs text-muted-foreground ml-1">
                                ({Math.round(ve.patternDetected / ve.patternPairsEvaluated * 100)}% hit)
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {(() => {
                            const qd = (ve as any).quantPatternDetected ?? 0;
                            const qnd = (ve as any).quantPatternNoDetection ?? 0;
                            const totalDetected = qd + ve.patternDetected;
                            const totalNoDetection = qnd + ve.patternNoDetection;
                            if (totalDetected + totalNoDetection > 0) {
                              return (
                                <>
                                  <span className="text-green-600">{fmt(totalDetected)}</span>
                                  {' / '}
                                  <span className="text-red-500">{fmt(totalNoDetection)}</span>
                                </>
                              );
                            }
                            return <span className="text-muted-foreground">—</span>;
                          })()}
                        </td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Total Strategy Evaluations <span className="text-xs text-muted-foreground">(since process start — in-memory, resets on PM2 restart)</span></td>
                        <td className="p-2 text-right">{fmt((ve as any).quantStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt((ve as any).patternStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right font-semibold">{fmt(ve.totalStrategyEvaluations)}</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">True Strategy Nulls <span className="text-xs text-muted-foreground">(since process start — no setup found, excludes post-signal rejections)</span></td>
                        <td className="p-2 text-right text-orange-500">{fmt(ve.quantStrategyNulls)}</td>
                        <td className="p-2 text-right text-orange-500">{fmt((ve as any).patternStrategyNulls ?? 0)}</td>
                        <td className="p-2 text-right font-semibold text-orange-500">{fmt(ve.quantStrategyNulls + ((ve as any).patternStrategyNulls ?? 0))}</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Signals Rejected (Net EV Below Floor) <span className="text-xs text-muted-foreground">(since process start — strategy fired but signal failed EV check)</span></td>
                        <td className="p-2 text-right text-red-500">{fmt((ve as any).quantSignalsRejected ?? 0)}</td>
                        <td className="p-2 text-right text-red-500">{fmt((ve as any).patternSignalsRejected ?? 0)}</td>
                        <td className="p-2 text-right font-semibold text-red-500">{fmt((ve as any).signalsRejected ?? 0)}</td>
                      </tr>
                      <tr className="bg-muted/30 font-semibold">
                        <td className="p-2">Trades Opened <span className="text-xs text-muted-foreground">(DB-backed, 24h rolling — scope differs from in-memory rows above)</span></td>
                        <td className="p-2 text-right text-green-600">{fmt((ve as any).quantTradesOpened ?? 0)}</td>
                        <td className="p-2 text-right text-green-600">{fmt((ve as any).patternTradesOpened ?? 0)}</td>
                        <td className="p-2 text-right font-semibold text-green-600">{fmt(((ve as any).quantTradesOpened ?? 0) + ((ve as any).patternTradesOpened ?? 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* By Strategy Breakdown */}
                {Object.keys(ve.byStrategy).length > 0 && (
                  <div className="overflow-x-auto">
                    <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/50">
                      By Strategy
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">Strategy</th>
                          <th className="text-right p-2 font-medium">Evaluated</th>
                          <th className="text-right p-2 font-medium">True Nulls</th>
                          <th className="text-right p-2 font-medium">Null %</th>
                          <th className="text-right p-2 font-medium">Signals</th>
                          <th className="text-right p-2 font-medium">Rejected</th>
                          <th className="text-right p-2 font-medium">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(ve.byStrategy)
                          .sort(([,a], [,b]) => b.evaluated - a.evaluated)
                          .map(([strategy, counts]) => (
                            <tr key={strategy} className="border-b hover:bg-muted/30">
                              <td className="p-2 font-mono text-xs">{strategy}</td>
                              <td className="p-2 text-right">{fmt(counts.evaluated)}</td>
                              <td className="p-2 text-right text-orange-500">{fmt(counts.nulls)}</td>
                              <td className="p-2 text-right text-muted-foreground">{counts.evaluated > 0 ? `${(counts.nulls / counts.evaluated * 100).toFixed(1)}%` : '—'}</td>
                              <td className="p-2 text-right text-blue-600">{fmt(counts.preRejectionSignals || 0)}</td>
                              <td className="p-2 text-right text-amber-600">{fmt(counts.rejected || 0)}</td>
                              <td className="p-2 text-right text-green-600">{fmt(counts.signals)}</td>
                            </tr>
                          ))
                        }
                        {/* Batch 22 HF4: Total row for by-strategy breakdown */}
                        {(() => {
                          const totals = Object.values(ve.byStrategy).reduce(
                            (acc, c: any) => ({
                              evaluated: acc.evaluated + c.evaluated,
                              nulls: acc.nulls + c.nulls,
                              preRejectionSignals: acc.preRejectionSignals + (c.preRejectionSignals || 0),
                              rejected: acc.rejected + (c.rejected || 0),
                              signals: acc.signals + c.signals
                            }),
                            { evaluated: 0, nulls: 0, preRejectionSignals: 0, rejected: 0, signals: 0 }
                          );
                          return (
                            <tr className="border-t-2 bg-muted/30 font-semibold">
                              <td className="p-2">TOTAL</td>
                              <td className="p-2 text-right">{fmt(totals.evaluated)}</td>
                              <td className="p-2 text-right text-orange-500">{fmt(totals.nulls)}</td>
                              <td className="p-2 text-right text-muted-foreground">{totals.evaluated > 0 ? `${(totals.nulls / totals.evaluated * 100).toFixed(1)}%` : '—'}</td>
                              <td className="p-2 text-right text-blue-600">{fmt(totals.preRejectionSignals)}</td>
                              <td className="p-2 text-right text-amber-600">{fmt(totals.rejected)}</td>
                              <td className="p-2 text-right text-green-600">{fmt(totals.signals)}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Batch 38: 3-Layer Null Reason Display */}
                {ve.nullReasons && (
                  <div className="overflow-x-auto">
                    {(() => {
                      const nr = ve.nullReasons as any;
                      const detail = (ve as any).nullReasonDetail as Record<string, number> | undefined;
                      const quantDetail = (ve as any).quantNullReasonDetail as Record<string, number> | undefined;
                      const patternDetail = (ve as any).patternNullReasonDetail as Record<string, number> | undefined;
                      const hasPoolDetail = !!(quantDetail && Object.keys(quantDetail).length > 0) || !!(patternDetail && Object.keys(patternDetail).length > 0);
                      const rejectedReasons = (ve as any).rejectedReasons as Record<string, number> | undefined;
                      const totalStratNulls = ve.quantStrategyNulls + ((ve as any).patternStrategyNulls ?? 0);
                      const totalEvals = ve.totalStrategyEvaluations || 1;
                      const quantEvals = (ve as any).quantStrategyEvaluations ?? 0;
                      const patternEvals = (ve as any).patternStrategyEvaluations ?? 0;
                      const pct = (n: number) => totalStratNulls > 0 ? Math.round(n / totalStratNulls * 100) : 0;
                      const poolFmt = (count: number, evals: number) => evals > 0 ? `${fmt(count)} / ${fmt(evals)}` : fmt(count);
                      const poolCell = (count: number, evals: number) => {
                        if (evals <= 0) return fmt(count);
                        const p = evals > 0 ? (count / evals * 100).toFixed(1) : '0.0';
                        return `${fmt(count)} / ${fmt(evals)} (${p}%)`;
                      };
                      const pctOfEvals = (n: number) => totalEvals > 0 ? Math.round(n / totalEvals * 100) : 0;
                      const reasonLabels: Record<string, string> = {
                        'unknown': 'Not Yet Instrumented',
                        'insufficient_data': 'Insufficient Price Data / Candles',
                        'no_pattern': 'No Pattern Detected',
                        'abcd_structure_not_found': 'ABCD Structure Not Found',
                        'weak_pattern': 'Pattern Too Weak (below strength threshold)',
                        'indicator_filter': 'Indicator Out of Range (RSI/ADX/momentum)',
                        'volume_insufficient': 'Volume Confirmation Failed',
                        'price_position': 'Price Not in Required Zone',
                        'guard_fail': 'ATR / Stop / R:R Guard Failed',
                        'range_not_found': 'No Valid Range / Support Level Found',
                        'correlation_fail': 'Correlation Check Failed',
                        'volatility_filter': 'Volatility Percentile Too Low',
                        'breakout_fail': 'No Breakout Detected',
                        'toxicity_high': 'High Toxicity (DHMA)',
                        'spread_wide': 'Spread Too Wide (DHMA)',
                        'regime_alignment': 'Regime Alignment Failed',
                      };
                      const groupDefs: { label: string; keys: string[] }[] = [
                        { label: 'A — Data & Setup', keys: ['insufficient_data', 'unknown'] },
                        { label: 'B — Pattern Detection', keys: ['no_pattern', 'abcd_structure_not_found', 'weak_pattern', 'breakout_fail'] },
                        { label: 'C — Indicator & Volatility', keys: ['indicator_filter', 'volatility_filter'] },
                        { label: 'D — Volume & Price', keys: ['volume_insufficient', 'price_position', 'range_not_found'] },
                        { label: 'E — Risk Guards', keys: ['guard_fail', 'correlation_fail'] },
                        { label: 'F — Regime & Spread', keys: ['regime_alignment', 'toxicity_high', 'spread_wide'] },
                      ];
                      const SectionHeader = ({ title, colorClass }: { title: string; colorClass: string }) => (
                        <div className={`border-l-4 pl-3 py-1.5 mx-2 my-1 ${colorClass}`}>
                          <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
                        </div>
                      );
                      return (
                        <>
                          {/* SECTION 1: Setup Nulls */}
                          <SectionHeader title="Setup Nulls (Strategy Evaluation)" colorClass="border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400" />
                          <table className="w-full text-sm mb-2">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left p-2 font-medium">Category</th>
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Quant (nulls / evals)</th>}
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Pattern (nulls / evals)</th>}
                                <th className="text-right p-2 font-medium">{hasPoolDetail ? 'Total' : 'Count'}</th>
                                <th className="text-right p-2 font-medium">% of Strategy Nulls</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b hover:bg-muted/30 font-medium">
                                <td className="p-2">Strategy Conditions Not Met</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolFmt(ve.quantStrategyNulls ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolFmt((ve as any).patternStrategyNulls ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.conditionsNotMet ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.conditionsNotMet ?? 0)}%</td>
                              </tr>
                              {detail && Object.keys(detail).length > 0 && groupDefs.map(group => {
                                const groupEntries = group.keys
                                  .map(k => ({ key: k, count: detail[k] ?? 0 }))
                                  .filter(e => e.count > 0);
                                if (groupEntries.length === 0) return null;
                                return (
                                  <React.Fragment key={group.label}>
                                    <tr className="bg-muted/10">
                                      <td colSpan={hasPoolDetail ? 5 : 3} className="p-1.5 pl-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</td>
                                    </tr>
                                    {groupEntries.map(({ key, count }) => (
                                      <tr key={key} className="border-b hover:bg-muted/20">
                                        <td className="p-2 pl-10 text-xs text-muted-foreground">↳ {reasonLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                                        {hasPoolDetail && <td className="p-2 text-right text-xs text-orange-400">{poolCell(quantDetail?.[key] ?? 0, quantEvals)}</td>}
                                        {hasPoolDetail && <td className="p-2 text-right text-xs text-orange-400">{poolCell(patternDetail?.[key] ?? 0, patternEvals)}</td>}
                                        <td className="p-2 text-right text-xs text-orange-400">{fmt(count)}</td>
                                        <td className="p-2 text-right text-xs text-muted-foreground">{pct(count)}%</td>
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                              <tr className="border-b hover:bg-muted/30 font-medium">
                                <td className="p-2">ADX Guard</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{fmt(nr.adxGuard ?? 0)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">—</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.adxGuard ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.adxGuard ?? 0)}%</td>
                              </tr>
                              {/* B-NEW-11 (2026-05-13): Section Total row — makes drift visible.
                                  Sums all displayed counts in this section + compares against
                                  totalStratNulls. >100% indicates a reason is being double-counted
                                  or a pre-eval skip leaked into the section; <100% indicates
                                  uncategorized nulls. */}
                              {(() => {
                                const sectionTotal =
                                  (nr.conditionsNotMet ?? 0) +
                                  (nr.adxGuard ?? 0) +
                                  groupDefs.flatMap(g => g.keys).reduce((s, k) => s + (detail?.[k] ?? 0), 0);
                                const sectionPct = totalStratNulls > 0 ? Math.round(sectionTotal / totalStratNulls * 100) : 0;
                                const driftWarn = sectionPct > 100 || (totalStratNulls > 0 && sectionPct < 95);
                                return (
                                  <tr className={`border-t-2 ${driftWarn ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20' : 'border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/10'} font-semibold`}>
                                    <td className="p-2">Section Total <span className="text-[10px] text-muted-foreground">(sum of all rows above)</span></td>
                                    {hasPoolDetail && <td className="p-2 text-right">—</td>}
                                    {hasPoolDetail && <td className="p-2 text-right">—</td>}
                                    <td className="p-2 text-right">{fmt(sectionTotal)}</td>
                                    <td className={`p-2 text-right ${driftWarn ? 'text-amber-600 dark:text-amber-400' : ''}`}>{sectionPct}%{driftWarn && <span className="ml-1 text-[10px]">⚠</span>}</td>
                                  </tr>
                                );
                              })()}
                            </tbody>
                          </table>

                          {/* SECTION 2: Pre-Evaluation Skips (pair skipped before strategy.detect() called) */}
                          <SectionHeader title="Pre-Evaluation Skips" colorClass="border-yellow-500 bg-yellow-50/40 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400" />
                          <table className="w-full text-sm mb-2">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left p-2 font-medium">Category</th>
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Quant (nulls / evals)</th>}
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Pattern (nulls / evals)</th>}
                                <th className="text-right p-2 font-medium">{hasPoolDetail ? 'Total' : 'Count'}</th>
                                <th className="text-right p-2 font-medium">% of Strategy Nulls</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Duplicate Position</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['duplicate_position'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['duplicate_position'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.duplicatePosition ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.duplicatePosition ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Max Open Trades</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['max_open_trades'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['max_open_trades'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.maxOpenTrades ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.maxOpenTrades ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Regime Has No Strategies</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['regime_no_strategies'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['regime_no_strategies'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.regimeNoStrategies ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.regimeNoStrategies ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Family Filter Mismatch</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['family_filter_mismatch'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['family_filter_mismatch'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.familyFilterMismatch ?? 0)}</td>
                                {/* B-NEW-12 (RUNNING_ISSUES #101): family_filter_mismatch is a
                                    pre-eval skip — fires BEFORE strategy.detect(), so it's not
                                    counted in totalStratNulls. Use the correct denominator
                                    emitted by the endpoint: familyMismatchDenominatorTotal =
                                    strategiesEvaluated (eligibility-pass) + family_filter_mismatch
                                    (eligibility-fail). Was showing 158%/177% before this fix. */}
                                <td className="p-2 text-right">{(() => {
                                  const denom = (ve as any).familyMismatchDenominatorTotal ?? 0;
                                  const num = nr.familyFilterMismatch ?? 0;
                                  return denom > 0 ? `${Math.round(num / denom * 100)}%` : '0%';
                                })()}</td>
                              </tr>
                              {/* B-DIAG-387 (#387) OBJ-2 (no-hidden-gates): the three pre-open
                                  gate reasons checkPreOpenGates can emit that previously rendered
                                  nowhere. Guarded `?? 0` so the shared panel renders 0 harmlessly
                                  for any class whose endpoint doesn't (yet) surface them. */}
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Re-entry Cooldown</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['reentry_cooldown'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['reentry_cooldown'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.reentryCooldown ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.reentryCooldown ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Price Past Stop (entry no longer viable)</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['price_past_stop'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['price_past_stop'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.pricePastStop ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.pricePastStop ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Price Past Target (entry no longer viable)</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['price_past_target'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['price_past_target'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.pricePastTarget ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.pricePastTarget ?? 0)}%</td>
                              </tr>
                            </tbody>
                          </table>

                          {/* SECTION 3: Post-Signal Rejections (signal WAS produced, then rejected) */}
                          <SectionHeader title="Post-Signal Rejections (strategy fired, trade blocked)" colorClass="border-red-500 bg-red-50/40 dark:bg-red-950/20 text-red-700 dark:text-red-400" />
                          <table className="w-full text-sm mb-2">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left p-2 font-medium">Category</th>
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Quant (nulls / evals)</th>}
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Pattern (nulls / evals)</th>}
                                <th className="text-right p-2 font-medium">{hasPoolDetail ? 'Total' : 'Count'}</th>
                                <th className="text-right p-2 font-medium">% of Evaluations</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Net EV Below Floor</td>
                                {hasPoolDetail && <td className="p-2 text-right text-red-500">{poolCell(quantDetail?.['net_ev_rejected'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-red-500">{poolCell(patternDetail?.['net_ev_rejected'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-red-500">{fmt(rejectedReasons?.netEvBelowFloor ?? 0)}</td>
                                <td className="p-2 text-right">{pctOfEvals(rejectedReasons?.netEvBelowFloor ?? 0)}%</td>
                              </tr>
                            </tbody>
                          </table>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="p-4 text-muted-foreground text-center">No VTS evaluation data yet — waiting for next VTS cycle</div>
          )}
        </CardContent>
      </Card>

      {/* Batch 50: Removed redundant "Signal Rejection Breakdown (24h)" section.
         Post-signal rejections are now shown in the VTS Evaluation Breakdown above
         with accurate counts from VTS counters. The old section used a separate
         logSkippedSignal tracker with conflicting numbers. */}
      {/* Batch 52: Cooldown Exclusions card REMOVED (Kyle directive 2026-04-06)
         PairFailureTracker cooldown was redundant — batch size fixed at ~300/cycle
         regardless. Adaptive ratio manager handles pair selection. */}

      {/* Batch 34: Metric Distribution — moved to bottom, redesigned with plain language */}
      {(data?.lastScan as any)?.metricDistribution && (
        <Card className="max-w-4xl">
          <CardHeader className="py-3">
            <CardTitle className="text-lg">Filter Metric Ranges (Last Scan — updates each 30s cycle)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Shows the spread of metric values across pairs that survived global filters. Helps assess whether thresholds are calibrated correctly — if the threshold sits in the middle of the range, it is actively filtering; if all values are well above/below the threshold, the filter is not doing meaningful work.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {(() => {
                const dist = (data?.lastScan as any).metricDistribution;
                const hasPools = dist?.quant && dist?.pattern;
                const sections = hasPools
                  ? [
                      { label: 'Quant Pool', data: dist.quant, pools: ['lq', 'di'] },
                      { label: 'Pattern Pool', data: dist.pattern, pools: ['lq', 'di'] },
                    ]
                  : [{ label: 'All Survivors', data: dist?.combined || dist, pools: ['lq', 'di', 'vn'] }];

                return sections.map((section) => (
                  <div key={section.label} className="mb-4">
                    <div className="px-2 py-1 bg-muted/30 font-medium text-sm">{section.label}</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Metric</th>
                          <th className="text-right p-2 font-medium">Lowest</th>
                          <th className="text-right p-2 font-medium">25th %ile</th>
                          <th className="text-right p-2 font-medium">Middle Value</th>
                          <th className="text-right p-2 font-medium">75th %ile</th>
                          <th className="text-right p-2 font-medium">Highest</th>
                          <th className="text-right p-2 font-medium">Pairs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.pools.map((key) => {
                          const d = section.data?.[key];
                          if (!d || d.count === 0) return null;
                          const labels: Record<string, string> = {
                            lq: 'Liquidity Quality (higher = more liquid)',
                            di: 'Directional Integrity (higher = stronger trend)',
                            vn: 'Volume Noise (lower = cleaner volume)',
                          };
                          return (
                            <tr key={key} className="border-b hover:bg-muted/30">
                              <td className="p-2 font-medium">{labels[key] || key}</td>
                              <td className="p-2 text-right">{d.min}</td>
                              <td className="p-2 text-right">{d.p25}</td>
                              <td className="p-2 text-right font-semibold">{d.median}</td>
                              <td className="p-2 text-right">{d.p75}</td>
                              <td className="p-2 text-right">{d.max}</td>
                              <td className="p-2 text-right text-muted-foreground">{d.count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}


// B63: DBS Pair Tracking — Kyle's quick-and-dirty diagnostic for high-DBS pair visibility.
// Two tables: last scan + rolling 24h. Shows total pairs, high-DBS pairs, strong_trend
// pool survivors, strong_bull_trend evaluations/nulls/signals/trades, null-reason breakdown.
function DbsPairTrackingPanel({ data, isLoading }: { data: FilterDiagnosticsData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <Card><CardContent className="p-6">Loading B63 DBS diagnostics…</CardContent></Card>;
  }
  if (!data) {
    return <Card><CardContent className="p-6 text-muted-foreground">No data available.</CardContent></Card>;
  }

  const lastDbs = data.lastScan?.b63Dbs;
  const rollingDbs = data.rolling24h?.b63Dbs;
  const lastScanPairs = data.lastScan?.totalPairsScanned ?? 0;
  const rolling24hPairs = data.rolling24h?.totalPairsScanned ?? 0;

  // Extract strong_bull_trend strategy stats from VTS evaluation counters
  const lastCycleEval = data.lastCycleVtsEval?.byStrategy?.strong_bull_trend;
  const rolling24hEval = data.vtsEvaluation?.byStrategy?.strong_bull_trend;

  // Per-strategy null reasons (B63 added these). Filter to strong_bull_trend.
  const lastNullReasons: Record<string, number> = data.lastCycleVtsEval?.byStrategyNullReasons?.strong_bull_trend ?? {};
  const rolling24hNullReasons: Record<string, number> = data.vtsEvaluation?.byStrategyNullReasons?.strong_bull_trend ?? {};

  const fmt = (v: number | undefined) => (v ?? 0).toLocaleString();
  const pct = (v: number | undefined, denom: number | undefined) => {
    if (!denom || denom <= 0) return '—';
    return `${(((v ?? 0) / denom) * 100).toFixed(1)}%`;
  };

  // Helper: render a strategy stat row as (count, % of evaluations)
  const renderStrategyRow = (label: string, value: number | undefined, denom: number | undefined, extra?: React.ReactNode) => (
    <tr className="border-b">
      <td className="p-2 text-xs text-muted-foreground">{label}</td>
      <td className="p-2 text-right font-mono">{fmt(value)}</td>
      <td className="p-2 text-right text-xs text-muted-foreground">{pct(value, denom)}</td>
      {extra !== undefined && <td className="p-2 text-xs text-muted-foreground">{extra}</td>}
    </tr>
  );

  const renderPanel = (title: string, dbs: B63DbsSnapshot | B63DbsAggregate | undefined, totalPairsScanned: number, evalStats: any, nullReasons: Record<string, number>, isAggregate: boolean) => {
    const classified = dbs?.totalClassified ?? 0;
    const strongDbs = dbs?.strongDbsPairs ?? 0;
    const strongPool = dbs?.strongTrendPoolPassed ?? 0;
    const nullTotal = Object.values(nullReasons).reduce((a, b) => a + b, 0);
    const evaluations = evalStats?.evaluated ?? 0;
    const nulls = evalStats?.nulls ?? 0;
    const preRej = evalStats?.preRejectionSignals ?? evalStats?.signals ?? 0;
    const trades = evalStats?.signals ?? 0;
    const rejected = evalStats?.rejected ?? 0;
    const symbols = (dbs as any)?.strongDbsSymbols ?? (dbs as any)?.uniqueStrongDbsSymbols ?? [];

    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="p-2 text-xs text-muted-foreground">Total pairs scanned</td>
                <td className="p-2 text-right font-mono">{fmt(totalPairsScanned)}</td>
                <td className="p-2 text-right text-xs text-muted-foreground">—</td>
                <td className="p-2 text-xs text-muted-foreground">Unique pair evaluations in window</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 text-xs text-muted-foreground">Pairs with OHLC for DBS compute</td>
                <td className="p-2 text-right font-mono">{fmt((dbs as any)?.preGlobalDbsComputed ?? 0)}</td>
                <td className="p-2 text-right text-xs text-muted-foreground">{pct((dbs as any)?.preGlobalDbsComputed ?? 0, totalPairsScanned)}</td>
                <td className="p-2 text-xs text-muted-foreground">OHLC cached — DBS computed on these only</td>
              </tr>
              <tr className="border-b bg-orange-500/10">
                <td className="p-2 text-xs font-semibold">High-DBS candidates PRE-global filter (DBS ≥ 0.35 positive)</td>
                <td className="p-2 text-right font-mono font-semibold">{fmt((dbs as any)?.preGlobalStrongDbs ?? 0)}</td>
                <td className="p-2 text-right text-xs font-semibold">{pct((dbs as any)?.preGlobalStrongDbs ?? 0, (dbs as any)?.preGlobalDbsComputed ?? 0)}</td>
                <td className="p-2 text-xs text-muted-foreground">TRUE high-DBS count — before any filter applied</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 text-xs text-muted-foreground">Classified survivors (post-global-filter)</td>
                <td className="p-2 text-right font-mono">{fmt(classified)}</td>
                <td className="p-2 text-right text-xs text-muted-foreground">{pct(classified, totalPairsScanned)}</td>
                <td className="p-2 text-xs text-muted-foreground">Survived global filters (standard or strong_trend profile)</td>
              </tr>
              <tr className="border-b bg-orange-500/5">
                <td className="p-2 text-xs font-semibold">High-DBS that passed global filter</td>
                <td className="p-2 text-right font-mono font-semibold">{fmt(strongDbs)}</td>
                <td className="p-2 text-right text-xs font-semibold">{pct(strongDbs, (dbs as any)?.preGlobalStrongDbs ?? 0)}</td>
                <td className="p-2 text-xs text-muted-foreground">Of PRE-global high-DBS, survived strong_trend globals</td>
              </tr>
              <tr className="border-b bg-green-500/5">
                <td className="p-2 text-xs font-semibold">Survived strong_trend IMF filter</td>
                <td className="p-2 text-right font-mono font-semibold">{fmt(strongPool)}</td>
                <td className="p-2 text-right text-xs font-semibold">{pct(strongPool, strongDbs)}</td>
                <td className="p-2 text-xs text-muted-foreground">Of post-global, survived LQ/VN/DI IMF checks</td>
              </tr>
              <tr className="border-b">
                <td colSpan={4} className="p-2 text-xs font-semibold text-muted-foreground bg-muted/30">Strong Bull Trend Strategy Activity</td>
              </tr>
              {renderStrategyRow("Strategy evaluations", evaluations, evaluations || 1, "byStrategy.strong_bull_trend.evaluated")}
              {renderStrategyRow("Nulls (returned null)", nulls, evaluations, `${evaluations - nulls} non-null outcomes`)}
              {renderStrategyRow("Signals generated (pre-rejection)", preRej, evaluations, "Detect returned a valid StrategySignal")}
              {renderStrategyRow("Rejected post-signal (NetEV, dup, etc.)", rejected, preRej, "Signals killed by post-detect gates")}
              {renderStrategyRow("Trades generated (actual opens)", trades, evaluations, "Signals that became open VTS trades")}
            </tbody>
          </table>

          {Object.keys(nullReasons).length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Null-reason breakdown (strong_bull_trend only)</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-2 text-left">Reason</th>
                    <th className="p-2 text-right">Count</th>
                    <th className="p-2 text-right">% of nulls</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(nullReasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <tr key={reason} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">{reason}</td>
                        <td className="p-2 text-right font-mono">{fmt(count)}</td>
                        <td className="p-2 text-right text-xs text-muted-foreground">{pct(count, nullTotal)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 text-xs text-muted-foreground italic">No null reasons recorded yet (waiting for per-strategy tracking to accumulate — requires PM2 restart after B63.2 deploy).</div>
          )}

          {symbols.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                {isAggregate ? 'Unique high-DBS symbols observed (24h)' : 'High-DBS symbols this scan'}
              </div>
              <div className="text-xs font-mono bg-muted/20 rounded p-2 max-h-32 overflow-auto">
                {symbols.slice(0, 50).join(', ')}
                {symbols.length > 50 && ` … +${symbols.length - 50} more`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">
        High-DBS pair tracking for B63 Path D (Strong Bull Trend). Shows routing exclusivity,
        strong_trend filter pool performance, strategy evaluation outcomes, and null-reason
        breakdown specific to strong_bull_trend.
      </div>
      {renderPanel("Last Scan Cycle", lastDbs, lastScanPairs, lastCycleEval, lastNullReasons, false)}
      {renderPanel("Rolling 24h", rollingDbs, rolling24hPairs, rolling24hEval, rolling24hNullReasons, true)}
    </div>
  );
}


export default function MachineLearningPage() {
  const [activeTab, setActiveTab] = useState("open");
  const queryClient = useQueryClient();

  // B79.0n.UD-HOTFIX (2026-05-21): fetch the server-side xStock name map once
  // and populate the client-side overlay used by getAssetName(). The bundled
  // XSTOCK_SPOT_REGISTRY in shared/asset-classes.ts is empty client-side
  // post-B79.0n.UNIVERSE-DISCOVERY (server-populated at boot). Refresh hourly
  // to pick up newly-discovered symbols from the daily 06:00 UTC cron.
  useQuery<{ ok: boolean; count: number; names: Record<string, string> }>({
    queryKey: ['/api/xstocks/asset-names'],
    queryFn: async () => {
      const data = await apiFetch('/api/xstocks/asset-names');
      if (data && data.names) setXstockNameOverlay(data.names);
      return data;
    },
    refetchInterval: 60 * 60 * 1000,  // 1 hour
    staleTime: 30 * 60 * 1000,
  });

  // B-NAMES (2026-06-15): fetch the server-backfilled CRYPTO name overlay and
  // populate the client-side overlay used by getAssetName(). The curated
  // CRYPTO_NAMES map still wins (map-first); this only fills symbols the map
  // misses or ticker-echoes (e.g. CHIP). Refresh hourly like the xStock overlay
  // to pick up names the 6-hourly server resolver sweep newly backfills.
  useQuery<{ ok: boolean; count: number; names: Record<string, string> }>({
    queryKey: ['/api/crypto/asset-names'],
    queryFn: async () => {
      const data = await apiFetch('/api/crypto/asset-names');
      if (data && data.names) setCryptoNameOverlay(data.names);
      return data;
    },
    refetchInterval: 60 * 60 * 1000,  // 1 hour
    staleTime: 30 * 60 * 1000,
  });

  const { data: openData, isLoading: openLoading, refetch: refetchOpen } = useQuery<{
    success: boolean;
    count: number;
    trades: OpenTrade[];
  }>({
    queryKey: ['/api/vts/ml/open'],
    queryFn: () => apiFetch('/api/vts/ml/open'),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: closedData, isLoading: closedLoading, refetch: refetchClosed } = useQuery<{
    success: boolean;
    count: number;
    days: number;
    trades: ClosedTrade[];
  }>({
    queryKey: ['/api/vts/ml/closed'],
    queryFn: () => apiFetch('/api/vts/ml/closed?days=7'),
    refetchInterval: 300000,
    staleTime: 60000,
  });

  const { data: adjustmentsData, isLoading: adjustmentsLoading, refetch: refetchAdjustments } = useQuery<{
    ok: boolean;
    count: number;
    adjustments: PredictiveAdjustment[];
  }>({
    queryKey: ['/api/vts/predictive-adjustments'],
    queryFn: () => apiFetch('/api/vts/predictive-adjustments?limit=100'),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: summaryData } = useQuery<{
    ok: boolean;
    summary: AdjustmentSummary;
  }>({
    queryKey: ['/api/vts/predictive-adjustments/summary'],
    queryFn: () => apiFetch('/api/vts/predictive-adjustments/summary?days=7'),
    refetchInterval: 300000,
    staleTime: 120000,
  });

  const { data: currentData } = useQuery<{
    ok: boolean;
    values: CurrentValues;
  }>({
    queryKey: ['/api/vts/predictive-adjustments/current'],
    queryFn: () => apiFetch('/api/vts/predictive-adjustments/current'),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: archiveData, isLoading: archiveLoading, refetch: refetchArchive } = useQuery<{
    ok: boolean;
    records: RegimeArchiveRecord[];
  }>({
    queryKey: ['/api/vts/regime-archive'],
    queryFn: () => apiFetch('/api/vts/regime-archive?limit=100'),
    refetchInterval: 300000,
    staleTime: 120000,
  });

  const { data: archiveSummaryData } = useQuery<{
    ok: boolean;
    summary: ArchiveSummary;
  }>({
    queryKey: ['/api/vts/regime-archive/summary'],
    queryFn: () => apiFetch('/api/vts/regime-archive/summary'),
    refetchInterval: 300000,
    staleTime: 120000,
  });

  const { data: manifestData } = useQuery<{
    ok: boolean;
    manifest: ManifestEntry[];
  }>({
    queryKey: ['/api/vts/regime-archive/manifest'],
    queryFn: () => apiFetch('/api/vts/regime-archive/manifest'),
    refetchInterval: 300000,
    staleTime: 120000,
  });

  // Batch 19H: Filter Pipeline Diagnostics (19I: faster refresh for Last Scan)
  const { data: diagnosticsData, isLoading: diagnosticsLoading } = useQuery<FilterDiagnosticsData>({
    queryKey: ['/api/vts/filter-diagnostics'],
    queryFn: () => apiFetch('/api/vts/filter-diagnostics'),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const handleTriggerArchive = async () => {
    try {
      const token = await ensureValidToken();
      const response = await fetch('/api/vts/regime-archive/trigger', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (response.ok) {
        refetchArchive();
      } else {
        const errorText = await response.text();
        console.error('[Archive] HTTP Error:', response.status, errorText);
      }
    } catch (error) {
      console.error('[Archive] Error:', error);
    }
  };

  const handleExportOpen = async () => {
    try {
      const token = await ensureValidToken();
      const response = await fetch('/api/vts/ml/open/export', {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vts_open_trades_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleExportClosed = async () => {
    try {
      const token = await ensureValidToken();
      const response = await fetch('/api/vts/ml/closed/export?days=7', {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vts_closed_trades_7d_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleExportAdjustments = async () => {
    try {
      const token = await ensureValidToken();
      const response = await fetch('/api/vts/predictive-adjustments/export', {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `predictive_adjustments_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const openTrades = openData?.trades || [];
  const closedTrades = closedData?.trades || [];
  const adjustments = adjustmentsData?.adjustments || [];
  const archiveRecords = archiveData?.records || [];
  const archiveSummary = archiveSummaryData?.summary || null;
  const archiveManifest = manifestData?.manifest || [];

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Machine Learning</h1>
            <p className="text-muted-foreground">VTS Trade Data for ML Pipeline</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          {/* B-NEW-14-UI (2026-05-14, Kyle directive): tab strip wraps onto
              multiple lines when the viewport is narrower than the natural
              tab-row width. Default shadcn TabsList uses a fixed `h-10` +
              `inline-flex` (no wrap), which left the last few tabs running
              off-screen on half-width windows. `flex-wrap h-auto` allows
              wrapping; the strip still renders as a single row at full width. */}
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="open" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Open Trades
              <Badge variant="secondary" className="ml-1">{openTrades.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="closed" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Closed Trades (7d)
              <Badge variant="secondary" className="ml-1">{closedTrades.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="adjustments" className="flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Predictive Adjustments
              <Badge variant="secondary" className="ml-1">{adjustments.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="archive" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Regime Archive
              <Badge variant="secondary" className="ml-1">{archiveRecords.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter Diagnostics
            </TabsTrigger>
            <TabsTrigger value="dbs-tracking" className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              DBS Pair Tracking
            </TabsTrigger>
            {/* B79.0i.a: xStocks observation tab (last per Langston Q7) */}
            <TabsTrigger value="xstocks" className="flex items-center gap-2" data-testid="tab-xstocks">
              <LineChart className="w-4 h-4" />
              xStocks Filter Diagnostics
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {activeTab === 'open' && (
              <>
                <Button variant="outline" size="sm" onClick={() => refetchOpen()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportOpen}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </>
            )}
            {activeTab === 'closed' && (
              <>
                <Button variant="outline" size="sm" onClick={() => refetchClosed()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportClosed}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </>
            )}
            {activeTab === 'adjustments' && (
              <>
                <Button variant="outline" size="sm" onClick={() => refetchAdjustments()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportAdjustments}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </>
            )}
            {activeTab === 'archive' && (
              <Button variant="outline" size="sm" onClick={() => refetchArchive()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="open">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Open Simulated Trades</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Auto-refresh: 60s | Max: 300 trades
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {openLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <OpenTradesTable trades={openTrades} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Closed Simulated Trades (Last 7 Days)</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Auto-refresh: 5 min
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {closedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ClosedTradesTable trades={closedTrades} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <PredictiveAdjustmentsPanel 
            adjustments={adjustments}
            summary={summaryData?.summary || null}
            currentValues={currentData?.values || null}
            isLoading={adjustmentsLoading}
          />
        </TabsContent>

        <TabsContent value="archive">
          <RegimeArchivePanel
            records={archiveRecords}
            summary={archiveSummary}
            manifest={archiveManifest}
            isLoading={archiveLoading}
            onTriggerArchive={handleTriggerArchive}
          />
        </TabsContent>

        <TabsContent value="diagnostics">
          <FilterDiagnosticsPanel
            data={diagnosticsData}
            isLoading={diagnosticsLoading}
          />
        </TabsContent>

        <TabsContent value="dbs-tracking">
          <DbsPairTrackingPanel
            data={diagnosticsData}
            isLoading={diagnosticsLoading}
          />
        </TabsContent>

        {/* B79.0i.a: xStocks observation tab content. All 5 panels stack in this single component. */}
        <TabsContent value="xstocks">
          <XstocksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
