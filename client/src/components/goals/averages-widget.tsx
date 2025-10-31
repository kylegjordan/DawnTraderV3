import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useState, memo, useEffect } from "react";

interface AveragesData {
  avgDailyEarnings: number;
  avgTradesPerDay: number;
  avgEarningsPerTrade: number;
  avgAmountInvestedPerTrade: number;
  avgFeesPerTrade: number;
  avgDailyEarningsPct: number | null;
  avgTradeCompletionTime: string;
}

const PERIOD_OPTIONS = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
];

function AveragesWidgetComponent() {
  useEffect(() => {
    console.log('[35.2][Dashboard] AveragesWidget re-render');
  });
  const { mode, isPaper } = useTradingMode();
  const [period, setPeriod] = useState('1d');
  
  const { data: averages, isLoading } = useQuery<AveragesData>({
    queryKey: [`/api/trading/averages?mode=${mode}&period=${period}`],
  });

  if (isLoading && !averages) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-averages">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Averages</span>
            <BarChart3 className="w-5 h-5 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 7 }).map((_, i) => (
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

  const getChangeType = (value: number | null | undefined): 'positive' | 'negative' | 'neutral' => {
    if (value == null) return 'neutral';
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  };

  const data = averages || {
    avgDailyEarnings: 0,
    avgTradesPerDay: 0,
    avgEarningsPerTrade: 0,
    avgAmountInvestedPerTrade: 0,
    avgFeesPerTrade: 0,
    avgDailyEarningsPct: null,
    avgTradeCompletionTime: '0h 0m',
  };

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-averages">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Averages</span>
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
          </div>
          <BarChart3 className="w-5 h-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full" data-testid="period-selector-averages">
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
            <span className="text-xs text-muted-foreground">Avg Daily Earnings:</span>
            <span className={cn(
              "text-sm font-mono",
              getChangeType(data.avgDailyEarnings) === "positive" && "text-success",
              getChangeType(data.avgDailyEarnings) === "negative" && "text-destructive",
              getChangeType(data.avgDailyEarnings) === "neutral" && "text-muted-foreground"
            )} data-testid="avg-daily-earnings">
              {formatCurrency(data.avgDailyEarnings)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Trades per Day:</span>
            <span className="text-sm font-mono text-foreground" data-testid="avg-trades-per-day">
              {data.avgTradesPerDay.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Earnings per Trade:</span>
            <span className={cn(
              "text-sm font-mono",
              getChangeType(data.avgEarningsPerTrade) === "positive" && "text-success",
              getChangeType(data.avgEarningsPerTrade) === "negative" && "text-destructive",
              getChangeType(data.avgEarningsPerTrade) === "neutral" && "text-muted-foreground"
            )} data-testid="avg-earnings-per-trade">
              {formatCurrency(data.avgEarningsPerTrade)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Amount Invested:</span>
            <span className="text-sm font-mono text-foreground" data-testid="avg-amount-invested">
              {formatCurrency(data.avgAmountInvestedPerTrade)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Fees per Trade:</span>
            <span className="text-sm font-mono text-muted-foreground" data-testid="avg-fees-per-trade">
              {formatCurrency(data.avgFeesPerTrade)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Daily Earnings %:</span>
            <span className={cn(
              "text-sm font-mono",
              data.avgDailyEarningsPct == null && "text-muted-foreground",
              data.avgDailyEarningsPct != null && getChangeType(data.avgDailyEarningsPct) === "positive" && "text-success",
              data.avgDailyEarningsPct != null && getChangeType(data.avgDailyEarningsPct) === "negative" && "text-destructive"
            )} data-testid="avg-daily-earnings-pct">
              {data.avgDailyEarningsPct == null ? 'Pending' : formatPercent(data.avgDailyEarningsPct)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Completion Time:</span>
            <span className="text-sm font-mono text-foreground" data-testid="avg-completion-time">
              {data.avgTradeCompletionTime}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Phase 35.2A: Memoize to prevent unnecessary re-renders
export default memo(AveragesWidgetComponent);
