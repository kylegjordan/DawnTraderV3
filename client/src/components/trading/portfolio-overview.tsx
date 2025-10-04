import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Target, PieChart } from "lucide-react";
import { useTrading } from "@/hooks/use-trading";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function PortfolioOverview() {
  const { portfolioMetrics, portfolioLoading } = useTrading();
  
  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['/api/portfolio/earnings'],
  });

  const loading = portfolioLoading || earningsLoading;

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

  const formatEarnings = (value: number) => {
    const formatted = `${value >= 0 ? '+' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return formatted;
  };

  const getChangeType = (value: number): 'positive' | 'negative' | 'neutral' => {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  };

  const earnings = earningsData || { today: 0, yesterday: 0, thisWeek: 0, thisMonth: 0, thisYear: 0, lifetime: 0 };

  const metrics = [
    {
      title: "Portfolio Value",
      value: `$${portfolioMetrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: `Win Rate: ${portfolioMetrics.winRate.toFixed(1)}%`,
      changeType: portfolioMetrics.winRate >= 50 ? "positive" : "negative" as const,
      icon: DollarSign,
      subtitle: `${portfolioMetrics.wins}W / ${portfolioMetrics.losses}L`
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
      value: `${portfolioMetrics.unrealizedPL >= 0 ? '+' : ''}$${Math.abs(portfolioMetrics.unrealizedPL).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: `${portfolioMetrics.openTradesCount} open positions`,
      changeType: portfolioMetrics.unrealizedPL >= 0 ? "positive" : "negative" as const,
      icon: Target,
      subtitle: ""
    },
    {
      title: "Cash vs Crypto",
      value: `${portfolioMetrics.cashPercent?.toFixed(1) || '100.0'}%`,
      change: `Crypto: ${portfolioMetrics.cryptoPercent?.toFixed(1) || '0.0'}%`,
      changeType: "neutral" as const,
      icon: PieChart,
      subtitle: `$${(portfolioMetrics.cash || portfolioMetrics.totalValue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} cash`
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        
        return (
          <Card key={index} className="metric-card" data-testid={`metric-${metric.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{metric.title}</span>
                <Icon className={cn(
                  "w-5 h-5",
                  metric.changeType === "positive" && "text-success",
                  metric.changeType === "negative" && "text-destructive",
                  metric.changeType === "neutral" && "text-primary"
                )} />
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
                    <span className="text-xs text-muted-foreground">Yesterday:</span>
                    <span className={cn(
                      "text-sm font-bold font-mono",
                      getChangeType((metric as any).earningsData.yesterday) === "positive" && "text-success",
                      getChangeType((metric as any).earningsData.yesterday) === "negative" && "text-destructive",
                      getChangeType((metric as any).earningsData.yesterday) === "neutral" && "text-muted-foreground"
                    )} data-testid="earnings-yesterday">
                      {formatEarnings((metric as any).earningsData.yesterday)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">This Week:</span>
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
                    <span className="text-xs text-muted-foreground">This Month:</span>
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
                    <span className="text-xs text-muted-foreground">This Year:</span>
                    <span className={cn(
                      "text-sm font-bold font-mono",
                      getChangeType((metric as any).earningsData.thisYear) === "positive" && "text-success",
                      getChangeType((metric as any).earningsData.thisYear) === "negative" && "text-destructive",
                      getChangeType((metric as any).earningsData.thisYear) === "neutral" && "text-muted-foreground"
                    )} data-testid="earnings-year">
                      {formatEarnings((metric as any).earningsData.thisYear)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-xs font-semibold text-foreground">Lifetime:</span>
                    <span className={cn(
                      "text-lg font-bold font-mono",
                      getChangeType((metric as any).earningsData.lifetime) === "positive" && "text-success",
                      getChangeType((metric as any).earningsData.lifetime) === "negative" && "text-destructive",
                      getChangeType((metric as any).earningsData.lifetime) === "neutral" && "text-muted-foreground"
                    )} data-testid="earnings-lifetime">
                      {formatEarnings((metric as any).earningsData.lifetime)}
                    </span>
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
