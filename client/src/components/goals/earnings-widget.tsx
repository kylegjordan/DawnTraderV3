import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";

interface EarningsSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  allTime: number;
  avgDailyEarnings: number;
  avgDailyEarningsStatus: string;
}

interface EarningsDataPoint {
  date: string;
  earnings: number;
  timestamp: number;
}

export default function EarningsWidget() {
  const { mode, isPaper } = useTradingMode();
  
  const { data: earnings, isLoading } = useQuery<EarningsSummary>({
    queryKey: ['earnings', 'summary', mode],
    queryFn: () => fetch(`/api/earnings/summary?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });
  
  const sparklineEndpoint = isPaper ? '/api/paper/metrics/earnings-chart' : '/api/portfolio/earnings-chart';
  const { data: sparklineData } = useQuery<EarningsDataPoint[]>({
    queryKey: ['earnings', 'sparkline', mode],
    queryFn: () => fetch(`${sparklineEndpoint}?days=7`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(r => r.json()),
  });

  if (isLoading && !earnings) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-earnings">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Earnings</span>
            <TrendingUp className="w-5 h-5 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!earnings) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-earnings">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Earnings</span>
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
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Today:</span>
            <span className="text-sm font-bold font-mono text-muted-foreground">$0.00</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">This Week:</span>
            <span className="text-sm font-bold font-mono text-muted-foreground">$0.00</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">This Month:</span>
            <span className="text-sm font-bold font-mono text-muted-foreground">$0.00</span>
          </div>
          
          <div className="h-px bg-border my-2" />
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Avg Daily Earnings (ADE):</span>
            <span className="text-sm font-bold font-mono text-muted-foreground">Pending</span>
          </div>
          
          <div>
            <div className="text-xs text-muted-foreground mb-1">7-Day Trend:</div>
            <div className="h-12 bg-muted/30 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatEarnings = (value: number | null | undefined) => {
    if (value == null) return '$0.00';
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getChangeType = (value: number | null | undefined): 'positive' | 'negative' | 'neutral' => {
    if (value == null) return 'neutral';
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  };
  
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length === 0) {
      return <div className="h-12 bg-muted/30 rounded animate-pulse" />;
    }
    
    const values = sparklineData.map(d => d.earnings);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    
    const width = 100;
    const height = 40;
    const points = sparklineData.map((d, i) => {
      const x = (i / (sparklineData.length - 1)) * width;
      const y = height - ((d.earnings - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg width="100%" height="48" viewBox={`0 0 ${width} ${height}`} className="mt-1">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn(
            getChangeType(earnings?.thisWeek) === 'positive' && 'text-green-500',
            getChangeType(earnings?.thisWeek) === 'negative' && 'text-red-500',
            getChangeType(earnings?.thisWeek) === 'neutral' && 'text-muted-foreground'
          )}
        />
      </svg>
    );
  };

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-earnings">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Earnings</span>
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
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Today:</span>
          <span className={cn(
            "text-sm font-bold font-mono",
            getChangeType(earnings.today) === "positive" && "text-success",
            getChangeType(earnings.today) === "negative" && "text-destructive",
            getChangeType(earnings.today) === "neutral" && "text-muted-foreground"
          )} data-testid="earnings-today">
            {formatEarnings(earnings.today)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">This Week:</span>
          <span className={cn(
            "text-sm font-bold font-mono",
            getChangeType(earnings.thisWeek) === "positive" && "text-success",
            getChangeType(earnings.thisWeek) === "negative" && "text-destructive",
            getChangeType(earnings.thisWeek) === "neutral" && "text-muted-foreground"
          )} data-testid="earnings-week">
            {formatEarnings(earnings.thisWeek)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">This Month:</span>
          <span className={cn(
            "text-sm font-bold font-mono",
            getChangeType(earnings.thisMonth) === "positive" && "text-success",
            getChangeType(earnings.thisMonth) === "negative" && "text-destructive",
            getChangeType(earnings.thisMonth) === "neutral" && "text-muted-foreground"
          )} data-testid="earnings-month">
            {formatEarnings(earnings.thisMonth)}
          </span>
        </div>
        
        <div className="h-px bg-border my-2" />
        
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Avg Daily Earnings (ADE):</span>
          <span className={cn(
            "text-sm font-bold font-mono",
            earnings.avgDailyEarningsStatus === 'insufficient_data' && "text-muted-foreground",
            earnings.avgDailyEarningsStatus !== 'insufficient_data' && getChangeType(earnings.avgDailyEarnings) === "positive" && "text-success",
            earnings.avgDailyEarningsStatus !== 'insufficient_data' && getChangeType(earnings.avgDailyEarnings) === "negative" && "text-destructive"
          )} data-testid="earnings-average-daily">
            {earnings.avgDailyEarningsStatus === 'insufficient_data' ? 'Pending' : formatEarnings(earnings.avgDailyEarnings)}
          </span>
        </div>
        
        <div>
          <div className="text-xs text-muted-foreground mb-1">7-Day Trend:</div>
          {renderSparkline()}
        </div>
      </CardContent>
    </Card>
  );
}
