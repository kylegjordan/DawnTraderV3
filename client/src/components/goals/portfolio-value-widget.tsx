import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useTrading } from "@/hooks/use-trading";

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

export default function PortfolioValueWidget() {
  const { isPaper } = useTradingMode();
  
  const { portfolioMetrics: livePortfolioMetrics, portfolioLoading: livePortfolioLoading } = useTrading();
  
  // Phase 27.F.14.I: Use paper-specific endpoint that queries portfolio_state table
  const { data: paperPortfolioMetrics, isLoading: paperPortfolioLoading } = useQuery<PortfolioMetrics>({
    queryKey: ['/api/paper/portfolio/state'],
    enabled: isPaper,
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });
  
  const portfolioMetrics = isPaper ? paperPortfolioMetrics : livePortfolioMetrics;
  const portfolioLoading = isPaper ? paperPortfolioLoading : livePortfolioLoading;

  if (portfolioLoading && !portfolioMetrics) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-portfolio-value">
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Portfolio Value</span>
            <DollarSign className="w-5 h-5 text-primary" />
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

  if (!portfolioMetrics) {
    return (
      <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-portfolio-value">
        <CardHeader>
          <CardTitle className="text-lg">Portfolio Value</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Portfolio data unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '$0.00';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  };

  const availableForTrading = (portfolioMetrics.cash || 0);
  const inOpenTrades = (portfolioMetrics.currentExposure || 0);

  return (
    <Card className={cn("metric-card", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="widget-portfolio-value">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Portfolio Value</span>
            {isPaper && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                SIMULATED
              </span>
            )}
          </div>
          <DollarSign className="w-5 h-5 text-primary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total:</span>
          <span className="text-xl font-bold font-mono text-foreground" data-testid="portfolio-total">
            {formatCurrency(portfolioMetrics.totalValue)}
          </span>
        </div>
        
        <div className="h-px bg-border my-2" />
        
        {/* Cash vs Crypto Allocation Bars */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Cash Allocation</span>
            <span className="font-mono text-foreground">{portfolioMetrics.cashPercent?.toFixed(1) || 0}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 dark:bg-green-600 transition-all duration-300"
              style={{ width: `${portfolioMetrics.cashPercent || 0}%` }}
              data-testid="cash-allocation-bar"
            />
          </div>
          
          <div className="flex justify-between items-center text-xs mt-2">
            <span className="text-muted-foreground">Crypto Allocation</span>
            <span className="font-mono text-foreground">{portfolioMetrics.cryptoPercent?.toFixed(1) || 0}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-300"
              style={{ width: `${portfolioMetrics.cryptoPercent || 0}%` }}
              data-testid="crypto-allocation-bar"
            />
          </div>
        </div>
        
        <div className="h-px bg-border my-2" />
        
        <div className="text-[10px] text-muted-foreground text-center" data-testid="portfolio-sync-time">
          {portfolioMetrics.syncTimestamp 
            ? `Last synced: ${formatTimestamp(portfolioMetrics.syncTimestamp)}`
            : 'Sync status unknown'
          }
        </div>
      </CardContent>
    </Card>
  );
}
