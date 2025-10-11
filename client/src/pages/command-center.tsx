import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Activity, 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Sparkles,
  Terminal
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface TelemetryData {
  system: {
    uptime: number;
    memory: {
      total: number;
      free: number;
      used: number;
      usagePercent: number;
    };
    cpu: {
      cores: number;
      loadAverage: number[];
    };
  };
  trading: {
    totalPL: number;
    activeTrades: number;
    closedTrades: number;
    winRate: number;
    roi: number;
    activeStrategies: string[];
  };
  ai: {
    recentLearningCycles: number;
    averageConfidence: number;
    opportunitiesGenerated: number;
    adjustmentsMade: number;
  };
  goals: any[];
  guardrails: any;
  recentChats: any[];
}

interface AnalysisData {
  anomalies: Array<{ severity: string; message: string }>;
  optimizations: Array<{ impact: string; recommendation: string }>;
  recommendations: Array<{ urgencyLevel: string; action: string; rationale: string }>;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface OrchestratorLog {
  id: number;
  category: string;
  recommendation: string;
  actionTaken: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  urgencyLevel: 'low' | 'medium' | 'high';
  timestamp: string;
  metadata: any;
}

export default function CommandCenter() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  // Check if current user is admin
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  
  if (!currentUser.isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Access Denied. You do not have permission to access the Command Center.
          </AlertDescription>
        </Alert>
        <Button onClick={() => setLocation("/dashboard")} className="mt-4" data-testid="button-return-dashboard">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  // Fetch latest telemetry
  const { data: telemetry, isLoading: telemetryLoading } = useQuery<TelemetryData>({
    queryKey: ['/api/orchestrator/telemetry'],
    refetchInterval: 30000,
  });

  // Fetch latest AI analysis
  const { data: analysis, isLoading: analysisLoading } = useQuery<AnalysisData>({
    queryKey: ['/api/orchestrator/analysis'],
    refetchInterval: 30000,
  });

  // Fetch orchestrator logs
  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: OrchestratorLog[] }>({
    queryKey: ['/api/orchestrator/logs?limit=50'],
    refetchInterval: 30000,
  });

  const logs = logsData?.logs || [];

