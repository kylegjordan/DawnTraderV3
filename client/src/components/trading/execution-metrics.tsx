import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { CheckCircle, XCircle, Clock, Activity, TrendingUp, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/timezone";

interface ExecutionAttempt {
  id: string;
  mode: 'live' | 'paper';
  symbol: string;
  strategy: string;
  decision: 'BLOCKED' | 'OPENED';
  blockReason: string | null;
  blockDetail: string | null;
  entryPrice: string;
  stopPrice: string | null;
  targetPrice: string | null;
  confidence: string | null;
  createdAt: string;
}

interface ExecutionStats {
  totalAttempts: number;
  openedCount: number;
  blockedCount: number;
  openRate: number;
  blocksByReason: Record<string, number>;
  byStrategy: Record<string, { opened: number; blocked: number }>;
}

export function ExecutionMetricsPanel() {
  const { mode } = useTradingMode();
  
  const { data: stats, isLoading: statsLoading } = useQuery<{ success: boolean; data: ExecutionStats }>({
    queryKey: ['/api/metrics/execution-attempts/stats', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/execution-attempts/stats?mode=${mode}&hours=24`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch execution stats');
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: recentAttempts, isLoading: attemptsLoading } = useQuery<{ success: boolean; data: ExecutionAttempt[] }>({
    queryKey: ['/api/metrics/execution-attempts', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/execution-attempts?mode=${mode}&limit=10`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch execution attempts');
      return response.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: settings } = useQuery<{ timezone?: string; timeFormat?: string }>({ 
    queryKey: ['/api/settings'],
    refetchInterval: 300000,
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  if (statsLoading || attemptsLoading) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Execution Metrics (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const metricsData = stats?.data;
  const attempts = recentAttempts?.data || [];

  const formatBlockReason = (reason: string | null): string => {
    if (!reason) return 'Unknown';
    return reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Execution Metrics (24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold">{metricsData?.totalAttempts || 0}</div>
            <div className="text-xs text-muted-foreground">Total Attempts</div>
          </div>
          <div className="text-center p-3 bg-success/10 rounded-lg">
            <div className="text-2xl font-bold text-success flex items-center justify-center gap-1">
              <CheckCircle className="w-4 h-4" />
              {metricsData?.openedCount || 0}
            </div>
            <div className="text-xs text-muted-foreground">Opened</div>
          </div>
          <div className="text-center p-3 bg-destructive/10 rounded-lg">
            <div className="text-2xl font-bold text-destructive flex items-center justify-center gap-1">
              <XCircle className="w-4 h-4" />
              {metricsData?.blockedCount || 0}
            </div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </div>
          <div className="text-center p-3 bg-primary/10 rounded-lg">
            <div className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
              <TrendingUp className="w-4 h-4" />
              {((metricsData?.openRate || 0) * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Open Rate</div>
          </div>
        </div>

        {metricsData?.blocksByReason && Object.keys(metricsData.blocksByReason).length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Block Reasons</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metricsData.blocksByReason).map(([reason, count]) => (
                <Badge key={reason} variant="outline" className="text-xs">
                  <Ban className="w-3 h-3 mr-1" />
                  {formatBlockReason(reason)}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {attempts.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Recent Attempts</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md text-xs",
                    attempt.decision === 'OPENED' ? "bg-success/5 border border-success/20" : "bg-destructive/5 border border-destructive/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {attempt.decision === 'OPENED' ? (
                      <CheckCircle className="w-3 h-3 text-success" />
                    ) : (
                      <XCircle className="w-3 h-3 text-destructive" />
                    )}
                    <span className="font-medium">{attempt.symbol}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {attempt.strategy.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {attempt.decision === 'BLOCKED' && attempt.blockReason && (
                      <span className="text-destructive">{formatBlockReason(attempt.blockReason)}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {settings && formatTime(attempt.createdAt, {
                        timezone: settings.timezone || 'Asia/Dubai',
                        timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!metricsData?.totalAttempts || metricsData.totalAttempts === 0) && attempts.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No execution attempts in the last 24 hours</p>
            <p className="text-xs">Trades will appear here when the engine processes signals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutionMetricsCompact() {
  const { mode } = useTradingMode();
  
  const { data: stats, isLoading } = useQuery<{ success: boolean; data: ExecutionStats }>({
    queryKey: ['/api/metrics/execution-attempts/stats', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/execution-attempts/stats?mode=${mode}&hours=24`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch execution stats');
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-4 text-xs text-muted-foreground py-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  const metricsData = stats?.data;

  if (!metricsData || metricsData.totalAttempts === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 text-xs py-2 border-t mt-4 pt-3">
      <span className="text-muted-foreground">24h Execution:</span>
      <span className="flex items-center gap-1">
        <Activity className="w-3 h-3" />
        {metricsData.totalAttempts} attempts
      </span>
      <span className="flex items-center gap-1 text-success">
        <CheckCircle className="w-3 h-3" />
        {metricsData.openedCount} opened
      </span>
      <span className="flex items-center gap-1 text-destructive">
        <XCircle className="w-3 h-3" />
        {metricsData.blockedCount} blocked
      </span>
      <span className="flex items-center gap-1 text-primary">
        ({((metricsData.openRate || 0) * 100).toFixed(0)}% open rate)
      </span>
    </div>
  );
}
