import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TruthCheckDiscrepancy {
  field: string;
  backend: any;
  cortex: any;
  walter: any;
  severity: 'high' | 'medium' | 'low';
  delta?: number;
}

interface TruthCheckResult {
  timestamp: string;
  userId: string;
  mode: string;
  summary: {
    totalChecks: number;
    discrepancies: number;
    severity: 'ok' | 'warning' | 'critical';
  };
  discrepancies: TruthCheckDiscrepancy[];
  layers: {
    backend: {
      portfolioBalance: number;
      activeStrategies: string[];
      engineActive: boolean;
      riskPerTrade: number;
      dailyLossKillSwitch: number;
      maxExposurePercent: number;
    };
    cortex: {
      portfolioBalance: number;
      activeStrategies: string[];
      engineActive: boolean;
      riskPerTrade: number;
      dailyLossKillSwitch: number;
      maxExposurePercent: number;
    };
    walter: {
      portfolioBalance: number;
      activeStrategies: string[];
      engineActive: boolean;
      riskPerTrade: number;
      dailyLossKillSwitch: number;
      maxExposurePercent: number;
    };
  };
}

interface ContextRefreshMetrics {
  lastRefreshISO: string | null;
  avgLatencyMs: number;
  totalRefreshes: number;
  failedRefreshes: number;
  lastError: string | null;
}

