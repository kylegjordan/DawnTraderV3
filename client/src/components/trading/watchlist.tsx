import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrading } from "@/hooks/use-trading";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { WatchlistPair } from "@/lib/types";

function WatchlistCard({ pair }: { pair: WatchlistPair }) {
  // Phase 27.F.19b: Map real API fields, handle missing values with "—"
  const currentPrice = pair.currentPrice && !isNaN(parseFloat(pair.currentPrice)) 
    ? parseFloat(pair.currentPrice) 
    : null;
  const vwap = pair.vwap && !isNaN(parseFloat(pair.vwap)) 
    ? parseFloat(pair.vwap) 
    : null;
  const volume24h = pair.volume24h && !isNaN(parseFloat(pair.volume24h)) 
    ? parseFloat(pair.volume24h) 
    : null;
  const dailyRange = pair.dailyRange && !isNaN(parseFloat(pair.dailyRange)) 
    ? parseFloat(pair.dailyRange) 
    : null;
  
  const vwapDiff = (currentPrice !== null && vwap !== null && vwap > 0) 
    ? ((currentPrice - vwap) / vwap) * 100 
    : null;
  const isAboveVWAP = vwapDiff !== null && vwapDiff > 0;
  
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
                24h Vol: {volume24h !== null ? `$${(volume24h / 1000000).toFixed(0)}M` : '—'}
              </div>
            </div>
          </div>
          <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Price</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {currentPrice !== null ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}` : '—'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">vs VWAP</span>
            <span className={cn(
              "font-mono text-sm font-semibold",
              vwapDiff !== null ? (isAboveVWAP ? "text-success" : "text-destructive") : "text-muted-foreground"
            )}>
              {vwapDiff !== null ? `${vwapDiff >= 0 ? '+' : ''}${vwapDiff.toFixed(1)}%` : '—'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Range</span>
            <span className="font-mono text-sm font-semibold text-primary">
              {dailyRange !== null ? `${dailyRange.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Watchlist() {
  const { watchlist, watchlistLoading } = useTrading();
  const [countdown, setCountdown] = useState<string>('—:—');
  
  // Phase 27.F.19b: Fetch diagnostics for nextScanAt
  const { data: diagnosticsData } = useQuery<{ nextScanAt?: string }>({
    queryKey: ['/api/active-engine/diagnostics/scan?mode=paper&limit=10&trace=false&strategies=false'],
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 10 * 1000, // Auto-refresh every 10 seconds
  });
  
  // Phase 27.F.19b: Countdown timer using nextScanAt
  useEffect(() => {
    const updateCountdown = () => {
      if (!diagnosticsData?.nextScanAt) {
        setCountdown('—:—');
        return;
      }
      
      const now = Date.now();
      const nextScan = new Date(diagnosticsData.nextScanAt).getTime();
      const diff = Math.max(0, nextScan - now);
      
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      setCountdown(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    
    // Update immediately
    updateCountdown();
    
    // Then update every second
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [diagnosticsData?.nextScanAt]);
  
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
              Ready to Buy
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Next scan in:</span>
              <span className="font-mono text-sm font-semibold text-primary">{countdown}</span>
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
            Ready to Buy
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Next scan in:</span>
            <span className="font-mono text-sm font-semibold text-primary" data-testid="text-next-scan-time">
              {countdown}
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
