import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import type { AIAuditLog } from '@shared/schema';

export function AuditLogViewer() {
  const { data: auditLogs, isLoading } = useQuery<AIAuditLog[]>({
    queryKey: ['/api/ai/audit-logs'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="p-6" data-testid="card-audit-log-loading">
        <p className="text-sm text-muted-foreground">Loading audit logs...</p>
      </Card>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <Card className="p-6" data-testid="card-audit-log-empty">
        <p className="text-sm text-muted-foreground">No audit logs yet</p>
      </Card>
    );
  }

  const getActionIcon = (actionType: string) => {
    if (actionType.includes('update_setting')) return <Settings className="w-4 h-4" />;
    if (actionType.includes('analysis')) return <CheckCircle className="w-4 h-4" />;
    if (actionType.includes('error')) return <AlertCircle className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Card className="p-4" data-testid="card-audit-log">
      <div className="mb-4">
        <h3 className="font-semibold mb-1">AI Audit Log</h3>
        <p className="text-sm text-muted-foreground">
          Track all AI-driven changes and analysis requests
        </p>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="border rounded-lg p-3"
              data-testid={`audit-log-${log.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {getActionIcon(log.actionType)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{log.actionType.replace(/_/g, ' ')}</span>
                    {getStatusBadge(log.status)}
                  </div>
                  
                  {log.settingName && (
                    <p className="text-sm text-muted-foreground mb-1">
                      Setting: <strong>{log.settingName}</strong>
                    </p>
                  )}
                  
                  {log.oldValue && log.newValue && (
                    <div className="text-xs bg-muted p-2 rounded mb-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="opacity-60">Old:</span>{' '}
                          <code>{JSON.stringify(log.oldValue)}</code>
                        </div>
                        <div>
                          <span className="opacity-60">New:</span>{' '}
                          <code>{JSON.stringify(log.newValue)}</code>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {log.gptResponse && (
                    <p className="text-sm line-clamp-2 mb-2">{log.gptResponse}</p>
                  )}
                  
                  {log.confirmationMethod && (
                    <p className="text-xs text-muted-foreground">
                      Confirmed via: {log.confirmationMethod}
                    </p>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-2">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
