import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, TrendingUp, Target, Clock } from "lucide-react";

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

export default function LottieTuningTab() {
  const { data, isLoading, isError, error } = useQuery<LATTIMetrics>({
    queryKey: ['/api/system/latti-tuning'],
    refetchInterval: 30000, // Update every 30 seconds
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
            className="px-3 py-1.5 text-xs bg-sky-600 dark:bg-sky-700 text-white rounded-md font-medium"
            data-testid="badge-passive-learning"
          >
            🔍 Observation Mode Active
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
