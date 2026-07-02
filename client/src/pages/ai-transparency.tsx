import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, CheckCircle2, XCircle, Clock, TrendingUp, AlertTriangle, Brain, Target, Settings, LineChart, Terminal, Activity, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RecentActionsTimeline } from "@/components/dashboard/recent-actions-timeline";

// Helper function to format category labels
const getCategoryLabel = (category: string): string => {
  const categoryLabels: Record<string, string> = {
    'system': 'System Health',
    'trading': 'Trading Strategy',
    'optimization': 'Performance Optimization',
    'ai_analysis': 'AI Analysis',
    'risk_management': 'Risk Management',
    'market_analysis': 'Market Analysis'
  };
  return categoryLabels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function AITransparencyPage() {
  const [activeTab, setActiveTab] = useState("ai-command-center");
  const { mode } = useTradingMode();
  const { toast } = useToast();
  const [approvingLogId, setApprovingLogId] = useState<number | null>(null);
  const [auditReport, setAuditReport] = useState<any | null>(null);
  
  // Check if current user is admin
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = currentUser.isAdmin || false;

  // Fetch transparency logs (mode-isolated - mode in URL triggers cache invalidation)
  const { data: transparencyData, isLoading: logsLoading } = useQuery<{ ok: boolean; logs: any[] }>({
    queryKey: [`/api/schedulers/transparency-logs?mode=${mode}`],
    enabled: !!mode, // Only fetch when mode is defined
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  // Fetch filter calibrations (mode-isolated - mode in URL triggers cache invalidation)
  const { data: calibrationsData, isLoading: calibrationsLoading } = useQuery<{ ok: boolean; calibrations: any[] }>({
    queryKey: [`/api/screeners/calibration?mode=${mode}`],
    enabled: !!mode, // Only fetch when mode is defined
    refetchInterval: 60000,
  });

  // Fetch system alerts/error logs (system-wide, not mode-isolated)
  const { data: alertsData, isLoading: alertsLoading } = useQuery<{ ok: boolean; errors: any[] }>({
    queryKey: ['/api/system/error-logs'],
    refetchInterval: 60000,
  });

  // Fetch Autonomy Confidence Index
  const { data: confidenceData } = useQuery<{ ok: boolean; autonomyConfidence: number; components: any }>({
    queryKey: ['/api/learning/autonomy-confidence'],
    refetchInterval: 60000,
  });

  // Fetch semantic memories (Milestone 15)
  const { data: semanticData, isLoading: semanticLoading } = useQuery<{ ok: boolean; memories: any[] }>({
    queryKey: ['/api/semantic/latest?limit=20'],
    refetchInterval: 60000,
  });

  // Fetch semantic tags (Milestone 15)
  const { data: tagsData } = useQuery<{ ok: boolean; tags: string[] }>({
    queryKey: ['/api/semantic/tags'],
    refetchInterval: 60000,
  });

  // Fetch learning health metrics (Milestone 16 - Intelligence Refinement)
  const { data: learningMetricsData, isLoading: learningMetricsLoading } = useQuery<{ ok: boolean; metrics: any }>({
    queryKey: ['/api/ai/learning-metrics'],
    refetchInterval: 60000,
  });

  // Fetch actuation proposals (Milestone 17 - Autonomous Adjustments)
  const { data: proposalsData, isLoading: proposalsLoading } = useQuery<{ ok: boolean; proposals: any[] }>({
    queryKey: ['/api/actuation/proposals'],
    refetchInterval: 60000,
  });

  // Fetch historic signals stats (Milestone 17C - Historic Signals)
  const { data: historicSignalsData, isLoading: historicSignalsLoading } = useQuery<{ ok: boolean; stats: any }>({
    queryKey: ['/api/historic-signals/stats'],
    refetchInterval: 60000,
  });

  // Fetch paper trading simulation data (Milestone 18)
  const { data: paperSimData, isLoading: paperSimLoading } = useQuery<{ ok: boolean; isRunning: boolean; stats: any }>({
    queryKey: ['/api/active-engine/metrics'],
    refetchInterval: 5000, // More frequent refresh for responsive status updates
    staleTime: 0, // Always consider data stale for immediate updates
  });

  const { data: paperPositionsData, isLoading: paperPositionsLoading } = useQuery<{ ok: boolean; positions: any[] }>({
    queryKey: ['/api/active-engine/positions'],
    refetchInterval: 5000, // More frequent refresh for responsive status updates
    staleTime: 0, // Always consider data stale for immediate updates
  });

  // Fetch AI Orchestrator logs
  const { data: orchestratorLogsData, isLoading: orchestratorLogsLoading } = useQuery<{ ok: boolean; logs: any[] }>({
    queryKey: ['/api/orchestrator/logs?limit=50'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch learning summary (cumulative AI metrics)
  const { data: learningSummaryData, isLoading: learningSummaryLoading } = useQuery<{ ok: boolean; success: boolean; summary: any }>({
    queryKey: ['/api/orchestrator/learning-summary'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch latest telemetry (for AI Command Center tab)
  const { data: telemetryData, isLoading: telemetryLoading } = useQuery<any>({
    queryKey: ['/api/orchestrator/telemetry'],
    refetchInterval: 30000,
  });

  // Fetch latest AI analysis (for AI Analysis tab)
  const { data: analysisData, isLoading: analysisLoading } = useQuery<any>({
    queryKey: ['/api/orchestrator/analysis'],
    refetchInterval: 30000,
  });

  // Fetch orchestrator recommendation logs (for AI Recommendations tab)
  const { data: recommendationLogsData, isLoading: recommendationLogsLoading } = useQuery<{ logs: any[] }>({
    queryKey: ['/api/orchestrator/logs?limit=50'],
    refetchInterval: 30000,
  });

  // Fetch formula audit data (for Formula Health in AI Command Center)
  const { data: formulaAuditData, isLoading: formulaAuditLoading } = useQuery<{ ok: boolean; report: any }>({
    queryKey: ['/api/system/formula-audit'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Fetch feed health data (for Feed Health in AI Command Center)
  const { data: feedHealthData, isLoading: feedHealthLoading } = useQuery<{ ok: boolean; grade: string; metrics: any; issues: string[]; history: any[] }>({
    queryKey: ['/api/system/feed-health'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

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

  // System audit trigger
  const runSystemAuditMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/orchestrator/audit', {});
    },
    onSuccess: (response: any) => {
      setAuditReport(response.audit);
      toast({
        title: "System Audit Complete",
        description: `Overall health: ${response.audit.health.overall.toUpperCase()}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to run audit",
        variant: "destructive",
      });
    }
  });

  // Formula audit trigger (admin-only)
  const runFormulaAuditMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('GET', '/api/system/formula-audit/run', {});
    },
    onSuccess: (response: any) => {
      toast({
        title: "Formula Audit Complete",
        description: `${response.report.passed}/${response.report.totalFormulas} formulas passed validation`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/system/formula-audit'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to run system audit",
        variant: "destructive",
      });
    }
  });

  // Feed health check trigger (admin-only)
  const runFeedHealthCheckMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('GET', '/api/system/feed-health/run', {});
    },
    onSuccess: (response: any) => {
      toast({
        title: "Feed Health Check Complete",
        description: `Overall grade: ${response.grade} (${response.metrics.status})`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/system/feed-health'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to run feed health check",
        variant: "destructive",
      });
    }
  });

  // Update log status (reject)
  const updateLogMutation = useMutation({
    mutationFn: async ({ id, status, actionTaken }: { id: number; status: string; actionTaken?: string }) => {
      return await apiRequest('PATCH', `/api/orchestrator/logs/${id}`, { status, actionTaken });
    },
    onSuccess: () => {
      toast({
        title: "Recommendation Rejected",
        description: "The recommendation has been rejected",
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

  // Approve recommendation and execute change
  const approveRecommendation = async (log: any) => {
    setApprovingLogId(log.id);
    try {
      let endpoint = '';
      let payload: any = {};

      if (log.category === 'goal_update' && log.metadata) {
        endpoint = '/api/orchestrator/updateGoal';
        payload = {
          mode: log.metadata.mode,
          metricName: log.metadata.metricName,
          goalValue: log.metadata.goalValue,
          approved: true,
          reason: 'Approved by admin via AI Transparency'
        };
      } else if (log.category === 'guardrail_update' && log.metadata) {
        endpoint = '/api/orchestrator/updateGuardrail';
        payload = {
          mode: log.metadata.mode,
          field: log.metadata.field,
          value: log.metadata.value,
          approved: true,
          reason: 'Approved by admin via AI Transparency'
        };
      } else if (log.category === 'strategy_update' && log.metadata) {
        endpoint = '/api/orchestrator/updateStrategy';
        payload = {
          mode: log.metadata.mode,
          strategy: log.metadata.strategy,
          field: log.metadata.field,
          value: log.metadata.value,
          approved: true,
          reason: 'Approved by admin via AI Transparency'
        };
      } else {
        await apiRequest('PATCH', `/api/orchestrator/logs/${log.id}`, { 
          status: 'approved', 
          actionTaken: 'Approved by admin' 
        });
        
        toast({
          title: "Recommendation Approved",
          description: "The recommendation has been approved",
        });
        
        queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/logs?limit=50'] });
        return;
      }

      await apiRequest('POST', endpoint, payload);
      await apiRequest('PATCH', `/api/orchestrator/logs/${log.id}`, { 
        status: 'approved', 
        actionTaken: 'Approved and applied by admin' 
      });

      toast({
        title: "Recommendation Approved",
        description: "Configuration has been updated successfully",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/orchestrator/logs?limit=50'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/guardrails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/strategy-settings'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve recommendation",
        variant: "destructive",
      });
    } finally {
      setApprovingLogId(null);
    }
  };

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

  const logs = transparencyData?.logs || [];
  const calibrations = calibrationsData?.calibrations || [];
  const alerts = alertsData?.errors || [];
  const confidenceIndex = confidenceData?.autonomyConfidence ?? 0;
  const semanticMemories = semanticData?.memories || [];
  const semanticTags = tagsData?.tags || [];
  const learningMetrics = learningMetricsData?.metrics || null;
  const proposals = proposalsData?.proposals || [];
  const historicSignalsStats = historicSignalsData?.stats || null;
  const paperSimMetrics = paperSimData?.stats || null;
  const isSimRunning = paperSimData?.isRunning || false;
  const paperPositions = paperPositionsData?.positions || [];
  const orchestratorLogs = orchestratorLogsData?.logs ?? [];
  const learningSummary = learningSummaryData?.summary || null;
  const telemetry = telemetryData;
  const analysis = analysisData;
  const recommendationLogs = recommendationLogsData?.logs || [];

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-purple-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">AI Transparency</h1>
            <Badge 
              variant={confidenceIndex >= 50 ? "default" : "outline"}
              className="text-sm px-3 py-1"
              data-testid="badge-autonomy-confidence"
            >
              Confidence: {confidenceIndex}/100
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Monitor automated scheduler activity, learning adjustments, semantic insights, and system health</p>
        </div>
      </div>

      {/* Debug Panel (Admin Only) */}
      {isAdmin && (
        <Card className="mb-6 border-blue-500/50" data-testid="card-debug-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Debug Panel (Admin Only)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Last Fetch:</span>{" "}
                <span className="font-mono" data-testid="text-debug-timestamp">
                  {orchestratorLogsData ? new Date().toLocaleTimeString() : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Logs Fetched:</span>{" "}
                <span className="font-mono font-semibold" data-testid="text-debug-count">
                  {orchestratorLogsData?.logs?.length || 0}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge 
                  variant={orchestratorLogsLoading ? "secondary" : orchestratorLogsData ? "default" : "destructive"}
                  className="text-xs"
                  data-testid="badge-debug-status"
                >
                  {orchestratorLogsLoading ? "Loading" : orchestratorLogsData ? "Connected" : "Error"}
                </Badge>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Endpoint: <code className="bg-muted px-1 py-0.5 rounded">/api/orchestrator/logs?limit=50</code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-2 justify-start w-full h-auto p-2" data-testid="tabs-ai-transparency">
          <TabsTrigger value="ai-command-center" data-testid="tab-ai-command-center" className="min-w-[140px] text-sm px-3 py-2">
            <Activity className="w-4 h-4 mr-2" />
            AI Command Center
          </TabsTrigger>
          <TabsTrigger value="ai-analysis" data-testid="tab-ai-analysis" className="min-w-[140px] text-sm px-3 py-2">
            <Brain className="w-4 h-4 mr-2" />
            AI Analysis
          </TabsTrigger>
          <TabsTrigger value="ai-recommendations" data-testid="tab-ai-recommendations" className="min-w-[140px] text-sm px-3 py-2">
            <TrendingUp className="w-4 h-4 mr-2" />
            AI Recommendations
          </TabsTrigger>
          <TabsTrigger value="automation-logs" data-testid="tab-automation-logs" className="min-w-[140px] text-sm px-3 py-2">
            <Clock className="w-4 h-4 mr-2" />
            Automation Logs
          </TabsTrigger>
          <TabsTrigger value="orchestrator-activity" data-testid="tab-orchestrator-activity" className="min-w-[140px] text-sm px-3 py-2">
            <Terminal className="w-4 h-4 mr-2" />
            Orchestrator
          </TabsTrigger>
          <TabsTrigger value="learning-adjustments" data-testid="tab-learning-adjustments" className="min-w-[140px] text-sm px-3 py-2">
            <TrendingUp className="w-4 h-4 mr-2" />
            Learning Adjustments
          </TabsTrigger>
          <TabsTrigger value="autonomous-adjustments" data-testid="tab-autonomous-adjustments" className="min-w-[140px] text-sm px-3 py-2">
            <Settings className="w-4 h-4 mr-2" />
            Autonomous Adjustments
          </TabsTrigger>
          <TabsTrigger value="historic-signals" data-testid="tab-historic-signals" className="min-w-[140px] text-sm px-3 py-2">
            <TrendingUp className="w-4 h-4 mr-2" />
            Historic Signals
          </TabsTrigger>
          <TabsTrigger value="semantic-insights" data-testid="tab-semantic-insights" className="min-w-[140px] text-sm px-3 py-2">
            <Brain className="w-4 h-4 mr-2" />
            Semantic Insights
          </TabsTrigger>
          <TabsTrigger value="learning-health" data-testid="tab-learning-health" className="min-w-[140px] text-sm px-3 py-2">
            <Target className="w-4 h-4 mr-2" />
            Learning Health
          </TabsTrigger>
          <TabsTrigger value="historic-learnings" data-testid="tab-historic-learnings" className="min-w-[140px] text-sm px-3 py-2">
            <Sparkles className="w-4 h-4 mr-2" />
            Historic Learnings
          </TabsTrigger>
          <TabsTrigger value="paper-trading" data-testid="tab-paper-trading" className="min-w-[140px] text-sm px-3 py-2">
            <LineChart className="w-4 h-4 mr-2" />
            Paper Trading
          </TabsTrigger>
          <TabsTrigger value="health-alerts" data-testid="tab-health-alerts" className="min-w-[140px] text-sm px-3 py-2">
            <AlertTriangle className="w-4 h-4 mr-2" />
            System Health
          </TabsTrigger>
        </TabsList>

        {/* AI Command Center Tab (formerly Overview from Command Center) */}
        <TabsContent value="ai-command-center" className="space-y-6 mt-6" data-testid="content-ai-command-center">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              {analysis && (
                <Badge 
                  variant={getUrgencyColor(analysis.urgencyLevel)}
                  className="text-sm px-3 py-1"
                  data-testid={`badge-urgency-${analysis?.urgencyLevel}`}
                >
                  {analysis.urgencyLevel?.toUpperCase()}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => runSystemAuditMutation.mutate()}
                disabled={runSystemAuditMutation.isPending}
                data-testid="button-run-audit"
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {runSystemAuditMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running Audit...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    Run System Audit
                  </>
                )}
              </Button>
              <Button
                onClick={() => triggerAnalysisMutation.mutate()}
                disabled={triggerAnalysisMutation.isPending}
                data-testid="button-trigger-analysis"
                size="sm"
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
          </div>

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
                      <span className="text-sm font-semibold" data-testid="text-cpu">{telemetry.system?.cpu?.loadAverage?.[0]?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Memory</span>
                      <span className="text-sm font-semibold" data-testid="text-memory">{telemetry.system?.memory?.usagePercent?.toFixed(1) || 'N/A'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Uptime</span>
                      <span className="text-sm font-semibold" data-testid="text-uptime">
                        {telemetry.system?.uptime ? Math.floor(telemetry.system.uptime / 3600) : 'N/A'}h
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
                      <span className={`text-sm font-semibold ${(telemetry.trading?.totalPL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-total-pl">
                        ${telemetry.trading?.totalPL?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Win Rate</span>
                      <span className="text-sm font-semibold" data-testid="text-win-rate">{telemetry.trading?.winRate?.toFixed(1) || '0.0'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">ROI</span>
                      <span className="text-sm font-semibold" data-testid="text-roi">{telemetry.trading?.roi?.toFixed(2) || '0.00'}%</span>
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
                      <span className="text-sm font-semibold" data-testid="text-learning-cycles">{telemetry.ai?.recentLearningCycles || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Opportunities</span>
                      <span className="text-sm font-semibold" data-testid="text-opportunities">{telemetry.ai?.opportunitiesGenerated || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Adjustments</span>
                      <span className="text-sm font-semibold" data-testid="text-adjustments">{telemetry.ai?.adjustmentsMade || 0}</span>
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
                    {telemetry.goals?.length > 0 ? (
                      <ul className="space-y-2">
                        {telemetry.goals.slice(0, 3).map((goal: any, idx: number) => (
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

              {/* System Audit Report */}
              {auditReport && (
                <Card data-testid="card-audit-report">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          System Audit Report
                          <Badge 
                            variant={
                              auditReport.health.overall === 'healthy' ? 'default' :
                              auditReport.health.overall === 'fair' ? 'outline' :
                              auditReport.health.overall === 'degraded' ? 'secondary' : 'destructive'
                            }
                            data-testid={`badge-health-${auditReport.health.overall}`}
                          >
                            {auditReport.health.overall.toUpperCase()}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Generated {formatDistanceToNow(new Date(auditReport.timestamp))} ago
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Health Checks */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Health Checks</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {Object.entries(auditReport.health.checks).map(([check, status]: [string, any]) => (
                          <div key={check} className="flex items-center gap-2" data-testid={`check-${check}`}>
                            {status === 'pass' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : status === 'warning' ? (
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span className="text-sm capitalize">{check}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Formula Health */}
              <Card data-testid="card-formula-health">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <LineChart className="w-5 h-5" />
                        Formula Health
                      </CardTitle>
                      <CardDescription>
                        Verification of all formulas used in screeners, guardrails, and strategies
                      </CardDescription>
                    </div>
                    {isAdmin && (
                      <Button
                        size="sm"
                        onClick={() => runFormulaAuditMutation.mutate()}
                        disabled={runFormulaAuditMutation.isPending}
                        data-testid="button-run-formula-audit"
                      >
                        {runFormulaAuditMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Activity className="w-4 h-4 mr-2" />
                            Run Audit Now
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formulaAuditLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : formulaAuditData?.report ? (
                    <>
                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-foreground" data-testid="text-total-formulas">
                            {formulaAuditData.report.totalFormulas}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Formulas</div>
                        </div>
                        <div className="text-center p-3 bg-green-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-passed-formulas">
                            {formulaAuditData.report.passed}
                          </div>
                          <div className="text-xs text-muted-foreground">Passed</div>
                        </div>
                        <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400" data-testid="text-warning-formulas">
                            {formulaAuditData.report.warnings}
                          </div>
                          <div className="text-xs text-muted-foreground">Warnings</div>
                        </div>
                        <div className="text-center p-3 bg-red-500/10 rounded-lg">
                          <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-failed-formulas">
                            {formulaAuditData.report.failed}
                          </div>
                          <div className="text-xs text-muted-foreground">Failed</div>
                        </div>
                      </div>

                      {/* Last Audit Info */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span data-testid="text-last-audit">
                          Last audit: {formatDistanceToNow(new Date(formulaAuditData.report.timestamp))} ago
                        </span>
                      </div>

                      {/* Warning/Failure Alerts */}
                      {(formulaAuditData.report.warnings > 0 || formulaAuditData.report.failed > 0) && (
                        <Alert variant={formulaAuditData.report.failed > 0 ? "destructive" : "default"}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            {formulaAuditData.report.failed > 0 ? (
                              <>
                                <strong>{formulaAuditData.report.failed} formula(s) failed validation</strong> with deviations ≥1%.
                                {isAdmin && " Review /tmp/audit_report.txt for details."}
                              </>
                            ) : (
                              <>
                                <strong>{formulaAuditData.report.warnings} formula(s)</strong> have minor deviations (0.1-1%).
                                {isAdmin && " Review /tmp/audit_report.txt for details."}
                              </>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Formula Details Summary */}
                      {formulaAuditData.report.tests && formulaAuditData.report.tests.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold">Formula Tests</h3>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {formulaAuditData.report.tests.map((test: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                                data-testid={`formula-test-${idx}`}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {test.status === 'PASS' ? (
                                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                  ) : test.status === 'WARNING' ? (
                                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                  )}
                                  <span className="text-sm font-medium">{test.name}</span>
                                </div>
                                <div className="text-right">
                                  <Badge
                                    variant={
                                      test.status === 'PASS' ? 'default' :
                                      test.status === 'WARNING' ? 'outline' : 'destructive'
                                    }
                                    className="text-xs"
                                  >
                                    {test.deviationPercent.toFixed(2)}% deviation
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Recent Auto-Resolutions */}
                      <RecentActionsTimeline source="formula" maxItems={5} />
                    </>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No formula audit data available. {isAdmin && "Click 'Run Audit Now' to generate a report."}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Feed Health */}
              <Card data-testid="card-feed-health">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Feed Health
                      </CardTitle>
                      <CardDescription>
                        Real-time monitoring of Kraken WebSocket + REST fallback data feeds
                      </CardDescription>
                    </div>
                    {isAdmin && (
                      <Button
                        size="sm"
                        onClick={() => runFeedHealthCheckMutation.mutate()}
                        disabled={runFeedHealthCheckMutation.isPending}
                        data-testid="button-run-feed-health-check"
                      >
                        {runFeedHealthCheckMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          <>
                            <Activity className="w-4 h-4 mr-2" />
                            Recheck Now
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {feedHealthLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : feedHealthData?.metrics ? (
                    <>
                      {/* Overall Grade */}
                      <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg">
                        <div className="text-5xl font-bold mb-2" data-testid="text-feed-grade">
                          {feedHealthData.grade}
                        </div>
                        <div className="text-sm text-muted-foreground">Overall Grade</div>
                        <div className="mt-2 flex items-center justify-center gap-2">
                          {feedHealthData.metrics.status === 'healthy' ? (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Healthy
                            </Badge>
                          ) : feedHealthData.metrics.status === 'warning' ? (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Warning
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              Critical
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Feed Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-foreground" data-testid="text-feed-latency">
                            {feedHealthData.metrics.latencyMs}ms
                          </div>
                          <div className="text-xs text-muted-foreground">Latency</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-foreground" data-testid="text-feed-uptime">
                            {feedHealthData.metrics.uptimePercent}%
                          </div>
                          <div className="text-xs text-muted-foreground">Uptime</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-foreground" data-testid="text-feed-reconnects">
                            {feedHealthData.metrics.reconnectCount}
                          </div>
                          <div className="text-xs text-muted-foreground">Reconnects (last 5min)</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-foreground" data-testid="text-feed-pairs">
                            {feedHealthData.metrics.pairCount}
                          </div>
                          <div className="text-xs text-muted-foreground">Active Pairs</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-foreground" data-testid="text-feed-type">
                            {feedHealthData.metrics.feedType === 'websocket' ? 'WS' : 'REST'}
                          </div>
                          <div className="text-xs text-muted-foreground">Feed Type</div>
                        </div>
                      </div>

                      {/* Last Update Info */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span data-testid="text-last-feed-check">
                          Recently checked
                        </span>
                      </div>

                      {/* Issues Alert */}
                      {feedHealthData.issues && feedHealthData.issues.length > 0 && (
                        <Alert variant={feedHealthData.metrics.status === 'critical' ? "destructive" : "default"}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <div className="space-y-1">
                              {feedHealthData.issues.map((issue, idx) => (
                                <div key={idx} className="text-sm">
                                  • {issue}
                                </div>
                              ))}
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Health History Sparkline */}
                      {feedHealthData.history && feedHealthData.history.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold">Latency History (1 hour)</h3>
                          <div className="h-16 flex items-end justify-between gap-1">
                            {feedHealthData.history.map((h: any, idx: number) => {
                              const heightPercent = Math.min(100, (h.latencyMs / 5000) * 100);
                              const isHealthy = h.wasHealthy;
                              return (
                                <div
                                  key={idx}
                                  className={`flex-1 rounded-sm ${isHealthy ? 'bg-green-500/50' : 'bg-red-500/50'}`}
                                  style={{ height: `${heightPercent}%` }}
                                  title={`${h.latencyMs}ms`}
                                />
                              );
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground text-center">
                            Green = healthy (&lt;2s), Red = degraded (≥2s)
                          </div>
                        </div>
                      )}
                      
                      {/* Recent Auto-Resolutions */}
                      <RecentActionsTimeline source="feed" maxItems={5} />
                    </>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No feed health data available. {isAdmin && "Click 'Recheck Now' to generate a report."}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No telemetry data available</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* AI Analysis Tab (from Command Center) */}
        <TabsContent value="ai-analysis" className="space-y-6 mt-6" data-testid="content-ai-analysis">
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
                      {analysis.anomalies.map((anomaly: any, idx: number) => (
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
                      {analysis.optimizations.map((opt: any, idx: number) => (
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

        {/* AI Recommendations Tab (from Command Center) */}
        <TabsContent value="ai-recommendations" className="space-y-6 mt-6" data-testid="content-ai-recommendations">
          {recommendationLogsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : recommendationLogs.length > 0 ? (
            <div className="space-y-4">
              {recommendationLogs.map((log: any) => (
                <Card key={log.id} data-testid={`card-log-${log.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" data-testid={`badge-category-${log.id}`}>{getCategoryLabel(log.category)}</Badge>
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
                    <p className="text-sm mb-3" data-testid={`text-recommendation-${log.id}`}>
                      {log.recommendation}
                    </p>
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
                          onClick={() => approveRecommendation(log)}
                          disabled={approvingLogId === log.id || updateLogMutation.isPending}
                          data-testid={`button-approve-${log.id}`}
                        >
                          {approvingLogId === log.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateLogMutation.mutate({ id: log.id, status: 'rejected', actionTaken: 'Rejected by admin' })}
                          disabled={approvingLogId === log.id || updateLogMutation.isPending}
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

        {/* Tab 1: Recent Automation Logs */}
        <TabsContent value="automation-logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Automation Logs</CardTitle>
              <CardDescription>
                Activity from autonomous schedulers and automated tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="text-sm text-muted-foreground">Loading logs...</div>
              ) : logs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No automation logs found</div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log: any) => (
                    <div 
                      key={log.id} 
                      className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      data-testid={`log-${log.id}`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {log.success ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" data-testid="icon-success" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" data-testid="icon-failure" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-foreground" data-testid={`text-task-name-${log.id}`}>
                            {log.taskName}
                          </h3>
                          <span className="text-xs text-muted-foreground" data-testid={`text-timestamp-${log.id}`}>
                            {formatDistanceToNow(new Date(log.executedAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-result-${log.id}`}>
                          {log.resultSummary}
                        </p>
                        {log.duration && (
                          <div className="text-xs text-muted-foreground">
                            Duration: {parseFloat(log.duration).toFixed(2)}s
                          </div>
                        )}
                        {log.mode && (
                          <Badge variant="outline" className="text-xs">
                            {log.mode} mode
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orchestrator Activity Tab */}
        <TabsContent value="orchestrator-activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Orchestrator Activity</CardTitle>
              <CardDescription>
                System monitoring insights and AI recommendations from the orchestrator
              </CardDescription>
            </CardHeader>
            <CardContent>
              {orchestratorLogsLoading ? (
                <div className="text-sm text-muted-foreground">Loading orchestrator logs...</div>
              ) : !orchestratorLogsData || !orchestratorLogsData.logs || orchestratorLogs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No orchestrator activity found or AI activity data is unavailable.</div>
              ) : (
                <div className="space-y-3">
                  {orchestratorLogs.map((log: any) => (
                    <div 
                      key={log.id} 
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      data-testid={`orchestrator-log-${log.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={
                              log.urgencyLevel === 'critical' ? 'destructive' : 
                              log.urgencyLevel === 'high' ? 'default' : 
                              'secondary'
                            }
                            data-testid={`badge-urgency-${log.id}`}
                          >
                            {log.urgencyLevel}
                          </Badge>
                          <Badge variant="outline" className="text-xs" data-testid={`badge-category-${log.id}`}>
                            {log.category}
                          </Badge>
                          {log.status && (
                            <Badge 
                              variant={
                                log.status === 'approved' ? 'default' : 
                                log.status === 'rejected' ? 'destructive' : 
                                log.status === 'applied' ? 'outline' : 
                                'secondary'
                              }
                              data-testid={`badge-status-${log.id}`}
                            >
                              {log.status}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground" data-testid={`text-orchestrator-timestamp-${log.id}`}>
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <p className="text-sm text-foreground" data-testid={`text-orchestrator-recommendation-${log.id}`}>
                        {log.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Learning Adjustments */}
        <TabsContent value="learning-adjustments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Learning Adjustments</CardTitle>
              <CardDescription>
                Recent filter calibrations and portfolio adjustments from Paper → Live transfer
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calibrationsLoading ? (
                <div className="text-sm text-muted-foreground">Loading adjustments...</div>
              ) : calibrations.length === 0 ? (
                <div className="text-sm text-muted-foreground">No learning adjustments found</div>
              ) : (
                <div className="space-y-3">
                  {calibrations.map((cal: any) => (
                    <div 
                      key={cal.id} 
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      data-testid={`calibration-${cal.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={cal.mode === 'live' ? 'default' : 'secondary'} data-testid={`badge-mode-${cal.id}`}>
                          {cal.mode} mode
                        </Badge>
                        <span className="text-xs text-muted-foreground" data-testid={`text-cal-timestamp-${cal.id}`}>
                          {formatDistanceToNow(new Date(cal.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      {cal.reason && (
                        <p className="text-sm text-foreground mb-2" data-testid={`text-reason-${cal.id}`}>
                          {cal.reason}
                        </p>
                      )}
                      {cal.source && (
                        <div className="text-xs text-muted-foreground">
                          Source: {cal.source}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Autonomous Adjustments (Milestone 17) */}
        <TabsContent value="autonomous-adjustments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Autonomous Adjustments</CardTitle>
              <CardDescription>
                AI-proposed parameter adjustments subject to policy constraints and approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposalsLoading ? (
                <div className="text-sm text-muted-foreground">Loading proposals...</div>
              ) : proposals.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No actuation proposals found. CLE will generate proposals based on learning patterns.
                </div>
              ) : (
                <div className="space-y-3">
                  {proposals.map((proposal: any) => (
                    <div 
                      key={proposal.id} 
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      data-testid={`proposal-${proposal.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={
                              proposal.status === 'approved' ? 'default' : 
                              proposal.status === 'rejected' ? 'destructive' : 
                              proposal.status === 'applied' ? 'outline' : 
                              'secondary'
                            }
                            data-testid={`badge-status-${proposal.id}`}
                          >
                            {proposal.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs" data-testid={`badge-confidence-${proposal.id}`}>
                            Confidence: {(parseFloat(proposal.confidenceScore || '0') * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground" data-testid={`text-proposal-timestamp-${proposal.id}`}>
                          {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Variable:</span>{" "}
                            <span className="font-medium" data-testid={`text-variable-${proposal.id}`}>{proposal.variableName}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Change:</span>{" "}
                            <span className="font-medium" data-testid={`text-value-${proposal.id}`}>
                              {proposal.currentValue} → {proposal.proposedValue}
                            </span>
                          </div>
                        </div>
                        
                        {proposal.reason && (
                          <p className="text-sm text-foreground" data-testid={`text-proposal-reason-${proposal.id}`}>
                            {proposal.reason}
                          </p>
                        )}
                        
                        {proposal.reviewedBy && (
                          <div className="text-xs text-muted-foreground">
                            Reviewed by: {proposal.reviewedBy}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Historic Signals (Milestone 17C) */}
        <TabsContent value="historic-signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historic Signal Analysis</CardTitle>
              <CardDescription>
                Performance metrics from historical pattern backtesting for AI learning
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historicSignalsLoading ? (
                <div className="text-sm text-muted-foreground">Loading historic signals stats...</div>
              ) : !historicSignalsStats ? (
                <div className="text-sm text-muted-foreground">
                  No historic signals found. Use the backfill API to generate signals from historical data.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Overall Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Total Signals</div>
                      <div className="text-2xl font-bold" data-testid="text-total-signals">
                        {historicSignalsStats.totalSignals || 0}
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                      <div className="text-2xl font-bold" data-testid="text-win-rate">
                        {historicSignalsStats.winRate !== null && historicSignalsStats.winRate !== undefined ? `${historicSignalsStats.winRate.toFixed(1)}%` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">Avg Return</div>
                      <div 
                        className={`text-2xl font-bold ${historicSignalsStats.avgReturn > 0 ? 'text-green-500' : historicSignalsStats.avgReturn < 0 ? 'text-red-500' : ''}`}
                        data-testid="text-avg-return"
                      >
                        {historicSignalsStats.avgReturn !== null && historicSignalsStats.avgReturn !== undefined ? `${historicSignalsStats.avgReturn > 0 ? '+' : ''}${historicSignalsStats.avgReturn.toFixed(2)}%` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Strategy Breakdown */}
                  {historicSignalsStats.byStrategy && historicSignalsStats.byStrategy.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Performance by Strategy</h3>
                      <div className="space-y-3">
                        {historicSignalsStats.byStrategy.map((strategy: any) => (
                          <div 
                            key={strategy.strategyId} 
                            className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                            data-testid={`strategy-${strategy.strategyId}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="secondary" data-testid={`badge-strategy-${strategy.strategyId}`}>
                                {strategy.strategyId?.replace(/_/g, ' ').toUpperCase() || 'Unknown'}
                              </Badge>
                              <span className="text-xs text-muted-foreground" data-testid={`text-strategy-count-${strategy.strategyId}`}>
                                {strategy.count} signals
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Win Rate:</span>{" "}
                                <span className="font-medium" data-testid={`text-strategy-winrate-${strategy.strategyId}`}>
                                  {strategy.winRate !== null && strategy.winRate !== undefined ? `${strategy.winRate.toFixed(1)}%` : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Avg Return:</span>{" "}
                                <span 
                                  className={`font-medium ${strategy.avgReturn > 0 ? 'text-green-500' : strategy.avgReturn < 0 ? 'text-red-500' : ''}`}
                                  data-testid={`text-strategy-return-${strategy.strategyId}`}
                                >
                                  {strategy.avgReturn !== null && strategy.avgReturn !== undefined ? `${strategy.avgReturn > 0 ? '+' : ''}${strategy.avgReturn.toFixed(2)}%` : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Semantic Insights (Milestone 15) */}
        <TabsContent value="semantic-insights" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Semantic Memory Insights</CardTitle>
              <CardDescription>
                Vector-based knowledge recall from past learnings and experiences
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Tag filters */}
              {semanticTags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {semanticTags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-tag-${tag}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Semantic memories list */}
              {semanticLoading ? (
                <div className="text-sm text-muted-foreground">Loading semantic memories...</div>
              ) : semanticMemories.length === 0 ? (
                <div className="text-sm text-muted-foreground">No semantic memories found. Ingestion runs every 6 hours.</div>
              ) : (
                <div className="space-y-3">
                  {semanticMemories.map((memory: any) => (
                    <div 
                      key={memory.id} 
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      data-testid={`memory-${memory.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-source-${memory.id}`}>
                            {memory.sourceTable}
                          </Badge>
                          <Badge variant="outline" className="text-xs" data-testid={`badge-relevance-${memory.id}`}>
                            Relevance: {parseFloat(memory.relevance || '0').toFixed(2)}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground" data-testid={`text-memory-timestamp-${memory.id}`}>
                          {formatDistanceToNow(new Date(memory.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground mb-2" data-testid={`text-content-${memory.id}`}>
                        {memory.content}
                      </p>
                      {memory.tags && memory.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {memory.tags.map((tag: string, idx: number) => (
                            <span key={idx} className="text-xs px-2 py-0.5 bg-muted rounded" data-testid={`tag-${memory.id}-${idx}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Learning Health (Milestone 16 - Intelligence Refinement) */}
        <TabsContent value="learning-health" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Learning Health Metrics</CardTitle>
              <CardDescription>
                Intelligence Refinement Layer - Cognitive Weight Adjuster performance and learning source reliability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {learningMetricsLoading ? (
                <div className="text-sm text-muted-foreground">Loading learning metrics...</div>
              ) : !learningMetrics ? (
                <div className="text-sm text-muted-foreground">
                  No learning metrics available. Refinement runs every 6 hours.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-avg-accuracy">
                      <div className="text-sm text-muted-foreground mb-1">Average Accuracy</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-avg-accuracy">
                        {(learningMetrics.averageAccuracy * 100).toFixed(1)}%
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-confidence-variance">
                      <div className="text-sm text-muted-foreground mb-1">Confidence Variance</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-confidence-variance">
                        {learningMetrics.confidenceVariance.toFixed(3)}
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-total-sources">
                      <div className="text-sm text-muted-foreground mb-1">Total Sources</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-total-sources">
                        {learningMetrics.totalSources}
                      </div>
                    </div>
                  </div>

                  {/* Last Refinement */}
                  {learningMetrics.lastRefinement && (
                    <div className="text-sm text-muted-foreground" data-testid="text-last-refinement">
                      Last refinement: {formatDistanceToNow(new Date(learningMetrics.lastRefinement), { addSuffix: true })}
                    </div>
                  )}

                  {/* Top Learning Sources */}
                  {learningMetrics.topSources && learningMetrics.topSources.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3">Top Learning Sources</h4>
                      <div className="space-y-2">
                        {learningMetrics.topSources.map((source: any, idx: number) => (
                          <div 
                            key={idx}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                            data-testid={`source-${idx}`}
                          >
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-source-type-${idx}`}>
                                {source.type}
                              </Badge>
                              <span className="text-sm font-medium text-foreground" data-testid={`text-source-name-${idx}`}>
                                {source.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-xs text-muted-foreground">
                                Weight: <span className="font-medium text-foreground" data-testid={`text-weight-${idx}`}>{source.weight.toFixed(3)}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Accuracy: <span className="font-medium text-foreground" data-testid={`text-accuracy-${idx}`}>{(source.accuracy * 100).toFixed(1)}%</span>
                              </div>
                              <Badge variant="outline" className="text-xs" data-testid={`badge-predictions-${idx}`}>
                                {source.predictions} predictions
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 7: Historic Learnings (Cumulative AI Metrics) */}
        <TabsContent value="historic-learnings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historic Learnings Summary</CardTitle>
              <CardDescription>
                Cumulative AI learning metrics from all historical data sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              {learningSummaryLoading ? (
                <div className="text-sm text-muted-foreground">Loading learning summary...</div>
              ) : !learningSummary ? (
                <div className="text-sm text-muted-foreground">
                  No historical learning data available yet. AI insights and recommendations will accumulate over time.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Overall Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-total-insights">
                      <div className="text-sm text-muted-foreground mb-1">Total AI Insights</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-total-insights">
                        {learningSummary.totalInsights || 0}
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-approved-recs">
                      <div className="text-sm text-muted-foreground mb-1">Approved Recommendations</div>
                      <div className="text-2xl font-bold text-green-600" data-testid="text-approved-recs">
                        {learningSummary.approvedRecommendations || 0}
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-opportunities">
                      <div className="text-sm text-muted-foreground mb-1">AI Opportunities</div>
                      <div className="text-2xl font-bold text-foreground" data-testid="text-opportunities">
                        {learningSummary.totalOpportunities?.toLocaleString() || 0}
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-card" data-testid="card-learning-cycles">
                      <div className="text-sm text-muted-foreground mb-1">Learning Cycles</div>
                      <div className="text-2xl font-bold text-purple-600" data-testid="text-learning-cycles">
                        {learningSummary.learningCycles || 0}
                      </div>
                    </div>
                  </div>

                  {/* Paper Trading Performance */}
                  {learningSummary.paperTrading && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3">Historical Paper Trading Performance</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 border rounded-lg bg-card" data-testid="card-paper-trades">
                          <div className="text-sm text-muted-foreground mb-1">Total Trades</div>
                          <div className="text-2xl font-bold text-foreground" data-testid="text-paper-trades">
                            {learningSummary.paperTrading.totalTrades || 0}
                          </div>
                        </div>
                        
                        <div className="p-4 border rounded-lg bg-card" data-testid="card-paper-winrate">
                          <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                          <div className="text-2xl font-bold text-foreground" data-testid="text-paper-winrate">
                            {learningSummary.paperTrading.winRate ? `${learningSummary.paperTrading.winRate}%` : 'N/A'}
                          </div>
                        </div>
                        
                        <div className="p-4 border rounded-lg bg-card" data-testid="card-paper-total-pl">
                          <div className="text-sm text-muted-foreground mb-1">Total P/L</div>
                          <div 
                            className={`text-2xl font-bold ${
                              learningSummary.paperTrading.totalPL > 0 ? 'text-green-600' : 
                              learningSummary.paperTrading.totalPL < 0 ? 'text-red-600' : 
                              'text-foreground'
                            }`}
                            data-testid="text-paper-total-pl"
                          >
                            ${learningSummary.paperTrading.totalPL?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                        
                        <div className="p-4 border rounded-lg bg-card" data-testid="card-paper-avg-pl">
                          <div className="text-sm text-muted-foreground mb-1">Avg P/L</div>
                          <div 
                            className={`text-2xl font-bold ${
                              learningSummary.paperTrading.avgPL > 0 ? 'text-green-600' : 
                              learningSummary.paperTrading.avgPL < 0 ? 'text-red-600' : 
                              'text-foreground'
                            }`}
                            data-testid="text-paper-avg-pl"
                          >
                            ${learningSummary.paperTrading.avgPL?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Last Updated */}
                  <div className="text-xs text-muted-foreground text-right" data-testid="text-last-updated">
                    Last updated: {learningSummary.lastUpdated ? new Date(learningSummary.lastUpdated).toLocaleString() : 'N/A'}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 8: Paper Trading Simulation (Milestone 18) */}
        <TabsContent value="paper-trading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paper Trading Simulation Engine</CardTitle>
              <CardDescription>
                Live paper trading simulation with real-time metrics and portfolio monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paperSimLoading ? (
                <div className="text-sm text-muted-foreground">Loading paper trading data...</div>
              ) : !paperSimMetrics ? (
                <div className="text-sm text-muted-foreground">
                  No paper trading simulation data available. Start the simulation engine to begin paper trading.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status and Control */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${isSimRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                      <span className="text-sm font-medium text-foreground" data-testid="text-sim-status">
                        Engine Status: {isSimRunning ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                  </div>

                  {/* Portfolio Metrics */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Portfolio Performance</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 border rounded-lg bg-card" data-testid="card-total-trades">
                        <div className="text-sm text-muted-foreground mb-1">Total Trades</div>
                        <div className="text-2xl font-bold text-foreground" data-testid="text-total-trades">
                          {paperSimMetrics.totalTrades || 0}
                        </div>
                      </div>
                      
                      <div className="p-4 border rounded-lg bg-card" data-testid="card-win-rate">
                        <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                        <div className="text-2xl font-bold text-foreground" data-testid="text-win-rate">
                          {paperSimMetrics.winRate !== null && paperSimMetrics.winRate !== undefined 
                            ? `${paperSimMetrics.winRate.toFixed(1)}%` 
                            : 'N/A'}
                        </div>
                      </div>
                      
                      <div className="p-4 border rounded-lg bg-card" data-testid="card-total-pnl">
                        <div className="text-sm text-muted-foreground mb-1">Total P/L</div>
                        <div 
                          className={`text-2xl font-bold ${
                            paperSimMetrics.totalPnl > 0 ? 'text-green-500' : 
                            paperSimMetrics.totalPnl < 0 ? 'text-red-500' : 
                            'text-foreground'
                          }`}
                          data-testid="text-total-pnl"
                        >
                          ${paperSimMetrics.totalPnl?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      
                      <div className="p-4 border rounded-lg bg-card" data-testid="card-sharpe-ratio">
                        <div className="text-sm text-muted-foreground mb-1">Sharpe Ratio</div>
                        <div className="text-2xl font-bold text-foreground" data-testid="text-sharpe-ratio">
                          {paperSimMetrics.sharpeRatio?.toFixed(2) || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Metrics */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 border rounded-lg bg-card">
                      <div className="text-xs text-muted-foreground mb-1">Max Drawdown</div>
                      <div 
                        className={`text-lg font-bold ${paperSimMetrics.maxDrawdown >= 15 ? 'text-red-500' : 'text-foreground'}`}
                        data-testid="text-max-drawdown"
                      >
                        {paperSimMetrics.maxDrawdown?.toFixed(2) || '0.00'}%
                      </div>
                    </div>
                    
                    <div className="p-3 border rounded-lg bg-card">
                      <div className="text-xs text-muted-foreground mb-1">Profit Factor</div>
                      <div className="text-lg font-bold text-foreground" data-testid="text-profit-factor">
                        {paperSimMetrics.profitFactor?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                    
                    <div className="p-3 border rounded-lg bg-card">
                      <div className="text-xs text-muted-foreground mb-1">Avg Return</div>
                      <div 
                        className={`text-lg font-bold ${
                          paperSimMetrics.avgReturn > 0 ? 'text-green-500' : 
                          paperSimMetrics.avgReturn < 0 ? 'text-red-500' : 
                          'text-foreground'
                        }`}
                        data-testid="text-avg-return"
                      >
                        {paperSimMetrics.avgReturn !== null && paperSimMetrics.avgReturn !== undefined 
                          ? `${paperSimMetrics.avgReturn > 0 ? '+' : ''}${paperSimMetrics.avgReturn.toFixed(2)}%` 
                          : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Open Positions */}
                  {paperPositions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3">
                        Open Positions ({paperPositions.length})
                      </h4>
                      <div className="space-y-2">
                        {paperPositions.map((pos: any, idx: number) => (
                          <div 
                            key={idx} 
                            className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                            data-testid={`position-${idx}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-symbol-${idx}`}>
                                  {pos.symbol}
                                </Badge>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {pos.strategy}
                                </span>
                              </div>
                              <div className="text-right">
                                <div 
                                  className={`text-sm font-medium ${
                                    parseFloat(pos.unrealizedPnl || 0) > 0 ? 'text-green-500' : 
                                    parseFloat(pos.unrealizedPnl || 0) < 0 ? 'text-red-500' : 
                                    'text-foreground'
                                  }`}
                                  data-testid={`text-pnl-${idx}`}
                                >
                                  ${parseFloat(pos.unrealizedPnl || 0).toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Entry: ${parseFloat(pos.avgPrice || 0).toFixed(4)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strategy Breakdown */}
                  {paperSimMetrics.byStrategy && paperSimMetrics.byStrategy.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3">Performance by Strategy</h4>
                      <div className="space-y-2">
                        {paperSimMetrics.byStrategy.map((strategy: any, idx: number) => (
                          <div 
                            key={idx} 
                            className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                            data-testid={`strategy-${idx}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs" data-testid={`badge-strategy-${idx}`}>
                                  {strategy.strategyId?.replace(/_/g, ' ').toUpperCase() || 'Unknown'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {strategy.count} trades
                                </span>
                              </div>
                              <div className="text-right">
                                <div 
                                  className={`text-sm font-medium ${
                                    strategy.totalPnl > 0 ? 'text-green-500' : 
                                    strategy.totalPnl < 0 ? 'text-red-500' : 
                                    'text-foreground'
                                  }`}
                                  data-testid={`text-strategy-pnl-${idx}`}
                                >
                                  ${strategy.totalPnl?.toFixed(2) || '0.00'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {strategy.winRate !== null && strategy.winRate !== undefined 
                                    ? `${strategy.winRate.toFixed(1)}% win rate` 
                                    : 'N/A'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 8: System Health Alerts */}
        <TabsContent value="health-alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Health Alerts</CardTitle>
              <CardDescription>
                Error logs and system health warnings with severity indicators
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertsLoading ? (
                <div className="text-sm text-muted-foreground">Loading alerts...</div>
              ) : alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  No system alerts - all systems healthy
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert: any) => {
                    const severity = alert.context?.severity || 'info';
                    const severityColors: Record<string, string> = {
                      error: 'border-red-500 bg-red-50 dark:bg-red-950',
                      warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950',
                      info: 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    };

                    return (
                      <div 
                        key={alert.id} 
                        className={`p-4 border-l-4 rounded-lg ${severityColors[severity] || severityColors.info}`}
                        data-testid={`alert-${alert.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge 
                            variant={alert.resolved ? 'outline' : 'destructive'}
                            data-testid={`badge-status-${alert.id}`}
                          >
                            {alert.resolved ? 'Resolved' : 'Active'}
                          </Badge>
                          <span className="text-xs text-muted-foreground" data-testid={`text-alert-timestamp-${alert.id}`}>
                            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground mb-1" data-testid={`text-alert-type-${alert.id}`}>
                          {alert.errorType}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-alert-message-${alert.id}`}>
                          {alert.errorMessage}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
