import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, TrendingUp, Target, Clock, Brain } from "lucide-react";

interface LATTIMetrics {
  lastRun: string;
  tuningCycle: number;
  adjustments: Record<string, number>;
  confidence: number;
  stabilityScore: number;
  passiveLearning: boolean;
  telemetry?: {
    entries: number;
    exits: number;
    hitRate: number;
    avgPLPerTrade: number;
  };
}

interface LearningInsight {
  metric: string;
  correlation: number;
  insight: string;
}

interface LATTIInsights {
  timestamp: string;
  mode: string;
  passiveLearning: boolean;
  topInsights: LearningInsight[];
  simulatedAdjustments: {
    deltaAlpha: number;
    deltaBeta: number;
    expectedPLChange: number;
  };
}

interface CrossStrategyCorrelation {
  strategy: string;
  correlation: number;
  insight: string;
}

interface CrossStrategyData {
  summary: {
    bestStrategy: string;
    weakestStrategy: string;
    timestamp: string;
  };
  correlations: CrossStrategyCorrelation[];
}

export default function LottieTuningTab() {
  const { data, isLoading, isError, error } = useQuery<LATTIMetrics>({
    queryKey: ['/api/system/latti-tuning'],
    refetchInterval: 30000, // Update every 30 seconds
  });

  // Phase 31.K - Fetch Learning Insights
  const { data: insights } = useQuery<LATTIInsights>({
    queryKey: ['/api/system/latti-insights'],
    refetchInterval: 60000, // Update every 60 seconds
  });

  // Phase 31.L - Fetch Cross-Strategy Learning Correlations
  const { data: crossData } = useQuery<CrossStrategyData>({
    queryKey: ['/api/system/latti-cross-strategy'],
    refetchInterval: 90000, // Update every 90 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading Lottie tuning metrics...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">
          Failed to load tuning metrics: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">No tuning data available</div>
      </div>
    );
  }

  // Prepare chart data from adjustments
  const chartData = Object.entries(data.adjustments || {}).map(([key, value]) => ({
    name: key.replace('dhma.', ''),
    value: typeof value === 'number' ? value : 0,
  }));

  // Format last run time
  const lastRunDate = new Date(data.lastRun);
  const formattedLastRun = lastRunDate.toLocaleString();

  return (
    <div className="space-y-4" data-testid="lottie-tuning-tab">
      {/* Header with Mode Badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Lottie Tuning Overview</h2>
        {data.passiveLearning && (
          <div 
            className="px-3 py-1.5 text-xs bg-sky-600 dark:bg-sky-700 text-white rounded-md font-medium flex flex-col items-center gap-1"
            data-testid="badge-passive-learning"
          >
            <span>🔍 Observation Mode Active</span>
            <span className="text-xs text-sky-100 dark:text-sky-200 italic font-normal">
              Lottie is observing real-time data and testing parameter hypotheses internally.
            </span>
          </div>
        )}
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Last Run Card */}
        <Card data-testid="card-last-run">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-500" />
              Last Run
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-last-run">
              {formattedLastRun}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cycle: {data.tuningCycle} min
            </p>
          </CardContent>
        </Card>

        {/* Confidence Card */}
        <Card data-testid="card-confidence">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-confidence">
              {(data.confidence * 100).toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tuning confidence score
            </p>
          </CardContent>
        </Card>

        {/* Stability Score Card */}
        <Card data-testid="card-stability">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              Stability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stability">
              {(data.stabilityScore * 100).toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Parameter stability
            </p>
          </CardContent>
        </Card>

        {/* Telemetry Summary Card */}
        {data.telemetry && (
          <Card data-testid="card-telemetry">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-hit-rate">
                {(data.telemetry.hitRate * 100).toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Hit rate ({data.telemetry.exits} trades)
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Adjustments Chart */}
      {chartData.length > 0 ? (
        <Card data-testid="card-adjustments-chart">
          <CardHeader>
            <CardTitle>Recent Parameter Adjustments</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  className="text-xs"
                />
                <YAxis 
                  domain={[-0.05, 0.05]} 
                  className="text-xs"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))' 
                  }}
                  formatter={(value: number) => value.toFixed(4)}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#0ea5e9" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  data-testid="chart-line-adjustments"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="card-no-adjustments">
          <CardHeader>
            <CardTitle>Recent Parameter Adjustments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              No parameter adjustments in recent cycles
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 31.K - Learning Insights Panel */}
      <Card data-testid="card-learning-insights">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Learning Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insights ? (
            <div className="space-y-4">
              {/* Top Insights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {insights.topInsights.map((insight, idx) => (
                  <div 
                    key={idx} 
                    className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                    data-testid={`insight-card-${idx}`}
                  >
                    <p className="text-sm font-semibold text-foreground mb-2">
                      {insight.metric}
                    </p>
                    <p className="text-xs text-muted-foreground italic mb-3 min-h-[3rem]">
                      {insight.insight}
                    </p>
                    <p className="text-sm font-bold" data-testid={`insight-correlation-${idx}`}>
                      <span className={insight.correlation > 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400"}>
                        Correlation: {(insight.correlation * 100).toFixed(0)}%
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              {/* Simulated Adjustments */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <h3 className="text-sm font-semibold mb-2 text-foreground">
                  Simulated Adjustments
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div data-testid="text-delta-alpha">
                    <span className="text-muted-foreground">Δα:</span>{" "}
                    <span className="font-mono font-bold text-foreground">
                      {insights.simulatedAdjustments.deltaAlpha.toFixed(3)}
                    </span>
                  </div>
                  <div data-testid="text-delta-beta">
                    <span className="text-muted-foreground">Δβ:</span>{" "}
                    <span className="font-mono font-bold text-foreground">
                      {insights.simulatedAdjustments.deltaBeta.toFixed(3)}
                    </span>
                  </div>
                  <div data-testid="text-expected-pl">
                    <span className="text-muted-foreground">Expected P&L Impact:</span>{" "}
                    <span className={`font-mono font-bold ${
                      insights.simulatedAdjustments.expectedPLChange > 0 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {(insights.simulatedAdjustments.expectedPLChange * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground italic">
              Collecting insights...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 31.L - Cross-Strategy Learning Panel */}
      <Card data-testid="card-cross-strategy">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Cross-Strategy Learning
          </CardTitle>
        </CardHeader>
        <CardContent>
          {crossData ? (
            <>
              <p className="text-sm text-muted-foreground mb-4" data-testid="text-strategy-summary">
                Best Strategy: <strong className="text-emerald-600 dark:text-emerald-400">{crossData.summary.bestStrategy}</strong> | 
                Weakest: <strong className="text-amber-600 dark:text-amber-400">{crossData.summary.weakestStrategy}</strong>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {crossData.correlations.map((s, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
                    data-testid={`strategy-card-${idx}`}
                  >
                    <p className="font-semibold text-sm text-foreground mb-1" data-testid={`strategy-name-${idx}`}>
                      {s.strategy}
                    </p>
                    <p className="text-xs italic text-muted-foreground mb-2 min-h-[2.5rem]">
                      {s.insight}
                    </p>
                    <p 
                      className={`text-sm font-bold ${s.correlation > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                      data-testid={`strategy-correlation-${idx}`}
                    >
                      Corr: {(s.correlation * 100).toFixed(0)}%
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground italic">
              Gathering cross-strategy learning data...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telemetry Details */}
      {data.telemetry && (
        <Card data-testid="card-telemetry-details">
          <CardHeader>
            <CardTitle>Strategy Telemetry (DHMA - 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Entries</p>
                <p className="text-xl font-bold" data-testid="text-telemetry-entries">
                  {data.telemetry.entries}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Closed Trades</p>
                <p className="text-xl font-bold" data-testid="text-telemetry-exits">
                  {data.telemetry.exits}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hit Rate</p>
                <p className="text-xl font-bold" data-testid="text-telemetry-hitrate">
                  {(data.telemetry.hitRate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg P&L / Trade</p>
                <p className="text-xl font-bold" data-testid="text-telemetry-avgpl">
                  ${data.telemetry.avgPLPerTrade.toFixed(4)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer Info */}
      <div className="text-sm text-muted-foreground italic text-center" data-testid="text-mode-indicator">
        {data.passiveLearning 
          ? "🔍 Passive Learning: Parameters are being observed but not automatically applied" 
          : "⚡ Live Adaptive Mode: Parameters are automatically tuned based on performance"}
      </div>
    </div>
  );
}
