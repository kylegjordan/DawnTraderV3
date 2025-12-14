import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { CheckCircle, XCircle, Activity, TrendingUp, Ban, BarChart3, Target, AlertTriangle, GitBranch, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Phase 8.8.3-I4: RTB Metrics Response from /api/diagnostics/rtb-metrics
 * This is now the SINGLE SOURCE OF TRUTH for all RTB metrics
 */
interface RtbMetricsResponse {
  ok: boolean;
  phase: string;
  description: string;
  timestamp: string;
  sessionStart: string;
  totals: {
    attempts: number;
    opened: number;
    blocked: number;
  };
  byBlockReason: Record<string, number>;
  byStrategy: Record<string, { attempts: number; opened: number; blocked: number }>;
  bySymbol: number | Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }>;
  invariantCheck: {
    valid: boolean;
    message: string;
  };
}

interface SlalMetricsResponse {
  ok: boolean;
  phase: string;
  timestamp: string;
  metrics: {
    mode: 'live' | 'paper';
    since: string;
    signalsGenerated: number;
    signalsSized: number;
    signalsValidated: number;
    signalsExecuted: number;
    signalsCompleted: number;
    signalsRejected: number;
    rejectionsByReason: Record<string, number>;
    rejectionsByStage: Record<string, number>;
    avgGenerationToCompletionMs: number;
    successRate: number;
    strategyBreakdown: Record<string, {
      generated: number;
      completed: number;
      rejected: number;
      successRate: number;
    }>;
  };
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

/**
 * Phase 8.8.3-I4: ExecutionMetricsPanel
 * Now uses /api/diagnostics/rtb-metrics as single source of truth
 * Phase 8.8.4-A: Added SLAL (Signal Lifecycle Audit Layer) metrics tab
 */
export function ExecutionMetricsPanel() {
  const { mode } = useTradingMode();
  
  /**
   * Phase 8.8.3-I4: Single query to the canonical RTB metrics endpoint
   * This replaces the previous three separate queries
   */
  const { data: rtbMetrics, isLoading } = useQuery<RtbMetricsResponse>({
    queryKey: ['/api/diagnostics/rtb-metrics', mode],
    queryFn: async () => {
      const response = await fetch(`/api/diagnostics/rtb-metrics`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch RTB metrics');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  /**
   * Phase 8.8.4-A: SLAL metrics query for signal lifecycle tracking
   */
  const { data: slalMetrics, isLoading: slalLoading } = useQuery<SlalMetricsResponse>({
    queryKey: ['/api/diagnostics/signal-lifecycle', mode],
    queryFn: async () => {
      const response = await fetch(`/api/diagnostics/signal-lifecycle?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch SLAL metrics');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  /**
   * Phase 8.8.3-I4 A4: Invariant checking - log mismatch to console
   */
  useEffect(() => {
    if (!rtbMetrics || !rtbMetrics.ok) return;

    const { totals, byBlockReason, invariantCheck } = rtbMetrics;
    const sumByReason = Object.values(byBlockReason || {}).reduce((a, b) => a + b, 0);

    // Check invariant: attemptsTotal === openedTotal + blockedTotal
    const expectedTotal = totals.opened + totals.blocked;
    const invariantValid = totals.attempts === expectedTotal;

    // Check breakdown: blockedTotal === sum(byReason)
    const breakdownValid = totals.blocked === sumByReason;

    if (!invariantValid || !breakdownValid) {
      console.warn('[8.8.3-I4][RTB_METRICS_MISMATCH]', {
        attemptsTotal: totals.attempts,
        openedTotal: totals.opened,
        blockedTotal: totals.blocked,
        sumByReason,
        invariantValid,
        breakdownValid,
        serverInvariantCheck: invariantCheck,
      });
    }
  }, [rtbMetrics]);

  const formatBlockReason = (reason: string): string => {
    return reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatStrategy = (strategy: string): string => {
    return strategy.replace(/_/g, ' ');
  };

  // Compute derived values from the single source of truth
  const totals = rtbMetrics?.totals || { attempts: 0, opened: 0, blocked: 0 };
  const byBlockReason = rtbMetrics?.byBlockReason || {};
  const byStrategy = rtbMetrics?.byStrategy || {};
  
  // Compute rates
  const openedRate = totals.attempts > 0 ? ((totals.opened / totals.attempts) * 100).toFixed(1) : '0.0';
  const blockedRate = totals.attempts > 0 ? ((totals.blocked / totals.attempts) * 100).toFixed(1) : '0.0';
  
  // Phase 8.8.3-I4: Build block reasons from keys of byBlockReason instead of hardcoded list
  // We still use ALL_BLOCK_REASONS for ordering, but show any reason that has count > 0
  const blockReasonRows: Array<{ reason: string; count: number; description: string }> = 
    ALL_BLOCK_REASONS.map(reason => ({
      reason,
      count: byBlockReason[reason] || 0,
      description: BLOCK_REASON_DESCRIPTIONS[reason] || '-'
    }));
  
  // Add any unknown reasons from byBlockReason that aren't in ALL_BLOCK_REASONS
  Object.keys(byBlockReason).forEach(reasonKey => {
    const isKnown = (ALL_BLOCK_REASONS as readonly string[]).includes(reasonKey);
    if (!isKnown) {
      blockReasonRows.push({
        reason: reasonKey,
        count: byBlockReason[reasonKey],
        description: BLOCK_REASON_DESCRIPTIONS[reasonKey] || 'Unknown block reason'
      });
    }
  });

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

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4" />
          RTB Execution Metrics
          <Badge variant="secondary" className="text-[10px] ml-auto">
            Auto-refresh: 30s
          </Badge>
          {/* Phase 8.8.3-I4: Show invariant status indicator */}
          {rtbMetrics?.invariantCheck && !rtbMetrics.invariantCheck.valid && (
            <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Metrics Mismatch
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phase 8.8.3-I4: RTB Summary Table - Now from single source of truth */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <BarChart3 className="w-3 h-3" />
            RTB Summary (Session)
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Metric</TableHead>
                <TableHead className="text-xs text-right">Count</TableHead>
                <TableHead className="text-xs text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Attempts
                </TableCell>
                <TableCell className="text-xs text-right font-mono">{formatNumber(totals.attempts)}</TableCell>
                <TableCell className="text-xs text-right">-</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1 text-success">
                  <CheckCircle className="w-3 h-3" />
                  Opened
                </TableCell>
                <TableCell className="text-xs text-right text-success font-mono">{formatNumber(totals.opened)}</TableCell>
                <TableCell className="text-xs text-right text-success">{openedRate}%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs font-medium flex items-center gap-1 text-destructive">
                  <XCircle className="w-3 h-3" />
                  Blocked
                </TableCell>
                <TableCell className="text-xs text-right text-destructive font-mono">{formatNumber(totals.blocked)}</TableCell>
                <TableCell className="text-xs text-right text-destructive">{blockedRate}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {rtbMetrics?.sessionStart && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Session started: {new Date(rtbMetrics.sessionStart).toLocaleString()}
            </p>
          )}
        </div>

        {/* Phase 8.8.3-I4: Blocked Breakdown - From byBlockReason */}
        <div className="max-w-xl">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Ban className="w-3 h-3" />
            Blocked Breakdown (All Reasons)
          </h4>
          {/* Total Blocked from totals.blocked - must match sum of byBlockReason */}
          <p className="text-xs font-medium mb-2 text-destructive">
            Total Blocked: {formatNumber(totals.blocked)}
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
              {blockReasonRows.map(({ reason, count, description }) => (
                <TableRow key={reason}>
                  <TableCell className="text-xs font-medium">{formatBlockReason(reason)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{description}</TableCell>
                  <TableCell className={cn(
                    "text-xs text-right font-mono",
                    count > 0 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {formatNumber(count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Strategy breakdown - from byStrategy */}
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground mb-1">Blocked by Strategy:</p>
            <div className="flex flex-wrap gap-1">
              {ALL_STRATEGIES.map((strategy) => {
                const strategyData = byStrategy[strategy];
                const count = strategyData?.blocked || 0;
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

        {/* Phase 8.8.3-I4: Opened by Strategy - From byStrategy */}
        <div className="max-w-xs">
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Target className="w-3 h-3" />
            Opened by Strategy (Session)
          </h4>
          <p className="text-xs font-medium mb-2 text-success">
            Total Opened: {formatNumber(totals.opened)}
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
                const strategyData = byStrategy[strategy];
                const count = strategyData?.opened || 0;
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
        </div>

        {totals.attempts === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No execution attempts recorded</p>
            <p className="text-xs">Trades will appear here when the engine processes signals</p>
          </div>
        )}

        {/* Phase 8.8.4-A: Signal Lifecycle Audit Layer (SLAL) Metrics */}
        <div className="border-t pt-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <GitBranch className="w-3 h-3" />
            Signal Lifecycle Audit (SLAL)
            {slalLoading && <Skeleton className="h-3 w-16 inline-block" />}
          </h4>
          
          {slalMetrics?.metrics && (
            <div className="space-y-4">
              {/* SLAL Pipeline Summary - Phase 8.8.4-B: Added QUEUED and PROMOTED stages */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-2">Signal Pipeline Flow</p>
                <div className="flex items-center gap-1 flex-wrap text-xs">
                  <Badge variant="outline" className="font-mono">
                    Generated: {formatNumber(slalMetrics.metrics.signalsGenerated)}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="font-mono">
                    Sized: {formatNumber(slalMetrics.metrics.signalsSized)}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="font-mono">
                    Validated: {formatNumber(slalMetrics.metrics.signalsValidated)}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="font-mono">
                    Executed: {formatNumber(slalMetrics.metrics.signalsExecuted)}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="secondary" className="font-mono text-success">
                    Completed: {formatNumber(slalMetrics.metrics.signalsCompleted)}
                  </Badge>
                </div>
                {/* Phase 8.8.4-B: QUEUED/PROMOTED branch for capacity-blocked signals */}
                {(slalMetrics.metrics.rejectionsByStage?.QUEUED > 0 || slalMetrics.metrics.rejectionsByStage?.PROMOTED > 0) && (
                  <div className="flex items-center gap-1 flex-wrap text-xs mt-2 ml-4">
                    <span className="text-muted-foreground text-[10px]">↳ Capacity Queue:</span>
                    <Badge variant="outline" className="font-mono border-warning text-warning">
                      Queued: {formatNumber(slalMetrics.metrics.rejectionsByStage?.QUEUED || 0)}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="outline" className="font-mono border-success text-success">
                      Promoted: {formatNumber(slalMetrics.metrics.rejectionsByStage?.PROMOTED || 0)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* SLAL Success Rate & Timing */}
              <div className="flex gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3 h-3 text-success" />
                  <span className="text-xs">
                    Success Rate: <span className="font-mono font-medium">{slalMetrics.metrics.successRate.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Timer className="w-3 h-3 text-primary" />
                  <span className="text-xs">
                    Avg Duration: <span className="font-mono font-medium">{slalMetrics.metrics.avgGenerationToCompletionMs.toFixed(0)}ms</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-3 h-3 text-destructive" />
                  <span className="text-xs">
                    Rejected: <span className="font-mono font-medium text-destructive">{formatNumber(slalMetrics.metrics.signalsRejected)}</span>
                  </span>
                </div>
              </div>

              {/* SLAL Rejections by Reason */}
              {slalMetrics.metrics.signalsRejected > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Rejections by Reason</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(slalMetrics.metrics.rejectionsByReason)
                      .filter(([, count]) => count > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([reason, count]) => (
                        <Badge 
                          key={reason} 
                          variant="destructive" 
                          className="text-[10px] font-mono"
                        >
                          {reason.replace(/_/g, ' ')}: {count}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {/* SLAL Rejections by Stage */}
              {slalMetrics.metrics.signalsRejected > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Rejections by Stage</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(slalMetrics.metrics.rejectionsByStage)
                      .filter(([, count]) => count > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([stage, count]) => (
                        <Badge 
                          key={stage} 
                          variant="outline" 
                          className="text-[10px] font-mono border-destructive text-destructive"
                        >
                          {stage}: {count}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              {/* SLAL Strategy Breakdown */}
              {Object.keys(slalMetrics.metrics.strategyBreakdown).length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Strategy Performance</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Strategy</TableHead>
                        <TableHead className="text-[10px] text-right">Gen</TableHead>
                        <TableHead className="text-[10px] text-right">Done</TableHead>
                        <TableHead className="text-[10px] text-right">Rej</TableHead>
                        <TableHead className="text-[10px] text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(slalMetrics.metrics.strategyBreakdown)
                        .sort((a, b) => b[1].generated - a[1].generated)
                        .map(([strategy, stats]) => (
                          <TableRow key={strategy}>
                            <TableCell className="text-[10px]">{formatStrategy(strategy)}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono">{stats.generated}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono text-success">{stats.completed}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono text-destructive">{stats.rejected}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono">{stats.successRate.toFixed(0)}%</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {slalMetrics.metrics.signalsGenerated === 0 && (
                <div className="text-center py-3 text-muted-foreground">
                  <GitBranch className="w-6 h-6 mx-auto mb-1 opacity-50" />
                  <p className="text-[10px]">No signals generated yet this session</p>
                </div>
              )}

              {slalMetrics.metrics.since && (
                <p className="text-[10px] text-muted-foreground">
                  Session started: {new Date(slalMetrics.metrics.since).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Phase 8.8.3-I4: ExecutionMetricsCompact
 * Now uses /api/diagnostics/rtb-metrics as single source of truth
 */
export function ExecutionMetricsCompact() {
  const { mode } = useTradingMode();
  
  const { data: rtbMetrics, isLoading } = useQuery<RtbMetricsResponse>({
    queryKey: ['/api/diagnostics/rtb-metrics', mode],
    queryFn: async () => {
      const response = await fetch(`/api/diagnostics/rtb-metrics`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch RTB metrics');
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

  const totals = rtbMetrics?.totals || { attempts: 0, opened: 0, blocked: 0 };
  const openedRate = totals.attempts > 0 ? ((totals.opened / totals.attempts) * 100).toFixed(1) : '0.0';

  if (totals.attempts === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 text-xs py-2 border-t mt-4 pt-3">
      <span className="text-muted-foreground">RTB Execution:</span>
      <span className="flex items-center gap-1">
        <Activity className="w-3 h-3" />
        {totals.attempts} attempts
      </span>
      <span className="flex items-center gap-1 text-success">
        <CheckCircle className="w-3 h-3" />
        {totals.opened} opened
      </span>
      <span className="flex items-center gap-1 text-destructive">
        <XCircle className="w-3 h-3" />
        {totals.blocked} blocked
      </span>
      <span className="flex items-center gap-1 text-primary">
        ({openedRate}% open rate)
      </span>
    </div>
  );
}
