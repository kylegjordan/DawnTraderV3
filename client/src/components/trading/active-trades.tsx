import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/hooks/use-trading";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Trade } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { formatTime } from "@/lib/timezone";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Beaker } from "lucide-react";

const strategyColors = {
  vwap_pullback: "bg-primary/10 text-primary",
  abcd_long: "bg-chart-2/10 text-chart-2",
  sma_trend_ride: "bg-chart-3/10 text-chart-3"
};

const strategyNames = {
  vwap_pullback: "VWAP Pullback",
  abcd_long: "ABCD Long",
  sma_trend_ride: "SMA Trend Ride"
};

function TradeRow({ trade }: { trade: Trade }) {
  const { closeTrade, isClosingTrade } = useTrading();
  const { toast } = useToast();
  
  // Directive 12.1.4 (BUG-020): Removed simulated price (was entryPrice * 1.02)
  // Current price display now shows entry price until live price feed is integrated (v2 component)
  const entryPrice = parseFloat(trade.entryPrice);
  const currentPrice = entryPrice; // No simulated price — shows entry until live feed available
  const unrealizedPL = 0; // Cannot calculate without live price
  const unrealizedPLPercent = 0;
  const unrealizedR = 0;
  
  // Fetch user settings for timezone conversion
  const { data: settings } = useQuery<{ timezone?: string; timeFormat?: string }>({ 
    queryKey: ['/api/settings'],
    refetchInterval: 300000,
    staleTime: 300000,
    refetchOnWindowFocus: false
  });
  
  const handleClose = async () => {
    try {
      closeTrade(trade.id);
      toast({
        title: "Trade Closed",
        description: `${trade.symbol} position closed manually`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to close trade",
        variant: "destructive",
      });
    }
  };

  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'text-orange-500';
    if (symbol.includes('ETH')) return 'text-blue-500';
    if (symbol.includes('SOL')) return 'text-purple-500';
    return 'text-primary';
  };

  return (
    <tr className="trade-row transition-colors" data-testid={`trade-row-${trade.id}`}>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <span className={cn("text-xs font-bold", getSymbolColor(trade.symbol))}>
              {trade.symbol.slice(0, 3)}
            </span>
          </div>
          <div>
            <div className="font-semibold text-foreground">{trade.symbol}</div>
            <div className="text-xs text-muted-foreground">
              {settings && formatTime(trade.entryTime, {
                timezone: settings.timezone || 'Asia/Dubai',
                timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
              })}
            </div>
          </div>
        </div>
      </td>
      
      <td className="px-4 py-4">
        <Badge className={cn("text-xs font-medium", strategyColors[trade.strategy])}>
          {strategyNames[trade.strategy]}
        </Badge>
      </td>
      
      <td className="px-4 py-4">
        <div className="font-mono text-sm text-foreground">
          ${parseFloat(trade.entryPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </td>
      
      <td className="px-4 py-4">
        <div className="font-mono text-sm text-muted-foreground">
          ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          <span className="text-xs ml-1">(entry)</span>
        </div>
      </td>
      
      <td className="px-4 py-4">
        <div className="font-mono text-sm text-destructive">
          ${parseFloat(trade.stopPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </td>
      
      <td className="px-4 py-4">
        <div className="font-mono text-sm text-success">
          ${parseFloat(trade.targetPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </td>
      
      <td className="px-4 py-4">
        <div className="font-mono text-sm text-muted-foreground">
          —
        </div>
        <div className="text-xs text-muted-foreground">
          Awaiting live price
        </div>
      </td>
      
      <td className="px-4 py-4">
        <div className="font-mono text-xs text-muted-foreground">
          ${parseFloat(trade.entryFee).toFixed(2)}
        </div>
      </td>
      
      <td className="px-4 py-4">
        <Button
          size="sm"
          variant="destructive"
          onClick={handleClose}
          disabled={isClosingTrade}
          className="px-3 py-1 text-xs font-semibold"
          data-testid={`button-close-${trade.id}`}
        >
          Close
        </Button>
      </td>
    </tr>
  );
}

export default function ActiveTrades() {
  const { mode, isPaper } = useTradingMode();
  const { activeTrades: liveActiveTrades, activeTradesLoading: liveActiveTradesLoading } = useTrading();
  
  const { data: paperActiveTrades = [], isLoading: paperActiveTradesLoading } = useQuery<Trade[]>({
    queryKey: ['/api/paper/trades/active'],
    enabled: isPaper,
    refetchInterval: 30000,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });
  
  const activeTrades = isPaper ? paperActiveTrades : liveActiveTrades;
  const activeTradesLoading = isPaper ? paperActiveTradesLoading : liveActiveTradesLoading;

  if (activeTradesLoading && activeTrades.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active Trades</CardTitle>
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section data-testid="active-trades-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Active Trades</h2>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors",
          isPaper ? "bg-blue-500/10" : "bg-primary/10"
        )}>
          {isPaper && <Beaker className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
          {!isPaper && <div className="w-2 h-2 bg-success rounded-full animate-pulse" />}
          <span className={cn(
            "text-sm font-medium",
            isPaper ? "text-blue-600 dark:text-blue-400" : "text-primary"
          )}>
            {isPaper ? 'Simulated' : 'Live Monitoring'}
          </span>
        </div>
      </div>
      
      <Card className="rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          {activeTrades.length === 0 ? (
            <div className="p-8 text-center min-h-[200px] flex items-center justify-center">
              <p className="text-muted-foreground">No active trades</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Pair
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Strategy
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Entry
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Current
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Stop
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    P/L
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Fees
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeTrades.map((trade) => (
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
