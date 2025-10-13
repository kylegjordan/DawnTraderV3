import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Info, XCircle, Bell, BellOff } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

type AlertSeverity = "critical" | "warning" | "info";

interface SystemAlert {
  id: string;
  userId: string;
  mode: "live" | "paper";
  alertType: string;
  severity: AlertSeverity;
  message: string;
  metadata?: any;
  acknowledged: boolean;
  timestamp: string;
}

interface AlertsResponse {
  ok: boolean;
  alerts: SystemAlert[];
}

export default function AlertBanner() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const mode = user?.tradingMode || "paper";

  // Fetch unacknowledged alerts
  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ["/api/alerts"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const alerts = data?.alerts || [];

  // Walter verbal notification for critical alerts
  useEffect(() => {
    const criticalAlerts = alerts.filter(a => a.severity === "critical");
    if (criticalAlerts.length > 0 && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(
        "⚠️ Critical system condition detected — check alerts panel."
      );
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, [alerts.length]);

  // Acknowledge all alerts
  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/alerts/acknowledge-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  // Mute low severity alerts
  const muteLowSeverityMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/alerts/mute-low-severity");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  // Hide banner if no alerts
  if (isLoading || alerts.length === 0) {
    return null;
  }

  // Sort alerts: newest first
  const sortedAlerts = [...alerts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Severity styling
  const getSeverityStyle = (severity: AlertSeverity) => {
    switch (severity) {
      case "critical":
        return {
          bg: "bg-destructive/10 dark:bg-destructive/20",
          border: "border-destructive",
          text: "text-destructive",
          icon: <AlertTriangle className="h-5 w-5" />,
        };
      case "warning":
        return {
          bg: "bg-amber-50 dark:bg-amber-950/30",
          border: "border-amber-500",
          text: "text-amber-700 dark:text-amber-400",
          icon: <XCircle className="h-5 w-5" />,
        };
      case "info":
        return {
          bg: "bg-muted dark:bg-muted/50",
          border: "border-muted-foreground/20",
          text: "text-muted-foreground",
          icon: <Info className="h-5 w-5" />,
        };
    }
  };

  return (
    <Card className="p-4 space-y-3" data-testid="alert-banner">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Bell className="h-5 w-5" />
          System Alerts ({alerts.length})
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => muteLowSeverityMutation.mutate()}
            disabled={muteLowSeverityMutation.isPending}
            data-testid="button-mute-info"
          >
            <BellOff className="h-4 w-4 mr-1" />
            Mute Info
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => acknowledgeAllMutation.mutate()}
            disabled={acknowledgeAllMutation.isPending}
            data-testid="button-acknowledge-all"
          >
            Acknowledge All
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {sortedAlerts.map((alert) => {
          const style = getSeverityStyle(alert.severity);
          return (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${style.bg} ${style.border}`}
              data-testid={`alert-${alert.severity}-${alert.id}`}
            >
              <div className="flex items-start gap-3">
                <div className={style.text}>{style.icon}</div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`font-medium ${style.text}`}>
                        {alert.severity.toUpperCase()} - {alert.alertType}
                      </p>
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
  );
}
