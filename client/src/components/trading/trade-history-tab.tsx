import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

export function TradeHistoryTab() {
  const [filters, setFilters] = useState({
    symbol: '',
    strategy: 'all',
    status: 'closed',
    dateFrom: '',
    dateTo: ''
  });
  
  const { data: trades = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/trades'],
    refetchInterval: 30000
  });

  const filteredTrades = trades.filter((trade: any) => {
    if (filters.symbol && !trade.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) {
      return false;
    }
    if (filters.strategy && filters.strategy !== 'all' && trade.strategy !== filters.strategy) {
      return false;
    }
    return true;
  });

  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'text-orange-500';
    if (symbol.includes('ETH')) return 'text-blue-500';
    return 'text-primary';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-normal mb-2">
              This tab displays historical trade data for Paper and Live modes.
            </div>
            <div className="text-2xl">Filters</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="Search symbol..."
              value={filters.symbol}
              onChange={(e) => setFilters(prev => ({ ...prev, symbol: e.target.value }))}
              data-testid="input-symbol-filter"
            />
            
            <Select 
              value={filters.strategy} 
              onValueChange={(value) => setFilters(prev => ({ ...prev, strategy: value }))}
            >
              <SelectTrigger data-testid="select-strategy-filter">
                <SelectValue placeholder="All strategies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strategies</SelectItem>
                <SelectItem value="vwap_pullback">VWAP Pullback</SelectItem>
                <SelectItem value="abcd_long">ABCD Long</SelectItem>
                <SelectItem value="sma_trend_ride">SMA Trend Ride</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              data-testid="input-date-from"
            />
            
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              data-testid="input-date-to"
            />
            
            <Button
              variant="outline"
              onClick={() => setFilters({
                symbol: '',
                strategy: 'all',
                status: 'closed',
                dateFrom: '',
                dateTo: ''
              })}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {filteredTrades.length} Trade{filteredTrades.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No trades match your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Date</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Symbol</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Strategy</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Entry</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Exit</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Quantity</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">P/L</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">R</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Fees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTrades.map((trade: any) => {
                    const realizedPL = parseFloat(trade.realizedPL || '0');
                    const realizedPLR = parseFloat(trade.realizedPLR || '0');
                    const isProfit = realizedPL > 0;
                    const totalFees = parseFloat(trade.entryFee || '0') + parseFloat(trade.exitFee || '0');
                    
                    return (
                      <tr key={trade.id} className="hover:bg-muted/50" data-testid={`trade-history-${trade.id}`}>
                        <td className="p-3 text-sm">
                          {trade.exitTime ? 
                            new Date(trade.exitTime).toLocaleDateString() : 
                            new Date(trade.entryTime).toLocaleDateString()
                          }
                        </td>
                        
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-semibold", getSymbolColor(trade.symbol))}>
                              {trade.symbol}
                            </span>
                            <Badge variant={trade.mode === 'live' ? 'default' : 'secondary'} className="text-xs">
                              {trade.mode}
                            </Badge>
                          </div>
                        </td>
                        
                        <td className="p-3">
                          <Badge className={cn("text-xs", strategyColors[trade.strategy as keyof typeof strategyColors] || "bg-muted/10")}>
                            {strategyNames[trade.strategy as keyof typeof strategyNames] || trade.strategy}
                          </Badge>
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.entryPrice ? `$${parseFloat(trade.entryPrice).toFixed(4)}` : '-'}
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.exitPrice ? `$${parseFloat(trade.exitPrice).toFixed(4)}` : '-'}
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.quantity ? parseFloat(trade.quantity).toLocaleString() : '-'}
                        </td>
                        
                        <td className="p-3">
                          <div className={cn("font-mono text-sm font-semibold", isProfit ? "text-success" : "text-destructive")}>
                            {isProfit ? '+' : ''}${realizedPL.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {trade.entryPrice && trade.quantity ? 
                              ((realizedPL / (parseFloat(trade.entryPrice) * parseFloat(trade.quantity))) * 100).toFixed(2) : '0.00'}%
                          </div>
                        </td>
                        
                        <td className="p-3">
                          <div className={cn("font-mono text-sm font-semibold", realizedPLR >= 0 ? "text-success" : "text-destructive")}>
                            {realizedPLR >= 0 ? '+' : ''}{realizedPLR.toFixed(2)}R
                          </div>
                        </td>
                        
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          ${totalFees.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
