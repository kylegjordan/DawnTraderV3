import { useState, useEffect } from "react";
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

  // WebSocket listener for health_engine events
  useEffect(() => {
    try {
      const healthMessages = messages.filter((msg: any) => msg.type === 'health_engine');
      if (healthMessages.length > 0) {
        const latest = healthMessages[healthMessages.length - 1];
        if (latest?.payload) {
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

  // If still no data after loading, show error state
  if (!latestData) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <p className="text-lg font-medium">Unable to load health data</p>
        <p className="text-sm text-muted-foreground mt-2">
          The health monitoring service may be unavailable. Please try refreshing the page.
        </p>
      </div>
    );
  }

  const getStatusIcon = (ok: boolean) => {
    if (ok) return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getStatusBadge = (ok: boolean, label: string = "OK") => {
    if (ok) {
      return <Badge className="bg-green-500/10 text-green-500">{label}</Badge>;
    }
    return <Badge variant="destructive">WARN</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Top Row - System Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-system-status">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {getStatusIcon(latestData.overallOk !== false)}
              <span className="text-2xl font-bold">
                {latestData.overallOk !== false ? 'OK' : 'WARN'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: {new Date(('timestamp' in latestData ? latestData.timestamp : latestData.ts) || Date.now()).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-broadcast-latency">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Broadcast Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {healthSummary?.lastLatencies?.broadcast || 'N/A'}
              {healthSummary?.lastLatencies?.broadcast && ' ms'}
            </div>
            {heartbeatHistory.length > 0 && (
              <div className="mt-2 h-8 flex items-end gap-0.5">
                {heartbeatHistory.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-primary/20 rounded-sm"
                    style={{ height: `${Math.min((val / 200) * 100, 100)}%` }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recovery-events">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              Recovery Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {healthSummary?.recentRecoveries || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Last 24 hours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Queue Health Section - Only show if WebSocket data available */}
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
              {/* Paper Queue */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Paper Mode</span>
                  {getStatusBadge(wsHealthData.paper.queue.ok)}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queue Depth:</span>
                    <span className="font-mono">{wsHealthData.paper.queue.depth || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Executing Age:</span>
                    <span className="font-mono">
                      {wsHealthData.paper.queue.executingJobAgeMs 
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

              {/* Live Queue */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Live Mode</span>
                  {getStatusBadge(wsHealthData.live.queue.ok)}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queue Depth:</span>
                    <span className="font-mono">{wsHealthData.live.queue.depth || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Executing Age:</span>
                    <span className="font-mono">
                      {wsHealthData.live.queue.executingJobAgeMs 
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

      {/* Engine Health Section - Only show if WebSocket data available */}
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
              {/* Paper Engine */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Paper Engine</span>
                  {getStatusBadge(wsHealthData.paper.engine.ok)}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Running:</span>
                    <span className="font-mono">
                      {wsHealthData.paper.engine.isRunning ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Tick:</span>
                    <span className="font-mono">
                      {wsHealthData.paper.engine.lastTickAgeMs 
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

              {/* Live Engine */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Live Engine</span>
                  {getStatusBadge(wsHealthData.live.engine.ok)}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Running:</span>
                    <span className="font-mono">
                      {wsHealthData.live.engine.isRunning ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Tick:</span>
                    <span className="font-mono">
                      {wsHealthData.live.engine.lastTickAgeMs 
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

      {/* Market Data & Infrastructure - Only show if WebSocket data available */}
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
                {getStatusIcon(wsHealthData.marketData.ok)}
                <span className="font-medium">
                  {wsHealthData.marketData.ok ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {wsHealthData.marketData.lastUpdateAgeMs && (
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
                {getStatusIcon(wsHealthData.database.ok)}
                <span className="font-medium">
                  {wsHealthData.database.ok ? 'Connected' : 'Disconnected'}
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
                {getStatusIcon(wsHealthData.websocket.ok)}
                <span className="font-medium">
                  {wsHealthData.websocket.ok ? 'Active' : 'Inactive'}
                </span>
              </div>
              {wsHealthData.websocket.connectedClients !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {wsHealthData.websocket.connectedClients} client(s) connected
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recovery Log */}
      {recoveryData && recoveryData.actions.length > 0 && (
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
                    <p className="text-sm font-medium">{action.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(action.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {action.success && (
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
}
