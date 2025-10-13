import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, TrendingUp, DollarSign, Activity, BarChart3, Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface SymbolData {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  vwap?: number;
}

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Placeholder for future API integration
  const { data: searchResults, isLoading } = useQuery<SymbolData[]>({
    queryKey: ['/api/symbols/search', searchQuery],
    enabled: searchQuery.length > 2,
  });

  const { data: symbolDetails } = useQuery<SymbolData>({
    queryKey: ['/api/symbols/details', selectedSymbol],
    enabled: !!selectedSymbol,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is triggered automatically via useQuery
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Search and Analysis</h1>
        <p className="text-muted-foreground">
          Search for trading symbols and analyze market data
        </p>
      </div>

      {/* Search Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SearchIcon className="w-5 h-5" />
            Symbol Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              type="text"
              placeholder="Search for symbols (e.g., BTC, ETH, SOL)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
              data-testid="input-symbol-search"
            />
            <Button type="submit" data-testid="button-search">
              <SearchIcon className="w-4 h-4 mr-2" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchQuery.length > 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map((symbol) => (
                  <div
                    key={symbol.symbol}
                    className="p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => setSelectedSymbol(symbol.symbol)}
                    data-testid={`symbol-result-${symbol.symbol}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{symbol.symbol}</div>
                      <div className="text-sm text-muted-foreground">
                        ${symbol.price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No symbols found. Try a different search term.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Symbol Analysis */}
      {selectedSymbol && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Symbol Analysis: {selectedSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  Current Price
                </div>
                <div className="text-2xl font-bold">
                  {symbolDetails?.price ? `$${symbolDetails.price.toLocaleString()}` : '-'}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Activity className="w-4 h-4" />
                  24h Volume
                </div>
                <div className="text-2xl font-bold">
                  {symbolDetails?.volume24h ? `$${(symbolDetails.volume24h / 1000000).toFixed(1)}M` : '-'}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  Daily Range
                </div>
                <div className="text-2xl font-bold">
                  {symbolDetails?.dailyRange ? `${symbolDetails.dailyRange.toFixed(2)}%` : '-'}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <BarChart3 className="w-4 h-4" />
                  VWAP
                </div>
                <div className="text-2xl font-bold">
                  {symbolDetails?.vwap ? `$${symbolDetails.vwap.toLocaleString()}` : '-'}
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <Brain className="w-4 h-4 inline mr-2" />
                AI analysis for this symbol will be available here. This includes strategy recommendations, risk assessment, and entry/exit suggestions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {searchQuery.length <= 2 && !selectedSymbol && (
        <Card>
          <CardContent className="py-12 text-center">
            <SearchIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Search for Symbols</h3>
            <p className="text-muted-foreground">
              Enter a symbol name or ticker to search and analyze trading opportunities
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
