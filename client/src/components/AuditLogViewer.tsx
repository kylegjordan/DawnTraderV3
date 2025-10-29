import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, XCircle, Loader2, History, Shield, Filter } from "lucide-react";

interface AuditLogEntry {
  id: number;
  entityType: 'guardrails' | 'filters';
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  tradingMode: 'live' | 'paper';
  timestamp: string;
}

interface AuditLogsResponse {
  ok: boolean;
  data: AuditLogEntry[];
  count: number;
  timestamp: string;
}

export function AuditLogViewer() {
  const { toast } = useToast();
  const [modeFilter, setModeFilter] = useState<'all' | 'paper' | 'live'>('all');
  const [entityFilter, setEntityFilter] = useState<'all' | 'guardrails' | 'filters'>('all');

  const { data, isLoading, error, refetch } = useQuery<AuditLogsResponse>({
    queryKey: ['/api/diagnostics/audit-logs', modeFilter, entityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (modeFilter !== 'all') params.append('mode', modeFilter);
      if (entityFilter !== 'all') params.append('entityType', entityFilter);
      params.append('limit', '50');
      
      const response = await fetch(`/api/diagnostics/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      return response.json();
    },
  });

  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshing...",
      description: "Fetching latest audit logs.",
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Override Audit History
          </CardTitle>
          <CardDescription>
            Track all manual override changes to guardrails and filters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Override Audit History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load audit logs: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const logs = data?.data || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Override Audit History
            </CardTitle>
            <CardDescription>
              Track all manual override changes to guardrails and filters (last 50 entries)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            data-testid="button-refresh-audit-logs"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Mode:</label>
            <Select value={modeFilter} onValueChange={(value: any) => setModeFilter(value)}>
              <SelectTrigger className="w-32" data-testid="select-mode-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paper">Paper</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Type:</label>
            <Select value={entityFilter} onValueChange={(value: any) => setEntityFilter(value)}>
              <SelectTrigger className="w-40" data-testid="select-entity-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="guardrails">Guardrails</SelectItem>
                <SelectItem value="filters">Filters</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {logs.length === 0 ? (
          <Alert>
            <AlertDescription>
              No audit log entries found. Override changes will appear here when manual adjustments are made to guardrails or filters.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30"
                data-testid={`audit-log-entry-${log.id}`}
              >
                <div className="mt-1">
                  {log.entityType === 'guardrails' ? (
                    <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Filter className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  )}
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={log.tradingMode === 'live' ? 'destructive' : 'secondary'}>
                      {log.tradingMode}
                    </Badge>
                    <Badge variant="outline">
                      {log.entityType}
                    </Badge>
                    <span className="text-sm font-medium">{log.field}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Old Value:</span>
                      <div className="font-mono mt-1 p-2 bg-background rounded">
                        {log.oldValue || 'null'}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">New Value:</span>
                      <div className="font-mono mt-1 p-2 bg-background rounded">
                        {log.newValue || 'null'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {formatTimestamp(log.timestamp)} • Changed by: {log.changedBy}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {logs.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground text-center">
            Showing {logs.length} most recent entries
          </div>
        )}
      </CardContent>
    </Card>
  );
}
