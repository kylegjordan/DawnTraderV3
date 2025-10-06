import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/hooks/use-trading";
import { ArrowRight, TrendingUp, TrendingDown, Beaker } from "lucide-react";
import { cn } from "@/lib/utils";
import { Trade } from "@/lib/types";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatTime } from "@/lib/timezone";
import { useTradingMode } from "@/contexts/trading-mode-context";

const strategyColors = {
  vwap_pullback: "bg-primary/10 text-primary",
  abcd_long: "bg-chart-2/10 text-chart-2",
  sma_trend_ride: "bg-chart-3/10 text-chart-3"
};

const strategyAbbr = {
  vwap_pullback: "VWAP PB",
  abcd_long: "ABCD",
  sma_trend_ride: "SMA TR"
};

function TradeRow({ trade }: { trade: Trade }) {
  const realizedPL = parseFloat(trade.realizedPL || '0');
  const realizedPLPercent = parseFloat(trade.realizedPLPercent || '0');
  const realizedPLR = parseFloat(trade.realizedPLR || '0');
  const entryFee = parseFloat(trade.entryFee || '0');
  const exitFee = parseFloat(trade.exitFee || '0');
  const totalFees = entryFee + exitFee;
  
  const isProfit = realizedPL > 0;
  
  // Fetch user settings for timezone conversion
  const { data: settings } = useQuery<{ timezone?: string; timeFormat?: string }>({ 
    queryKey: ['/api/settings'],
  });
  
  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'text-orange-500';
    if (symbol.includes('ETH')) return 'text-blue-500';
    if (symbol.includes('ADA')) return 'text-blue-400';
    if (symbol.includes('XRP')) return 'text-blue-600';
    if (symbol.includes('DOGE')) return 'text-yellow-500';
    return 'text-primary';
  };

  const calculateHoldTime = () => {
    if (!trade.exitTime) return 0;
    const entryTime = new Date(trade.entryTime);
    const exitTime = new Date(trade.exitTime);
    return (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60); // hours
  };

  return (
    <tr className="trade-row transition-colors" data-testid={`recent-trade-${trade.id}`}>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {trade.exitTime && settings
          ? formatTime(trade.exitTime, {
              timezone: settings.timezone || 'Asia/Dubai',
              timeFormat: settings.timeFormat || '12hr'
            })
          : 'N/A'
        }
      </td>
      
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
            <span className={cn("text-xs font-bold", getSymbolColor(trade.symbol))}>
              {trade.symbol.charAt(0)}
            </span>
          </div>
          <span className="font-semibold text-foreground text-sm">{trade.symbol}</span>
        </div>
      </td>
      
      <td className="px-4 py-3">
        <Badge className={cn("text-xs font-medium", strategyColors[trade.strategy])}>
          {strategyAbbr[trade.strategy]}
        </Badge>
      </td>
      
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1">
          {isProfit ? (
            <TrendingUp className="w-3 h-3 text-success" />
          ) : (
            <TrendingDown className="w-3 h-3 text-destructive" />
          )}
          <span className={cn("text-sm font-medium", isProfit ? "text-success" : "text-destructive")}>
            SELL
          </span>
        </span>
      </td>
      
      <td className="px-4 py-3 font-mono text-sm text-foreground">
        ${parseFloat(trade.entryPrice).toFixed(4)}
      </td>
      
      <td className="px-4 py-3 font-mono text-sm text-foreground">
        {trade.exitPrice ? `$${parseFloat(trade.exitPrice).toFixed(4)}` : 'N/A'}
      </td>
      
      <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
        {parseFloat(trade.quantity).toLocaleString()}
      </td>
      
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        ${totalFees.toFixed(2)}
      </td>
      
      <td className="px-4 py-3">
        <div className={cn("font-mono text-sm font-semibold", isProfit ? "text-success" : "text-destructive")}>
          {isProfit ? '+' : ''}${realizedPL.toFixed(2)}
        </div>
        <div className="text-xs text-muted-foreground">
          {realizedPLPercent >= 0 ? '+' : ''}{realizedPLPercent.toFixed(2)}%
        </div>
      </td>
      
      <td className="px-4 py-3">
        <div className={cn("font-mono text-sm font-semibold", isProfit ? "text-success" : "text-destructive")}>
          {realizedPLR >= 0 ? '+' : ''}{realizedPLR.toFixed(2)}R
        </div>
        <div className="text-xs text-muted-foreground">
          {realizedPLR >= 0 ? '+' : ''}${(realizedPLR * parseFloat(trade.riskAmount)).toFixed(2)}
        </div>
      </td>
    </tr>
  );
}

export default function RecentTrades() {
  const { mode, isPaper } = useTradingMode();
  const { recentTrades: liveRecentTrades, recentTradesLoading: liveRecentTradesLoading } = useTrading();
  
  const { data: paperRecentTrades = [], isLoading: paperRecentTradesLoading } = useQuery<Trade[]>({
    queryKey: ['/api/paper/trades', { limit: 10 }],
    enabled: isPaper,
  });
  
  const recentTrades = isPaper ? paperRecentTrades : liveRecentTrades;
  const recentTradesLoading = isPaper ? paperRecentTradesLoading : liveRecentTradesLoading;

  if (recentTradesLoading) {
    return (
      <section>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-20" />
        </div>
        <Card>
          <div className="p-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid="recent-trades-section">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Recent Trades (Last 10)</h2>
          {isPaper && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
              <Beaker className="w-3 h-3 mr-1" />
              SIMULATED
            </Badge>
          )}
        </div>
        <Link href="/history">
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 text-primary hover:bg-primary/10"
            data-testid="button-view-all-history"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
      
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {recentTrades.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No recent trades</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Pair
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Strategy
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Entry
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Exit
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Fees
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Net P/L
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    R
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTrades.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </section>
  );
}
