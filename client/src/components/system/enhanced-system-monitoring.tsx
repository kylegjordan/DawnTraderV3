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
  Brain,
  Target,
  Sparkles,
  Eye,
  GraduationCap,
  Shield,
  Archive,
  Gauge,
  Clock,
  Globe,
  ScanLine,
  BookOpen,
  Server,
  Settings
} from "lucide-react";
import ClusterTab from "./cluster-tab";
import LearningNetworkTab from "./learning-network-tab";
import { LATTISafetyMonitor } from "./latti-safety-monitor";
import { DataFlowTracePanel } from "@/components/dashboard/data-flow-trace-panel";
// Directive 12.2.3: SystemTruthPanel import removed (file deleted in Batch 7A)
import SystemHealthSummary from "@/components/system-health-summary";
import EngineTelemetry from "@/components/monitoring/engine-telemetry";
import SystemConfigTab from "./system-config-tab";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";

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

interface IntrospectionSummary {
  biasIndex: number;
  confidenceStability: number;
  reasoningQuality: number;
  lastAnalysis: string;
  totalBiasesDetected: number;
}

interface BiasObservation {
  id: string;
  biasType: string;
  detectedAt: string;
  confidenceScore: number;
  reasoningSnapshot: string;
}

interface ConfidenceDrift {
  timestamp: string;
  confidenceLevel: number;
  varianceScore: number;
}

export default function EnhancedSystemMonitoring() {
  const [activeTab, setActiveTab] = useState("engine-telemetry");
  const { toast } = useToast();
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // Directive 12.2.3: truthData state removed (SystemTruthPanel deleted in Batch 7A)

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

  // Directive 12.2.3: Truth data polling removed (SystemTruthPanel + system-truth-diagnostic deleted in Batch 7A)
  
  // Acknowledge alert mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest('POST', '/api/diagnostics/acknowledge-alert', { alertId });
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
      return await apiRequest('POST', '/api/diagnostics/analyze', {});
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

  // Fetch introspection summary
  const { data: introspectionData, isLoading: introspectionLoading } = useQuery<{ success: boolean; summary: IntrospectionSummary }>({
    queryKey: ['/api/introspection/status'],
    refetchInterval,
  });

  // Fetch recent biases (24h)
  const { data: biasesData, isLoading: biasesLoading } = useQuery<{ success: boolean; biases: BiasObservation[]; count: number }>({
    queryKey: ['/api/introspection/biases'],
    refetchInterval,
  });

  // Fetch confidence drift data (48h)
  const { data: driftData, isLoading: driftLoading } = useQuery<{ success: boolean; driftData: ConfidenceDrift[]; count: number }>({
    queryKey: ['/api/introspection/drift'],
    refetchInterval,
  });

  // Run mitigation mutation
  const runMitigationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/introspection/mitigate', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/introspection/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/introspection/biases'] });
      toast({
        title: "Mitigation Complete",
        description: "Bias mitigation cycle completed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to run bias mitigation",
        variant: "destructive",
      });
    }
  });

  const metrics = metricsData?.metrics;
  const engineStatus = engineData?.status;
  const walterActivity = walterData?.activity;
  const dbHealth = dbHealthData?.health;
  const errors = errorData?.errors || [];
  const analyses = analysisData?.analyses || [];
  const introspection = introspectionData?.summary;
  const biases = biasesData?.biases || [];
  const driftPoints = driftData?.driftData || [];
  
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
    <div className="min-h-screen overflow-y-auto">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-2 justify-start w-full h-auto p-2" data-testid="tabs-system-monitoring">
          <TabsTrigger value="engine-telemetry" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-engine-telemetry" title="Engine Telemetry">
            <Server className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Engine Telemetry</span>
          </TabsTrigger>
          <TabsTrigger value="system-config" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-system-config" title="System Configuration">
            <Settings className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">System Config</span>
          </TabsTrigger>
          <TabsTrigger value="system-ai" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-system-ai" title="System & AI">
            <Activity className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">System & AI</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-performance" title="Performance">
            <Cpu className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="trading-engine" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-trading-engine" title="Trading Engine">
            <TrendingUp className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Trading Engine</span>
          </TabsTrigger>
          <TabsTrigger value="walter" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-walter" title="Walter Activity">
            <Bot className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Walter Activity</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-database" title="Database">
            <Database className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Database</span>
          </TabsTrigger>
          <TabsTrigger value="awareness" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-awareness" title="Awareness">
            <Brain className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Awareness</span>
          </TabsTrigger>
          <TabsTrigger value="alignment" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-alignment" title="Alignment">
            <CheckCircle2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Alignment</span>
          </TabsTrigger>
          <TabsTrigger value="strategy" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-strategy" title="Strategy">
            <Target className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Strategy</span>
          </TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-simulation" title="Simulation">
            <Sparkles className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Simulation</span>
          </TabsTrigger>
          <TabsTrigger value="reflection" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-reflection" title="Reflection">
            <Eye className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Reflection</span>
          </TabsTrigger>
          <TabsTrigger value="ethics" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-ethics" title="Ethics">
            <CheckCircle2 className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Ethics</span>
          </TabsTrigger>
          <TabsTrigger value="federation" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-federation" title="Federation">
            <Globe className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Federation</span>
          </TabsTrigger>
          <TabsTrigger value="collaboration" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-collaboration" title="Collaboration">
            <Bot className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Collaboration</span>
          </TabsTrigger>
          <TabsTrigger value="learning" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-learning" title="Learning">
            <GraduationCap className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Learning</span>
          </TabsTrigger>
          <TabsTrigger value="oversight" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-oversight" title="Oversight">
            <Shield className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Oversight</span>
          </TabsTrigger>
          <TabsTrigger value="memory" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-memory" title="Memory">
            <Archive className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Memory</span>
          </TabsTrigger>
          <TabsTrigger value="core" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-core" title="Core">
            <Cpu className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Core</span>
          </TabsTrigger>
          <TabsTrigger value="safety" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-safety" title="Safety">
            <Shield className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Safety</span>
          </TabsTrigger>
          <TabsTrigger value="perf-metrics" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-perf-metrics" title="Task Performance">
            <Gauge className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Task Performance</span>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-alerts" title={`Alerts (${errors.filter(e => !e.resolved).length})`}>
            <AlertTriangle className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Alerts ({errors.filter(e => !e.resolved).length})</span>
          </TabsTrigger>
          <TabsTrigger value="ux-monitor" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-ux-monitor" title="UX Monitor">
            <Monitor className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">UX Monitor</span>
          </TabsTrigger>
          <TabsTrigger value="introspection" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-introspection" title="Introspection">
            <ScanLine className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Introspection</span>
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-knowledge" title="Knowledge">
            <BookOpen className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Knowledge</span>
          </TabsTrigger>
          <TabsTrigger value="cluster" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-cluster" title="Cluster">
            <Server className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Cluster</span>
          </TabsTrigger>
          <TabsTrigger value="learning" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-learning" title="Learning Network">
            <Brain className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Learning Network</span>
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-diagnostics" title="Diagnostics & Telemetry">
            <Monitor className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Diagnostics & Telemetry</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 0: System & AI */}
        <TabsContent value="system-ai" className="space-y-6 mt-6">
          {/* System Status Header */}
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

          {/* AI Diagnostic Insights */}
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
        </TabsContent>

        {/* Tab 1: Real-Time Performance */}
        <TabsContent value="performance" className="space-y-4 mt-6">
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
        <TabsContent value="trading-engine" className="space-y-6 mt-6">
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
        <TabsContent value="walter" className="space-y-6 mt-6">
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
        <TabsContent value="database" className="space-y-6 mt-6">
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
        <TabsContent value="alerts" className="space-y-6 mt-6">
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
        <TabsContent value="ux-monitor" className="relative z-0 overflow-visible pt-2 space-y-4">
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
        <TabsContent value="awareness" className="space-y-6 mt-6">
          <AwarenessTab />
        </TabsContent>

        {/* Tab 8: Goal Alignment - Adaptive Learning & Policy Alignment */}
        <TabsContent value="alignment" className="space-y-6 mt-6">
          <AlignmentTab />
        </TabsContent>

        {/* Tab 7: Strategy & Learning */}
        <TabsContent value="strategy" className="space-y-6 mt-6">
          <StrategyTab />
        </TabsContent>

        {/* Tab 8: Simulation - Phase 9.3 */}
        <TabsContent value="simulation" className="space-y-6 mt-6">
          <SimulationTab />
        </TabsContent>

        {/* Tab 9: Reflection - Phase 9.4 */}
        <TabsContent value="reflection" className="space-y-6 mt-6">
          <ReflectionTab />
        </TabsContent>

        {/* Tab 10: Ethics - Phase 13.0 */}
        <TabsContent value="ethics" className="space-y-6 mt-6">
          <EthicsTab />
        </TabsContent>

        {/* Tab 10.5: Federation - Phase 14.0 */}
        <TabsContent value="federation" className="space-y-6 mt-6">
          <FederationTab />
        </TabsContent>

        {/* Tab 11: Collaboration - Phase 9.6 */}
        <TabsContent value="collaboration" className="space-y-6 mt-6">
          <CollaborationTab />
        </TabsContent>

        {/* Tab 12: Learning - Phase 9.7 */}
        <TabsContent value="learning" className="space-y-6 mt-6">
          <LearningTab />
        </TabsContent>

        {/* Tab 13: Oversight - Phase 9.8 */}
        <TabsContent value="oversight" className="space-y-6 mt-6">
          <OversightTab />
        </TabsContent>

        {/* Tab 14: Memory - Phase 9.9 */}
        <TabsContent value="memory" className="space-y-6 mt-6">
          <MemoryTab />
        </TabsContent>

        {/* Tab 15: Core - Phase 10.0 */}
        <TabsContent value="core" className="space-y-6 mt-6">
          <CoreTab />
        </TabsContent>

        {/* Tab 16: Safety - Phase 11.0 */}
        <TabsContent value="safety" className="space-y-6 mt-6">
          <SafetyTab />
        </TabsContent>

        {/* Tab 17: Task Performance Metrics - Phase 12.0 */}
        <TabsContent value="perf-metrics" className="space-y-6 mt-6">
          <PerformanceTab />
        </TabsContent>

        {/* Tab 21: Introspection - Phase 15.0 */}
        <TabsContent value="introspection" className="space-y-6 mt-6">
          <IntrospectionTab 
            introspection={introspection}
            introspectionLoading={introspectionLoading}
            biases={biases}
            biasesLoading={biasesLoading}
            driftPoints={driftPoints}
            driftLoading={driftLoading}
            runMitigationMutation={runMitigationMutation}
          />
        </TabsContent>

        {/* Tab 22: Knowledge - Phase 16.0 */}
        <TabsContent value="knowledge" className="space-y-6 mt-6">
          <KnowledgeTab />
        </TabsContent>

        {/* Cluster Tab */}
        <TabsContent value="cluster" className="space-y-6 mt-6" data-testid="content-cluster">
          <ClusterTab />
        </TabsContent>

        {/* Learning Network Tab - Phase 18.0 */}
        <TabsContent value="learning" className="space-y-6 mt-6" data-testid="content-learning">
          <LearningNetworkTab />
        </TabsContent>

        {/* Phase 27.F.31: Diagnostics & Telemetry Tab */}
        <TabsContent value="diagnostics" className="space-y-6 mt-6" data-testid="content-diagnostics">
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-foreground">System Diagnostics & Telemetry</h3>
            <p className="text-sm text-muted-foreground">
              Real-time system truth synchronization, data flow diagnostics, and Walter activity monitoring
            </p>
            
            {/* Directive 12.2.3: SystemTruthPanel removed (file deleted in Batch 7A) */}
            
            {/* Developer-Only Data Flow Trace */}
            <DataFlowTracePanel />
            
            {/* System Health Summary - Walter Activity (Feed/Formula Monitoring) */}
            <SystemHealthSummary />
          </div>
        </TabsContent>

        {/* Phase 41F-D: Engine Telemetry Tab */}
        <TabsContent value="engine-telemetry" className="space-y-6 mt-6" data-testid="content-engine-telemetry">
          <EngineTelemetry />
        </TabsContent>

        {/* Phase 6: System Configuration Tab */}
        <TabsContent value="system-config" className="space-y-6 mt-6" data-testid="content-system-config">
          <SystemConfigTab />
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

