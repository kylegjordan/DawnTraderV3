import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info, XCircle, Bell } from 'lucide-react';
import { SystemAlert, categorizeAlert, shouldShowAlert, getAlertStyle } from '@/lib/alert-utils';
import { NotificationsPanel } from './notifications-panel';
import { ActionableAlertModal } from './actionable-alert-modal';

interface AlertsResponse {
  ok: boolean;
  alerts: SystemAlert[];
}

export default function AlertBanner() {
  const [selectedAlert, setSelectedAlert] = useState<SystemAlert | null>(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

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

  const alerts = data?.alerts || [];
  const showSystemAlerts = settings?.showSystemAlerts !== false;

  // Categorize alerts
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
                <Badge variant="destructive">
                  {categorizedAlerts.critical.length} Critical
                </Badge>
              )}
              {categorizedAlerts.actionable.length > 0 && (
                <Badge variant="secondary">
                  {categorizedAlerts.actionable.length} Action Required
                </Badge>
              )}
            </h3>
          </div>

          <div className="space-y-2">
            {bannerAlerts.map((alert) => {
              const style = getAlertStyle(alert.severity);
              const category = categorizeAlert(alert);
              const isActionable = category === 'actionable';

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${style.bg} ${style.border} ${
                    isActionable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                  }`}
                  onClick={() => isActionable && setSelectedAlert(alert)}
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
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
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
    </div>
  );
}