  // Manual analysis trigger
  const triggerAnalysisMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/orchestrator/analyze', {});
    },
    onSuccess: () => {
      toast({
        title: "Analysis Triggered",
        description: "GPT-4o is analyzing the system. Results will appear shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/analysis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/telemetry'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to trigger analysis",
        variant: "destructive",
      });
    }
  });

  // Update log status (approve/reject)
  const updateLogMutation = useMutation({
    mutationFn: async ({ id, status, actionTaken }: { id: number; status: string; actionTaken?: string }) => {
      return await apiRequest('PATCH', `/api/orchestrator/logs/${id}`, { status, actionTaken });
    },
    onSuccess: () => {
      toast({
        title: "Log Updated",
        description: "Recommendation status has been updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/logs?limit=50'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update log",
        variant: "destructive",
      });
    }
  });

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'text-red-500';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <Terminal className="w-7 h-7 text-blue-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-command-center">AI Command Center</h1>
              {analysis && (
                <Badge 
                  variant={getUrgencyColor(analysis.urgencyLevel)}
                  className="text-sm px-3 py-1"
                  data-testid={`badge-urgency-${analysis.urgencyLevel}`}
                >
                  {analysis.urgencyLevel.toUpperCase()}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              GPT-4o powered system diagnostics and autonomous recommendations
            </p>
          </div>
        </div>
        <Button
          onClick={() => triggerAnalysisMutation.mutate()}
          disabled={triggerAnalysisMutation.isPending}
          data-testid="button-trigger-analysis"
          className="flex items-center gap-2"
        >
          {triggerAnalysisMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Trigger Analysis
            </>
          )}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-2 justify-start w-full h-auto p-2" data-testid="tabs-command-center">
          <TabsTrigger value="overview" data-testid="tab-overview" className="min-w-[140px] text-sm px-3 py-2">
            <Activity className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis" className="min-w-[140px] text-sm px-3 py-2">
            <Brain className="w-4 h-4 mr-2" />
            AI Analysis
          </TabsTrigger>
          <TabsTrigger value="recommendations" data-testid="tab-recommendations" className="min-w-[140px] text-sm px-3 py-2">
            <TrendingUp className="w-4 h-4 mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6" data-testid="content-overview">
          {telemetryLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : telemetry ? (
            <>
              {/* System Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="card-system-metrics">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      System Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">CPU Load</span>
                      <span className="text-sm font-semibold" data-testid="text-cpu">{telemetry.system.cpu.loadAverage[0].toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Memory</span>
                      <span className="text-sm font-semibold" data-testid="text-memory">{telemetry.system.memory.usagePercent.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Uptime</span>
                      <span className="text-sm font-semibold" data-testid="text-uptime">
                        {Math.floor(telemetry.system.uptime / 3600)}h
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-trading-metrics">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Trading Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total P/L</span>
                      <span className={`text-sm font-semibold ${telemetry.trading.totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-total-pl">
                        ${telemetry.trading.totalPL.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Win Rate</span>
                      <span className="text-sm font-semibold" data-testid="text-win-rate">{telemetry.trading.winRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">ROI</span>
                      <span className="text-sm font-semibold" data-testid="text-roi">{telemetry.trading.roi.toFixed(2)}%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-ai-metrics">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      AI Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Learning Cycles</span>
                      <span className="text-sm font-semibold" data-testid="text-learning-cycles">{telemetry.ai.recentLearningCycles}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Opportunities</span>
                      <span className="text-sm font-semibold" data-testid="text-opportunities">{telemetry.ai.opportunitiesGenerated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Adjustments</span>
                      <span className="text-sm font-semibold" data-testid="text-adjustments">{telemetry.ai.adjustmentsMade}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Goals and Guardrails */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card data-testid="card-goals">
                  <CardHeader>
                    <CardTitle className="text-base">Active Goals</CardTitle>
                    <CardDescription>Current user-defined trading goals</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {telemetry.goals.length > 0 ? (
                      <ul className="space-y-2">
                        {telemetry.goals.slice(0, 3).map((goal, idx) => (
                          <li key={idx} className="text-sm flex items-start gap-2" data-testid={`text-goal-${idx}`}>
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>{goal.description || goal.target}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-goals">No active goals</p>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="card-guardrails">
                  <CardHeader>
                    <CardTitle className="text-base">Active Guardrails</CardTitle>
                    <CardDescription>Protective rules and boundaries</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {telemetry.guardrails && Object.keys(telemetry.guardrails).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(telemetry.guardrails).map(([key, value], idx) => (
                          <div key={idx} className="text-sm flex items-start gap-2" data-testid={`text-guardrail-${idx}`}>
                            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}: {String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-guardrails">No active guardrails</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No telemetry data available</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="analysis" className="space-y-6 mt-6" data-testid="content-analysis">
          {analysisLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : analysis ? (
            <>
              {/* Anomalies */}
              <Card data-testid="card-anomalies">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Detected Anomalies
                  </CardTitle>
                  <CardDescription>Issues requiring attention</CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.anomalies && analysis.anomalies.length > 0 ? (
                    <ul className="space-y-3">
                      {analysis.anomalies.map((anomaly, idx) => (
                        <li key={idx} className="flex items-start gap-3 pb-3 border-b last:border-0" data-testid={`anomaly-${idx}`}>
                          <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${getSeverityColor(anomaly.severity)}`} />
                          <div className="flex-1">
                            <Badge variant="outline" className="mb-1">{anomaly.severity}</Badge>
                            <p className="text-sm">{anomaly.message}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-anomalies">No anomalies detected</p>
                  )}
                </CardContent>
              </Card>

              {/* Optimizations */}
              <Card data-testid="card-optimizations">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Optimization Opportunities
                  </CardTitle>
                  <CardDescription>Performance improvement suggestions</CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.optimizations && analysis.optimizations.length > 0 ? (
                    <ul className="space-y-3">
                      {analysis.optimizations.map((opt, idx) => (
                        <li key={idx} className="flex items-start gap-3 pb-3 border-b last:border-0" data-testid={`optimization-${idx}`}>
                          <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                          <div className="flex-1">
                            <Badge variant="outline" className="mb-1">{opt.impact}</Badge>
                            <p className="text-sm">{opt.recommendation}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-optimizations">No optimizations suggested</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No analysis data available. Trigger an analysis to generate insights.</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-6 mt-6" data-testid="content-recommendations">
          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length > 0 ? (
            <div className="space-y-4">
              {logs.map((log) => (
                <Card key={log.id} data-testid={`card-log-${log.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" data-testid={`badge-category-${log.id}`}>{log.category}</Badge>
                          <Badge variant={getUrgencyColor(log.urgencyLevel)} data-testid={`badge-urgency-${log.id}`}>
                            {log.urgencyLevel}
                          </Badge>
                          <Badge 
                            variant={log.status === 'approved' ? 'default' : log.status === 'rejected' ? 'destructive' : 'outline'}
                            data-testid={`badge-status-${log.id}`}
                          >
                            {log.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-timestamp-${log.id}`}>
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-3" data-testid={`text-recommendation-${log.id}`}>{log.recommendation}</p>
                    {log.actionTaken && (
                      <div className="bg-muted p-3 rounded-md">
                        <p className="text-xs text-muted-foreground mb-1">Action Taken:</p>
                        <p className="text-sm" data-testid={`text-action-${log.id}`}>{log.actionTaken}</p>
                      </div>
                    )}
                    {log.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => updateLogMutation.mutate({ id: log.id, status: 'approved', actionTaken: 'Approved by admin' })}
                          disabled={updateLogMutation.isPending}
                          data-testid={`button-approve-${log.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateLogMutation.mutate({ id: log.id, status: 'rejected', actionTaken: 'Rejected by admin' })}
                          disabled={updateLogMutation.isPending}
                          data-testid={`button-reject-${log.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No recommendations available</AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
