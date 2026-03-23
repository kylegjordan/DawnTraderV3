import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, Download, TrendingUp, TrendingDown, Clock, Target, AlertTriangle, Sliders, Activity, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ensureValidToken } from "@/lib/auth";
import { format } from "date-fns";
import { getFrictionLabel } from "@/utils/frictionColor";

interface OpenTrade {
  symbol: string;
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
}

interface ClosedTrade {
  symbol: string;
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
    imf: { failedLQ: number; failedVN: number; passed: number; total: number; benchmarkBypassed: number };
    survivors: number;
  };
  pattern: {
    global: Record<string, number> | null;
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number } | null;
    survivors: number;
  };
  destination: string;
  destinationCount: number;
}

interface FilterDiagnosticsData {
  ok: boolean;
  lastScan: ScanDiagnostics | null;
  rolling24h: {
    totalScans: number;
    totalPairsScanned: number;
    uniquePairsScanned: number;
    aggregated: {
      quant: ScanDiagnostics['quant'];
      pattern: ScanDiagnostics['pattern'];
    };
  };
  signalRejections: {
    total: number;
    byReason: Record<string, number>;
    byRegime: Record<string, number>;
  };
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
  const sp = sourcePool?.toUpperCase() ?? 'QUANT';
  if (sp === 'QUANT') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (sp === 'PATTERN') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (sp === 'HYBRID') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

const getResultBadgeColor = (result: string) => {
  if (result.includes('TARGET') || result.includes('PROFIT')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (result.includes('STOP')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
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

type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
type SortDirection = 'asc' | 'desc';

function SortableHeader({ 
  label, 
  field, 
  currentSort, 
  direction, 
  onSort, 
  align = 'left' 
}: { 
  label: string; 
  field: string; 
  currentSort: string | null; 
  direction: SortDirection; 
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const isActive = currentSort === field;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  
  return (
    <th 
      className={`px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none`}
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
        className="overflow-x-auto scrollbar-thin"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <table className="w-full min-w-[2400px] text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <SortableHeader label="Symbol" field="symbol" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Regime" field="regime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Strategy" field="strategy" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <SortableHeader label="Pool" field="pool" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
              <SortableHeader label="$ Value / Qty" field="dollarValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Entry/Current" field="entryPrice" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dist. T/S</th>
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
              <SortableHeader label="Entry Time" field="entryTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Duration" field="durationOpenMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={23} className="px-3 py-8 text-center text-muted-foreground">
                  No open simulated trades
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.entryTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{trade.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                      {normalizeRegimeDisplay(trade.regime)}
                    </Badge>
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
                    <Badge variant="outline" className={`text-xs ${getSourcePoolBadgeColor(trade.sourcePool ?? 'quant')}`}>
                      {(trade.sourcePool ?? 'quant').toUpperCase()}
                    </Badge>
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
                  <td className="px-3 py-2 text-xs">{trade.pairDirectionalBias || '\u2014'}</td>
                  <td className="px-3 py-2 text-xs">{trade.globalDirectionalBias || '\u2014'}</td>
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
        className="overflow-x-auto scrollbar-thin"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <table className="w-full min-w-[2400px] text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <SortableHeader label="Symbol" field="symbol" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Regime" field="regime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Strategy" field="strategy" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <SortableHeader label="Pool" field="pool" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
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
                <td colSpan={23} className="px-3 py-8 text-center text-muted-foreground">
                  No closed trades in the last 7 days
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.exitTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{trade.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                      {normalizeRegimeDisplay(trade.regime)}
                    </Badge>
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
                    <Badge variant="outline" className={`text-xs ${getSourcePoolBadgeColor(trade.sourcePool ?? 'quant')}`}>
                      {(trade.sourcePool ?? 'quant').toUpperCase()}
                    </Badge>
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
                    <Badge variant="outline" className={`text-xs ${getResultBadgeColor(trade.resultType)}`}>
                      {trade.resultType.includes('TARGET') ? (
                        <TrendingUp className="w-3 h-3 mr-1 inline" />
                      ) : trade.resultType.includes('STOP') ? (
                        <TrendingDown className="w-3 h-3 mr-1 inline" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 mr-1 inline" />
                      )}
                      {trade.resultType.replace(/_/g, ' ')}
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
                  <td className="px-3 py-2 text-xs">{trade.pairDirectionalBias || '\u2014'}</td>
                  <td className="px-3 py-2 text-xs">{trade.globalDirectionalBias || '\u2014'}</td>
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
function FilterDiagnosticsPanel({ data, isLoading }: { data: FilterDiagnosticsData | undefined; isLoading: boolean }) {
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

  const { lastScan, rolling24h, signalRejections } = data;

  const formatFilterName = (key: string): string => {
    const names: Record<string, string> = {
      failed_min_volume: 'Min Volume',
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

  const formatReasonName = (reason: string): string => {
    return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Batch 19I: Format numbers with comma separators
  const fmt = (n: number | undefined | null): string => {
    if (n === undefined || n === null) return '—';
    return n.toLocaleString();
  };

  return (
    <div className="space-y-4 max-w-4xl">
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
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastScan.quant.global).map(([key, value]) => (
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
                    </tr>
                  ))}
                  {/* IMF Section Header */}
                  <tr className="border-b bg-muted/50">
                    <td colSpan={3} className="p-2 font-medium text-xs uppercase tracking-wider">IMF Metrics (Post-Global)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed LQ</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedLQ, lastScan.quant.imf.total)}`}>{fmt(lastScan.quant.imf.failedLQ)}</td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedLQ, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedLQ) : '—'}
                    </td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed VN</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedVN, lastScan.quant.imf.total)}`}>{fmt(lastScan.quant.imf.failedVN)}</td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedVN, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedVN) : '—'}
                    </td>
                  </tr>
                  {lastScan.pattern.imf && (
                    <tr className="border-b hover:bg-muted/30">
                      <td className="p-2">Failed DI</td>
                      <td className="p-2 text-right text-muted-foreground">—</td>
                      <td className={`p-2 text-right ${getRejectionColor(lastScan.pattern.imf.failedDI, lastScan.pattern.imf.total)}`}>
                        {fmt(lastScan.pattern.imf.failedDI)}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Benchmark Bypassed</td>
                    <td className="p-2 text-right text-blue-500">{fmt(lastScan.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">IMF Passed</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.imf.passed)}</td>
                    <td className="p-2 text-right text-green-600">{lastScan.pattern.imf ? fmt(lastScan.pattern.imf.passed) : '—'}</td>
                  </tr>
                  {/* Summary Row */}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-2">Final Survivors</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.pattern.survivors)}</td>
                  </tr>
                  <tr className="bg-muted/50 font-semibold">
                    <td className="p-2">Destination: {lastScan.destination === 'active_pool' ? 'Active Pool' : 'VTS Batch'}</td>
                    <td colSpan={2} className="p-2 text-right text-primary">{fmt(lastScan.destinationCount)} pairs total</td>
                  </tr>
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
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rolling24h.aggregated.quant.global).map(([key, value]) => (
                    <tr key={key} className="border-b hover:bg-muted/30">
                      <td className="p-2">{formatFilterName(key)}</td>
                      <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor(value as number, rolling24h.totalPairsScanned)}`}>
                        {fmt(value as number)}
                      </td>
                      <td className={`p-2 text-right ${rolling24h.aggregated.pattern.global && key in rolling24h.aggregated.pattern.global ? (key === 'passed_all_filters' ? 'text-green-600 font-semibold' : '') : 'text-muted-foreground'}`}>
                        {rolling24h.aggregated.pattern.global && key in (rolling24h.aggregated.pattern.global as Record<string, number>)
                          ? fmt((rolling24h.aggregated.pattern.global as Record<string, number>)[key])
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b bg-muted/50">
                    <td colSpan={3} className="p-2 font-medium text-xs uppercase tracking-wider">IMF Metrics (24h Totals)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed LQ</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedLQ)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedLQ) : '—'}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed VN</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedVN)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedVN) : '—'}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed DI</td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedDI) : '—'}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Benchmark Bypassed</td>
                    <td className="p-2 text-right text-blue-500">{fmt(rolling24h.aggregated.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                  </tr>
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-2">Total Survivors (24h)</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.quant.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.pattern.survivors)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-muted-foreground text-center">No 24h data accumulated yet</div>
          )}
        </CardContent>
      </Card>

      {/* TABLE 3: Signal Rejection Breakdown */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Signal Rejection Breakdown (24h)</span>
            <span className="text-sm font-normal text-muted-foreground">
              {fmt(signalRejections.total)} total rejections
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {signalRejections.total > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {/* By Reason */}
              <div>
                <h4 className="text-sm font-medium mb-2">By Rejection Reason</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Reason</th>
                      <th className="text-right p-2 font-medium">Count</th>
                      <th className="text-right p-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(signalRejections.byReason)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([reason, count]) => (
                        <tr key={reason} className="border-b hover:bg-muted/30">
                          <td className="p-2">{formatReasonName(reason)}</td>
                          <td className="p-2 text-right">{fmt(count as number)}</td>
                          <td className="p-2 text-right text-muted-foreground">
                            {signalRejections.total > 0 ? ((count as number) / signalRejections.total * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {/* By Regime */}
              <div>
                <h4 className="text-sm font-medium mb-2">By Market Regime</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Regime</th>
                      <th className="text-right p-2 font-medium">Count</th>
                      <th className="text-right p-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(signalRejections.byRegime)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([regime, count]) => (
                        <tr key={regime} className="border-b hover:bg-muted/30">
                          <td className="p-2">{regime}</td>
                          <td className="p-2 text-right">{fmt(count as number)}</td>
                          <td className="p-2 text-right text-muted-foreground">
                            {signalRejections.total > 0 ? ((count as number) / signalRejections.total * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-4 text-muted-foreground text-center">No signal rejections in the last 24 hours</div>
          )}
        </CardContent>
      </Card>

      {/* TABLE 4: VTS Evaluation Breakdown (Batch 19I) */}
      <Card className="max-w-4xl">
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>VTS Evaluation Breakdown</span>
            <span className="text-sm font-normal text-muted-foreground">
              {data?.vtsEvaluation ? '24-Hour Rolling' : 'No VTS data yet'}
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
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Pairs Evaluated</td>
                        <td className="p-2 text-right">{fmt(ve.quantPairsEvaluated)}</td>
                        <td className="p-2 text-right">{fmt(ve.patternPairsEvaluated)}</td>
                        <td className="p-2 text-right font-semibold">{fmt(ve.quantPairsEvaluated + ve.patternPairsEvaluated)}</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Pattern Detection</td>
                        <td className="p-2 text-right text-muted-foreground">—</td>
                        <td className="p-2 text-right">
                          <span className="text-green-600">{fmt(ve.patternDetected)}</span>
                          {' / '}
                          <span className="text-red-500">{fmt(ve.patternNoDetection)}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({ve.patternPairsEvaluated > 0 ? Math.round(ve.patternDetected / ve.patternPairsEvaluated * 100) : 0}% hit)
                          </span>
                        </td>
                        <td className="p-2 text-right text-muted-foreground">—</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Strategy Returned Null</td>
                        <td className="p-2 text-right text-orange-500">{fmt(ve.quantStrategyNulls)}</td>
                        <td className="p-2 text-right text-muted-foreground">—</td>
                        <td className="p-2 text-right text-orange-500">{fmt(ve.quantStrategyNulls)}</td>
                      </tr>
                      {ve.totalStrategyEvaluations > 0 && (
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2">Total Strategy Evaluations</td>
                          <td colSpan={2} className="p-2 text-right">{fmt(ve.totalStrategyEvaluations)}</td>
                          <td className="p-2 text-right font-semibold">{fmt(ve.totalStrategyEvaluations)}</td>
                        </tr>
                      )}
                      <tr className="bg-muted/30 font-semibold">
                        <td className="p-2">Signals Generated</td>
                        <td colSpan={2} className="p-2 text-right text-green-600">{fmt(ve.signalsGenerated)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(ve.signalsGenerated)}</td>
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
                          <th className="text-right p-2 font-medium">Nulls</th>
                          <th className="text-right p-2 font-medium">Signals</th>
                          <th className="text-right p-2 font-medium">Hit Rate</th>
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
                              <td className="p-2 text-right text-green-600">{fmt(counts.signals)}</td>
                              <td className="p-2 text-right">
                                {counts.evaluated > 0 ? `${Math.round(counts.signals / counts.evaluated * 100)}%` : '—'}
                              </td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Batch 21: Null Reason Breakdown */}
                {ve.nullReasons && Object.values(ve.nullReasons).some((v: number) => v > 0) && (
                  <div className="overflow-x-auto">
                    <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/50">
                      Null Reason Breakdown (24h)
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">Reason</th>
                          <th className="text-right p-2 font-medium">Count</th>
                          <th className="text-right p-2 font-medium">% of Nulls</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'conditionsNotMet', label: 'Strategy Conditions Not Met' },
                          { key: 'netEvBelowFloor', label: 'Net EV Below Floor' },
                          { key: 'adxGuard', label: 'ADX Guard (< 25)' },
                          { key: 'duplicatePosition', label: 'Duplicate Position' },
                          { key: 'maxOpenTrades', label: 'Max Open Trades' },
                          { key: 'regimeNoStrategies', label: 'No Strategies for Regime' },
                        ].filter(r => (ve.nullReasons as any)[r.key] > 0)
                          .sort((a, b) => (ve.nullReasons as any)[b.key] - (ve.nullReasons as any)[a.key])
                          .map(r => {
                            const count = (ve.nullReasons as any)[r.key] as number;
                            const totalNulls = ve.quantStrategyNulls || 1;
                            return (
                              <tr key={r.key} className="border-b hover:bg-muted/30">
                                <td className="p-2">{r.label}</td>
                                <td className="p-2 text-right text-orange-500">{fmt(count)}</td>
                                <td className="p-2 text-right">{Math.round(count / totalNulls * 100)}%</td>
                              </tr>
                            );
                          })
                        }
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="p-4 text-muted-foreground text-center">No VTS evaluation data yet — waiting for next VTS cycle</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


export default function MachineLearningPage() {
  const [activeTab, setActiveTab] = useState("open");
  const queryClient = useQueryClient();

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
          <TabsList>
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
      </Tabs>
    </div>
  );
}
