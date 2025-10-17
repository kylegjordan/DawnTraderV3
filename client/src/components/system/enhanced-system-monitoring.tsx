import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { 
  Activity, 
  Cpu, 
  Database, 
  Download, 
  HardDrive, 
  Zap, 
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Bot,
  TrendingUp,
  Check,
  Monitor,
  Brain
} from "lucide-react";

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    load: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  latency: {
    database: number;
    api: number;
  };
  apiHealth: {
    status: string;
    lastCheck: string;
    responseTime: number;
  };
}

interface TradingEngineStatus {
  activeMode: 'live' | 'paper' | 'stopped';
  ordersQueue: number;
  executionLatency: number;
  lastActivity: string | null;
}

interface WalterActivity {
  requestsPerMinute: number;
  successRate: number;
  pendingApprovals: number;
  totalRequests24h: number;
}

interface DatabaseHealth {
  connectionStatus: string;
  recordCounts: {
    users: number;
    trades: number;
    aiOpportunities: number;
    watchlistPairs: number;
  };
  errorRate: number;
  averageQueryTime: number;
}

interface ErrorLog {
  id: string;
  timestamp: string;
  errorType: string;
  message: string;
  resolved: boolean;
}

interface DiagnosticAnalysis {
  id: string;
  timestamp: string;
  recommendation: string;
  urgencyLevel: 'low' | 'medium' | 'high';
  metadata: {
    anomalies?: {
      detected: boolean;
      anomalies: Array<{
        type: string;
        severity: string;
        metric: string;
        value: number;
        description: string;
      }>;
    };
    trends?: {
      cpuTrend: string;
      memoryTrend: string;
      latencyTrend: string;
      errorTrend: string;
    };
    recommendations?: string[];
  };
}

