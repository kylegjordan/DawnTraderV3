import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, XCircle, Clock, TrendingUp, AlertTriangle, Brain, Target, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTradingMode } from "@/contexts/trading-mode-context";

export default function AITransparencyPage() {
  const [activeTab, setActiveTab] = useState("automation-logs");
  const { mode } = useTradingMode();

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

  const logs = transparencyData?.logs || [];
  const calibrations = calibrationsData?.calibrations || [];
  const alerts = alertsData?.errors || [];
  const confidenceIndex = confidenceData?.autonomyConfidence ?? 0;
  const semanticMemories = semanticData?.memories || [];
  const semanticTags = tagsData?.tags || [];
  const learningMetrics = learningMetricsData?.metrics || null;
  const proposals = proposalsData?.proposals || [];
  const historicSignalsStats = historicSignalsData?.stats || null;

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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7" data-testid="tabs-ai-transparency">
          <TabsTrigger value="automation-logs" data-testid="tab-automation-logs">
            <Clock className="w-4 h-4 mr-2" />
            Automation Logs
          </TabsTrigger>
          <TabsTrigger value="learning-adjustments" data-testid="tab-learning-adjustments">
            <TrendingUp className="w-4 h-4 mr-2" />
            Learning Adjustments
          </TabsTrigger>
          <TabsTrigger value="autonomous-adjustments" data-testid="tab-autonomous-adjustments">
            <Settings className="w-4 h-4 mr-2" />
            Autonomous Adjustments
          </TabsTrigger>
          <TabsTrigger value="historic-signals" data-testid="tab-historic-signals">
            <TrendingUp className="w-4 h-4 mr-2" />
            Historic Signals
          </TabsTrigger>
          <TabsTrigger value="semantic-insights" data-testid="tab-semantic-insights">
            <Brain className="w-4 h-4 mr-2" />
            Semantic Insights
          </TabsTrigger>
          <TabsTrigger value="learning-health" data-testid="tab-learning-health">
            <Target className="w-4 h-4 mr-2" />
            Learning Health
          </TabsTrigger>
          <TabsTrigger value="health-alerts" data-testid="tab-health-alerts">
            <AlertTriangle className="w-4 h-4 mr-2" />
            System Health
          </TabsTrigger>
        </TabsList>

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
                                {strategy.strategyId.replace(/_/g, ' ').toUpperCase()}
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

        {/* Tab 5: System Health Alerts */}
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
