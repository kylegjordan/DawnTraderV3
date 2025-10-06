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
}

const PERIOD_OPTIONS = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
];

export default function TradingActivityWidget() {
  const { mode, isPaper } = useTradingMode();
  const [period, setPeriod] = useState('1d');
  
  const { data: activity, isLoading } = useQuery<TradingActivityData>({
    queryKey: ['/api/trading/activity', { mode, period }],
  });

  if (isLoading) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-trading-activity">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Trading Activity and Results</span>
            <Activity className="w-5 h-5 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '$0.00';
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value == null) return '0.00%';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
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
  };

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-trading-activity">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Trading Activity and Results</span>
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
            <span className="text-xs text-muted-foreground">Number of Trades:</span>
            <span className="text-sm font-mono text-foreground" data-testid="activity-trades-count">
              {data.numberOfTrades}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-center">
            <span className="text-xs text-success">Profitable Trades:</span>
            <span className="text-sm font-mono text-success" data-testid="activity-profitable">
              {data.profitableTrades}
            </span>
          </div>
          <div className="flex justify-between items-center pl-4">
            <span className="text-xs text-muted-foreground">Total Profits:</span>
            <span className="text-sm font-mono text-success" data-testid="activity-total-profits">
              {formatCurrency(data.totalProfits)}
            </span>
          </div>
          <div className="flex justify-between items-center pl-4">
            <span className="text-xs text-muted-foreground">Avg Return %:</span>
            <span className="text-sm font-mono text-success" data-testid="activity-avg-return">
              {formatPercent(data.avgReturnPercent)}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-center">
            <span className="text-xs text-destructive">Losing Trades:</span>
            <span className="text-sm font-mono text-destructive" data-testid="activity-losing">
              {data.losingTrades}
            </span>
          </div>
          <div className="flex justify-between items-center pl-4">
            <span className="text-xs text-muted-foreground">Total Losses:</span>
            <span className="text-sm font-mono text-destructive" data-testid="activity-total-losses">
              {formatCurrency(data.totalLosses)}
            </span>
          </div>
          <div className="flex justify-between items-center pl-4">
            <span className="text-xs text-muted-foreground">Avg Loss %:</span>
            <span className="text-sm font-mono text-destructive" data-testid="activity-avg-loss">
              {formatPercent(data.avgLossPercent)}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Total Fees Paid:</span>
            <span className="text-sm font-mono text-muted-foreground" data-testid="activity-fees">
              {formatCurrency(data.totalFeesPaid)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
