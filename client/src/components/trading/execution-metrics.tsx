import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { CheckCircle, XCircle, Activity, TrendingUp, Ban, BarChart3, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RTBSummary {
  totalAttempts: number;
  opened: number;
  blocked: number;
  openedRate: string;
  blockedRate: string;
  last24h: {
    attempts: number;
    opened: number;
    blocked: number;
  };
}

interface RTBBlockedSummary {
  totalBlocked: number;
  blockedLast24h: number;
  byReason: Record<string, number>;
  byStrategy: Record<string, number>;
  topReasons: Array<{ reason: string; count: number }>;
}

interface RTBOpenedSummary {
  totalOpened: number;
  openedLast24h: number;
  byStrategy: Record<string, number>;
  bySymbol: Array<{ symbol: string; count: number }>;
  topStrategies: Array<{ strategy: string; count: number }>;
}

const REFRESH_INTERVAL = 30000;

export function ExecutionMetricsPanel() {
  const { mode } = useTradingMode();
  
  const { data: rtbSummary, isLoading: summaryLoading } = useQuery<{ success: boolean; data: RTBSummary }>({
    queryKey: ['/api/metrics/rtb-summary', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/rtb-summary?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch RTB summary');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  const { data: blockedSummary, isLoading: blockedLoading } = useQuery<{ success: boolean; data: RTBBlockedSummary }>({
    queryKey: ['/api/metrics/rtb-blocked-summary', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/rtb-blocked-summary?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch blocked summary');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  const { data: openedSummary, isLoading: openedLoading } = useQuery<{ success: boolean; data: RTBOpenedSummary }>({
    queryKey: ['/api/metrics/rtb-opened-summary', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/rtb-opened-summary?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch opened summary');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  const isLoading = summaryLoading || blockedLoading || openedLoading;

  const formatBlockReason = (reason: string): string => {
    return reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatStrategy = (strategy: string): string => {
    return strategy.replace(/_/g, ' ');
  };

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            RTB Execution Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = rtbSummary?.data;
  const blocked = blockedSummary?.data;
  const opened = openedSummary?.data;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4" />
          RTB Execution Metrics
          <Badge variant="secondary" className="text-[10px] ml-auto">
            Auto-refresh: 30s
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* J5.1 - RTB Summary Table */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <BarChart3 className="w-3 h-3" />
            Overall RTB Summary
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Metric</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Last 24h</TableHead>
                <TableHead className="text-xs text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Attempts
                </TableCell>
                <TableCell className="text-xs text-right">{summary?.totalAttempts || 0}</TableCell>
                <TableCell className="text-xs text-right">{summary?.last24h?.attempts || 0}</TableCell>
                <TableCell className="text-xs text-right">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1 text-success">
                  <CheckCircle className="w-3 h-3" />
                  Opened
                </TableCell>
                <TableCell className="text-xs text-right text-success">{summary?.opened || 0}</TableCell>
                <TableCell className="text-xs text-right text-success">{summary?.last24h?.opened || 0}</TableCell>
                <TableCell className="text-xs text-right text-success">{summary?.openedRate || '0.0'}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1 text-destructive">
                  <XCircle className="w-3 h-3" />
                  Blocked
                </TableCell>
                <TableCell className="text-xs text-right text-destructive">{summary?.blocked || 0}</TableCell>
                <TableCell className="text-xs text-right text-destructive">{summary?.last24h?.blocked || 0}</TableCell>
                <TableCell className="text-xs text-right text-destructive">{summary?.blockedRate || '0.0'}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* J5.2 - Blocked Summary Table */}
        {blocked && blocked.totalBlocked > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Ban className="w-3 h-3" />
              Blocked Breakdown
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Block Reason</TableHead>
                  <TableHead className="text-xs text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocked.topReasons.map(({ reason, count }) => (
                  <TableRow key={reason}>
                    <TableCell className="text-xs">{formatBlockReason(reason)}</TableCell>
                    <TableCell className="text-xs text-right text-destructive">{count}</TableCell>
                  </TableRow>
                ))}
                {blocked.topReasons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs text-center text-muted-foreground">
                      No blocked attempts recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {Object.keys(blocked.byStrategy).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(blocked.byStrategy).slice(0, 5).map(([strategy, count]) => (
                  <Badge key={strategy} variant="outline" className="text-[10px]">
                    {formatStrategy(strategy)}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* J5.3 - Opened Summary Table */}
        {opened && opened.totalOpened > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Target className="w-3 h-3" />
              Opened Breakdown
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Strategy</TableHead>
                  <TableHead className="text-xs text-right">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opened.topStrategies.map(({ strategy, count }) => (
                  <TableRow key={strategy}>
                    <TableCell className="text-xs">{formatStrategy(strategy)}</TableCell>
                    <TableCell className="text-xs text-right text-success">{count}</TableCell>
                  </TableRow>
                ))}
                {opened.topStrategies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs text-center text-muted-foreground">
                      No opened trades recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {opened.bySymbol.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">Top Symbols:</span>
                {opened.bySymbol.slice(0, 5).map(({ symbol, count }) => (
                  <Badge key={symbol} variant="secondary" className="text-[10px]">
                    {symbol}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {(!summary?.totalAttempts || summary.totalAttempts === 0) && (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No execution attempts recorded</p>
            <p className="text-xs">Trades will appear here when the engine processes signals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutionMetricsCompact() {
  const { mode } = useTradingMode();
  
  const { data: rtbSummary, isLoading } = useQuery<{ success: boolean; data: RTBSummary }>({
    queryKey: ['/api/metrics/rtb-summary', mode],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/rtb-summary?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch RTB summary');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
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

  const summary = rtbSummary?.data;

  if (!summary || summary.totalAttempts === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 text-xs py-2 border-t mt-4 pt-3">
      <span className="text-muted-foreground">RTB Execution:</span>
      <span className="flex items-center gap-1">
        <Activity className="w-3 h-3" />
        {summary.totalAttempts} attempts
      </span>
      <span className="flex items-center gap-1 text-success">
        <CheckCircle className="w-3 h-3" />
        {summary.opened} opened
      </span>
      <span className="flex items-center gap-1 text-destructive">
        <XCircle className="w-3 h-3" />
        {summary.blocked} blocked
      </span>
      <span className="flex items-center gap-1 text-primary">
        ({summary.openedRate}% open rate)
      </span>
    </div>
  );
}
