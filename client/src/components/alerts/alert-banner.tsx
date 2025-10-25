import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info, XCircle, Bell, X } from 'lucide-react';
import { SystemAlert, categorizeAlert, shouldShowAlert, getAlertStyle } from '@/lib/alert-utils';
import { NotificationsPanel } from './notifications-panel';
import { ActionableAlertModal } from './actionable-alert-modal';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';

interface AlertsResponse {
  ok: boolean;
  alerts: SystemAlert[];
}

export default function AlertBanner() {
  const [selectedAlert, setSelectedAlert] = useState<SystemAlert | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const { toast } = useToast();
  const { messages: wsMessages } = useWebSocket();

  // Fetch unacknowledged alerts
  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ['/api/alerts'],
    refetchInterval: 30000,
  });

  // Fetch user settings for showSystemAlerts flag
  const { data: settings } = useQuery<{ showSystemAlerts?: boolean }>({
    queryKey: ['/api/settings'],
    staleTime: 60000,
  });

  // Phase 27.F.14.J: Listen for alerts_updated events to sync across sessions with enhanced debug logging
  useEffect(() => {
    const alertUpdates = wsMessages.filter((msg: any) => msg.type === 'alerts_updated');
    if (alertUpdates.length > 0) {
      const latestUpdate = alertUpdates[alertUpdates.length - 1];
      const broadcastTimestamp = latestUpdate.payload?.timestamp || latestUpdate.timestamp;
      const timeSinceBroadcast = broadcastTimestamp 
        ? Date.now() - new Date(broadcastTimestamp).getTime()
        : 0;
      
      console.log('[AlertSync][Frontend] 📨 Received alerts_updated event:', {
        action: latestUpdate.payload?.action,
        alertId: latestUpdate.payload?.alertId,
        count: latestUpdate.payload?.count,
        latencyMs: timeSinceBroadcast,
        timestamp: broadcastTimestamp
      });
      
      // Invalidate alerts query to immediately refresh across all sessions
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      
      console.log('[AlertSync][Frontend] ✅ Received alerts_updated payload → invalidating cache');
    }
  }, [wsMessages]);

  // Mutation to dismiss a single alert
  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest('POST', `/api/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: 'Alert dismissed',
        description: 'The alert has been removed from your dashboard.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to dismiss alert. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Mutation to clear all visible alerts
  const clearAllAlertsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/alerts/acknowledge-all');
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: 'All alerts cleared',
        description: `${data.count || 0} alerts have been dismissed.`,
      });
      setShowClearAllDialog(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to clear alerts. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const rawAlerts = data?.alerts || [];
  const showSystemAlerts = settings?.showSystemAlerts !== false;

  // Filter out feed_health and formula_audit alerts (moved to System Health Summary widget)
  const alerts = rawAlerts.filter(
    (alert) => alert.alertType !== 'feed_health' && alert.alertType !== 'formula_audit'
  );

  // Categorize alerts (now excluding feed/formula health)
  const categorizedAlerts = {
    critical: alerts.filter((a) => categorizeAlert(a) === 'critical'),
    actionable: alerts.filter((a) => categorizeAlert(a) === 'actionable'),
    informational: alerts.filter((a) => categorizeAlert(a) === 'informational'),
  };

  // Filter based on user settings
  const visibleAlerts = alerts.filter((alert) =>
    shouldShowAlert(alert, showSystemAlerts)
  );

  // Critical and actionable alerts to show in banner
  const bannerAlerts = [
    ...categorizedAlerts.critical,
    ...categorizedAlerts.actionable,
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-4" data-testid="alert-system">
      {/* Critical and Actionable Alerts - Always Visible Banner */}
      {bannerAlerts.length > 0 && (
        <Card className="p-4 space-y-3" data-testid="alert-banner">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Alerts
              {categorizedAlerts.critical.length > 0 && (
                <Badge variant="destructive" data-testid="badge-critical-count">
                  {categorizedAlerts.critical.length} Critical
                </Badge>
              )}
              {categorizedAlerts.actionable.length > 0 && (
                <Badge variant="secondary" data-testid="badge-actionable-count">
                  {categorizedAlerts.actionable.length} Action Required
                </Badge>
              )}
            </h3>
            
            {/* Clear All Button */}
            {bannerAlerts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearAllDialog(true)}
                disabled={clearAllAlertsMutation.isPending}
                data-testid="button-clear-all-alerts"
              >
                Clear All
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {bannerAlerts.map((alert) => {
              const style = getAlertStyle(alert.severity);
              const category = categorizeAlert(alert);
              const isActionable = category === 'actionable';

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${style.bg} ${style.border} relative`}
                  data-testid={`alert-${alert.severity}-${alert.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={style.text}>
                      {alert.severity === 'critical' ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : alert.severity === 'warning' ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        <Info className="h-5 w-5" />
                      )}
                    </div>
                    <div
                      className={`flex-1 ${isActionable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                      onClick={() => isActionable && setSelectedAlert(alert)}
                    >
                      <div className="flex items-start justify-between pr-8">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-medium ${style.text}`}>
                              {alert.severity.toUpperCase()} - {alert.alertType.replace(/_/g, ' ')}
                            </p>
                            {isActionable && (
                              <Badge variant="outline" className="text-xs">
                                Click to Act
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-foreground mt-1">
                            {alert.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(alert.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Dismiss button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 opacity-70 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissAlertMutation.mutate(alert.id);
                      }}
                      disabled={dismissAlertMutation.isPending}
                      data-testid={`button-dismiss-alert-${alert.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Informational Notifications - Collapsible Panel */}
      <NotificationsPanel alerts={categorizedAlerts.informational} />

      {/* Actionable Alert Modal */}
      <ActionableAlertModal
        alert={selectedAlert}
        isOpen={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
      />
      
      {/* Clear All Confirmation Dialog */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent data-testid="dialog-clear-all-alerts">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all reviewed alerts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will dismiss all {bannerAlerts.length} visible alert{bannerAlerts.length !== 1 ? 's' : ''} from your dashboard.
              You can still view them in the AI Transparency section for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllAlertsMutation.mutate()}
              disabled={clearAllAlertsMutation.isPending}
              data-testid="button-confirm-clear-all"
            >
              {clearAllAlertsMutation.isPending ? 'Clearing...' : 'Clear All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
