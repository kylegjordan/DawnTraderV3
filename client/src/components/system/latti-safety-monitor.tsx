import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, AlertTriangle, Clock, Activity } from "lucide-react";

interface SafetySummary {
  totalAdjustments24h: number;
  violationsCount: number;
  lastViolationTime: Date | null;
  status: 'safe' | 'warning' | 'limit_reached';
}

interface LATTISafetySummaryResponse {
  paper: SafetySummary;
  live: SafetySummary;
}

export function LATTISafetyMonitor() {
  const { data: safetySummary, isLoading } = useQuery<LATTISafetySummaryResponse>({
    queryKey: ['/api/heuristic-trader/safety-summary'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const getSafetyIcon = (status: string) => {
    switch (status) {
      case 'safe':
        return <Shield className="h-5 w-5 text-green-500" data-testid="icon-safety-safe" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" data-testid="icon-safety-warning" />;
      case 'limit_reached':
        return <AlertTriangle className="h-5 w-5 text-red-500" data-testid="icon-safety-limit" />;
      default:
        return <Shield className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSafetyBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return <Badge className="bg-green-500 hover:bg-green-600" data-testid="badge-safety-safe">🟢 Safe</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-safety-warning">🟡 Warning</Badge>;
      case 'limit_reached':
        return <Badge className="bg-red-500 hover:bg-red-600" data-testid="badge-safety-limit">🔴 Limit Reached</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const formatLastViolation = (timestamp: Date | null) => {
    if (!timestamp) return 'None';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <Card data-testid="card-latti-safety-monitor">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            LATTI Safety Audit
          </CardTitle>
          <CardDescription>
            Parameter adjustment safety monitoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-latti-safety-monitor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          LATTI Safety Audit
        </CardTitle>
        <CardDescription>
          Phase 27.F.14.B Task 6 - Parameter adjustment safety monitoring
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Paper Mode Safety */}
        <div className="space-y-3" data-testid="section-paper-safety">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {getSafetyIcon(safetySummary?.paper.status || 'safe')}
              Paper Mode
            </h4>
            {getSafetyBadge(safetySummary?.paper.status || 'safe')}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                24h Adjustments
              </div>
              <div className="text-2xl font-bold" data-testid="text-paper-adjustments">
                {safetySummary?.paper.totalAdjustments24h || 0}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Violations
              </div>
              <div className="text-2xl font-bold text-red-500" data-testid="text-paper-violations">
                {safetySummary?.paper.violationsCount || 0}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Last Violation
              </div>
              <div className="text-sm font-medium" data-testid="text-paper-last-violation">
                {formatLastViolation(safetySummary?.paper.lastViolationTime || null)}
              </div>
            </div>
          </div>
        </div>

        {/* Live Mode Safety */}
        <div className="space-y-3" data-testid="section-live-safety">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              {getSafetyIcon(safetySummary?.live.status || 'safe')}
              Live Mode
            </h4>
            {getSafetyBadge(safetySummary?.live.status || 'safe')}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                24h Adjustments
              </div>
              <div className="text-2xl font-bold" data-testid="text-live-adjustments">
                {safetySummary?.live.totalAdjustments24h || 0}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Violations
              </div>
              <div className="text-2xl font-bold text-red-500" data-testid="text-live-violations">
                {safetySummary?.live.violationsCount || 0}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Last Violation
              </div>
              <div className="text-sm font-medium" data-testid="text-live-last-violation">
                {formatLastViolation(safetySummary?.live.lastViolationTime || null)}
              </div>
            </div>
          </div>
        </div>

        {/* Safety Rules */}
        <div className="pt-3 border-t space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">Safety Rules</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Max parameter change: ±30% from previous value</li>
            <li>• Max adjustments per hour: 3 per parameter</li>
            <li>• Violations logged to trading_audit_log</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
