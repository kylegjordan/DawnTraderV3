import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Database,
  Zap,
  Server,
  Cpu,
  Clock,
  Info
} from "lucide-react";

interface HealthEngineData {
  ts: string;
  paper: {
    queue: {
      ok: boolean;
      depth: number;
      executingJobAgeMs: number | null;
      oldestAgeMs: number | null;
    };
    engine: {
      ok: boolean;
      isRunning: boolean;
      lastTickAgeMs: number | null;
      lastSignalAgeMs: number | null;
    };
  };
  live: {
    queue: {
      ok: boolean;
      depth: number;
      executingJobAgeMs: number | null;
      oldestAgeMs: number | null;
    };
    engine: {
      ok: boolean;
      isRunning: boolean;
      lastTickAgeMs: number | null;
      lastSignalAgeMs: number | null;
    };
  };
  marketData: { ok: boolean; lastUpdateAgeMs: number | null };
  ssotCache: { ok: boolean };
  database: { ok: boolean };
  websocket: { ok: boolean; connectedClients: number };
  overallOk: boolean;
}

interface HealthSummary {
  overallOk: boolean;
  paperOk: boolean;
  liveOk: boolean;
  marketDataOk: boolean;
  dbOk: boolean;
  lastLatencies: {
    broadcast?: number;
  };
  timestamp: string;
  recentRecoveries: number;
}

