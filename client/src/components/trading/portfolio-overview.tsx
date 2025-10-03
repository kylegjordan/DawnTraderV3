import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Target, Award } from "lucide-react";
import { useTrading } from "@/hooks/use-trading";
import { cn } from "@/lib/utils";

export default function PortfolioOverview() {
  const { portfolioMetrics, portfolioLoading } = useTrading();

  if (portfolioLoading) {
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
      title: "Realized P/L (24h)",
      value: `${portfolioMetrics.realizedPL >= 0 ? '+' : ''}$${portfolioMetrics.realizedPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: "+4.2R",
      changeType: portfolioMetrics.realizedPL >= 0 ? "positive" : "negative" as const,
      icon: TrendingUp,
      subtitle: "($116.00/R)"
    },
    {
      title: "Unrealized P/L",
      value: `${portfolioMetrics.unrealizedPL >= 0 ? '+' : ''}$${portfolioMetrics.unrealizedPL.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: "+1.3R",
      changeType: portfolioMetrics.unrealizedPL >= 0 ? "positive" : "negative" as const,
      icon: Target,
      subtitle: `${portfolioMetrics.openTradesCount} open positions`
    },
    {
      title: "Win Rate (30d)",
      value: `${portfolioMetrics.winRate.toFixed(1)}%`,
      change: `${portfolioMetrics.wins}W / ${portfolioMetrics.losses}L`,
      changeType: "neutral" as const,
      icon: Award,
      subtitle: `• PF: ${portfolioMetrics.profitFactor.toFixed(2)}`
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
                <span className="text-xs text-muted-foreground ml-1">{metric.subtitle}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
