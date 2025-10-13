import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react';
import { SystemAlert, getAlertStyle } from '@/lib/alert-utils';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NotificationsPanelProps {
  alerts: SystemAlert[];
}

export function NotificationsPanel({ alerts }: NotificationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest('POST', `/api/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
    },
  });

  if (alerts.length === 0) {
    return null;
  }

  return (
    <Card className="border border-muted-foreground/20 dark:border-muted-foreground/10 overflow-hidden" data-testid="notifications-panel">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 dark:hover:bg-muted/10 transition-colors"
        data-testid="toggle-notifications-panel"
      >
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            System Notifications
          </h3>
          <Badge variant="outline" className="ml-2">
            {alerts.length}
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="border-t border-muted-foreground/10 dark:border-muted-foreground/5">
          <ScrollArea className="max-h-[400px]">
            <div className="p-4 space-y-2">
              {alerts.map((alert) => {
                const style = getAlertStyle(alert.severity);
                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${style.bg} ${style.border} relative group`}
                    data-testid={`notification-${alert.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className={`text-xs font-medium uppercase ${style.text}`}>
                              {alert.alertType.replace(/_/g, ' ')}
                            </p>
                            <p className="text-sm text-foreground mt-1">
                              {alert.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(alert.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                            onClick={() => acknowledgeMutation.mutate(alert.id)}
                            disabled={acknowledgeMutation.isPending}
                            data-testid={`dismiss-notification-${alert.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </Card>
  );
}
