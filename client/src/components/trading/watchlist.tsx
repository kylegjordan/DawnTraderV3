import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/hooks/use-trading";
import { cn } from "@/lib/utils";
import { WatchlistPair } from "@/lib/types";

function WatchlistCard({ pair }: { pair: WatchlistPair }) {
  const currentPrice = parseFloat(pair.currentPrice);
  const vwap = parseFloat(pair.vwap || '0');
  const volume24h = parseFloat(pair.volume24h);
  const dailyRange = parseFloat(pair.dailyRange);
  
  const vwapDiff = vwap > 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;
  const isAboveVWAP = vwapDiff > 0;
  
  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'bg-orange-500/10 text-orange-500';
    if (symbol.includes('ETH')) return 'bg-blue-500/10 text-blue-500';
    if (symbol.includes('SOL')) return 'bg-purple-500/10 text-purple-500';
    if (symbol.includes('AVAX')) return 'bg-red-500/10 text-red-500';
    if (symbol.includes('LINK')) return 'bg-blue-600/10 text-blue-600';
    if (symbol.includes('ATOM')) return 'bg-indigo-500/10 text-indigo-500';
    if (symbol.includes('DOT')) return 'bg-pink-500/10 text-pink-500';
    return 'bg-primary/10 text-primary';
  };

  return (
    <Card 
      className="hover:border-primary/50 transition-colors cursor-pointer"
      data-testid={`watchlist-card-${pair.symbol}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", getSymbolColor(pair.symbol))}>
              <span className="text-xs font-bold">
                {pair.baseCurrency.charAt(0)}
              </span>
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm">{pair.symbol}</div>
              <div className="text-xs text-muted-foreground">
                24h Vol: ${(volume24h / 1000000).toFixed(0)}M
              </div>
            </div>
          </div>
          <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Price</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              ${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">vs VWAP</span>
            <span className={cn(
              "font-mono text-sm font-semibold",
              isAboveVWAP ? "text-success" : "text-destructive"
            )}>
              {vwapDiff >= 0 ? '+' : ''}{vwapDiff.toFixed(1)}%
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Range</span>
            <span className="font-mono text-sm font-semibold text-primary">
              {dailyRange.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Watchlist() {
  const { watchlist, watchlistLoading } = useTrading();
  
  // Show only first 4 pairs for dashboard preview
  const displayPairs = watchlist.slice(0, 4);

  if (watchlistLoading) {
    return (
      <Card className="rounded-xl border shadow-sm" data-testid="watchlist-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardHeader>
        <CardContent className="min-h-[200px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="flex justify-between">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (displayPairs.length === 0) {
    return (
      <Card className="rounded-xl border shadow-sm" data-testid="watchlist-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl sm:text-2xl">
              Symbols That Have Cleared the Screening Process
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Next scan in:</span>
              <span className="font-mono text-sm font-semibold text-primary">--:--</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-[200px]">
          <div className="text-center py-8">
            <p className="text-muted-foreground">No pairs in watchlist</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border shadow-sm" data-testid="watchlist-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl sm:text-2xl">
            Symbols That Have Cleared the Screening Process
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Next scan in:</span>
            <span className="font-mono text-sm font-semibold text-primary" data-testid="text-next-scan-time">
              28:45
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-[200px] max-h-[400px] overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayPairs.map((pair) => (
            <WatchlistCard key={pair.id} pair={pair} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