function AlignmentTab() {
  const { toast } = useToast();
  
  // Fetch current alignment profile
  const { data: profileData, isLoading: profileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ['/api/alignment/profile'],
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Fetch recent experience insights
  const { data: experiencesData, isLoading: experiencesLoading } = useQuery({
    queryKey: ['/api/alignment/experiences'],
    refetchInterval: 60000,
  });
  
  // Fetch alignment history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/alignment/history'],
    refetchInterval: 60000,
  });
  
  // Fetch alignment adjustments
  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ['/api/alignment/adjustments'],
    refetchInterval: 60000,
  });
  
  // Synthesize experiences mutation
  const synthesizeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/alignment/synthesize', {});
    },
    onSuccess: () => {
      toast({
        title: 'Synthesis Complete',
        description: 'Experience insights have been synthesized successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/alignment/experiences'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Synthesis Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Evaluate drift mutation
  const evaluateDriftMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/alignment/evaluate-drift', {});
    },
    onSuccess: () => {
      toast({
        title: 'Drift Evaluation Complete',
        description: 'Performance drift has been evaluated and profile adjusted',
      });
      refetchProfile();
      queryClient.invalidateQueries({ queryKey: ['/api/alignment/adjustments'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Drift Evaluation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const profile = (profileData as any)?.profile;
  const experiences = (experiencesData as any)?.experiences || [];
  const history = (historyData as any)?.history || [];
  const adjustments = (adjustmentsData as any)?.adjustments || [];
  
  const getVerificationColor = (result: string) => {
    const colors: Record<string, string> = {
      approved: 'bg-green-500',
      flagged: 'bg-yellow-500',
      rejected: 'bg-red-500',
    };
    return colors[result] || 'bg-gray-500';
  };
  
  return (
    <div className="space-y-4">
      {/* Current Alignment Profile */}
      <Card data-testid="card-alignment-profile">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Current Alignment Profile
              </CardTitle>
              <CardDescription>
                System's adaptive objectives and alignment status
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => synthesizeMutation.mutate()}
                disabled={synthesizeMutation.isPending}
                data-testid="button-synthesize-experiences"
              >
                {synthesizeMutation.isPending ? 'Synthesizing...' : 'Synthesize Experiences'}
              </Button>
              <Button
                size="sm"
                onClick={() => evaluateDriftMutation.mutate()}
                disabled={evaluateDriftMutation.isPending}
                data-testid="button-evaluate-drift"
              >
                {evaluateDriftMutation.isPending ? 'Evaluating...' : 'Evaluate Drift'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profileLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : profile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div data-testid="profile-status">
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge variant={profile.currentStatus === 'aligned' ? 'default' : 'destructive'}>
                    {profile.currentStatus}
                  </Badge>
                </div>
                <div data-testid="profile-last-adjustment">
                  <div className="text-sm text-muted-foreground">Last Adjustment</div>
                  <div className="text-sm font-medium">
                    {profile.lastAdjustment ? new Date(profile.lastAdjustment).toLocaleString() : 'Never'}
                  </div>
                </div>
              </div>
              
              {profile.objectives && Object.keys(profile.objectives).length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Objectives:</div>
                  <div className="space-y-1">
                    {Object.entries(profile.objectives as Record<string, any>).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm" data-testid={`objective-${key}`}>
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium">{JSON.stringify(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {profile.targetMetrics && Object.keys(profile.targetMetrics).length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Target Metrics:</div>
                  <div className="space-y-1">
                    {Object.entries(profile.targetMetrics as Record<string, any>).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm" data-testid={`metric-${key}`}>
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium">{JSON.stringify(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">No alignment profile available</div>
          )}
        </CardContent>
      </Card>
      
      {/* Recent Experience Insights */}
      <Card data-testid="card-experience-insights">
        <CardHeader>
          <CardTitle>Experience Insights</CardTitle>
          <CardDescription>Synthesized learnings from system experiences</CardDescription>
        </CardHeader>
        <CardContent>
          {experiencesLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : experiences.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {experiences.map((exp: any, idx: number) => (
                <div 
                  key={exp.id} 
                  className="p-3 rounded-lg bg-muted/50 space-y-2"
                  data-testid={`experience-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{exp.domain}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(exp.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm">{exp.insight}</div>
                  {exp.patternsIdentified && exp.patternsIdentified.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Patterns: {exp.patternsIdentified.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">No experience insights available</div>
          )}
        </CardContent>
      </Card>
      
      {/* Alignment Verification History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-alignment-history">
          <CardHeader>
            <CardTitle>Verification History</CardTitle>
            <CardDescription>Recent alignment verifications</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : history.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {history.slice(0, 10).map((item: any, idx: number) => (
                  <div 
                    key={item.auditId} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    data-testid={`verification-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getVerificationColor(item.verificationResult)}`}></div>
                      <div>
                        <div className="text-sm font-medium">{item.actionType}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(item.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <Badge variant={item.verificationResult === 'approved' ? 'default' : 'secondary'}>
                      {item.verificationResult}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No verification history available</div>
            )}
          </CardContent>
        </Card>
        
        <Card data-testid="card-alignment-adjustments">
          <CardHeader>
            <CardTitle>Alignment Adjustments</CardTitle>
            <CardDescription>Recent profile adaptations</CardDescription>
          </CardHeader>
          <CardContent>
            {adjustmentsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : adjustments.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {adjustments.map((adj: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="p-2 rounded-lg bg-muted/50"
                    data-testid={`adjustment-${idx}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">Drift: {adj.drift ? adj.drift.toFixed(2) : 'N/A'}</span>
                      <span className="text-xs text-muted-foreground">
                        {adj.timestamp ? new Date(adj.timestamp).toLocaleString() : 'Unknown'}
                      </span>
                    </div>
                    {adj.recommendation && (
                      <div className="text-xs text-muted-foreground">{adj.recommendation}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No adjustments recorded</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StrategyTab() {
  const { toast } = useToast();
  
  // Fetch strategic plans
  const { data: plansData, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ['/api/strategic/plans'],
    refetchInterval: 30000,
  });
  
  // Fetch learning profile
  const { data: learningData, isLoading: learningLoading, refetch: refetchLearning } = useQuery({
    queryKey: ['/api/learning/profile'],
    refetchInterval: 30000,
  });
  
  // Fetch compliance status
  const { data: complianceData, isLoading: complianceLoading } = useQuery({
    queryKey: ['/api/strategic/compliance'],
    refetchInterval: 60000,
  });
  
  const plans = (plansData as any)?.plans || [];
  const learningProfile = (learningData as any)?.profile;
  const compliance = (complianceData as any)?.status;
  
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500',
      draft: 'bg-gray-500',
      paused: 'bg-yellow-500',
      completed: 'bg-blue-500',
    };
    return colors[status] || 'bg-gray-500';
  };
  
  const getPhaseColor = (phase: string) => {
    const colors: Record<string, string> = {
      observation: 'bg-blue-500',
      adjustment: 'bg-yellow-500',
      evaluation: 'bg-green-500',
    };
    return colors[phase] || 'bg-gray-500';
  };
  
  return (
    <div className="space-y-4">
      {/* Strategic Plans Overview */}
      <Card data-testid="card-strategic-plans">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Strategic Plans
          </CardTitle>
          <CardDescription>Long-range planning and execution tracking</CardDescription>
        </CardHeader>
        <CardContent>
          {plansLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : plans.length > 0 ? (
            <div className="space-y-3">
              {plans.map((plan: any, idx: number) => (
                <div 
                  key={plan.planId} 
                  className="p-3 rounded-lg bg-muted/50 space-y-2"
                  data-testid={`plan-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{plan.title}</div>
                    <Badge variant="outline" className="gap-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(plan.status)}`}></div>
                      {plan.status}
                    </Badge>
                  </div>
                  {plan.description && (
                    <div className="text-sm text-muted-foreground">{plan.description}</div>
                  )}
                  {plan.currentProgress && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>Progress</span>
                        <span className="font-medium">
                          {(plan.currentProgress as any)?.completionPercent || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div 
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${(plan.currentProgress as any)?.completionPercent || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  {plan.alignmentScore !== null && (
                    <div className="text-xs">
                      Alignment Score: <span className="font-medium">{plan.alignmentScore?.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No strategic plans available</p>
              <p className="text-sm mt-1">Plans will appear here once created</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Learning Profile */}
      <Card data-testid="card-learning-profile">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Continuous Learning Profile
          </CardTitle>
          <CardDescription>Adaptive learning and weight optimization</CardDescription>
        </CardHeader>
        <CardContent>
          {learningLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : learningProfile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div data-testid="metric-learning-phase">
                  <div className="text-sm text-muted-foreground">Current Phase</div>
                  <Badge className="mt-1 gap-1">
                    <div className={`w-2 h-2 rounded-full ${getPhaseColor(learningProfile.currentPhase)}`}></div>
                    {learningProfile.currentPhase}
                  </Badge>
                </div>
                <div data-testid="metric-learning-confidence">
                  <div className="text-sm text-muted-foreground">Confidence Score</div>
                  <div className="text-2xl font-bold mt-1">
                    {(learningProfile.confidenceScore * 100).toFixed(1)}%
                  </div>
                </div>
                <div data-testid="metric-learning-iterations">
                  <div className="text-sm text-muted-foreground">Iterations</div>
                  <div className="text-2xl font-bold mt-1">
                    {learningProfile.iterationCount || 0}
                  </div>
                </div>
              </div>
              
              {learningProfile.cognitiveWeights && (
                <div>
                  <div className="text-sm font-medium mb-2">Cognitive Weights:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(learningProfile.cognitiveWeights as Record<string, any>).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground capitalize">{key}:</span>
                        <span className="font-medium">{typeof value === 'number' ? value.toFixed(2) : value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No learning profile available</p>
              <p className="text-sm mt-1">Profile will be created automatically</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Policy Compliance */}
      <Card data-testid="card-policy-compliance">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Policy Compliance Status
          </CardTitle>
          <CardDescription>Strategic policy enforcement and guardrails</CardDescription>
        </CardHeader>
        <CardContent>
          {complianceLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : compliance ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Compliance</span>
                <Badge variant={compliance.compliant ? 'default' : 'destructive'}>
                  {compliance.compliant ? 'Compliant' : 'Non-Compliant'}
                </Badge>
              </div>
              {compliance.activePolicies && (
                <div>
                  <div className="text-sm text-muted-foreground mb-2">
                    Active Policies: {compliance.activePolicies.length}
                  </div>
                  <div className="space-y-1">
                    {compliance.activePolicies.slice(0, 5).map((policy: any, idx: number) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30"
                        data-testid={`policy-${idx}`}
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span>{policy.policyType || 'Unknown Policy'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No compliance data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SimulationTab() {
  const { toast } = useToast();
  
  // Fetch simulations list
  const { data: simulations, isLoading: simulationsLoading, refetch } = useQuery({
    queryKey: ['/api/simulation/list'],
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Fetch strategic memory lessons
  const { data: lessons, isLoading: lessonsLoading } = useQuery({
    queryKey: ['/api/strategic/memory/lessons'],
    refetchInterval: 60000,
  });
  
  // Run simulation mutation
  const runSimulationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/simulation/run', {
        type: 'risk_assessment',
        description: 'Manual risk assessment simulation',
        inputState: {
          portfolioBalance: 10000,
          currentPositions: [],
        },
        actions: {
          riskLevel: 'moderate',
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Simulation Started',
        description: 'Risk assessment simulation has been initiated',
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Simulation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Extract lessons mutation
  const extractLessonsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/strategic/memory/extract', {});
    },
    onSuccess: () => {
      toast({
        title: 'Lessons Extracted',
        description: 'Strategic lessons have been extracted from simulations',
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Extraction Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const simulationsList = (simulations as any)?.simulations || [];
  const lessonsList = (lessons as any)?.lessons || [];
  
  return (
    <div className="space-y-4">
      {/* Simulations Overview */}
      <Card data-testid="card-simulations-overview">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Strategic Simulations
              </CardTitle>
              <CardDescription>
                Scenario simulations and outcome predictions
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => runSimulationMutation.mutate()}
              disabled={runSimulationMutation.isPending}
              data-testid="button-run-simulation"
            >
              {runSimulationMutation.isPending ? 'Running...' : 'Run Simulation'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {simulationsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : simulationsList.length > 0 ? (
            <div className="space-y-3">
              {simulationsList.slice(0, 5).map((sim: any, idx: number) => (
                <div 
                  key={sim.simulationId} 
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`simulation-${idx}`}
                >
                  <div className="flex-1">
                    <div className="font-medium">{sim.description || 'Simulation'}</div>
                    <div className="text-sm text-muted-foreground">
                      Type: {sim.type} • Status: {sim.evaluationStatus}
                    </div>
                  </div>
                  {sim.successScore !== null && (
                    <Badge variant={sim.successScore > 0.7 ? 'default' : 'secondary'}>
                      Score: {(sim.successScore * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No simulations available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategic Memory Lessons */}
      <Card data-testid="card-strategic-lessons">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Strategic Lessons
              </CardTitle>
              <CardDescription>
                Lessons extracted from completed simulations
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => extractLessonsMutation.mutate()}
              disabled={extractLessonsMutation.isPending}
              data-testid="button-extract-lessons"
            >
              {extractLessonsMutation.isPending ? 'Extracting...' : 'Extract Lessons'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {lessonsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : lessonsList.length > 0 ? (
            <div className="space-y-3">
              {lessonsList.slice(0, 5).map((lesson: any, idx: number) => (
                <div 
                  key={lesson.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`lesson-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium">{lesson.lessonTitle}</div>
                    <Badge variant="outline">{lesson.confidenceLevel}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {lesson.lessonContent?.substring(0, 150)}
                    {lesson.lessonContent?.length > 150 ? '...' : ''}
                  </div>
                  {lesson.applicableContexts && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {lesson.applicableContexts.map((context: string, cIdx: number) => (
                        <Badge key={cIdx} variant="secondary" className="text-xs">
                          {context}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No strategic lessons available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReflectionTab() {
  const { toast } = useToast();

  const { data: reflectionData, isLoading: reflectionsLoading } = useQuery({
    queryKey: ['/api/reflection/list'],
    refetchInterval: 60000,
  });

  const { data: auditData, isLoading: auditsLoading } = useQuery({
    queryKey: ['/api/reflection/audits'],
    refetchInterval: 60000,
  });

  const reflectMutation = useMutation({
    mutationFn: async (input: any) => {
      return apiRequest('POST', '/api/reflection/reflect', input);
    },
    onSuccess: () => {
      toast({
        title: 'Reflection Complete',
        description: 'New reflection analysis generated',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reflection/list'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Reflection Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reflections = reflectionData?.reflections || [];
  const audits = auditData?.audits || [];

  return (
    <div className="space-y-4">
      <Card data-testid="card-reflections">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Reflective Intelligence
            </CardTitle>
            <Button
              size="sm"
              onClick={() => reflectMutation.mutate({
                triggerSource: 'manual_ui_trigger',
                depth: 'analytical',
                subjectArea: 'system_state',
                contextData: {}
              })}
              disabled={reflectMutation.isPending}
              data-testid="button-trigger-reflection"
            >
              {reflectMutation.isPending ? 'Reflecting...' : 'Trigger Reflection'}
            </Button>
          </div>
          <CardDescription>Self-reflective analysis and meta-reasoning</CardDescription>
        </CardHeader>
        <CardContent>
          {reflectionsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : reflections.length > 0 ? (
            <div className="space-y-3">
              {reflections.slice(0, 5).map((ref: any, idx: number) => (
                <div 
                  key={ref.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`reflection-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium">{ref.subjectArea}</div>
                    <Badge variant={ref.reflectionDepth === 'meta' ? 'default' : 'secondary'}>
                      {ref.reflectionDepth}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">
                    {ref.analysisText?.substring(0, 150)}
                    {ref.analysisText?.length > 150 ? '...' : ''}
                  </div>
                  {ref.questionsRaised && ref.questionsRaised.length > 0 && (
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      Questions: {ref.questionsRaised.join('; ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No reflections available</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-decision-audits">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Decision Quality Audits
          </CardTitle>
          <CardDescription>Post-execution decision analysis</CardDescription>
        </CardHeader>
        <CardContent>
          {auditsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : audits.length > 0 ? (
            <div className="space-y-3">
              {audits.slice(0, 5).map((audit: any, idx: number) => (
                <div 
                  key={audit.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`audit-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium">{audit.decisionType}</div>
                    <Badge variant={
                      audit.qualityRating === 'excellent' ? 'default' :
                      audit.qualityRating === 'good' ? 'secondary' :
                      audit.qualityRating === 'fair' ? 'outline' : 'destructive'
                    }>
                      {audit.qualityRating}
                    </Badge>
                  </div>
                  {audit.lessonsLearned && (
                    <div className="text-sm text-muted-foreground">
                      {audit.lessonsLearned}
                    </div>
                  )}
                  {audit.biasDetected && audit.biasDetected.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {audit.biasDetected.map((bias: string, bIdx: number) => (
                        <Badge key={bIdx} variant="destructive" className="text-xs">
                          {bias}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No decision audits available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EthicsTab() {
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/ethics/status'],
    refetchInterval: 60000,
  });

  const { data: principlesData, isLoading: principlesLoading } = useQuery({
    queryKey: ['/api/ethics/principles'],
    refetchInterval: 60000,
  });

  const { data: violationsData, isLoading: violationsLoading } = useQuery({
    queryKey: ['/api/ethics/violations'],
    refetchInterval: 60000,
  });

  const status = (statusData as any) || {};
  const principles = Array.isArray((principlesData as any)?.principles) ? (principlesData as any).principles : [];
  const violations = Array.isArray((violationsData as any)?.violations) ? (violationsData as any).violations : [];

  return (
    <div className="space-y-4">
      <Card data-testid="card-ethics-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Ethical Alignment Status
          </CardTitle>
          <CardDescription>
            Overall ethical compliance and principle adherence
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : status && status.ok !== false ? (
            <div className="space-y-4">
              <div className={`p-6 rounded-lg border-2 ${status.status === 'compliant' ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-lg font-semibold mb-1">
                      Alignment Score: {typeof status.alignmentScore === 'number' ? status.alignmentScore.toFixed(0) : '0'}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Status: {status.status === 'compliant' ? 'Compliant' : 'At Risk'}
                    </div>
                  </div>
                  <Badge 
                    variant={status.status === 'compliant' ? 'default' : 'secondary'}
                    className="text-lg px-4 py-2"
                    data-testid="badge-ethics-status"
                  >
                    {status.status === 'compliant' ? 'COMPLIANT' : 'AT RISK'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <div className="text-2xl font-bold" data-testid="text-violations-today">
                      {typeof status.violationsToday === 'number' ? status.violationsToday : 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Violations Today</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold" data-testid="text-principle-count">
                      {typeof status.principleCount === 'number' ? status.principleCount : 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Active Principles</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold" data-testid="text-principle-health">
                      {typeof status.principleHealth === 'number' ? status.principleHealth.toFixed(0) : '0'}%
                    </div>
                    <div className="text-xs text-muted-foreground">Principle Health</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No status data available</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-ethical-principles">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Ethical Principles ({principles.length})
            </CardTitle>
            <CardDescription>
              Active ethical guidelines governing system behavior
            </CardDescription>
          </CardHeader>
          <CardContent>
            {principlesLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : principles.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {principles.map((principle: any, idx: number) => (
                  <div 
                    key={principle.id} 
                    className="p-3 rounded-lg border"
                    data-testid={`principle-${idx}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold">{principle.name}</div>
                      <Badge 
                        variant={principle.enabled ? 'default' : 'secondary'}
                        data-testid={`badge-principle-status-${idx}`}
                      >
                        {principle.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {principle.description}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Type: {principle.type}</span>
                      <span>Priority: {principle.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No principles configured</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-ethics-violations">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Recent Violations
            </CardTitle>
            <CardDescription>
              Latest ethical principle violations detected
            </CardDescription>
          </CardHeader>
          <CardContent>
            {violationsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : violations.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {violations.slice(0, 10).map((violation: any, idx: number) => (
                  <div 
                    key={violation.id} 
                    className={`p-3 rounded-lg border-l-4 ${
                      violation.severity === 'critical' ? 'border-l-red-500 bg-red-50 dark:bg-red-950' :
                      violation.severity === 'high' ? 'border-l-orange-500 bg-orange-50 dark:bg-orange-950' :
                      violation.severity === 'medium' ? 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950' :
                      'border-l-blue-500 bg-blue-50 dark:bg-blue-950'
                    }`}
                    data-testid={`violation-${idx}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold">{violation.action_type}</div>
                      <Badge 
                        variant={
                          violation.severity === 'critical' || violation.severity === 'high' ? 'destructive' :
                          violation.severity === 'medium' ? 'secondary' :
                          'outline'
                        }
                        data-testid={`badge-violation-severity-${idx}`}
                      >
                        {violation.severity}
                      </Badge>
                    </div>
                    <div className="text-sm mb-2">{violation.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(violation.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No violations detected</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CollaborationTab() {
  const { toast } = useToast();

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['/api/collaboration/sessions'],
    refetchInterval: 30000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/collaboration/stats'],
    refetchInterval: 30000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ['/api/collaboration/agents'],
    refetchInterval: 60000,
  });

  const sessions = sessionsData?.sessions || [];
  const stats = statsData?.stats;
  const agents = agentsData?.agents || [];

  return (
    <div className="space-y-4">
      <Card data-testid="card-collaboration-stats">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Collaboration Statistics
          </CardTitle>
          <CardDescription>Cross-domain agent collaboration metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold" data-testid="text-active-sessions">
                  {stats.activeSessions}
                </div>
                <div className="text-sm text-muted-foreground">Active Sessions</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {stats.totalSessions}
                </div>
                <div className="text-sm text-muted-foreground">Total Sessions</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {stats.completedSessions}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {(stats.averageConsensusScore * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-muted-foreground">Avg Consensus</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No collaboration stats available</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-active-sessions">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Active Sessions ({sessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.slice(0, 5).map((session: any, idx: number) => (
                  <div 
                    key={session.id} 
                    className="p-3 rounded-lg border"
                    data-testid={`session-${idx}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-medium text-sm">{session.topic}</div>
                      <Badge variant={
                        session.consensusState === 'agreed' ? 'default' :
                        session.consensusState === 'disagreed' ? 'destructive' :
                        session.consensusState === 'evaluating' ? 'outline' :
                        'secondary'
                      }>
                        {session.consensusState}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {session.participants?.length || 0} participants
                    </div>
                    {session.consensusScore !== null && (
                      <div className="text-xs mt-1">
                        Consensus: {(session.consensusScore * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No active collaboration sessions</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-domain-agents">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              Domain Agents ({agents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {agents.map((agent: any, idx: number) => (
                <div key={idx} className="p-2 rounded border text-sm">
                  <div className="font-medium">{agent.agentId}</div>
                  <div className="text-muted-foreground text-xs">
                    {agent.capabilities?.join(', ') || 'No capabilities listed'}
                  </div>
                  <div className="text-xs mt-1">
                    Priority: {agent.priority}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LearningTab() {
  const { toast } = useToast();

  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['/api/learning/stats'],
    refetchInterval: 30000,
  });

  const stats = statsData?.summary;

  return (
    <div className="space-y-4">
      <Card data-testid="card-learning-stats">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            Learning Feedback Statistics
          </CardTitle>
          <CardDescription>Agent performance tracking and cooperative learning metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : stats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold" data-testid="text-total-feedback">
                    {stats.totalFeedbackRecords}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Feedback Records</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {stats.agentMetrics?.length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Active Agents</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {stats.topPerformers?.length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Top Performers</div>
                </div>
              </div>

              {stats.topPerformers && stats.topPerformers.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Top Performing Agents</div>
                  <div className="flex flex-wrap gap-2">
                    {stats.topPerformers.map((agent: string) => (
                      <Badge key={agent} variant="default" data-testid={`badge-top-${agent}`}>
                        {agent}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {stats.needsImprovement && stats.needsImprovement.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Needs Improvement</div>
                  <div className="flex flex-wrap gap-2">
                    {stats.needsImprovement.map((agent: string) => (
                      <Badge key={agent} variant="destructive" data-testid={`badge-needs-${agent}`}>
                        {agent}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No learning stats available</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-agent-performance">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Agent Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : stats?.agentMetrics && stats.agentMetrics.length > 0 ? (
            <div className="space-y-3">
              {stats.agentMetrics.map((metric: any, idx: number) => (
                <div 
                  key={`${metric.agentName}-${metric.domain}`} 
                  className="p-3 rounded-lg border"
                  data-testid={`agent-metric-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium">{metric.agentName}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        Domain: {metric.domain}
                      </div>
                    </div>
                    <Badge variant={
                      metric.accuracy >= 0.85 ? 'default' :
                      metric.accuracy >= 0.7 ? 'outline' :
                      'destructive'
                    }>
                      {(metric.accuracy * 100).toFixed(0)}% accuracy
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div>
                      <span className="text-muted-foreground">Alignment:</span>
                      <span className="ml-1 font-medium">{(metric.alignment * 100).toFixed(0)}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Feedback:</span>
                      <span className="ml-1 font-medium">{metric.feedbackCount}</span>
                    </div>
                    <div className="text-right">
                      {metric.accuracy >= 0.85 && (
                        <span className="text-green-600">✓ Excellent</span>
                      )}
                      {metric.accuracy < 0.6 && (
                        <span className="text-red-600">⚠ Low</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No agent performance data</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OversightTab() {
  const { toast } = useToast();

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['/api/oversight/summary'],
    refetchInterval: 60000,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['/api/oversight/logs'],
    refetchInterval: 60000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ logId, resolution }: { logId: string; resolution: string }) => {
      return apiRequest('POST', '/api/oversight/resolve', { logId, resolution });
    },
    onSuccess: () => {
      toast({
        title: 'Flag Resolved',
        description: 'Meta-cognitive flag has been marked as resolved',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/oversight/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/oversight/summary'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Resolution Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const summary = (summaryData as any)?.summary;
  const logs = (logsData as any)?.logs || [];

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-500',
      medium: 'bg-yellow-500',
      high: 'bg-red-500',
      critical: 'bg-red-700',
    };
    return colors[severity] || 'bg-gray-500';
  };

  return (
    <div className="space-y-4">
      <Card data-testid="card-oversight-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Meta-Cognitive Oversight Summary
          </CardTitle>
          <CardDescription>System-level trend analysis and issue detection</CardDescription>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : summary ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold" data-testid="text-total-flags">
                    {summary.totalFlags}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Flags</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {summary.unresolvedFlags}
                  </div>
                  <div className="text-sm text-muted-foreground">Unresolved</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {summary.highSeverity}
                  </div>
                  <div className="text-sm text-muted-foreground">High Severity</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">
                    {summary.recentTrends}
                  </div>
                  <div className="text-sm text-muted-foreground">Recent Trends</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No oversight summary available</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-oversight-logs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Oversight Flags & Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : logs.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {logs.map((log: any, idx: number) => (
                <div 
                  key={log.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`oversight-log-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getSeverityColor(log.severity)} data-testid={`badge-severity-${idx}`}>
                          {log.severity}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-flag-type-${idx}`}>
                          {log.flagType}
                        </Badge>
                        {log.resolved && (
                          <Badge variant="secondary" data-testid={`badge-resolved-${idx}`}>
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium mb-1">{log.description}</div>
                      {log.recommendation && (
                        <div className="text-xs text-muted-foreground">
                          💡 {log.recommendation}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-2">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                    {!log.resolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveMutation.mutate({ 
                          logId: log.id, 
                          resolution: 'Resolved via UI' 
                        })}
                        disabled={resolveMutation.isPending}
                        data-testid={`button-resolve-${idx}`}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No oversight flags detected</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemoryTab() {
  const { toast } = useToast();

  const { data: archivesData, isLoading: archivesLoading } = useQuery({
    queryKey: ['/api/memory/archives'],
    refetchInterval: 30000,
  });

  const { data: calibrationsData, isLoading: calibrationsLoading } = useQuery({
    queryKey: ['/api/memory/calibration'],
    refetchInterval: 30000,
  });

  const archives = (archivesData as any)?.archives || [];
  const calibrations = (calibrationsData as any)?.calibrations || [];

  const getScopeColor = (scope: string) => {
    const colors: Record<string, string> = {
      tactical: 'bg-blue-500',
      strategic: 'bg-purple-500',
      meta: 'bg-orange-500',
      short_term: 'bg-green-500',
      medium_term: 'bg-yellow-500',
      long_term: 'bg-red-500',
    };
    return colors[scope] || 'bg-gray-500';
  };

  return (
    <div className="space-y-4">
      <Card data-testid="card-memory-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Strategic Memory Overview
          </CardTitle>
          <CardDescription>
            Long-term knowledge archival and cognitive parameter tuning
          </CardDescription>
        </CardHeader>
        <CardContent>
          {archivesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <div className="text-sm text-muted-foreground mb-1">Total Archives</div>
                <div className="text-2xl font-bold" data-testid="text-total-archives">
                  {archives.length}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <div className="text-sm text-muted-foreground mb-1">Calibrations</div>
                <div className="text-2xl font-bold" data-testid="text-total-calibrations">
                  {calibrations.length}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <div className="text-sm text-muted-foreground mb-1">Recent Changes</div>
                <div className="text-2xl font-bold" data-testid="text-recent-changes">
                  {calibrations.filter((c: any) => {
                    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return new Date(c.createdAt) > twentyFourHoursAgo;
                  }).length}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-memory-archives">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Strategic Memory Archives
          </CardTitle>
        </CardHeader>
        <CardContent>
          {archivesLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : archives.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {archives.slice(0, 10).map((archive: any, idx: number) => (
                <div 
                  key={archive.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`memory-archive-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getScopeColor(archive.memoryScope)} data-testid={`badge-scope-${idx}`}>
                          {archive.memoryScope}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-agent-${idx}`}>
                          {archive.agentName}
                        </Badge>
                        {archive.performanceDelta && archive.performanceDelta > 0 && (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300">
                            +{(archive.performanceDelta * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium mb-1">{archive.summary}</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Archived: {new Date(archive.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No strategic memories archived yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-calibration-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Model Calibration History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {calibrationsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : calibrations.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {calibrations.slice(0, 10).map((cal: any, idx: number) => (
                <div 
                  key={cal.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`calibration-${idx}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" data-testid={`badge-cal-agent-${idx}`}>
                          {cal.agentName}
                        </Badge>
                        <Badge variant="secondary" data-testid={`badge-parameter-${idx}`}>
                          {cal.parameter}
                        </Badge>
                        <Badge 
                          className={cal.newValue > cal.oldValue ? 'bg-green-500' : cal.newValue < cal.oldValue ? 'bg-red-500' : 'bg-gray-500'}
                          data-testid={`badge-change-${idx}`}
                        >
                          {cal.oldValue.toFixed(3)} → {cal.newValue.toFixed(3)}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{cal.reason}</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {new Date(cal.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No model calibrations performed yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CoreTab() {
  const { toast } = useToast();

  const { data: coreStatusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/core/status'],
    refetchInterval: 120000, // 2 minutes
  });

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['/api/core/agents'],
    refetchInterval: 120000,
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/core/optimize', {});
    },
    onSuccess: () => {
      toast({
        title: "Optimization Complete",
        description: "Unified cognitive core optimization cycle completed successfully",
      });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Optimization Failed",
        description: error.message || "Failed to run optimization cycle",
        variant: "destructive",
      });
    },
  });

  const status = (coreStatusData as any)?.status || null;
  const agents = (agentsData as any)?.agents || [];

  const latestCycle = status?.latestCycle;
  const activeAgents = status?.activeAgents || 0;
  const metrics = status?.metrics;

  return (
    <div className="space-y-4">
      <Card data-testid="card-core-overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            Cognitive Core Status
          </CardTitle>
          <CardDescription>
            Unified cognitive core optimization and subsystem synchronization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-secondary/30">
                  <div className="text-sm text-muted-foreground mb-1">Cycle ID</div>
                  <div className="text-lg font-mono truncate" data-testid="text-cycle-id">
                    {latestCycle?.cycleId || 'N/A'}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-secondary/30">
                  <div className="text-sm text-muted-foreground mb-1">Optimization Type</div>
                  <div className="text-lg font-semibold capitalize" data-testid="text-optimization-type">
                    {latestCycle?.optimizationType?.replace('_', ' ') || 'N/A'}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-secondary/30">
                  <div className="text-sm text-muted-foreground mb-1">Global Score</div>
                  <div className="text-2xl font-bold" data-testid="text-global-score">
                    {latestCycle?.score ? (latestCycle.score * 100).toFixed(1) + '%' : 'N/A'}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-secondary/30">
                  <div className="text-sm text-muted-foreground mb-1">Active Agents</div>
                  <div className="text-2xl font-bold" data-testid="text-active-agents">
                    {activeAgents}
                  </div>
                </div>
              </div>

              {metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Stability</div>
                    <div className="text-lg font-semibold">
                      {(metrics.stabilityScore * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Bias</div>
                    <div className="text-lg font-semibold">
                      {(metrics.biasScore * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Learning</div>
                    <div className="text-lg font-semibold">
                      {(metrics.learningScore * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Memory</div>
                    <div className="text-lg font-semibold">
                      {(metrics.memoryScore * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-center">
                <Button 
                  onClick={() => optimizeMutation.mutate()}
                  disabled={optimizeMutation.isPending}
                  data-testid="button-force-optimization"
                >
                  {optimizeMutation.isPending ? 'Optimizing...' : 'Force Optimization Cycle'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-active-agents">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Agent Registry
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : agents.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {agents.slice(0, 20).map((agent: any, idx: number) => (
                <div 
                  key={agent.id} 
                  className="p-3 rounded-lg border"
                  data-testid={`agent-${idx}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" data-testid={`badge-agent-name-${idx}`}>
                          {agent.agentName}
                        </Badge>
                        <Badge variant="secondary" data-testid={`badge-domain-${idx}`}>
                          {agent.domain}
                        </Badge>
                        <Badge 
                          className={
                            agent.state === 'active' ? 'bg-green-500' : 
                            agent.state === 'idle' ? 'bg-yellow-500' : 
                            agent.state === 'suspended' ? 'bg-orange-500' : 
                            'bg-gray-500'
                          }
                          data-testid={`badge-state-${idx}`}
                        >
                          {agent.state}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-muted-foreground">
                          Performance: <span className="font-semibold">{(agent.performance * 100).toFixed(0)}%</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(agent.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No agents registered yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SafetyTab() {
  const { toast } = useToast();
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false);

  const { data: safetyStatusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/safety/status'],
    refetchInterval: 60000, // 1 minute
  });

  const toggleKillSwitchMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return await apiRequest('POST', '/api/safety/kill-switch', { 
        enabled, 
        reason: enabled ? 'Manual activation from UI' : 'Manual deactivation from UI' 
      });
    },
    onSuccess: (data: any) => {
      const newStatus = data.killSwitch?.is_enabled;
      setKillSwitchEnabled(newStatus);
      toast({
        title: newStatus ? "Kill Switch Activated" : "Kill Switch Deactivated",
        description: newStatus 
          ? "All trading and execution operations are now blocked" 
          : "Trading and execution operations are now allowed",
        variant: newStatus ? "destructive" : "default",
      });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Toggle Failed",
        description: error.message || "Failed to toggle kill switch",
        variant: "destructive",
      });
    },
  });

  const status = (safetyStatusData as any) || null;
  const recentEvents = status?.recentEvents || [];
  const activePolicies = status?.activePolicies || [];
  const killSwitch = status?.killSwitch;

  // Sync kill switch state
  useEffect(() => {
    if (killSwitch) {
      setKillSwitchEnabled(killSwitch.is_enabled);
    }
  }, [killSwitch]);

  return (
    <div className="space-y-4">
      <Card data-testid="card-kill-switch">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Kill Switch Control
          </CardTitle>
          <CardDescription>
            Emergency stop for all trading and execution operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-4">
              <div className={`p-6 rounded-lg border-2 ${killSwitchEnabled ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-green-500 bg-green-50 dark:bg-green-950'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-lg font-semibold mb-1">
                      Status: {killSwitchEnabled ? 'ACTIVE' : 'INACTIVE'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {killSwitchEnabled 
                        ? 'All trading operations are blocked' 
                        : 'Trading operations are allowed'}
                    </div>
                  </div>
                  <Badge 
                    variant={killSwitchEnabled ? 'destructive' : 'default'}
                    className="text-lg px-4 py-2"
                    data-testid="badge-kill-switch-status"
                  >
                    {killSwitchEnabled ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
                
                <Button 
                  onClick={() => toggleKillSwitchMutation.mutate(!killSwitchEnabled)}
                  disabled={toggleKillSwitchMutation.isPending}
                  variant={killSwitchEnabled ? 'default' : 'destructive'}
                  className="w-full"
                  data-testid="button-toggle-kill-switch"
                >
                  {toggleKillSwitchMutation.isPending 
                    ? 'Toggling...' 
                    : killSwitchEnabled 
                      ? 'Deactivate Kill Switch' 
                      : 'Activate Kill Switch'}
                </Button>

                {killSwitch?.activated_at && (
                  <div className="mt-4 pt-4 border-t text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Toggled:</span>
                      <span className="font-medium">
                        {new Date(killSwitch.activated_at).toLocaleString()}
                      </span>
                    </div>
                    {killSwitch.reason && (
                      <div className="mt-2">
                        <span className="text-muted-foreground">Reason: </span>
                        <span className="font-medium">{killSwitch.reason}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-safety-policies">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Active Policies
            </CardTitle>
            <CardDescription>
              Safety policies currently enforced
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : activePolicies.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {activePolicies.map((policy: any, idx: number) => (
                  <div 
                    key={policy.id} 
                    className="p-3 rounded-lg border"
                    data-testid={`policy-${idx}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold">{policy.policy_name}</div>
                      <Badge 
                        variant={policy.enabled ? 'default' : 'secondary'}
                        data-testid={`badge-policy-status-${idx}`}
                      >
                        {policy.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Scope: {policy.scope}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Updated: {new Date(policy.updated_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No active policies configured</p>
              </div>
            )}
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-medium">
                Total Active Policies: {status?.totalActivePolicies || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-safety-events">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Recent Safety Events
            </CardTitle>
            <CardDescription>
              Latest safety-related events and violations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : recentEvents.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {recentEvents.map((event: any, idx: number) => (
                  <div 
                    key={event.id} 
                    className={`p-3 rounded-lg border-l-4 ${
                      event.severity === 'critical' ? 'border-l-red-500 bg-red-50 dark:bg-red-950' :
                      event.severity === 'high' ? 'border-l-orange-500 bg-orange-50 dark:bg-orange-950' :
                      event.severity === 'medium' ? 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950' :
                      'border-l-blue-500 bg-blue-50 dark:bg-blue-950'
                    }`}
                    data-testid={`event-${idx}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold">{event.event_type}</div>
                      <Badge 
                        variant={
                          event.severity === 'critical' || event.severity === 'high' ? 'destructive' :
                          event.severity === 'medium' ? 'secondary' :
                          'outline'
                        }
                        data-testid={`badge-event-severity-${idx}`}
                      >
                        {event.severity}
                      </Badge>
                    </div>
                    {event.message && (
                      <div className="text-sm mb-2">{event.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No recent safety events</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Phase 27.F.14.B Task 6: LATTI Safety Audit & Bound Verification */}
      <LATTISafetyMonitor />
    </div>
  );
}

function FederationTab() {
  const { toast } = useToast();

  // Fetch federation status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/federation/status'],
    refetchInterval: 60000, // 60 seconds
  });

  // Fetch recent sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['/api/ethics/collab/sessions'],
    refetchInterval: 60000, // 60 seconds
  });

  // Fetch open conflicts
  const { data: conflictsData, isLoading: conflictsLoading } = useQuery({
    queryKey: ['/api/ethics/collab/conflicts'],
    refetchInterval: 60000, // 60 seconds
  });

  // Force Propagation mutation
  const forcePropagationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/federation/propagate', { updates: [] });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Propagation Initiated",
        description: data.message || "Federated ethics propagation completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/federation/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Propagation Failed",
        description: error.message || "Failed to initiate propagation",
        variant: "destructive",
      });
    },
  });

  // Run Mediation Pass mutation
  const runMediationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ethics/collab/mediate', {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Mediation Pass Complete",
        description: data.message || "Ethics conflict mediation completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ethics/collab/conflicts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Mediation Failed",
        description: error.message || "Failed to run mediation pass",
        variant: "destructive",
      });
    },
  });

  const status = (statusData as any) || null;
  const sessions = (sessionsData as any)?.sessions || [];
  const conflicts = (conflictsData as any)?.conflicts || [];

  return (
    <div className="space-y-4">
      {/* Federated Status Card */}
      <Card data-testid="card-federation-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Federated Status
          </CardTitle>
          <CardDescription>
            Multi-agent ethical consensus state across all domains
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : status ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Snapshot Timestamp</div>
                  <div className="text-lg font-semibold" data-testid="text-snapshot-timestamp">
                    {status.snapshot?.timestamp 
                      ? new Date(status.snapshot.timestamp).toLocaleString() 
                      : 'N/A'}
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Domains Covered</div>
                  <div className="text-lg font-semibold" data-testid="text-domains-count">
                    {status.domainsActive?.length || 0} domains
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Open Conflicts</div>
                  <div className="text-lg font-semibold" data-testid="text-open-conflicts">
                    {status.openConflicts || 0}
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Last Propagation</div>
                  <div className="text-lg font-semibold" data-testid="text-last-propagation">
                    {status.lastPropagation 
                      ? new Date(status.lastPropagation).toLocaleString() 
                      : 'N/A'}
                  </div>
                </div>
              </div>

              {status.lastConsensus && (
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm font-medium mb-2">Last Consensus</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge 
                        variant={
                          status.lastConsensus.verdict === 'approved' ? 'default' : 
                          status.lastConsensus.verdict === 'rejected' ? 'destructive' : 
                          'secondary'
                        }
                        data-testid="badge-consensus-verdict"
                      >
                        {status.lastConsensus.verdict || 'N/A'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Confidence: <span className="font-semibold" data-testid="text-consensus-confidence">
                        {status.lastConsensus.confidence 
                          ? `${(status.lastConsensus.confidence * 100).toFixed(1)}%` 
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No federation status available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions & Conflicts Card */}
      <Card data-testid="card-sessions-conflicts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Sessions & Conflicts
          </CardTitle>
          <CardDescription>
            Recent consensus sessions and open conflicts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Recent Sessions */}
            <div>
              <div className="text-sm font-medium mb-3">Recent Sessions</div>
              {sessionsLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : sessions.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {sessions.slice(0, 20).map((session: any, idx: number) => (
                    <div 
                      key={session.sessionId || idx} 
                      className="p-3 rounded-lg border"
                      data-testid={`session-${idx}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-sm font-semibold truncate max-w-[60%]">
                          {session.sessionId || 'Unknown Session'}
                        </div>
                        <Badge 
                          variant={
                            session.verdict === 'approved' ? 'default' : 
                            session.verdict === 'rejected' ? 'destructive' : 
                            'secondary'
                          }
                          data-testid={`badge-session-verdict-${idx}`}
                        >
                          {session.verdict || 'N/A'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Domains: {session.domains?.join(', ') || 'N/A'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Confidence: {session.confidence ? `${(session.confidence * 100).toFixed(1)}%` : 'N/A'} | 
                        {session.createdAt && ` ${new Date(session.createdAt).toLocaleString()}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No federated sessions yet
                </div>
              )}
            </div>

            {/* Open Conflicts */}
            <div>
              <div className="text-sm font-medium mb-3">Open Conflicts</div>
              {conflictsLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : conflicts.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {conflicts.map((conflict: any, idx: number) => (
                    <div 
                      key={conflict.conflictId || idx} 
                      className="p-3 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950"
                      data-testid={`conflict-${idx}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-sm font-semibold truncate max-w-[60%]">
                          {conflict.conflictId || 'Unknown Conflict'}
                        </div>
                        <Badge 
                          variant="secondary"
                          data-testid={`badge-conflict-status-${idx}`}
                        >
                          {conflict.resolutionStatus || 'open'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Sources: {conflict.conflictingSources?.join(', ') || 'N/A'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {conflict.detectedAt && `Detected: ${new Date(conflict.detectedAt).toLocaleString()}`}
                      </div>
                      {conflict.resolutionRationale && (
                        <div className="text-xs mt-2 text-muted-foreground">
                          Reason: {conflict.resolutionRationale}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No open conflicts
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Tools Card */}
      <Card data-testid="card-admin-tools">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Admin Tools
          </CardTitle>
          <CardDescription>
            Manual controls for federated ethics operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button 
              onClick={() => forcePropagationMutation.mutate()}
              disabled={forcePropagationMutation.isPending}
              variant="outline"
              className="w-full"
              data-testid="button-force-propagation"
            >
              {forcePropagationMutation.isPending ? 'Propagating...' : 'Force Propagation'}
            </Button>
            <Button 
              onClick={() => runMediationMutation.mutate()}
              disabled={runMediationMutation.isPending}
              variant="outline"
              className="w-full"
              data-testid="button-run-mediation"
            >
              {runMediationMutation.isPending ? 'Mediating...' : 'Run Mediation Pass'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PerformanceTab() {
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ['/api/system/performance'],
    refetchInterval: 60000, // 60 seconds
  });

  const { data: autoscaleData, isLoading: autoscaleLoading } = useQuery({
    queryKey: ['/api/system/autoscale/hints'],
    refetchInterval: 60000, // 60 seconds
  });

  const perfResponse = (perfData as any) || null;
  const performance = perfResponse?.performance || null;
  const autoscale = (autoscaleData as any) || null;

  // Calculate success rate from task queue metrics
  const calculateSuccessRate = () => {
    if (!performance?.taskQueue) return null;
    const { totalProcessed, totalFailed } = performance.taskQueue;
    const totalCompleted = totalProcessed + totalFailed;
    if (totalCompleted === 0) return null; // No tasks completed yet
    return (totalProcessed / totalCompleted) * 100;
  };

  const successRate = calculateSuccessRate();

  return (
    <div className="space-y-4">
      {/* System Health Card */}
      <Card data-testid="card-system-health">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Health
          </CardTitle>
          <CardDescription>
            Overall system performance and queue metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perfLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : performance ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Health Score</div>
                <div className="text-3xl font-bold" data-testid="text-health-score">
                  {performance.overallHealthScore?.toFixed(1) || 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  out of 100
                </div>
              </div>
              
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Queue Depth</div>
                <div className="text-3xl font-bold" data-testid="text-queue-depth">
                  {performance.taskQueue?.currentDepth ?? 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  tasks pending
                </div>
              </div>
              
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
                <div className="text-3xl font-bold" data-testid="text-success-rate">
                  {successRate !== null ? successRate.toFixed(1) : 'N/A'}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  task completion
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No performance data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latency Metrics Card */}
      <Card data-testid="card-latency-metrics">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Latency Metrics
          </CardTitle>
          <CardDescription>
            Task queue and reasoning performance timing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {perfLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : performance?.taskQueue || performance?.reasoning ? (
            <div className="space-y-4">
              {/* Task Queue Latency */}
              {performance.taskQueue && (
                <div>
                  <div className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Task Queue Processing
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground mb-1">Average</div>
                      <div className="text-xl font-bold" data-testid="text-queue-p50">
                        {performance.taskQueue.avgProcessingTime?.toFixed(1) || 'N/A'} ms
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground mb-1">p95</div>
                      <div className="text-xl font-bold" data-testid="text-queue-p95">
                        {performance.taskQueue.p95ProcessingTime?.toFixed(1) || 'N/A'} ms
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reasoning Latency */}
              {performance.reasoning && (
                <div>
                  <div className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Autonomy Reasoning
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground mb-1">p50</div>
                      <div className="text-xl font-bold" data-testid="text-reasoning-p50">
                        {performance.reasoning.p50?.toFixed(1) || 'N/A'} ms
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground mb-1">p95</div>
                      <div className="text-xl font-bold" data-testid="text-reasoning-p95">
                        {performance.reasoning.p95?.toFixed(1) || 'N/A'} ms
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground mb-1">p99</div>
                      <div className="text-xl font-bold" data-testid="text-reasoning-p99">
                        {performance.reasoning.p99?.toFixed(1) || 'N/A'} ms
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No latency data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Autoscale Recommendations Card */}
      <Card data-testid="card-autoscale">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Autoscale Recommendations
          </CardTitle>
          <CardDescription>
            Intelligent worker scaling based on queue depth and latency
          </CardDescription>
        </CardHeader>
        <CardContent>
          {autoscaleLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : autoscale ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Recommended Workers</div>
                  <div className="text-3xl font-bold" data-testid="text-recommended-workers">
                    {autoscale.recommendedWorkers ?? 'N/A'}
                  </div>
                </div>
                
                {autoscale.reason && (
                  <div className="text-sm text-muted-foreground border-t pt-3">
                    <div className="font-medium mb-1">Reason:</div>
                    <div data-testid="text-autoscale-reason">{autoscale.reason}</div>
                  </div>
                )}
              </div>

              {autoscale.metrics && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="text-xs text-muted-foreground mb-1">Current Queue</div>
                    <div className="text-lg font-bold">
                      {autoscale.metrics.queueDepth ?? 'N/A'}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border bg-card">
                    <div className="text-xs text-muted-foreground mb-1">Reasoning p95</div>
                    <div className="text-lg font-bold">
                      {autoscale.metrics.reasoningP95?.toFixed(1) || 'N/A'} ms
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No autoscale data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IntrospectionTab({ 
  introspection, 
  introspectionLoading, 
  biases, 
  biasesLoading, 
  driftPoints, 
  driftLoading,
  runMitigationMutation 
}: {
  introspection?: IntrospectionSummary;
  introspectionLoading: boolean;
  biases: BiasObservation[];
  biasesLoading: boolean;
  driftPoints: ConfidenceDrift[];
  driftLoading: boolean;
  runMitigationMutation: any;
}) {
  // Group biases by type for breakdown
  const biasCounts = biases.reduce((acc, bias) => {
    acc[bias.biasType] = (acc[bias.biasType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-bias-index">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bias Index</CardTitle>
          </CardHeader>
          <CardContent>
            {introspectionLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : introspection ? (
              <div>
                <div className="text-3xl font-bold" data-testid="text-bias-index">
                  {introspection.biasIndex}
                </div>
                <Badge 
                  variant={introspection.biasIndex > 70 ? 'destructive' : introspection.biasIndex > 40 ? 'default' : 'secondary'}
                  className="mt-2"
                >
                  {introspection.biasIndex > 70 ? 'High' : introspection.biasIndex > 40 ? 'Moderate' : 'Low'}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-confidence-stability">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Confidence Stability</CardTitle>
          </CardHeader>
          <CardContent>
            {introspectionLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : introspection ? (
              <div>
                <div className="text-3xl font-bold" data-testid="text-confidence-stability">
                  {(introspection.confidenceStability * 100).toFixed(1)}%
                </div>
                <Badge 
                  variant={introspection.confidenceStability > 0.8 ? 'secondary' : introspection.confidenceStability > 0.6 ? 'default' : 'destructive'}
                  className="mt-2"
                >
                  {introspection.confidenceStability > 0.8 ? 'Stable' : introspection.confidenceStability > 0.6 ? 'Moderate' : 'Unstable'}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-reasoning-quality">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Reasoning Quality</CardTitle>
          </CardHeader>
          <CardContent>
            {introspectionLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : introspection ? (
              <div>
                <div className="text-3xl font-bold" data-testid="text-reasoning-quality">
                  {((introspection.reasoningQuality ?? 1) * 100).toFixed(0)}%
                </div>
                <Badge 
                  variant={(introspection.reasoningQuality ?? 1) > 0.85 ? 'secondary' : (introspection.reasoningQuality ?? 1) > 0.7 ? 'default' : 'destructive'}
                  className="mt-2"
                >
                  {(introspection.reasoningQuality ?? 1) > 0.85 ? 'Excellent' : (introspection.reasoningQuality ?? 1) > 0.7 ? 'Good' : 'Poor'}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-biases">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Biases (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {introspectionLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : introspection ? (
              <div>
                <div className="text-3xl font-bold" data-testid="text-total-biases">
                  {introspection.totalBiasesDetected}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Last: {new Date(introspection.lastAnalysis).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bias Breakdown & Mitigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-bias-breakdown">
          <CardHeader>
            <CardTitle>Bias Type Breakdown</CardTitle>
            <CardDescription>Distribution of detected cognitive biases</CardDescription>
          </CardHeader>
          <CardContent>
            {biasesLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : Object.keys(biasCounts).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(biasCounts).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between" data-testid={`bias-type-${type}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        type === 'confirmation' ? 'bg-red-500' :
                        type === 'recency' ? 'bg-orange-500' :
                        type === 'anchoring' ? 'bg-yellow-500' :
                        type === 'overconfidence' ? 'bg-blue-500' :
                        type === 'availability' ? 'bg-purple-500' :
                        'bg-pink-500'
                      }`}></div>
                      <span className="capitalize text-sm">{type.replace('_', ' ')}</span>
                    </div>
                    <Badge variant="outline" data-testid={`count-${type}`}>{count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ScanLine className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No biases detected in last 24h</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-mitigation-control">
          <CardHeader>
            <CardTitle>Bias Mitigation</CardTitle>
            <CardDescription>Apply corrections to detected cognitive biases</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border bg-muted/50">
                <h4 className="text-sm font-medium mb-2">Mitigation Status</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Automated mitigation runs every 8 hours. You can trigger a manual cycle below.
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" />
                  <span className="text-muted-foreground">Next auto-run in:</span>
                  <span className="font-medium">~6h</span>
                </div>
              </div>
              
              <Button 
                onClick={() => runMitigationMutation.mutate()}
                disabled={runMitigationMutation.isPending}
                className="w-full"
                data-testid="button-run-mitigation"
              >
                {runMitigationMutation.isPending ? (
                  <>
                    <Activity className="w-4 h-4 mr-2 animate-spin" />
                    Running Mitigation...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Run Mitigation Now
                  </>
                )}
              </Button>
              
              {introspection && introspection.biasIndex > 70 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">High Bias Index</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Consider running mitigation to improve reasoning quality
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confidence Drift Chart */}
      <Card data-testid="card-confidence-drift">
        <CardHeader>
          <CardTitle>Confidence Drift Analysis</CardTitle>
          <CardDescription>Confidence level variations over last 48 hours</CardDescription>
        </CardHeader>
        <CardContent>
          {driftLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : driftPoints.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={driftPoints}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value: any) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    className="text-xs"
                  />
                  <YAxis 
                    domain={[0, 1]}
                    tickFormatter={(value: any) => `${(value * 100).toFixed(0)}%`}
                    className="text-xs"
                  />
                  <RechartsTooltip 
                    labelFormatter={(value: any) => new Date(value).toLocaleString()}
                    formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Confidence']}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="confidenceLevel" 
                    stroke="hsl(var(--primary))" 
                    name="Confidence Level"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="varianceScore" 
                    stroke="hsl(var(--destructive))" 
                    name="Variance"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No confidence drift data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function KnowledgeTab() {
  const { toast } = useToast();
  
  // Fetch knowledge retrieval logs
  const { data: knowledgeData, isLoading: knowledgeLoading, refetch: refetchKnowledge } = useQuery({
    queryKey: ['/api/knowledge/query', { query: 'all', limit: '24' }],
    refetchInterval: 60000, // Refresh every minute
  });
  
  // Fetch trusted sources
  const { data: trustData, isLoading: trustLoading } = useQuery({
    queryKey: ['/api/knowledge/trust'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });
  
  // Refresh cache mutation
  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/knowledge/refresh', {});
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Cache Refreshed',
        description: `${data.removedCount} expired entries removed`,
      });
      refetchKnowledge();
    },
    onError: (error: Error) => {
      toast({
        title: 'Refresh Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const logs = knowledgeData?.logs || [];
  const trustRecords = trustData?.trustRecords || [];
  
  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-retrievals">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Retrievals (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {knowledgeLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div>
                <div className="text-3xl font-bold" data-testid="text-total-retrievals">
                  {logs.length}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Knowledge queries made
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-trusted-sources">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Trusted Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {trustLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div>
                <div className="text-3xl font-bold" data-testid="text-trusted-sources">
                  {trustRecords.length}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Verified + Moderate
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-avg-relevance">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Relevance</CardTitle>
          </CardHeader>
          <CardContent>
            {knowledgeLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : logs.length > 0 ? (
              <div>
                <div className="text-3xl font-bold" data-testid="text-avg-relevance">
                  {((logs.reduce((sum: number, log: any) => sum + (log.relevanceScore || 0), 0) / logs.length) * 100).toFixed(0)}%
                </div>
                <Badge variant="secondary" className="mt-2">
                  Quality Score
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-cache-hits">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Cache Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-cache-status">
                Active
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Knowledge caching enabled
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Retrievals & Trusted Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-recent-retrievals">
          <CardHeader>
            <CardTitle>Recent Retrievals</CardTitle>
            <CardDescription>Last 24 hours of knowledge queries</CardDescription>
          </CardHeader>
          <CardContent>
            {knowledgeLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : logs.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {logs.slice(0, 10).map((log: any) => (
                  <div key={log.id} className="p-3 rounded-lg border bg-card" data-testid={`retrieval-${log.id}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          log.trustLevel === 'verified' ? 'secondary' : 
                          log.trustLevel === 'moderate' ? 'default' : 
                          'destructive'
                        }>
                          {log.trustLevel}
                        </Badge>
                        <Badge variant="outline">
                          {(log.relevanceScore * 100).toFixed(0)}% relevance
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.retrievedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium mb-1">{log.query}</p>
                    {log.url && (
                      <p className="text-xs text-muted-foreground truncate">{log.url}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No retrievals in last 24h</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-trusted-domains">
          <CardHeader>
            <CardTitle>Trusted Domains</CardTitle>
            <CardDescription>Verified and moderate trust sources</CardDescription>
          </CardHeader>
          <CardContent>
            {trustLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : trustRecords.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {trustRecords.map((record: any) => (
                  <div key={record.id} className="p-3 rounded-lg border bg-card" data-testid={`trust-${record.id}`}>
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant={record.trustLevel === 'verified' ? 'secondary' : 'default'}>
                        {record.trustLevel}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {record.successfulRetrievals} successful
                      </div>
                    </div>
                    <p className="text-sm font-medium">{record.domain}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span>{((record.successfulRetrievals / (record.successfulRetrievals + record.failedRetrievals || 1)) * 100).toFixed(0)}% success rate</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No trusted sources yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cache Control */}
      <Card data-testid="card-cache-control">
        <CardHeader>
          <CardTitle>Cache Management</CardTitle>
          <CardDescription>Manage knowledge cache and refresh expired entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 rounded-lg border bg-muted/50">
              <h4 className="text-sm font-medium mb-2">Automatic Sync</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Cache is automatically refreshed every 2 hours to remove expired entries.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4" />
                <span className="text-muted-foreground">Next sync in:</span>
                <span className="font-medium">~1.5h</span>
              </div>
            </div>
            
            <Button 
              onClick={() => refreshCacheMutation.mutate()}
              disabled={refreshCacheMutation.isPending}
              className="w-full"
              data-testid="button-refresh-cache"
            >
              {refreshCacheMutation.isPending ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Refreshing Cache...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Refresh Cache Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
