import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Target, PieChart, Beaker } from "lucide-react";
import { useTrading } from "@/hooks/use-trading";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { EarningsData } from "@/lib/types";
import { calculateAverageDailyEarnings, getSparklineData, formatADE } from "@/lib/earnings-utils";
import EarningsSparkline from "./earnings-sparkline";
import { useTradingMode } from "@/contexts/trading-mode-context";

interface DailyBrief {
  date: string;
  metrics: {
    realized_pl?: number;
    num_trades?: number;
  } | null;
  trades: {
    closed?: any[];
    open?: any[];
  } | null;
}

interface PortfolioMetrics {
  totalValue: number;
  cash: number;
  crypto: number;
  cashPercent: number;
  cryptoPercent: number;
  unrealizedPL: number;
  realizedPL: number;
  openTradesCount: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  currentExposure: number;
  balanceSource?: string;
  balanceError?: string;
  syncTimestamp?: number;
}

export default function PortfolioOverview() {
  const { mode, isPaper } = useTradingMode();
  
  const { portfolioMetrics: livePortfolioMetrics, portfolioLoading: livePortfolioLoading } = useTrading();
  
  const { data: paperPortfolioMetrics, isLoading: paperPortfolioLoading } = useQuery<PortfolioMetrics>({
    queryKey: ['/api/paper/metrics/portfolio'],
    enabled: isPaper,
    // REB 2.8.10: Standardized portfolio refresh
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  
  const { data: earningsData, isLoading: earningsLoading } = useQuery<EarningsData>({
    queryKey: isPaper ? ['/api/paper/metrics/earnings'] : ['/api/portfolio/earnings'],
    // REB 2.8.10: Standardized portfolio refresh
    refetchInterval: 5000,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // P19-B-RENAME Wave-1 (Kyle ruling): the Walter-era /api/paper/briefs route +
  // table were deleted (never written — paper mode always got an empty list).
  // Paper mode keeps the empty-list default without a query.
  const { data: dailyBriefs = [], isLoading: briefsLoading } = useQuery<DailyBrief[]>({
    queryKey: ['/api/daily-briefs', { limit: 30 }],
    enabled: !isPaper,
  });

  const portfolioMetrics = isPaper ? paperPortfolioMetrics : livePortfolioMetrics;
  const portfolioLoading = isPaper ? paperPortfolioLoading : livePortfolioLoading;

  const loading = portfolioLoading || earningsLoading || briefsLoading;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="metric-card">
            <CardContent className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!portfolioMetrics) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Portfolio data unavailable</p>
      </div>
    );
  }

  const formatEarnings = (value: number | null | undefined) => {
    if (value == null) return '—';
    const formatted = `${value >= 0 ? '+' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return formatted;
  };

  const getChangeType = (value: number | null | undefined): 'positive' | 'negative' | 'neutral' => {
    if (value == null) return 'neutral';
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  };

  const earnings: EarningsData = earningsData || { today: 0, yesterday: 0, thisWeek: 0, thisMonth: 0, thisYear: 0, lifetime: 0 };

  const adeResult = calculateAverageDailyEarnings(dailyBriefs || []);
  const sparklineData = getSparklineData(dailyBriefs || [], 7);
  const hasPartialData = !briefsLoading && dailyBriefs && dailyBriefs.length > 0 && dailyBriefs.length < 5;

  const formatSyncTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toISOString().substring(11, 19) + ' UTC';
  };

  const getSyncStatus = () => {
    if (portfolioMetrics.balanceError) {
      return `Sync failed • ${portfolioMetrics.balanceError}`;
    }
    if (portfolioMetrics.balanceSource === 'kraken' && portfolioMetrics.syncTimestamp) {
      return `Synced from Kraken • Last updated ${formatSyncTime(portfolioMetrics.syncTimestamp)}`;
    }
    if (portfolioMetrics.balanceSource === 'internal') {
      return `Using internal estimate`;
    }
    return '';
  };

  const metrics = [
    {
      title: "Portfolio Value",
      value: portfolioMetrics.totalValue != null 
        ? `$${portfolioMetrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` 
        : '—',
      change: portfolioMetrics.totalTrades === 0 
        ? `Win Rate: —` 
        : portfolioMetrics.winRate != null 
          ? `Win Rate: ${portfolioMetrics.winRate.toFixed(1)}%`
          : 'Win Rate: —',
      changeType: portfolioMetrics.totalTrades === 0 
        ? "neutral" 
        : portfolioMetrics.winRate != null && portfolioMetrics.winRate >= 50 
          ? "positive" 
          : "negative",
      icon: DollarSign,
      iconHidden: true,
      subtitle: portfolioMetrics.totalTrades === 0 
        ? `No trades yet` 
        : `${portfolioMetrics.wins ?? 0}W / ${portfolioMetrics.losses ?? 0}L`,
      syncStatus: getSyncStatus()
    },
    {
      title: "Earnings Summary",
      value: formatEarnings(earnings.lifetime),
      change: `This Month: ${formatEarnings(earnings.thisMonth)}`,
      changeType: getChangeType(earnings.lifetime),
      icon: TrendingUp,
      subtitle: `Today: ${formatEarnings(earnings.today)}`,
      isEarnings: true,
      earningsData: earnings
    },
    {
      title: "Unrealized P/L",
      value: portfolioMetrics.unrealizedPL != null
        ? `${portfolioMetrics.unrealizedPL >= 0 ? '+' : ''}$${Math.abs(portfolioMetrics.unrealizedPL).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : '—',
      change: `${portfolioMetrics.openTradesCount ?? 0} open positions`,
      changeType: portfolioMetrics.unrealizedPL != null && portfolioMetrics.unrealizedPL >= 0 ? "positive" : "negative",
      icon: Target,
      subtitle: ""
    },
    {
      title: "Cash vs Crypto",
      value: "",
      change: "",
      changeType: "neutral" as const,
      icon: PieChart,
      subtitle: "",
      isCashCrypto: true,
      cashAmount: portfolioMetrics.cash || portfolioMetrics.totalValue,
      cryptoAmount: portfolioMetrics.crypto || 0,
      cashPercent: portfolioMetrics.cashPercent || 100,
      cryptoPercent: portfolioMetrics.cryptoPercent || 0
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        
        return (
          <Card key={index} className={cn(
            "metric-card transition-all duration-200",
            isPaper && "border-blue-500/30 bg-blue-500/5"
          )} data-testid={`metric-${metric.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">{metric.title}</span>
                  {isPaper && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                      SIMULATED
                    </span>
                  )}
                </div>
                {!(metric as any).iconHidden && (
                  <Icon className={cn(
                    "w-4 h-4 sm:w-5 sm:h-5",
                    metric.changeType === "positive" && "text-success",
                    metric.changeType === "negative" && "text-destructive",
                    metric.changeType === "neutral" && "text-primary"
                  )} />
                )}
              </div>
              
              {(metric as any).isEarnings ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Today:</span>
                    <span className={cn(
                      "text-sm font-bold font-mono",
                      getChangeType((metric as any).earningsData.today) === "positive" && "text-success",
                      getChangeType((metric as any).earningsData.today) === "negative" && "text-destructive",
                      getChangeType((metric as any).earningsData.today) === "neutral" && "text-muted-foreground"
                    )} data-testid="earnings-today">
                      {formatEarnings((metric as any).earningsData.today)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Weekly Total:</span>
                    <span className={cn(
                      "text-sm font-bold font-mono",
                      getChangeType((metric as any).earningsData.thisWeek) === "positive" && "text-success",
                      getChangeType((metric as any).earningsData.thisWeek) === "negative" && "text-destructive",
                      getChangeType((metric as any).earningsData.thisWeek) === "neutral" && "text-muted-foreground"
                    )} data-testid="earnings-week">
                      {formatEarnings((metric as any).earningsData.thisWeek)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Monthly Total:</span>
                    <span className={cn(
                      "text-sm font-bold font-mono",
                      getChangeType((metric as any).earningsData.thisMonth) === "positive" && "text-success",
                      getChangeType((metric as any).earningsData.thisMonth) === "negative" && "text-destructive",
                      getChangeType((metric as any).earningsData.thisMonth) === "neutral" && "text-muted-foreground"
                    )} data-testid="earnings-month">
                      {formatEarnings((metric as any).earningsData.thisMonth)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Average Daily:</span>
                    <span className={cn(
                      "text-sm font-bold font-mono",
                      adeResult.insufficientData && "text-muted-foreground",
                      !adeResult.insufficientData && getChangeType(adeResult.value) === "positive" && "text-success",
                      !adeResult.insufficientData && getChangeType(adeResult.value) === "negative" && "text-destructive"
                    )} data-testid="earnings-average-daily">
                      {formatADE(adeResult.value)}
                    </span>
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Trend (7 days):</span>
                    </div>
                    <EarningsSparkline data={sparklineData} />
                  </div>
                  {hasPartialData && (
                    <div className="text-[10px] text-muted-foreground italic pt-1">
                      Some trading metrics are still updating.
                    </div>
                  )}
                </div>
              ) : (metric as any).isCashCrypto ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Cash:</span>
                      <span className="text-lg font-bold font-mono text-foreground">
                        ${(metric as any).cashAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground ml-4">
                        ({(metric as any).cashPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Crypto:</span>
                      <span className="text-lg font-bold font-mono text-foreground">
                        ${(metric as any).cryptoAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground ml-4">
                        ({(metric as any).cryptoPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={cn(
                    "font-mono text-2xl font-bold mb-2",
                    metric.changeType === "positive" && "text-success",
                    metric.changeType === "negative" && "text-destructive",
                    metric.changeType === "neutral" && "text-foreground"
                  )}>
                    {metric.value}
                  </div>
                  
                  {(metric as any).syncStatus && (
                    <div className="text-[10px] text-muted-foreground mb-2 font-mono">
                      {(metric as any).syncStatus}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-1">
                    {metric.changeType === "positive" && (
                      <TrendingUp className="w-4 h-4 text-success" />
                    )}
                    <span className={cn(
                      "text-sm font-semibold",
                      metric.changeType === "positive" && "text-success",
                      metric.changeType === "negative" && "text-destructive",
                      metric.changeType === "neutral" && "text-muted-foreground"
                    )}>
                      {metric.change}
                    </span>
                    {metric.subtitle && <span className="text-xs text-muted-foreground ml-1">{metric.subtitle}</span>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
