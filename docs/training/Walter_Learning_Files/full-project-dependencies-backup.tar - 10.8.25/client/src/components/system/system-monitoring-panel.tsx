import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface SystemStatus {
  tradingEngine: string;
  aiScheduler: string;
  database: string;
  kraken: string;
  uptime: number;
  uptimeFormatted: string;
}

interface AuditEntry {
  id: string;
  strategy: string;
  mode: string;
  actorType: string;
  createdAt: string;
  prevParams: any;
  nextParams: any;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface AIAuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
}

interface ErrorLog {
  id: string;
  timestamp: string;
  errorType: string;
  message: string;
  resolved: boolean;
}

export default function SystemMonitoringPanel() {
  const { data: healthData, isLoading: healthLoading } = useQuery<{ ok: boolean; status: SystemStatus }>({
    queryKey: ['/api/system/health'],
  });

  const { data: auditData, isLoading: auditLoading } = useQuery<{ ok: boolean; audits: AuditEntry[] }>({
    queryKey: ['/api/system/strategy-audit'],
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<{ ok: boolean; logs: LogEntry[] }>({
    queryKey: ['/api/system/logs'],
  });

  const { data: aiAuditData, isLoading: aiAuditLoading } = useQuery<{ ok: boolean; logs: AIAuditLog[] }>({
    queryKey: ['/api/system/ai-audit'],
  });

  const { data: errorData, isLoading: errorLoading } = useQuery<{ ok: boolean; errors: ErrorLog[] }>({
    queryKey: ['/api/system/error-logs'],
  });

  const health = healthData?.status;
  const audits = auditData?.audits || [];
  const logs = logsData?.logs || [];
  const aiAuditLogs = aiAuditData?.logs || [];
  const errors = errorData?.errors || [];

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Systems Monitoring & Checks</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="health" className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-4">
            <TabsTrigger value="health" data-testid="tab-system-health">System Health</TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit-viewer">Audit Viewer</TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-system-logs">System Logs</TabsTrigger>
            <TabsTrigger value="validation" data-testid="tab-validation-reports">Validation Reports</TabsTrigger>
            <TabsTrigger value="aiAudit" data-testid="tab-ai-audit">Audit Log</TabsTrigger>
            <TabsTrigger value="errors" data-testid="tab-error-logs">Error Logs</TabsTrigger>
          </TabsList>

          {/* System Health */}
          <TabsContent value="health" data-testid="content-system-health">
            {healthLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : health ? (
              <ul className="mt-2 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <strong>Trading Engine:</strong> <span data-testid="status-trading-engine">{health.tradingEngine}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <strong>AI Scheduler:</strong> <span data-testid="status-ai-scheduler">{health.aiScheduler}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <strong>Database:</strong> <span data-testid="status-database">{health.database}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✅</span>
                  <strong>Kraken API:</strong> <span data-testid="status-kraken">{health.kraken}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span>⏱️</span>
                  <strong>Uptime:</strong> <span data-testid="status-uptime">{health.uptimeFormatted}</span>
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground">No health data available.</p>
            )}
          </TabsContent>

          {/* Audit Viewer */}
          <TabsContent value="audit" data-testid="content-audit-viewer">
            {auditLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : audits.length ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {audits.map((a) => (
                  <div key={a.id} className="border-b pb-2 text-sm" data-testid={`audit-entry-${a.id}`}>
                    <div className="font-semibold">
                      {a.strategy} ({a.mode}) — {a.actorType} at {new Date(a.createdAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {Object.keys(a.nextParams || {}).map(k => {
                        const oldVal = a.prevParams?.[k];
                        const newVal = a.nextParams?.[k];
                        if (oldVal !== newVal) {
                          return `${k}: ${oldVal} → ${newVal}`;
                        }
                        return null;
                      }).filter(Boolean).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground" data-testid="audit-empty-state">No audit entries found.</p>
            )}
          </TabsContent>

          {/* System Logs */}
          <TabsContent value="logs" data-testid="content-system-logs">
            {logsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <pre className="text-xs bg-muted dark:bg-muted p-2 rounded overflow-auto h-64" data-testid="system-logs-content">
                {logs.map((l) => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n") || "No logs available"}
              </pre>
            )}
          </TabsContent>

          {/* Validation Reports */}
          <TabsContent value="validation" data-testid="content-validation-reports">
            <p className="text-muted-foreground" data-testid="validation-empty-state">No validation reports available.</p>
          </TabsContent>

          {/* AI Audit Log */}
          <TabsContent value="aiAudit" data-testid="content-ai-audit">
            {aiAuditLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : aiAuditLogs.length ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {aiAuditLogs.map((l) => (
                  <div key={l.id} className="border-b pb-2 text-sm" data-testid={`ai-audit-${l.id}`}>
                    {new Date(l.timestamp).toLocaleString()} — {l.action}: {l.details}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground" data-testid="ai-audit-empty-state">No AI audit log entries available.</p>
            )}
          </TabsContent>

          {/* Error Logs */}
          <TabsContent value="errors" data-testid="content-error-logs">
            {errorLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : errors.length ? (
              <pre className="text-xs bg-red-950/20 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2 rounded overflow-auto h-64" data-testid="error-logs-content">
                {errors.map((e) => `[${new Date(e.timestamp).toLocaleString()}] ${e.errorType}: ${e.message}${e.resolved ? ' (RESOLVED)' : ''}`).join("\n")}
              </pre>
            ) : (
              <p className="text-muted-foreground" data-testid="error-logs-empty-state">No error logs found.</p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
