import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useState } from "react";

interface TradingActivityData {
  numberOfTrades: number;
  profitableTrades: number;
  totalProfits: number;
  losingTrades: number;
  totalLosses: number;
  avgReturnPercent: number;
}

const PERIOD_OPTIONS = [
  { value: '1d', label: 'Day' },
  { value: '1w', label: 'Week' },
  { value: '1m', label: 'Month' },
  { value: '60d', label: '60 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: 'Year' },
];

export default function ResultsWidget() {
  const { mode, isPaper } = useTradingMode();
  const [period, setPeriod] = useState('1d');
  
  const { data: activity, isLoading } = useQuery<TradingActivityData>({
    queryKey: ['/api/trading/activity', { mode, period }],
  });

  if (isLoading) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-results">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Results</span>
            <TrendingUp className="w-5 h-5 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
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

  const data = activity || {
    numberOfTrades: 0,
    profitableTrades: 0,
    totalProfits: 0,
    losingTrades: 0,
    totalLosses: 0,
    avgReturnPercent: 0,
  };

  const totalPnL = data.totalProfits + data.totalLosses;
  const profitFactor = Math.abs(data.totalLosses) > 0 ? data.totalProfits / Math.abs(data.totalLosses) : 0;
  const maxDrawdown = totalPnL < 0 ? (totalPnL / (data.totalProfits || 1)) * 100 : 0;
  const avgReturnPerTrade = data.avgReturnPercent;

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-results">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Results</span>
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
          </div>
          <TrendingUp className="w-5 h-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full" data-testid="period-selector-results">
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
            <span className="text-xs text-muted-foreground">Total P/L:</span>
            <span className={cn(
              "text-sm font-bold font-mono",
              getChangeType(totalPnL) === "positive" && "text-success",
              getChangeType(totalPnL) === "negative" && "text-destructive",
              getChangeType(totalPnL) === "neutral" && "text-muted-foreground"
            )} data-testid="results-total-pnl">
              {formatCurrency(totalPnL)}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Profit Factor:</span>
            <span className={cn(
              "text-sm font-bold font-mono",
              profitFactor >= 2 ? "text-success" : 
              profitFactor >= 1 ? "text-warning" : "text-destructive"
            )} data-testid="results-profit-factor">
              {profitFactor.toFixed(2)}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Max Drawdown:</span>
            <span className={cn(
              "text-sm font-bold font-mono",
              Math.abs(maxDrawdown) > 20 ? "text-destructive" : 
              Math.abs(maxDrawdown) > 10 ? "text-warning" : "text-muted-foreground"
            )} data-testid="results-max-drawdown">
              {maxDrawdown.toFixed(2)}%
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Return/Trade:</span>
            <span className={cn(
              "text-sm font-bold font-mono",
              getChangeType(avgReturnPerTrade) === "positive" && "text-success",
              getChangeType(avgReturnPerTrade) === "negative" && "text-destructive",
              getChangeType(avgReturnPerTrade) === "neutral" && "text-muted-foreground"
            )} data-testid="results-avg-return">
              {formatPercent(avgReturnPerTrade)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
