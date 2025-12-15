import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Clock, Timer, TrendingUp, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QueuedSignal {
  id: string;
  signalId: string;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number | null;
  quantity: number | null;
  notional: number | null;
  confidence: number;
  riskScore: number;
  expectedReturn: number;
  cwqi: number;
  status: string;
  blockReason: string;
  queuedAt: string;
  expiresAt: string;
  queueDurationMs: number;
}

interface RTBQueueResponse {
  ok: boolean;
  phase: string;
  mode: string;
  count: number;
  signals: QueuedSignal[];
  timestamp: string;
}

interface RTBQueueStatsResponse {
  ok: boolean;
  phase: string;
  mode: string;
  stats: {
    mode: string;
    totalQueued: number;
    avgCWQI: number;
    oldestSignalAge: number;
    byStrategy: Record<string, number>;
    byBlockReason: Record<string, number>;
  };
}

const REFRESH_INTERVAL = 10000;

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  return `${minutes}m ${remainingSecs}s`;
};

const formatPrice = (price: number): string => {
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 100) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
};

const formatStrategy = (strategy: string): string => {
  const strategyMap: Record<string, string> = {
    'vwap_pullback': 'VWAP Pullback',
    'abcd_long': 'ABCD Long',
    'sma_trend_ride': 'SMA Trend',
    'breakout': 'Breakout',
    'mean_reversion': 'Mean Reversion',
    'range_trading': 'Range Trading',
    'vwap_bounce': 'VWAP Bounce',
    'liquidity_trap': 'Liquidity Trap',
    'dhma': 'DHMA'
  };
  return strategyMap[strategy] || strategy;
};

const formatBlockReason = (reason: string): string => {
  const reasonMap: Record<string, string> = {
    'MAX_TRADES': 'Max Trades',
    'MAX_TOTAL_EXPOSURE': 'Max Exposure',
    'POSITION_LIMIT': 'Position Limit',
    'SLOT_CONFLICT': 'Slot Conflict'
  };
  return reasonMap[reason] || reason.replace(/_/g, ' ');
};

const getCWQIColor = (cwqi: number): string => {
  if (cwqi >= 0.7) return 'text-success';
  if (cwqi >= 0.5) return 'text-primary';
  return 'text-muted-foreground';
};

export function RTBQueuePanel() {
  const { mode } = useTradingMode();
  
  const { data: queueData, isLoading, refetch } = useQuery<RTBQueueResponse>({
    queryKey: ['/api/diagnostics/rtb-queue/signals', mode],
    queryFn: async () => {
      const response = await fetch(`/api/diagnostics/rtb-queue/signals?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch RTB queue');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  const { data: statsData } = useQuery<RTBQueueStatsResponse>({
    queryKey: ['/api/diagnostics/rtb-queue/stats', mode],
    queryFn: async () => {
      const response = await fetch(`/api/diagnostics/rtb-queue/stats?mode=${mode}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch RTB queue stats');
      return response.json();
    },
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL / 2,
  });

  const handleClearQueue = async () => {
    try {
      const response = await fetch(`/api/diagnostics/rtb-queue/clear?mode=${mode}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  };

  const handleForceRefresh = async () => {
    try {
      await fetch(`/api/diagnostics/rtb-queue/force-refresh?mode=${mode}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      refetch();
    } catch (error) {
      console.error('Failed to force refresh:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            RTB Queue (Capacity-Blocked)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const signals = queueData?.signals || [];
  const stats = statsData?.stats;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            RTB Queue (Capacity-Blocked)
            <Badge variant="secondary" className="text-[10px]">
              {signals.length} queued
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleForceRefresh}
                    className="h-7 w-7 p-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Force refresh queue</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {signals.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleClearQueue}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear all queued signals</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats && (
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span>Avg CWQI: <span className={cn("font-mono font-medium", getCWQIColor(stats.avgCWQI))}>{stats.avgCWQI.toFixed(3)}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3 text-muted-foreground" />
              <span>Oldest: <span className="font-mono">{formatDuration(stats.oldestSignalAge * 1000)}</span></span>
            </div>
            {Object.keys(stats.byBlockReason).length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <AlertCircle className="w-3 h-3 text-warning" />
                <span>Blocked by:</span>
                {Object.entries(stats.byBlockReason).map(([reason, count]) => (
                  <Badge key={reason} variant="outline" className="text-[10px] font-mono">
                    {formatBlockReason(reason)}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {signals.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Symbol</TableHead>
                  <TableHead className="text-xs">Strategy</TableHead>
                  <TableHead className="text-xs text-right">CWQI</TableHead>
                  <TableHead className="text-xs text-right">Confidence</TableHead>
                  <TableHead className="text-xs text-right">Entry</TableHead>
                  <TableHead className="text-xs text-right">Target</TableHead>
                  <TableHead className="text-xs">Block Reason</TableHead>
                  <TableHead className="text-xs text-right">Queue Time</TableHead>
                  <TableHead className="text-xs text-right">Expires In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((signal) => {
                  const expiresIn = new Date(signal.expiresAt).getTime() - Date.now();
                  const isNearExpiry = expiresIn < 60000;
                  
                  return (
                    <TableRow key={signal.id}>
                      <TableCell className="text-xs font-semibold">{signal.symbol}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {formatStrategy(signal.strategy)}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-xs text-right font-mono font-semibold", getCWQIColor(signal.cwqi))}>
                        {signal.cwqi.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {(signal.confidence * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {formatPrice(signal.entryPrice)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono text-success">
                        {signal.targetPrice ? formatPrice(signal.targetPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {formatBlockReason(signal.blockReason)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {formatDuration(signal.queueDurationMs)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-xs text-right font-mono",
                        isNearExpiry ? "text-warning" : ""
                      )}>
                        {expiresIn > 0 ? formatDuration(expiresIn) : 'Expired'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No signals in queue</p>
            <p className="text-xs">High-quality signals blocked by capacity constraints will appear here</p>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Signals are ranked by CWQI (Confidence-Weighted Quality Index). Top signal is promoted when capacity frees up. TTL: 3 minutes.
        </p>
      </CardContent>
    </Card>
  );
}
