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

const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return '0';
  return new Intl.NumberFormat('en-US').format(num);
};

// AJ9: All block reasons in display order - aligned with RtbMetricsService
// Phase 8.8.3-I3: Updated to match RtbBlockReason type in rtb-metrics-service.ts
const ALL_BLOCK_REASONS = [
  'KILL_SWITCH',
  'NO_STOP_LOSS',
  'INVALID_STOP_LOSS',
  'POSITION_LIMIT',
  'COOLDOWN',
  'MAX_POSITION',
  'LPCP_LOW_PRICE',
  'LPCP_MIN_NOTIONAL',
  'FX_CONVERSION_FAILED',
  'PORTFOLIO_RISK',
  'INSUFFICIENT_BALANCE',
  'MAX_EXPOSURE',
  'MAX_TOTAL_EXPOSURE',
  'MAX_TRADES',
  'ENGINE_STOPPING',
  'OTHER'
] as const;

// B3: Block reason descriptions - aligned with RtbMetricsService
// Phase 8.8.3-I3: Updated to match RtbBlockReason type
const BLOCK_REASON_DESCRIPTIONS: Record<string, string> = {
  'KILL_SWITCH': 'Daily loss limit exceeded, trading halted',
  'NO_STOP_LOSS': 'Signal rejected - no stop loss defined',
  'INVALID_STOP_LOSS': 'Stop loss price is invalid or misconfigured',
  'POSITION_LIMIT': 'Already holding max positions in this asset',
  'COOLDOWN': 'Asset in cooldown period after recent trade',
  'MAX_POSITION': 'Position size exceeds % of portfolio limit',
  'LPCP_LOW_PRICE': 'Asset price below minimum trading threshold',
  'LPCP_MIN_NOTIONAL': 'Trade value below minimum notional amount',
  'FX_CONVERSION_FAILED': 'Currency conversion failed for this pair',
  'PORTFOLIO_RISK': 'Trade exceeds portfolio risk per trade limit',
  'INSUFFICIENT_BALANCE': 'Not enough balance to execute trade',
  'MAX_EXPOSURE': 'Would exceed maximum portfolio exposure',
  'MAX_TOTAL_EXPOSURE': 'Max Total Portfolio Exposure exceeded',
  'MAX_TRADES': 'Maximum open trades limit reached',
  'ENGINE_STOPPING': 'Engine is shutting down, new trades blocked',
  'OTHER': 'Trade blocked for unspecified reason'
};

// AJ9: All 9 strategies in display order
const ALL_STRATEGIES = [
  'vwap_pullback',
  'abcd_long',
  'sma_trend_ride',
  'breakout',
  'mean_reversion',
  'range_trading',
  'vwap_bounce',
  'liquidity_trap',
  'dhma'
] as const;

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
        {/* J5.1 - RTB Summary Table (J6.2: Removed Total column, kept Last 24h only) */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <BarChart3 className="w-3 h-3" />
            Overall RTB Summary (Last 24h)
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Metric</TableHead>
                <TableHead className="text-xs text-right">Last 24h</TableHead>
                <TableHead className="text-xs text-right" title="Rate calculated using all-time totals">Rate*</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Attempts
                </TableCell>
                <TableCell className="text-xs text-right font-mono">{formatNumber(summary?.last24h?.attempts)}</TableCell>
                <TableCell className="text-xs text-right">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1 text-success">
                  <CheckCircle className="w-3 h-3" />
                  Opened
                </TableCell>
                <TableCell className="text-xs text-right text-success font-mono">{formatNumber(summary?.last24h?.opened)}</TableCell>
                <TableCell className="text-xs text-right text-success">{summary?.openedRate || '0.0'}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1 text-destructive">
                  <XCircle className="w-3 h-3" />
                  Blocked
                </TableCell>
                <TableCell className="text-xs text-right text-destructive font-mono">{formatNumber(summary?.last24h?.blocked)}</TableCell>
                <TableCell className="text-xs text-right text-destructive">{summary?.blockedRate || '0.0'}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-[10px] text-muted-foreground mt-1">*Rate uses all-time totals</p>
        </div>

        {/* J5.2/AJ9/AJ10.2 - Blocked Summary Table: Always show all 14 block reasons */}
        {/* Phase 8.8.3-B3: Reduced table width for aesthetic tightening */}
        <div className="max-w-xl">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Ban className="w-3 h-3" />
            Blocked Breakdown (All Reasons)
          </h4>
          {/* AJ10.2: Total Blocked line */}
          <p className="text-xs font-medium mb-2 text-destructive">
            Total Blocked (Last 24h): {formatNumber(
              ALL_BLOCK_REASONS.reduce((sum, reason) => sum + (blocked?.byReason?.[reason] || 0), 0)
            )}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Block Reason</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALL_BLOCK_REASONS.map((reason) => {
                const count = blocked?.byReason?.[reason] || 0;
                return (
                  <TableRow key={reason}>
                    <TableCell className="text-xs font-medium">{formatBlockReason(reason)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{BLOCK_REASON_DESCRIPTIONS[reason] || '-'}</TableCell>
                    <TableCell className={cn(
                      "text-xs text-right font-mono",
                      count > 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {formatNumber(count)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {/* AJ9: Show all 9 strategies in chips */}
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground mb-1">Blocked by Strategy:</p>
            <div className="flex flex-wrap gap-1">
              {ALL_STRATEGIES.map((strategy) => {
                const count = blocked?.byStrategy?.[strategy] || 0;
                return (
                  <Badge 
                    key={strategy} 
                    variant={count > 0 ? "destructive" : "outline"} 
                    className={cn(
                      "text-[10px] font-mono",
                      count === 0 && "opacity-60"
                    )}
                  >
                    {formatStrategy(strategy)}: {formatNumber(count)}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        {/* AJ9.5/AJ10.2 - Opened by Strategy Table: Always show all 9 strategies */}
        {/* Phase 8.8.3-B3: Reduced table width for aesthetic tightening */}
        <div className="max-w-xs">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Target className="w-3 h-3" />
            Opened by Strategy (Last 24h)
          </h4>
          {/* AJ10.2: Total Opened line */}
          <p className="text-xs font-medium mb-2 text-success">
            Total Opened (Last 24h): {formatNumber(
              ALL_STRATEGIES.reduce((sum, strategy) => sum + (opened?.byStrategy?.[strategy] || 0), 0)
            )}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Strategy</TableHead>
                <TableHead className="text-xs text-right">Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALL_STRATEGIES.map((strategy) => {
                const count = opened?.byStrategy?.[strategy] || 0;
                return (
                  <TableRow key={strategy}>
                    <TableCell className="text-xs">{formatStrategy(strategy)}</TableCell>
                    <TableCell className={cn(
                      "text-xs text-right font-mono",
                      count > 0 ? "text-success" : "text-muted-foreground"
                    )}>
                      {formatNumber(count)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {/* Top Symbols (only show if there are opened trades) */}
          {opened && opened.bySymbol && opened.bySymbol.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground mb-1">Top Opened Symbols:</p>
              <div className="flex flex-wrap gap-1">
                {opened.bySymbol.slice(0, 10).map(({ symbol, count }) => (
                  <Badge key={symbol} variant="secondary" className="text-[10px] font-mono">
                    {symbol}: {formatNumber(count)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

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
