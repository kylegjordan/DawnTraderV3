import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/hooks/use-trading";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery } from "@tanstack/react-query";
import { PieChart, DollarSign, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export default function PortfolioTab() {
  const { isPaper } = useTradingMode();
  const { portfolioMetrics: livePortfolioMetrics, portfolioLoading: livePortfolioLoading } = useTrading();
  
  const { data: paperPortfolioMetrics, isLoading: paperPortfolioLoading } = useQuery<PortfolioMetrics>({
    queryKey: ['/api/paper/metrics/portfolio'],
    enabled: isPaper,
  });
  
  const portfolioMetrics = isPaper ? paperPortfolioMetrics : livePortfolioMetrics;
  const isLoading = isPaper ? paperPortfolioLoading : livePortfolioLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '$0.00';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Portfolio Overview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            View your current portfolio allocation and performance metrics
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="w-4 h-4" />
                <span>Total Value</span>
              </div>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(portfolioMetrics?.totalValue)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="w-4 h-4" />
                <span>Cash</span>
              </div>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(portfolioMetrics?.cash)}
              </div>
              <div className="text-xs text-muted-foreground">
                {portfolioMetrics?.cashPercent?.toFixed(1)}% of portfolio
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="w-4 h-4" />
                <span>Crypto</span>
              </div>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(portfolioMetrics?.crypto)}
              </div>
              <div className="text-xs text-muted-foreground">
                {portfolioMetrics?.cryptoPercent?.toFixed(1)}% of portfolio
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="w-4 h-4" />
                <span>Unrealized P/L</span>
              </div>
              <div className={cn(
                "text-2xl font-bold font-mono",
                (portfolioMetrics?.unrealizedPL || 0) >= 0 ? "text-success" : "text-destructive"
              )}>
                {formatCurrency(portfolioMetrics?.unrealizedPL)}
              </div>
              <div className="text-xs text-muted-foreground">
                {portfolioMetrics?.openTradesCount || 0} open positions
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="w-4 h-4" />
                <span>Realized P/L</span>
              </div>
              <div className={cn(
                "text-2xl font-bold font-mono",
                (portfolioMetrics?.realizedPL || 0) >= 0 ? "text-success" : "text-destructive"
              )}>
                {formatCurrency(portfolioMetrics?.realizedPL)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="w-4 h-4" />
                <span>Win Rate</span>
              </div>
              <div className="text-2xl font-bold font-mono">
                {portfolioMetrics?.winRate?.toFixed(1) || '0.0'}%
              </div>
              <div className="text-xs text-muted-foreground">
                {portfolioMetrics?.wins || 0}W / {portfolioMetrics?.losses || 0}L
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Allocation Suggestions</CardTitle>
          <p className="text-sm text-muted-foreground">
            The AI can adjust allocation suggestions based on your goals
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            AI-driven portfolio allocation suggestions will appear here when you discuss goals in the Goals tab.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
