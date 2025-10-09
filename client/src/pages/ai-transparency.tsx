import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, XCircle, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTrading } from "@/hooks/use-trading";

export default function AITransparencyPage() {
  const [activeTab, setActiveTab] = useState("automation-logs");
  const { mode } = useTrading();

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

  const logs = transparencyData?.logs || [];
  const calibrations = calibrationsData?.calibrations || [];
  const alerts = alertsData?.errors || [];

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-purple-500" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Transparency</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor automated scheduler activity, learning adjustments, and system health</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3" data-testid="tabs-ai-transparency">
          <TabsTrigger value="automation-logs" data-testid="tab-automation-logs">
            <Clock className="w-4 h-4 mr-2" />
            Recent Automation Logs
          </TabsTrigger>
          <TabsTrigger value="learning-adjustments" data-testid="tab-learning-adjustments">
            <TrendingUp className="w-4 h-4 mr-2" />
            Learning Adjustments
          </TabsTrigger>
          <TabsTrigger value="health-alerts" data-testid="tab-health-alerts">
            <AlertTriangle className="w-4 h-4 mr-2" />
            System Health Alerts
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

        {/* Tab 3: System Health Alerts */}
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