export function SystemTruthPanel() {
  // Fetch truth check data
  const { data: truthData, isLoading: truthLoading, refetch: refetchTruth } = useQuery<{ ok: boolean; result: TruthCheckResult }>({
    queryKey: ['/api/system/truth-check'],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch context refresh metrics
  const { data: metricsData } = useQuery<{ ok: boolean; metrics: ContextRefreshMetrics }>({
    queryKey: ['/api/context/metrics'],
    refetchInterval: 30000,
  });

  // Manual refresh mutation
  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('/api/context/refresh', 'POST', {}),
    onSuccess: () => {
      // Refetch truth check data after refresh
      setTimeout(() => {
        refetchTruth();
        queryClient.invalidateQueries({ queryKey: ['/api/context/metrics'] });
      }, 500);
    },
  });

  if (truthLoading) {
    return (
      <Card data-testid="truth-panel-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            System Truth Sync
          </CardTitle>
          <CardDescription>Loading synchronization status...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const truthResult = truthData?.result;
  const metrics = metricsData?.metrics;

  if (!truthResult) return null;

  const { summary, discrepancies, layers } = truthResult;
  
  // Calculate staleness
  const lastRefreshTime = metrics?.lastRefreshISO ? new Date(metrics.lastRefreshISO) : null;
  const ageSeconds = lastRefreshTime ? (Date.now() - lastRefreshTime.getTime()) / 1000 : null;
  const isStale = ageSeconds ? ageSeconds > 30 : true;
  const stalenessColor = isStale ? "text-yellow-600 dark:text-yellow-500" : "text-green-600 dark:text-green-500";

  // Determine sync status
  const isSynced = summary.severity === 'ok';
  const SyncIcon = isSynced ? CheckCircle2 : AlertTriangle;
  const syncColor = isSynced ? "text-green-600" : summary.severity === 'warning' ? "text-yellow-600" : "text-red-600";

  return (
    <Card data-testid="system-truth-panel" className="border-l-4 border-l-blue-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SyncIcon className={`w-5 h-5 ${syncColor}`} />
              System Truth Sync
              {isSynced && <Badge variant="outline" className="text-green-600 border-green-600" data-testid="badge-synced">Synced</Badge>}
              {!isSynced && <Badge variant="outline" className={summary.severity === 'critical' ? 'text-red-600 border-red-600' : 'text-yellow-600 border-yellow-600'} data-testid="badge-warning">{discrepancies.length} Discrepancies</Badge>}
            </CardTitle>
            <CardDescription>
              Backend, Cortex, and Walter layer comparison
              {lastRefreshTime && (
                <span className={`ml-2 ${stalenessColor}`} data-testid="text-staleness">
                  • Last refresh: {formatDistanceToNow(lastRefreshTime, { addSuffix: true })}
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            size="sm"
            variant="outline"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Portfolio Balance */}
          <div className="space-y-1" data-testid="comparison-portfolio">
            <div className="text-sm font-medium text-muted-foreground">Portfolio Balance</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col" data-testid="value-backend-portfolio">
                <span className="text-muted-foreground">Backend</span>
                <span className="font-mono font-semibold">${layers.backend.portfolioBalance.toFixed(2)}</span>
              </div>
              <div className="flex flex-col" data-testid="value-cortex-portfolio">
                <span className="text-muted-foreground">Cortex</span>
                <span className="font-mono font-semibold">${layers.cortex.portfolioBalance.toFixed(2)}</span>
              </div>
              <div className="flex flex-col" data-testid="value-walter-portfolio">
                <span className="text-muted-foreground">Walter</span>
                <span className="font-mono font-semibold">${layers.walter.portfolioBalance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Active Strategies */}
          <div className="space-y-1" data-testid="comparison-strategies">
            <div className="text-sm font-medium text-muted-foreground">Active Strategies</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col" data-testid="value-backend-strategies">
                <span className="text-muted-foreground">Backend</span>
                <span className="font-mono font-semibold">{layers.backend.activeStrategies.length}</span>
              </div>
              <div className="flex flex-col" data-testid="value-cortex-strategies">
                <span className="text-muted-foreground">Cortex</span>
                <span className="font-mono font-semibold">{layers.cortex.activeStrategies.length}</span>
              </div>
              <div className="flex flex-col" data-testid="value-walter-strategies">
                <span className="text-muted-foreground">Walter</span>
                <span className="font-mono font-semibold">{layers.walter.activeStrategies.length}</span>
              </div>
            </div>
          </div>

          {/* Engine Status */}
          <div className="space-y-1" data-testid="comparison-engine">
            <div className="text-sm font-medium text-muted-foreground">Engine Status</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col" data-testid="value-backend-engine">
                <span className="text-muted-foreground">Backend</span>
                <Badge variant={layers.backend.engineActive ? "default" : "secondary"} className="text-xs">
                  {layers.backend.engineActive ? "Running" : "Stopped"}
                </Badge>
              </div>
              <div className="flex flex-col" data-testid="value-cortex-engine">
                <span className="text-muted-foreground">Cortex</span>
                <Badge variant={layers.cortex.engineActive ? "default" : "secondary"} className="text-xs">
                  {layers.cortex.engineActive ? "Running" : "Stopped"}
                </Badge>
              </div>
              <div className="flex flex-col" data-testid="value-walter-engine">
                <span className="text-muted-foreground">Walter</span>
                <Badge variant={layers.walter.engineActive ? "default" : "secondary"} className="text-xs">
                  {layers.walter.engineActive ? "Running" : "Stopped"}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Discrepancies List */}
        {discrepancies.length > 0 && (
          <div className="border-t pt-4" data-testid="discrepancies-list">
            <div className="text-sm font-medium mb-2">Detected Discrepancies:</div>
            <div className="space-y-2">
              {discrepancies.map((disc, idx) => (
                <div
                  key={idx}
                  className={`text-xs p-2 rounded border ${
                    disc.severity === 'high' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' :
                    disc.severity === 'medium' ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900' :
                    'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
                  }`}
                  data-testid={`discrepancy-${idx}`}
                >
                  <div className="font-medium capitalize">{disc.field.replace(/([A-Z])/g, ' $1').trim()}</div>
                  <div className="text-muted-foreground mt-1">
                    Backend: <code className="text-xs">{JSON.stringify(disc.backend)}</code> | 
                    Cortex: <code className="text-xs">{JSON.stringify(disc.cortex)}</code> | 
                    Walter: <code className="text-xs">{JSON.stringify(disc.walter)}</code>
                  </div>
                  <Badge variant="outline" className="mt-1 text-xs">{disc.severity} severity</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refresh Metrics */}
        {metrics && (
          <div className="border-t pt-4 text-xs text-muted-foreground" data-testid="refresh-metrics">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div data-testid="metric-total-refreshes">
                <span className="font-medium">Total Refreshes:</span> {metrics.totalRefreshes}
              </div>
              <div data-testid="metric-avg-latency">
                <span className="font-medium">Avg Latency:</span> {metrics.avgLatencyMs}ms
              </div>
              <div data-testid="metric-failed-refreshes">
                <span className="font-medium">Failed:</span> {metrics.failedRefreshes}
              </div>
              <div data-testid="metric-staleness-status">
                <span className="font-medium">Status:</span>{' '}
                <Badge variant={isStale ? "outline" : "default"} className="text-xs">
                  {isStale ? "Stale" : "Fresh"}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
