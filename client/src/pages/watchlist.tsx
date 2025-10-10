import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/hooks/use-trading";
import { useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Activity, Sparkles, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WatchlistPair } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

function WatchlistCard({ pair, onRemove }: { pair: WatchlistPair; onRemove: (id: string) => void }) {
  const currentPrice = parseFloat(pair.currentPrice);
  const vwap = parseFloat(pair.vwap || '0');
  const sma = parseFloat(pair.sma || '0');
  const volume24h = parseFloat(pair.volume24h);
  const dailyRange = parseFloat(pair.dailyRange);
  
  const vwapDiff = vwap > 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;
  const smaDiff = sma > 0 ? ((currentPrice - sma) / sma) * 100 : 0;
  const isAboveVWAP = vwapDiff > 0;
  const isAboveSMA = smaDiff > 0;
  
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
      className="hover:border-primary/50 transition-colors"
      data-testid={`watchlist-card-${pair.symbol}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", getSymbolColor(pair.symbol))}>
              <span className="text-sm font-bold">
                {pair.baseCurrency.charAt(0)}
              </span>
            </div>
            <div>
              <div className="font-semibold text-foreground">{pair.symbol}</div>
              <div className="text-xs text-muted-foreground">
                {pair.baseCurrency}/{pair.quoteCurrency}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(pair.id)}
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid={`button-remove-${pair.symbol}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Price</span>
            <span className="font-mono text-lg font-semibold text-foreground" data-testid={`text-price-${pair.symbol}`}>
              ${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">vs VWAP</span>
            <div className="flex items-center gap-1">
              {isAboveVWAP ? <TrendingUp className="h-3 w-3 text-success" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
              <span className={cn(
                "font-mono text-sm font-semibold",
                isAboveVWAP ? "text-success" : "text-destructive"
              )}>
                {vwapDiff >= 0 ? '+' : ''}{vwapDiff.toFixed(2)}%
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">vs SMA</span>
            <div className="flex items-center gap-1">
              {isAboveSMA ? <TrendingUp className="h-3 w-3 text-success" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
              <span className={cn(
                "font-mono text-sm font-semibold",
                isAboveSMA ? "text-success" : "text-destructive"
              )}>
                {smaDiff >= 0 ? '+' : ''}{smaDiff.toFixed(2)}%
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">24h Volume</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              ${(volume24h / 1000000).toFixed(1)}M
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Daily Range</span>
            <Badge variant="outline" className="font-mono">
              <Activity className="h-3 w-3 mr-1" />
              {dailyRange.toFixed(1)}%
            </Badge>
          </div>
          
          {/* Asset Capability Info (Milestone 17) - All Kraken assets support fractional trading */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Trading Type</span>
            <Badge variant="secondary" className="text-xs" data-testid={`badge-capability-${pair.symbol}`}>
              Fractional
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WatchlistPage() {
  const { watchlist, watchlistLoading, addToWatchlist, removeFromWatchlist } = useTrading();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState('');
  const [activeTab, setActiveTab] = useState("user-watchlist");

  // Fetch AI opportunities - must be before any early returns to comply with React hooks rules
  const { data: aiOpportunities = [], isLoading: aiOpportunitiesLoading } = useQuery<any[]>({
    queryKey: ['/api/ai-opportunities'],
    refetchInterval: 300000, // 5 minutes
  });

  const handleAddPair = async () => {
    if (!symbol || !baseCurrency || !quoteCurrency) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      await addToWatchlist({
        symbol,
        baseCurrency,
        quoteCurrency,
        volume24h: '0',
        currentPrice: '0',
        dailyRange: '0',
        isActive: true
      });

      toast({
        title: "Pair Added",
        description: `${symbol} has been added to your watchlist`
      });

      setSymbol('');
      setBaseCurrency('');
      setQuoteCurrency('');
      setDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add pair to watchlist",
        variant: "destructive"
      });
    }
  };

  const handleRemovePair = async (id: string) => {
    try {
      await removeFromWatchlist(id);
      toast({
        title: "Pair Removed",
        description: "The pair has been removed from your watchlist"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove pair from watchlist",
        variant: "destructive"
      });
    }
  };

  if (watchlistLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="flex justify-between">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="watchlist-page">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Watchlist</h1>
        <p className="text-muted-foreground mt-1">
          Monitor AI-generated opportunities and your custom trading pairs
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2" data-testid="watchlist-tabs">
          <TabsTrigger value="ai-opportunities" className="flex items-center gap-2" data-testid="tab-ai-opportunities">
            <Sparkles className="w-4 h-4" />
            AI Opportunities
          </TabsTrigger>
          <TabsTrigger value="user-watchlist" className="flex items-center gap-2" data-testid="tab-user-watchlist">
            <List className="w-4 h-4" />
            User Watchlists
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-opportunities" className="mt-6">
          {aiOpportunitiesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : aiOpportunities.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No AI Opportunities</h3>
                <p className="text-muted-foreground">
                  AI-generated trading opportunities will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {aiOpportunities.slice(0, 12).map((opp: any) => (
                <Card 
                  key={opp.id} 
                  className="hover:border-primary/50 transition-colors"
                  data-testid={`ai-opportunity-${opp.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge 
                        variant="outline" 
                        className="text-xs"
                        data-testid={`badge-type-${opp.id}`}
                      >
                        {opp.type}
                      </Badge>
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        data-testid={`badge-probability-${opp.id}`}
                      >
                        {opp.probabilityScore}%
                      </Badge>
                    </div>
                    <h4 
                      className="font-semibold text-lg mb-2"
                      data-testid={`text-symbol-${opp.id}`}
                    >
                      {opp.symbol}
                    </h4>
                    <p 
                      className="text-sm text-muted-foreground line-clamp-2"
                      data-testid={`text-notes-${opp.id}`}
                    >
                      {opp.notes}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="user-watchlist" className="mt-6">
          <div className="mb-4 flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-pair">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Pair
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Trading Pair to Watchlist</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input
                      id="symbol"
                      placeholder="e.g., XXBTZUSD"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      data-testid="input-symbol"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="baseCurrency">Base Currency</Label>
                    <Input
                      id="baseCurrency"
                      placeholder="e.g., BTC"
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                      data-testid="input-base-currency"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quoteCurrency">Quote Currency</Label>
                    <Input
                      id="quoteCurrency"
                      placeholder="e.g., USD"
                      value={quoteCurrency}
                      onChange={(e) => setQuoteCurrency(e.target.value)}
                      data-testid="input-quote-currency"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddPair} data-testid="button-confirm-add">
                    Add to Watchlist
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {watchlist.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Pairs in Watchlist</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add trading pairs to monitor their performance and receive signals
                </p>
                <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-pair">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Pair
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {watchlist.map((pair) => (
                <WatchlistCard key={pair.id} pair={pair} onRemove={handleRemovePair} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
