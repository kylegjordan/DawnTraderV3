import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, ChevronRight, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Link } from "wouter";

interface StrategyMetric {
  strategy: string;
  strategyName: string;
  winRate: number;
  avgRMultiple: number;
  totalPL: number;
  predictionAccuracy: number;
  confidence: number;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  dailyPLTrend: number[];
  status: 'positive' | 'negative' | 'neutral';
}

interface StrategyMetricsResponse {
  success: boolean;
  data: StrategyMetric[];
  period: string;
}

interface StrategyParameter {
  key: string;
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  description: string;
}

interface StrategyParametersResponse {
  ok: boolean;
  parameters: StrategyParameter[];
}

function DHMAParametersSection({ mode }: { mode: 'paper' | 'live' }) {
  const { data: paramsData, isLoading } = useQuery<StrategyParametersResponse>({
    queryKey: [`/api/strategy/parameters?mode=${mode}&strategy=dhma`],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="pt-3 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">DHMA Parameters</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!paramsData || !paramsData.ok || !paramsData.parameters || paramsData.parameters.length === 0) {
    return null;
  }

  return (
    <div className="pt-3 border-t border-border">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">DHMA Parameters</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {paramsData.parameters.map((param) => (
          <div 
            key={param.key}
            className="bg-muted/50 rounded-md px-2 py-1.5"
            title={param.description}
          >
            <div className="text-muted-foreground truncate">{param.label}</div>
            <div className="font-semibold text-foreground">{param.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StrategyPerformanceWidget() {
  const { mode } = useTradingMode();
  const [days] = useState(7);

  const endpoint = mode === 'live' 
    ? `/api/metrics/strategies?days=${days}`
    : `/api/paper/metrics/strategies?days=${days}`;

  const { data, isLoading } = useQuery<StrategyMetricsResponse>({
    queryKey: [endpoint],
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'positive':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30';
      case 'negative':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
      default:
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'positive':
        return <TrendingUp className="h-4 w-4" />;
      case 'negative':
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const renderMiniChart = (trend: number[]) => {
    if (!trend || trend.length === 0) return null;

    const max = Math.max(...trend.map(Math.abs), 1);
    const height = 40;
    const barWidth = 8;
    const gap = 2;

    return (
      <svg 
        width={trend.length * (barWidth + gap)} 
        height={height}
        className="ml-auto"
      >
        {trend.map((value, i) => {
          const barHeight = Math.abs(value) / max * height;
          const yPos = value >= 0 ? height - barHeight : height;
          const color = value >= 0 ? '#22c55e' : '#ef4444';

          return (
            <rect
              key={i}
              x={i * (barWidth + gap)}
              y={yPos}
              width={barWidth}
              height={barHeight}
              fill={color}
              opacity={0.8}
              rx={2}
            />
          );
        })}
      </svg>
    );
  };

  if (isLoading && !data) {
    return (
      <section data-testid="strategy-performance-widget">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">
          Strategy Performance
        </h2>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!data || !data.success || data.data.length === 0) {
    return (
      <section data-testid="strategy-performance-widget">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">
          Strategy Performance
        </h2>
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No strategy data available yet</p>
              <p className="text-sm mt-1">Complete trades to see performance metrics</p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="strategy-performance-widget">
      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">
        Strategy Performance
      </h2>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Last {days} Days</CardTitle>
              <CardDescription>Performance breakdown by trading strategy</CardDescription>
            </div>
            <Badge variant="outline" className="hidden sm:flex">
              {mode === 'live' ? 'Live' : 'Paper'} Mode
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.data.map((strategy) => (
            <Card 
              key={strategy.strategy}
              className="border-muted hover:border-primary/50 transition-colors"
              data-testid={`strategy-card-${strategy.strategy}`}
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant="secondary"
                        className={cn("font-semibold", getStatusColor(strategy.status))}
                      >
                        {getStatusIcon(strategy.status)}
                        <span className="ml-1.5">{strategy.strategyName}</span>
                      </Badge>
                      <span className="text-sm text-muted-foreground hidden sm:inline">
                        {strategy.closedTrades} closed · {strategy.openTrades} open
                      </span>
                    </div>
                    <div className={cn(
                      "text-lg font-bold",
                      strategy.totalPL > 0 ? "text-green-600 dark:text-green-400" :
                      strategy.totalPL < 0 ? "text-red-600 dark:text-red-400" :
                      "text-muted-foreground"
                    )}>
                      {strategy.totalPL >= 0 ? '+' : ''}${strategy.totalPL.toFixed(2)}
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div data-testid={`win-rate-${strategy.strategy}`}>
                      <div className="text-muted-foreground text-xs">Win Rate</div>
                      <div className="font-semibold text-foreground">
                        {strategy.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div data-testid={`r-multiple-${strategy.strategy}`}>
                      <div className="text-muted-foreground text-xs">Avg R-Multiple</div>
                      <div className={cn(
                        "font-semibold",
                        strategy.avgRMultiple > 0 ? "text-green-600 dark:text-green-400" :
                        strategy.avgRMultiple < 0 ? "text-red-600 dark:text-red-400" :
                        "text-foreground"
                      )}>
                        {strategy.avgRMultiple.toFixed(2)}R
                      </div>
                    </div>
                    <div data-testid={`accuracy-${strategy.strategy}`}>
                      <div className="text-muted-foreground text-xs">Prediction Accuracy</div>
                      <div className="font-semibold text-foreground">
                        {strategy.predictionAccuracy.toFixed(1)}%
                      </div>
                    </div>
                    <div data-testid={`confidence-${strategy.strategy}`}>
                      <div className="text-muted-foreground text-xs">Confidence</div>
                      <div className="font-semibold text-foreground">
                        {(strategy.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* DHMA-specific parameters */}
                  {strategy.strategy === 'dhma' && <DHMAParametersSection mode={mode} />}

                  {/* Trend and Detail Button */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        7-day trend:
                      </span>
                      {renderMiniChart(strategy.dailyPLTrend)}
                    </div>
                    <Link href={`/reports?strategy=${strategy.strategy}`}>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-primary hover:text-primary/80"
                        data-testid={`view-details-${strategy.strategy}`}
                      >
                        View Details
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