export default function EnhancedSystemMonitoring() {
  const [activeTab, setActiveTab] = useState("performance");
  const { toast } = useToast();
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // Enable auto-refresh every 10 seconds
  const refetchInterval = 10000;
  
  // Context Bridge WebSocket connection
  const { isConnected, messages } = useWebSocket();
  
  // Auto-scroll to bottom when new messages arrive in UX Monitor
  useEffect(() => {
    if (activeTab === 'ux-monitor' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);
  
  // Acknowledge alert mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest('/api/diagnostics/acknowledge-alert', 'POST', { alertId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system/error-logs'] });
      toast({
        title: "Alert Acknowledged",
        description: "The alert has been marked as resolved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to acknowledge alert",
        variant: "destructive",
      });
    }
  });

  // Run diagnostic analysis mutation
  const runAnalysisMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/diagnostics/analyze', 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/diagnostics/analysis-history'] });
      toast({
        title: "Analysis Complete",
        description: "System diagnostic analysis completed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to run diagnostic analysis",
        variant: "destructive",
      });
    }
  });
  
  // Fetch system metrics
  const { data: metricsData, isLoading: metricsLoading } = useQuery<{ ok: boolean; metrics: SystemMetrics }>({
    queryKey: ['/api/diagnostics/system-metrics'],
    refetchInterval,
  });

  // Fetch trading engine status
  const { data: engineData, isLoading: engineLoading } = useQuery<{ ok: boolean; status: TradingEngineStatus }>({
    queryKey: ['/api/diagnostics/trading-engine'],
    refetchInterval,
  });

  // Fetch Walter activity
  const { data: walterData, isLoading: walterLoading } = useQuery<{ ok: boolean; activity: WalterActivity }>({
    queryKey: ['/api/diagnostics/walter-activity'],
    refetchInterval,
  });

  // Fetch database health
  const { data: dbHealthData, isLoading: dbHealthLoading } = useQuery<{ ok: boolean; health: DatabaseHealth }>({
    queryKey: ['/api/diagnostics/database-health'],
    refetchInterval,
  });

  // Fetch error logs (alerts)
  const { data: errorData, isLoading: errorLoading } = useQuery<{ ok: boolean; errors: ErrorLog[] }>({
    queryKey: ['/api/system/error-logs'],
    refetchInterval,
  });

  // Fetch diagnostic analysis history
  const { data: analysisData, isLoading: analysisLoading } = useQuery<{ ok: boolean; analyses: DiagnosticAnalysis[] }>({
    queryKey: ['/api/diagnostics/analysis-history'],
    refetchInterval,
  });

  const metrics = metricsData?.metrics;
  const engineStatus = engineData?.status;
  const walterActivity = walterData?.activity;
  const dbHealth = dbHealthData?.health;
  const errors = errorData?.errors || [];
  const analyses = analysisData?.analyses || [];
  
  // Latest AI insight
  const latestAnalysis = analyses.length > 0 ? analyses[0] : null;

  // Format bytes to GB
  const formatBytes = (bytes: number) => {
    return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
  };

  // Export report handler
  const handleExportReport = async () => {
    try {
      const response = await fetch('/api/diagnostics/export-report', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-report-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export report error:', error);
    }
  };

  // Get overall system status color
  const getSystemStatusColor = () => {
    if (metricsLoading || !metrics) return 'yellow';
    if (metrics.cpu.usage > 90 || metrics.memory.usagePercent > 90) return 'red';
    if (metrics.cpu.usage > 70 || metrics.memory.usagePercent > 70) return 'yellow';
    return 'green';
  };

  const statusColor = getSystemStatusColor();

  return (
    <div className="space-y-6">
      {/* Header with Status Badge and Export Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge 
            variant={statusColor === 'green' ? 'default' : statusColor === 'yellow' ? 'secondary' : 'destructive'}
            className="text-sm px-4 py-2"
            data-testid="badge-system-status"
          >
            {statusColor === 'green' ? <CheckCircle2 className="w-4 h-4 mr-2" /> : 
             statusColor === 'yellow' ? <AlertTriangle className="w-4 h-4 mr-2" /> : 
             <XCircle className="w-4 h-4 mr-2" />}
            System Status: {statusColor === 'green' ? 'Healthy' : statusColor === 'yellow' ? 'Warning' : 'Critical'}
          </Badge>
          <span className="text-sm text-muted-foreground">Auto-refreshing every 10s</span>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => runAnalysisMutation.mutate()}
            variant="outline"
            size="sm"
            disabled={runAnalysisMutation.isPending}
            data-testid="button-run-analysis"
          >
            <Activity className="w-4 h-4 mr-2" />
            {runAnalysisMutation.isPending ? 'Analyzing...' : 'Run Analysis'}
          </Button>
          <Button 
            onClick={handleExportReport}
            variant="outline"
            size="sm"
            data-testid="button-export-report"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* AI Diagnostic Insights Banner */}
      {!analysisLoading && latestAnalysis && (
        <Card 
          className={`border-l-4 ${
            latestAnalysis.urgencyLevel === 'high' ? 'border-l-red-500 bg-red-50 dark:bg-red-950' :
            latestAnalysis.urgencyLevel === 'medium' ? 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950' :
            'border-l-blue-500 bg-blue-50 dark:bg-blue-950'
          }`}
          data-testid="card-ai-diagnostic-insights"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-5 h-5" />
                AI Diagnostic Insights
              </CardTitle>
              <Badge 
                variant={
                  latestAnalysis.urgencyLevel === 'high' ? 'destructive' :
                  latestAnalysis.urgencyLevel === 'medium' ? 'secondary' :
                  'default'
                }
                data-testid="badge-diagnostic-urgency"
              >
                {latestAnalysis.urgencyLevel} priority
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Last analyzed: {new Date(latestAnalysis.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-2" data-testid="text-diagnostic-summary">
              {latestAnalysis.recommendation}
            </p>
            {latestAnalysis.metadata?.anomalies?.detected && (
              <div className="mt-2 mb-3">
                <p className="text-xs font-medium mb-1">Detected Anomalies:</p>
                <div className="space-y-1">
                  {latestAnalysis.metadata.anomalies.anomalies.map((anomaly, idx) => (
                    <div 
                      key={idx} 
                      className="text-xs flex items-start gap-2 text-muted-foreground"
                      data-testid={`text-anomaly-${idx}`}
                    >
                      <Badge variant={
                        anomaly.severity === 'high' ? 'destructive' :
                        anomaly.severity === 'medium' ? 'secondary' :
                        'outline'
                      } className="text-xs px-1 py-0">
                        {anomaly.severity}
                      </Badge>
                      <span>{anomaly.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {latestAnalysis.metadata?.recommendations && latestAnalysis.metadata.recommendations.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-1">Recommendations:</p>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  {latestAnalysis.metadata.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2" data-testid={`text-diagnostic-rec-${idx}`}>
                      <span>•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7" data-testid="tabs-system-monitoring">
          <TabsTrigger value="performance" data-testid="tab-performance">
            <Cpu className="w-4 h-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="trading-engine" data-testid="tab-trading-engine">
            <TrendingUp className="w-4 h-4 mr-2" />
            Trading Engine
          </TabsTrigger>
          <TabsTrigger value="walter" data-testid="tab-walter">
            <Bot className="w-4 h-4 mr-2" />
            Walter Activity
          </TabsTrigger>
          <TabsTrigger value="database" data-testid="tab-database">
            <Database className="w-4 h-4 mr-2" />
            Database
          </TabsTrigger>
          <TabsTrigger value="awareness" data-testid="tab-awareness">
            <Brain className="w-4 h-4 mr-2" />
            Awareness
          </TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Alerts ({errors.filter(e => !e.resolved).length})
          </TabsTrigger>
          <TabsTrigger value="ux-monitor" data-testid="tab-ux-monitor">
            <Monitor className="w-4 h-4 mr-2" />
            UX Monitor
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Real-Time Performance */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CPU Card */}
            <Card data-testid="card-cpu">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  CPU Usage
                </CardTitle>
                <CardDescription>Processor utilization and load</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : metrics ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-bold" data-testid="text-cpu-usage">
                        {metrics.cpu.usage.toFixed(1)}%
                      </span>
                      <Badge variant={metrics.cpu.usage > 80 ? 'destructive' : 'secondary'}>
                        {metrics.cpu.cores} cores
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Load Avg: {metrics.cpu.load.map(l => l.toFixed(2)).join(', ')}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* Memory Card */}
            <Card data-testid="card-memory">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Memory Usage
                </CardTitle>
                <CardDescription>RAM utilization</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : metrics ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-bold" data-testid="text-memory-usage">
                        {metrics.memory.usagePercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* Latency Card */}
            <Card data-testid="card-latency">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Latency
                </CardTitle>
                <CardDescription>Response times</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : metrics ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Database:</span>
                      <span className="font-semibold" data-testid="text-db-latency">{metrics.latency.database}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">API:</span>
                      <span className="font-semibold" data-testid="text-api-latency">{metrics.latency.api}ms</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* API Health Card */}
            <Card data-testid="card-api-health">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  API Health
                </CardTitle>
                <CardDescription>External API status</CardDescription>
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : metrics ? (
                  <div className="space-y-2">
                    <Badge variant={metrics.apiHealth.status === 'healthy' ? 'default' : 'destructive'} data-testid="badge-api-status">
                      {metrics.apiHealth.status}
                    </Badge>
                    <div className="text-sm text-muted-foreground">
                      Response Time: {metrics.apiHealth.responseTime}ms
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Trading Engine Status */}
        <TabsContent value="trading-engine" className="space-y-4">
          <Card data-testid="card-trading-engine">
            <CardHeader>
              <CardTitle>Trading Engine Status</CardTitle>
              <CardDescription>Current trading activity and performance</CardDescription>
            </CardHeader>
            <CardContent>
              {engineLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : engineStatus ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Active Mode</div>
                      <Badge 
                        variant={engineStatus.activeMode === 'live' ? 'default' : engineStatus.activeMode === 'paper' ? 'secondary' : 'outline'}
                        className="mt-1"
                        data-testid="badge-trading-mode"
                      >
                        {engineStatus.activeMode.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Orders Queue</div>
                      <div className="text-2xl font-bold mt-1" data-testid="text-orders-queue">
                        {engineStatus.ordersQueue}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Execution Latency</div>
                      <div className="text-2xl font-bold mt-1" data-testid="text-execution-latency">
                        {engineStatus.executionLatency}ms
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Last Activity</div>
                      <div className="text-sm mt-1" data-testid="text-last-activity">
                        {engineStatus.lastActivity ? new Date(engineStatus.lastActivity).toLocaleString() : 'No recent activity'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Walter Activity */}
        <TabsContent value="walter" className="space-y-4">
          <Card data-testid="card-walter-activity">
            <CardHeader>
              <CardTitle>Walter Activity Metrics</CardTitle>
              <CardDescription>AI assistant usage and performance</CardDescription>
            </CardHeader>
            <CardContent>
              {walterLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : walterActivity ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Requests per Minute</div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-requests-per-min">
                      {walterActivity.requestsPerMinute.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-success-rate">
                      {walterActivity.successRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Pending Approvals</div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-pending-approvals">
                      {walterActivity.pendingApprovals}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Requests (24h)</div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-total-requests">
                      {walterActivity.totalRequests24h}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Database Health */}
        <TabsContent value="database" className="space-y-4">
          <Card data-testid="card-database-health">
            <CardHeader>
              <CardTitle>Database Health Metrics</CardTitle>
              <CardDescription>Connection status and record statistics</CardDescription>
            </CardHeader>
            <CardContent>
              {dbHealthLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : dbHealth ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={dbHealth.connectionStatus === 'connected' ? 'default' : 'destructive'}
                      data-testid="badge-db-connection"
                    >
                      {dbHealth.connectionStatus === 'connected' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                      {dbHealth.connectionStatus}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Query Time: {dbHealth.averageQueryTime}ms
                    </span>
                  </div>
                  
                  <div>
                    <div className="text-sm font-medium mb-2">Record Counts</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Users:</span>
                        <span className="font-semibold" data-testid="text-count-users">{dbHealth.recordCounts.users}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trades:</span>
                        <span className="font-semibold" data-testid="text-count-trades">{dbHealth.recordCounts.trades}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">AI Opportunities:</span>
                        <span className="font-semibold" data-testid="text-count-opportunities">{dbHealth.recordCounts.aiOpportunities}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Watchlist Pairs:</span>
                        <span className="font-semibold" data-testid="text-count-watchlist">{dbHealth.recordCounts.watchlistPairs}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Error Rate (last hour):</span>
                    <Badge variant={dbHealth.errorRate > 10 ? 'destructive' : 'secondary'} data-testid="badge-error-rate">
                      {dbHealth.errorRate} errors/hr
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Alert Log */}
        <TabsContent value="alerts" className="space-y-4">
          <Card data-testid="card-alerts">
            <CardHeader>
              <CardTitle>Alert Log</CardTitle>
              <CardDescription>System warnings, failures, and policy violations</CardDescription>
            </CardHeader>
            <CardContent>
              {errorLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : errors.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {errors.map((error) => (
                    <div 
                      key={error.id}
                      className={`p-3 border rounded-lg ${error.resolved ? 'bg-muted' : 'border-red-500 bg-red-50 dark:bg-red-950'}`}
                      data-testid={`alert-${error.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={error.resolved ? 'outline' : 'destructive'} data-testid={`badge-alert-status-${error.id}`}>
                            {error.resolved ? 'Resolved' : 'Active'}
                          </Badge>
                          {!error.resolved && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              onClick={() => acknowledgeMutation.mutate(error.id)}
                              disabled={acknowledgeMutation.isPending}
                              data-testid={`button-acknowledge-${error.id}`}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Acknowledge
                            </Button>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground" data-testid={`text-alert-time-${error.id}`}>
                          {new Date(error.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm font-medium" data-testid={`text-alert-type-${error.id}`}>
                        {error.errorType}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1" data-testid={`text-alert-message-${error.id}`}>
                        {error.message}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>No alerts - all systems healthy</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 6: UX Monitor - Context Bridge Events */}
        <TabsContent value="ux-monitor" className="space-y-4">
          <Card data-testid="card-ux-monitor">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="w-5 h-5" />
                    UX Monitor - Context Bridge Live Events
                  </CardTitle>
                  <CardDescription>
                    Real-time reasoning broadcasts and context updates
                  </CardDescription>
                </div>
                <Badge 
                  variant={isConnected ? "default" : "destructive"}
                  data-testid="badge-websocket-status"
                >
                  {isConnected ? "Connected" : "Disconnected"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className="bg-black dark:bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm"
                data-testid="log-context-bridge"
              >
                {messages.length === 0 ? (
                  <div className="text-green-400 opacity-70">
                    Waiting for Context Bridge events...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {messages.map((msg, idx) => {
                      const timestamp = new Date().toLocaleTimeString();
                      const isReasoningEvent = msg.type?.includes('reasoning') || msg.data?.eventType?.includes('reasoning');
                      const isCognitiveEvent = msg.type?.includes('cognitive') || msg.data?.eventType?.includes('cognitive');
                      
                      return (
                        <div 
                          key={idx} 
                          className={`${
                            isReasoningEvent ? 'text-blue-400' : 
                            isCognitiveEvent ? 'text-purple-400' : 
                            'text-green-400'
                          }`}
                          data-testid={`log-entry-${idx}`}
                        >
                          <span className="text-gray-500">[{timestamp}]</span>{' '}
                          <span className="text-yellow-400">{msg.type}</span>
                          {msg.data && (
                            <span className="ml-2">
                              {JSON.stringify(msg.data, null, 0).substring(0, 120)}
                              {JSON.stringify(msg.data).length > 120 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span>Reasoning Events</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    <span>Cognitive Events</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Other Events</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 7: Awareness - System Self-Awareness State */}
        <TabsContent value="awareness" className="space-y-4">
          <AwarenessTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AwarenessTab() {
  const { toast } = useToast();
  
  // Fetch current awareness state
  const { data: awarenessState, isLoading: stateLoading, refetch: refetchState } = useQuery({
    queryKey: ['/api/awareness/state'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Fetch awareness state history
  const { data: awarenessHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/awareness/history'],
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Manual reflection mutation
  const reflectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/awareness/reflect', {});
    },
    onSuccess: () => {
      toast({
        title: 'Reflection Complete',
        description: 'System has completed self-reflection analysis',
      });
      refetchState();
    },
    onError: (error: Error) => {
      toast({
        title: 'Reflection Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const currentState = (awarenessState as any)?.state;
  const states = (awarenessHistory as any)?.states || [];
  
  const getEmotionalColor = (emotion: string) => {
    const colors: Record<string, string> = {
      stable: 'bg-green-500',
      elevated: 'bg-yellow-500',
      critical: 'bg-red-500',
      recovering: 'bg-blue-500',
    };
    return colors[emotion] || 'bg-gray-500';
  };
  
  return (
    <div className="space-y-4">
      {/* Current Awareness State */}
      <Card data-testid="card-awareness-current">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Current Awareness State
              </CardTitle>
              <CardDescription>
                System's current self-awareness and cognitive status
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => reflectMutation.mutate()}
              disabled={reflectMutation.isPending}
              data-testid="button-trigger-reflection"
            >
              {reflectMutation.isPending ? 'Reflecting...' : 'Trigger Reflection'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stateLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : currentState ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div data-testid="metric-health-score">
                  <div className="text-sm text-muted-foreground">Health Score</div>
                  <div className="text-2xl font-bold">
                    {(currentState.healthScore * 100).toFixed(1)}%
                  </div>
                </div>
                <div data-testid="metric-cognitive-score">
                  <div className="text-sm text-muted-foreground">Cognitive Score</div>
                  <div className="text-2xl font-bold">
                    {currentState.cognitiveScore.toFixed(1)}%
                  </div>
                </div>
                <div data-testid="metric-confidence">
                  <div className="text-sm text-muted-foreground">Confidence</div>
                  <div className="text-2xl font-bold">
                    {currentState.confidenceScore.toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Emotional State:</span>
                  <Badge className={getEmotionalColor(currentState.emotionalState)} data-testid="badge-emotional-state">
                    {currentState.emotionalState}
                  </Badge>
                </div>
                {currentState.dominantDomain && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Dominant Domain:</span>
                    <Badge variant="outline" data-testid="badge-dominant-domain">
                      {currentState.dominantDomain}
                    </Badge>
                  </div>
                )}
                {currentState.anomalyDetected && (
                  <Badge variant="destructive" data-testid="badge-anomaly">
                    Anomaly Detected
                  </Badge>
                )}
              </div>
              
              {currentState.missionFocus && (
                <div data-testid="text-mission-focus">
                  <div className="text-sm text-muted-foreground">Current Focus:</div>
                  <div className="text-sm font-medium">{currentState.missionFocus}</div>
                </div>
              )}
              
              {currentState.recentActions && currentState.recentActions.length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Recent Actions:</div>
                  <div className="space-y-1">
                    {currentState.recentActions.slice(0, 5).map((action: any, idx: number) => (
                      <div key={idx} className="text-xs flex items-center gap-2" data-testid={`action-${idx}`}>
                        <Badge variant="secondary" className="text-xs">
                          {action.actionType}
                        </Badge>
                        <span className={action.outcome === 'success' ? 'text-green-600' : 'text-red-600'}>
                          {action.outcome}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">No awareness state available</div>
          )}
        </CardContent>
      </Card>
      
      {/* Awareness State History */}
      <Card data-testid="card-awareness-history">
        <CardHeader>
          <CardTitle>Awareness History</CardTitle>
          <CardDescription>Recent awareness states and trends</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : states.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {states.map((state: any, idx: number) => (
                <div 
                  key={state.id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  data-testid={`history-entry-${idx}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getEmotionalColor(state.emotionalState)}`}></div>
                    <div>
                      <div className="text-sm font-medium">{state.missionFocus || 'No focus'}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(state.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span>H: {(state.healthScore * 100).toFixed(0)}%</span>
                    <span>C: {state.cognitiveScore.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">No awareness history available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