export default function EngineTelemetry() {
  const [wsHealthData, setWsHealthData] = useState<HealthEngineData | null>(null);
  const [heartbeatHistory, setHeartbeatHistory] = useState<number[]>([]);
  const { messages } = useWebSocket();
  const wsConnectedRef = useRef(false);

  // Diagnostic logging - track connection state
  useEffect(() => {
    console.log('[EngineTelemetry] Component mounted');
    wsConnectedRef.current = true;
    
    return () => {
      console.log('[EngineTelemetry] Component unmounted');
      wsConnectedRef.current = false;
    };
  }, []);

  // WebSocket listener for health_engine events - STABILIZED WITH REF
  useEffect(() => {
    try {
      const healthMessages = messages.filter((msg: any) => msg.type === 'health_engine');
      if (healthMessages.length > 0 && wsConnectedRef.current) {
        const latest = healthMessages[healthMessages.length - 1];
        if (latest?.payload) {
          console.log('[EngineTelemetry] WS health data received:', {
            ts: latest.payload.ts,
            overallOk: latest.payload.overallOk,
            paperQueueDepth: latest.payload.paper?.queue?.depth,
            liveQueueDepth: latest.payload.live?.queue?.depth
          });
          setWsHealthData(latest.payload);
        }
      }
    } catch (error) {
      console.error('[EngineTelemetry] WebSocket processing error:', error);
    }
  }, [messages]);

  // REST fallback - fetch health summary every 15s
  const { data: healthSummary, isLoading: summaryLoading } = useQuery<HealthSummary>({
    queryKey: ['/api/health/summary'],
    refetchInterval: 15000,
  });

  // Recovery actions
  const { data: recoveryData } = useQuery<{ actions: any[] }>({
    queryKey: ['/api/health/recovery'],
    refetchInterval: 30000,
  });

  // Phase 41F-F: Anomaly detection data
  const { data: anomaliesData } = useQuery<{ anomalies: any[] }>({
    queryKey: ['/api/health/anomalies/recent'],
    refetchInterval: 15000,
  });

  // Diagnostic logging for data sources
  useEffect(() => {
    console.log('[EngineTelemetry] Data sources updated:', {
      hasWsData: !!wsHealthData,
      hasRestData: !!healthSummary,
      wsTs: wsHealthData?.ts,
      restTs: healthSummary?.timestamp
    });
  }, [wsHealthData, healthSummary]);

  const latestData = wsHealthData || healthSummary;

  // Show loading state only if query is actively loading and no data exists yet
  if (summaryLoading && !latestData) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Graceful fallback UI when no data available
  if (!latestData) {
    return (
      <div className="p-6 text-center">
        <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-lg font-medium text-gray-400 italic">
          Waiting for telemetry data (first heartbeat expected within 5s)...
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Engine health monitor broadcasts every 5 seconds
        </p>
      </div>
    );
  }

  // Phase 41F-F: Enhanced status indicators with 3-state color coding
  const getStatusColor = (ok: boolean, warning?: boolean): 'green' | 'yellow' | 'red' => {
    if (ok) return 'green';
    if (warning) return 'yellow';
    return 'red';
  };

  const getStatusIcon = (ok: boolean, warning?: boolean) => {
    const color = getStatusColor(ok, warning);
    if (color === 'green') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (color === 'yellow') return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusBadge = (ok: boolean, label: string = "OK", warning?: boolean) => {
    const color = getStatusColor(ok, warning);
    if (color === 'green') {
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{label}</Badge>;
    }
    if (color === 'yellow') {
      return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">WARN</Badge>;
    }
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">CRIT</Badge>;
  };

  // Phase 41F-F: Metric card with color-coded background
  const getMetricCardClass = (ok: boolean, warning?: boolean): string => {
    const color = getStatusColor(ok, warning);
    if (color === 'green') return 'border-green-500/20 bg-green-500/5';
    if (color === 'yellow') return 'border-yellow-500/20 bg-yellow-500/5';
    return 'border-red-500/20 bg-red-500/5';
  };

  // Error boundary wrapper for the main render
  try {
    return (
      <div className="space-y-6">
        {/* Top Row - System Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card 
            data-testid="card-system-status"
            className={getMetricCardClass(latestData?.overallOk !== false)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {getStatusIcon(latestData?.overallOk !== false)}
                <span className="text-2xl font-bold">
                  {latestData?.overallOk !== false ? 'OK' : 'WARN'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Last updated: {new Date((latestData && 'timestamp' in latestData ? latestData.timestamp : latestData?.ts) || Date.now()).toLocaleTimeString()}
              </p>
            </CardContent>
          </Card>

          <Card 
            data-testid="card-broadcast-latency"
            className={getMetricCardClass(
              (healthSummary?.lastLatencies?.broadcast ?? 0) < 100,
              (healthSummary?.lastLatencies?.broadcast ?? 0) >= 100 && (healthSummary?.lastLatencies?.broadcast ?? 0) < 200
            )}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Broadcast Latency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {getStatusIcon(
                  (healthSummary?.lastLatencies?.broadcast ?? 0) < 100,
                  (healthSummary?.lastLatencies?.broadcast ?? 0) >= 100 && (healthSummary?.lastLatencies?.broadcast ?? 0) < 200
                )}
                <div className="text-2xl font-bold">
                  {healthSummary?.lastLatencies?.broadcast ?? 'N/A'}
                  {healthSummary?.lastLatencies?.broadcast && ' ms'}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Target: &lt;100ms
              </p>
            </CardContent>
          </Card>

          <Card 
            data-testid="card-recovery-events"
            className={getMetricCardClass(
              (healthSummary?.recentRecoveries ?? 0) === 0,
              (healthSummary?.recentRecoveries ?? 0) > 0 && (healthSummary?.recentRecoveries ?? 0) < 5
            )}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4" />
                Recovery Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {getStatusIcon(
                  (healthSummary?.recentRecoveries ?? 0) === 0,
                  (healthSummary?.recentRecoveries ?? 0) > 0 && (healthSummary?.recentRecoveries ?? 0) < 5
                )}
                <div className="text-2xl font-bold">
                  {healthSummary?.recentRecoveries ?? 0}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Last 24 hours
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Queue Health Section - Defensive rendering with optional chaining */}
        {wsHealthData && (
          <Card data-testid="card-queue-health">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                Queue Health (Paper & Live)
              </CardTitle>
              <CardDescription>Operation queue metrics and execution status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Paper Queue - Fully defensive */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Paper Mode</span>
                    {getStatusBadge(wsHealthData?.paper?.queue?.ok ?? false)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Queue Depth:</span>
                      <span className="font-mono">{wsHealthData?.paper?.queue?.depth ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Executing Age:</span>
                      <span className="font-mono">
                        {wsHealthData?.paper?.queue?.executingJobAgeMs 
                          ? `${wsHealthData.paper.queue.executingJobAgeMs}ms`
                          : 'None'}
                      </span>
                    </div>
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Info className="h-3 w-3" />
                      Learn More
                      <ChevronDown className="h-3 w-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-md text-xs space-y-1">
                      <p><strong>Queue Depth:</strong> Normal 0-3 ⚠️ &gt;10 = bottleneck</p>
                      <p><strong>Executing Age:</strong> Normal &lt;500ms 🚨 &gt;3000ms = stuck job (auto-recovery at 60s)</p>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Live Queue - Fully defensive */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Live Mode</span>
                    {getStatusBadge(wsHealthData?.live?.queue?.ok ?? false)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Queue Depth:</span>
                      <span className="font-mono">{wsHealthData?.live?.queue?.depth ?? 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Executing Age:</span>
                      <span className="font-mono">
                        {wsHealthData?.live?.queue?.executingJobAgeMs 
                          ? `${wsHealthData.live.queue.executingJobAgeMs}ms`
                          : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Engine Health Section - Defensive rendering */}
        {wsHealthData && (
          <Card data-testid="card-engine-health">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Trading Engine Health
              </CardTitle>
              <CardDescription>Engine runtime status and activity metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Paper Engine - Fully defensive */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Paper Engine</span>
                    {getStatusBadge(wsHealthData?.paper?.engine?.ok ?? false)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Running:</span>
                      <span className="font-mono">
                        {wsHealthData?.paper?.engine?.isRunning ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Tick:</span>
                      <span className="font-mono">
                        {wsHealthData?.paper?.engine?.lastTickAgeMs 
                          ? `${wsHealthData.paper.engine.lastTickAgeMs}ms ago`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Info className="h-3 w-3" />
                      Learn More
                      <ChevronDown className="h-3 w-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-md text-xs space-y-1">
                      <p><strong>Tick Age:</strong> &lt;60,000ms ✅ ⚠️ &gt;1min = idle engine (auto-restart triggered)</p>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Live Engine - Fully defensive */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Live Engine</span>
                    {getStatusBadge(wsHealthData?.live?.engine?.ok ?? false)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Running:</span>
                      <span className="font-mono">
                        {wsHealthData?.live?.engine?.isRunning ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Tick:</span>
                      <span className="font-mono">
                        {wsHealthData?.live?.engine?.lastTickAgeMs 
                          ? `${wsHealthData.live.engine.lastTickAgeMs}ms ago`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Market Data & Infrastructure - Defensive rendering */}
        {wsHealthData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card data-testid="card-market-data">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Market Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(wsHealthData?.marketData?.ok ?? false)}
                  <span className="font-medium">
                    {wsHealthData?.marketData?.ok ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {wsHealthData?.marketData?.lastUpdateAgeMs !== null && wsHealthData?.marketData?.lastUpdateAgeMs !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Last update: {wsHealthData.marketData.lastUpdateAgeMs}ms ago
                  </p>
                )}
                <Collapsible className="mt-2">
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <Info className="h-3 w-3" />
                    Learn More
                    <ChevronDown className="h-3 w-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-md text-xs">
                    <p>Normal: connected or fallback_rest</p>
                    <p>🚨 blocked &gt;30s → auto-recovery</p>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            <Card data-testid="card-database">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Database
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {getStatusIcon(wsHealthData?.database?.ok ?? false)}
                  <span className="font-medium">
                    {wsHealthData?.database?.ok ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-websocket">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  WebSocket
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(wsHealthData?.websocket?.ok ?? false)}
                  <span className="font-medium">
                    {wsHealthData?.websocket?.ok ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {wsHealthData?.websocket?.connectedClients !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {wsHealthData.websocket.connectedClients} client(s) connected
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Phase 41F-F: Recent Anomalies Panel */}
        {anomaliesData && anomaliesData.anomalies && anomaliesData.anomalies.length > 0 && (
          <Card data-testid="card-anomalies">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Recent Anomalies
              </CardTitle>
              <CardDescription>Detected system anomalies and alerts (last 50)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {anomaliesData.anomalies.map((anomaly: any, idx: number) => {
                  const severityColor = 
                    anomaly.severity === 'critical' ? 'text-red-500 bg-red-500/10 border-red-500/20' :
                    anomaly.severity === 'warning' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' :
                    'text-blue-500 bg-blue-500/10 border-blue-500/20';
                  
                  const severityIcon = 
                    anomaly.severity === 'critical' ? <XCircle className="h-4 w-4 text-red-500" /> :
                    anomaly.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
                    <Info className="h-4 w-4 text-blue-500" />;

                  return (
                    <div 
                      key={idx} 
                      className={`flex items-start gap-3 p-3 rounded-md border ${severityColor}`}
                      data-testid={`anomaly-${idx}`}
                    >
                      {severityIcon}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {anomaly.subsystem || 'Unknown'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {anomaly.timestamp ? new Date(anomaly.timestamp).toLocaleString() : 'Unknown time'}
                          </span>
                        </div>
                        <p className="text-sm font-medium break-words">{anomaly.message || 'Unknown anomaly'}</p>
                        {anomaly.value !== undefined && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Value: <span className="font-mono">{anomaly.value}</span>
                            {anomaly.threshold && ` (threshold: ${anomaly.threshold})`}
                          </p>
                        )}
                      </div>
                      {anomaly.recovered && (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" title="Auto-recovered" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recovery Log */}
        {recoveryData && recoveryData.actions && recoveryData.actions.length > 0 && (
          <Card data-testid="card-recovery-log">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Recovery Event Log
              </CardTitle>
              <CardDescription>Recent auto-recovery actions taken by the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recoveryData.actions.map((action: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{action?.action ?? 'Unknown action'}</p>
                      <p className="text-xs text-muted-foreground">
                        {action?.timestamp ? new Date(action.timestamp).toLocaleString() : 'Unknown time'}
                      </p>
                    </div>
                    {action?.success && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  } catch (err) {
    console.error('[EngineTelemetry] Render failure:', err);
    return (
      <div className="p-6 text-center border border-red-500 rounded-lg">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-red-500">Render Error</p>
        <p className="text-sm text-muted-foreground mt-2 font-mono">
          {String(err)}
        </p>
      </div>
    );
  }
}
