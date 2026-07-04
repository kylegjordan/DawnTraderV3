import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAssetName, setXstockNameOverlay, setCryptoNameOverlay } from "@shared/asset-names";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, Download, Clock, Target, AlertTriangle, Sliders, Activity, Filter, LineChart } from "lucide-react";
// B79.0i.a: dedicated xStocks observation tab
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { apiFetch } from "@/lib/api";
import { ensureValidToken } from "@/lib/auth";
import { format } from "date-fns";
// P19-B8.1 (C1): VTS trade tables + filter-diagnostics panel + shared types/helpers extracted
// to client/src/components/vts/ (pure extraction, zero behavior change).
import { OpenTradesTable } from "@/components/vts/vts-open-trades-table";
import { ClosedTradesTable } from "@/components/vts/vts-closed-trades-table";
import { FilterDiagnosticsPanel } from "@/components/vts/vts-filter-diagnostics-panel";
import {
  type OpenTrade,
  type ClosedTrade,
  type FilterDiagnosticsData,
  type B63DbsSnapshot,
  type B63DbsAggregate,
  getRegimeBadgeColor,
  normalizeRegimeDisplay,
} from "@/components/vts/vts-shared";

type AdjustmentType =
  | "lifecycle"
  | "model_calibration"
  | "weight_adjustment"
  | "risk_adjustment"
  | "filter_adjustment";

type Reversibility = "automatic" | "manual" | "irreversible";

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
