import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useState } from "react";

interface TradingActivityData {
  numberOfTrades: number;
  profitableTrades: number;
  totalProfits: number;
  avgReturnPercent: number;
  losingTrades: number;
  totalLosses: number;
  avgLossPercent: number;
  totalFeesPaid: number;
  volumeTraded?: number;
}

interface ActiveTrade {
  id: string;
  status: string;
}

const PERIOD_OPTIONS = [
  { value: '1d', label: 'Day' },
  { value: '1w', label: 'Week' },
  { value: '1m', label: 'Month' },
  { value: '60d', label: '60 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: 'Year' },
];

export default function TradingActivityWidget() {
  const { mode, isPaper } = useTradingMode();
  const [period, setPeriod] = useState('1d');
  
  const { data: activity, isLoading: activityLoading } = useQuery<TradingActivityData>({
    queryKey: ['/api/trading/activity', mode, period],
    queryFn: () => fetch(`/api/trading/activity?mode=${mode}&period=${period}`).then(r => r.json()),
  });
  
  const activeTradesEndpoint = isPaper ? '/api/paper/trades/active' : '/api/trades/active';
  const { data: activeTrades, isLoading: activeLoading } = useQuery<ActiveTrade[]>({
    queryKey: [activeTradesEndpoint, mode],
  });

  const isLoading = activityLoading || activeLoading;

  if (isLoading) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-trading-activity">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Trading Activity</span>
            <Activity className="w-5 h-5 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '$0';
    return `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const data = activity || {
    numberOfTrades: 0,
    profitableTrades: 0,
    totalProfits: 0,
    avgReturnPercent: 0,
    losingTrades: 0,
    totalLosses: 0,
    avgLossPercent: 0,
    totalFeesPaid: 0,
    volumeTraded: 0,
  };

  const activeTradesCount = activeTrades?.length || 0;
  const closedTrades = data.numberOfTrades;
  const winRate = closedTrades > 0 ? (data.profitableTrades / closedTrades) * 100 : 0;
  const volumeTraded = data.volumeTraded || (data.totalProfits - data.totalLosses + data.totalFeesPaid);

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-trading-activity">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Trading Activity</span>
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
          </div>
          <Activity className="w-5 h-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full" data-testid="period-selector-activity">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{period === '1d' ? 'Trades Today:' : 'Total Trades:'}</span>
            <span className="text-sm font-bold font-mono text-foreground" data-testid="activity-trades-today">
              {closedTrades}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Active Trades:</span>
            <span className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400" data-testid="activity-active-trades">
              {activeTradesCount}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Closed Trades:</span>
            <span className="text-sm font-bold font-mono text-foreground" data-testid="activity-closed-trades">
              {closedTrades}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Win Rate:</span>
            <span className={cn(
              "text-sm font-bold font-mono",
              winRate >= 50 ? "text-success" : "text-muted-foreground"
            )} data-testid="activity-win-rate">
              {winRate.toFixed(1)}%
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Volume Traded:</span>
            <span className="text-sm font-bold font-mono text-foreground" data-testid="activity-volume-traded">
              {formatCurrency(volumeTraded)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
