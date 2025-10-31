import { useState, memo, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, XCircle, Loader2, TrendingUp, AlertTriangle } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useThrottleData } from "@/hooks/use-throttle-data";

interface OverrideFrequencyData {
  hour: string;
  paperCount: number;
  liveCount: number;
  totalCount: number;
}

interface AnomalyDetectionResult {
  timestamp: string;
  anomalyType: 'frequency_spike' | 'value_reversion';
  severity: 'warn' | 'critical';
  description: string;
  metadata: {
    changedBy?: string;
    fieldName?: string;
    entityType?: string;
    changeCount?: number;
    timeWindow?: string;
  };
}

function OverrideFrequencyChartComponent() {
  useEffect(() => {
    console.log('[35.2][Analytics] OverrideFrequencyChart re-render');
  });
  const { toast } = useToast();

  // Fetch frequency data
  const { data: frequencyData, isLoading: loadingFrequency, error: frequencyError, refetch: refetchFrequency } = useQuery<{
    ok: boolean;
    data: OverrideFrequencyData[];
    timestamp: string;
  }>({
    queryKey: ['/api/diagnostics/override-frequency'],
    queryFn: async () => {
      const response = await fetch('/api/diagnostics/override-frequency', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch override frequency data');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch anomaly detection results
  const { data: anomalyData, isLoading: loadingAnomalies, refetch: refetchAnomalies } = useQuery<{
    ok: boolean;
    data: AnomalyDetectionResult[];
    count: number;
    timestamp: string;
  }>({
    queryKey: ['/api/diagnostics/audit-anomalies'],
    queryFn: async () => {
      const response = await fetch('/api/diagnostics/audit-anomalies', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch anomaly data');
      }
      return response.json();
    },
  });

  const handleRefresh = () => {
    refetchFrequency();
    refetchAnomalies();
    toast({
      title: "Refreshing...",
      description: "Fetching latest override frequency and anomaly data.",
    });
  };

  // Format hour for display (remove date, show time only)
  const formatHour = (hourString: string) => {
    const date = new Date(hourString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false });
  };

  // Phase 35.2B: Use useMemo for data transformations to prevent recalculations
  const rawChartData = useMemo(() => {
    return frequencyData?.data.map((item) => ({
      hour: formatHour(item.hour),
      Paper: item.paperCount,
      Live: item.liveCount,
      Total: item.totalCount,
    })) || [];
  }, [frequencyData?.data]);

  // Phase 35.2B: Throttle chart data updates to max 1 per second
  const chartData = useThrottleData(rawChartData, 1000);

  // Phase 35.2B: Memoize anomalies array to prevent new reference on every render
  const anomalies = useMemo(() => anomalyData?.data || [], [anomalyData?.data]);
  const criticalAnomalies = useMemo(() => anomalies.filter(a => a.severity === 'critical').length, [anomalies]);
  const warningAnomalies = useMemo(() => anomalies.filter(a => a.severity === 'warn').length, [anomalies]);

  if (loadingFrequency || loadingAnomalies) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Override Frequency Trends
          </CardTitle>
          <CardDescription>
            Hourly override changes over the last 24 hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (frequencyError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Override Frequency Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load frequency data: {(frequencyError as Error).message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Override Frequency Trends
            </CardTitle>
            <CardDescription>
              Hourly override changes over the last 24 hours (paper vs live)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            data-testid="button-refresh-frequency"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Anomaly Alert Summary */}
        {anomalies.length > 0 && (
          <Alert variant={criticalAnomalies > 0 ? "destructive" : "default"} className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-1">
                {anomalies.length} Anomal{anomalies.length === 1 ? 'y' : 'ies'} Detected
              </div>
              <div className="text-sm">
                {criticalAnomalies > 0 && (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {criticalAnomalies} Critical
                  </span>
                )}
                {criticalAnomalies > 0 && warningAnomalies > 0 && <span className="mx-1">•</span>}
                {warningAnomalies > 0 && (
                  <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                    {warningAnomalies} Warning{warningAnomalies > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-1">
                {anomalies.slice(0, 3).map((anomaly, idx) => (
                  <div key={idx} className="text-xs">
                    • {anomaly.description}
                  </div>
                ))}
                {anomalies.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    ...and {anomalies.length - 3} more
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Chart */}
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Paper"
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Live"
                stroke="#ff7300"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Total"
                stroke="#82ca9d"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Alert>
            <AlertDescription>
              No override changes detected in the last 24 hours.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {chartData.reduce((sum, item) => sum + item.Paper, 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Paper Mode Changes</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {chartData.reduce((sum, item) => sum + item.Live, 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Live Mode Changes</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {chartData.reduce((sum, item) => sum + item.Total, 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total Changes (24h)</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Phase 35.2B: Memoize chart component to prevent unnecessary re-renders
export const OverrideFrequencyChart = memo(OverrideFrequencyChartComponent);
