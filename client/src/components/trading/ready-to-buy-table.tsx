import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TradingSignal {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  strategy: string;
  confidence: number;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
  vwap: number | null;
  volume24h: number | null;
  dailyRange: number | null;
  status: 'active' | 'expired' | 'executed';
  detectedAt: string;
}

interface TradingSignalsResponse {
  signals: TradingSignal[];
  timestamp: string;
}

type SortField = 'symbol' | 'volume' | 'price' | 'vwap' | 'range' | 'strategy' | 'entry' | 'target' | 'stop' | 'confidence';
type SortDirection = 'asc' | 'desc';

export default function ReadyToBuyTable() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, error, refetch } = useQuery<TradingSignal[]>({
    queryKey: ['/api/trading-signals'],
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (data) {
      setLastUpdated(new Date());
    }
  }, [data]);

  const handleRefresh = async () => {
    await refetch();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedSignals = data ? [...data].sort((a, b) => {
    let aValue: number | string;
    let bValue: number | string;

    switch (sortField) {
      case 'symbol':
        aValue = a.symbol;
        bValue = b.symbol;
        break;
      case 'volume':
        aValue = a.volume24h || 0;
        bValue = b.volume24h || 0;
        break;
      case 'price':
        aValue = a.currentPrice;
        bValue = b.currentPrice;
        break;
      case 'vwap':
        aValue = a.vwap || 0;
        bValue = b.vwap || 0;
        break;
      case 'range':
        aValue = a.dailyRange || 0;
        bValue = b.dailyRange || 0;
        break;
      case 'strategy':
        aValue = a.strategy;
        bValue = b.strategy;
        break;
      case 'entry':
        aValue = a.entryPrice;
        bValue = b.entryPrice;
        break;
      case 'target':
        aValue = a.targetPrice;
        bValue = b.targetPrice;
        break;
      case 'stop':
        aValue = a.stopPrice;
        bValue = b.stopPrice;
        break;
      case 'confidence':
        aValue = a.confidence;
        bValue = b.confidence;
        break;
      default:
        aValue = 0;
        bValue = 0;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc' 
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  }) : [];

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th 
      className="text-left py-2 px-3 font-medium cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => handleSort(field)}
      data-testid={`header-${field}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn(
          "w-3 h-3 transition-opacity",
          sortField === field ? "opacity-100" : "opacity-30"
        )} />
      </div>
    </th>
  );

  const formatStrategy = (strategy: string) => {
    const strategyMap: Record<string, string> = {
      'vwap_pullback': 'VWAP Pullback',
      'abcd_long': 'ABCD Long',
      'sma_trend_ride': 'SMA Trend',
      'breakout': 'Breakout',
      'mean_reversion': 'Mean Reversion',
      'range_trading': 'Range Trading',
      'vwap_bounce': 'VWAP Bounce',
      'liquidity_trap': 'Liquidity Trap'
    };
    return strategyMap[strategy] || strategy;
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Failed to load trading signals: {(error as Error).message}</p>
          <Button onClick={handleRefresh} variant="outline" className="mt-4" data-testid="button-refresh-signals">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Ready-to-Buy Signals ({sortedSignals.length})
          </CardTitle>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-last-updated">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="sm"
          disabled={isLoading}
          data-testid="button-refresh-signals"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading trading signals...</p>
          </div>
        ) : sortedSignals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="table-trading-signals">
              <thead>
                <tr className="border-b">
                  <SortHeader field="symbol" label="Symbol" />
                  <th className="text-left py-2 px-3 font-medium">Name</th>
                  <SortHeader field="volume" label="24h Volume" />
                  <SortHeader field="price" label="Price" />
                  <SortHeader field="vwap" label="VWAP" />
                  <SortHeader field="range" label="Range %" />
                  <SortHeader field="strategy" label="Strategy" />
                  <SortHeader field="entry" label="Entry" />
                  <SortHeader field="target" label="Target" />
                  <SortHeader field="stop" label="Stop" />
                  <SortHeader field="confidence" label="Confidence" />
                </tr>
              </thead>
              <tbody>
                {sortedSignals.map((signal, index) => {
                  const profitPotential = ((signal.targetPrice - signal.entryPrice) / signal.entryPrice) * 100;
                  const riskPercent = ((signal.entryPrice - signal.stopPrice) / signal.entryPrice) * 100;

                  return (
                    <tr 
                      key={signal.id} 
                      className="border-b hover:bg-muted/50 transition-colors" 
                      data-testid={`row-signal-${index}`}
                    >
                      <td className="py-3 px-3 font-semibold" data-testid={`text-symbol-${index}`}>
                        {signal.symbol}
                      </td>
                      <td className="py-3 px-3 text-sm text-muted-foreground" data-testid={`text-name-${index}`}>
                        {signal.baseCurrency}
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-volume-${index}`}>
                        {signal.volume24h !== null 
                          ? `$${(signal.volume24h / 1000000).toFixed(2)}M`
                          : '—'
                        }
                      </td>
                      <td className="text-right py-3 px-3 font-mono" data-testid={`text-price-${index}`}>
                        ${signal.currentPrice.toFixed(signal.currentPrice < 1 ? 4 : 2)}
                      </td>
                      <td className="text-right py-3 px-3 font-mono" data-testid={`text-vwap-${index}`}>
                        {signal.vwap !== null 
                          ? `$${signal.vwap.toFixed(signal.vwap < 1 ? 4 : 2)}`
                          : '—'
                        }
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-range-${index}`}>
                        {signal.dailyRange !== null 
                          ? `${signal.dailyRange.toFixed(2)}%`
                          : '—'
                        }
                      </td>
                      <td className="py-3 px-3" data-testid={`text-strategy-${index}`}>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {formatStrategy(signal.strategy)}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3 font-mono font-semibold text-success" data-testid={`text-entry-${index}`}>
                        ${signal.entryPrice.toFixed(signal.entryPrice < 1 ? 4 : 2)}
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-target-${index}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-mono">${signal.targetPrice.toFixed(signal.targetPrice < 1 ? 4 : 2)}</span>
                          <span className="text-xs text-success">+{profitPotential.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-stop-${index}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-mono">${signal.stopPrice.toFixed(signal.stopPrice < 1 ? 4 : 2)}</span>
                          <span className="text-xs text-destructive">-{riskPercent.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-confidence-${index}`}>
                        <span className={cn(
                          "font-semibold",
                          signal.confidence >= 0.8 ? "text-success" : signal.confidence >= 0.6 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {(signal.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Trading Signals</h3>
            <p className="text-muted-foreground">
              No buy signals have been detected yet. Signals will appear here when market conditions match strategy criteria.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
