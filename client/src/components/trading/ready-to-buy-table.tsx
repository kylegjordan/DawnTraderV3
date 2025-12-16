import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, ArrowUpDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TradingSignal {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  strategy: string;
  confidence: number;
  cwqi: number | null;
  ngc: number | null;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
  volume24h: number | null;
  status: 'active' | 'expired' | 'executed';
  detectedAt: string;
  estimatedQuantity?: number;
  estimatedValue?: number;
}

interface TradingSignalsResponse {
  signals: TradingSignal[];
  timestamp: string;
}

type SortField = 'rank' | 'symbol' | 'cwqi' | 'ngc' | 'volume' | 'price' | 'strategy' | 'entry' | 'target' | 'stop' | 'quantity';
type SortDirection = 'asc' | 'desc';

export default function ReadyToBuyTable() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<SortField>('cwqi');
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
      case 'rank':
      case 'cwqi':
        aValue = a.cwqi ?? a.confidence ?? 0;
        bValue = b.cwqi ?? b.confidence ?? 0;
        break;
      case 'ngc':
        aValue = a.ngc ?? 0;
        bValue = b.ngc ?? 0;
        break;
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
      case 'quantity':
        aValue = a.estimatedQuantity || 0;
        bValue = b.estimatedQuantity || 0;
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
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1" data-testid="text-last-updated">
              <Clock className="w-3 h-3" />
              Auto-updates every 30s | Last: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Phase 8.8.4-C.7: Unified RTB pool description */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p>
            <strong>Ready-to-Buy Signals:</strong> Displays all SQE-qualified signals ranked by CWQI 
            (Confidence-Weighted Quality Index). Signals remain in this pool until expiration or 
            promotion to active trades. CWQI combines Confidence, Risk, Expected Return, and Profit Rate.
          </p>
        </div>
        
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
                  <SortHeader field="rank" label="Rank" />
                  <SortHeader field="symbol" label="Symbol" />
                  <SortHeader field="cwqi" label="CWQI" />
                  <SortHeader field="ngc" label="NGC" />
                  <SortHeader field="price" label="Price" />
                  <SortHeader field="entry" label="Entry" />
                  <SortHeader field="target" label="Target" />
                  <SortHeader field="stop" label="Stop" />
                  <SortHeader field="quantity" label="Qty" />
                  <SortHeader field="volume" label="24h Vol" />
                  <SortHeader field="strategy" label="Strategy" />
                </tr>
              </thead>
              <tbody>
                {sortedSignals.map((signal, index) => {
                  const entryPrice = Number(signal.entryPrice);
                  const targetPrice = Number(signal.targetPrice);
                  const stopPrice = Number(signal.stopPrice);
                  const currentPrice = Number(signal.currentPrice);
                  const cwqi = signal.cwqi !== null ? Number(signal.cwqi) : (signal.confidence ?? 0);
                  const ngc = signal.ngc !== null ? Number(signal.ngc) : null;
                  const volume24h = signal.volume24h !== null ? Number(signal.volume24h) : null;
                  
                  const profitPotential = ((targetPrice - entryPrice) / entryPrice) * 100;
                  const riskPercent = ((entryPrice - stopPrice) / entryPrice) * 100;
                  const rank = index + 1;

                  return (
                    <tr 
                      key={signal.id} 
                      className="border-b hover:bg-muted/50 transition-colors" 
                      data-testid={`row-signal-${index}`}
                    >
                      <td className="py-3 px-3 text-center font-semibold" data-testid={`text-rank-${index}`}>
                        <span className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs",
                          rank <= 3 ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                        )}>
                          {rank}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold" data-testid={`text-symbol-${index}`}>
                        {signal.symbol}
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-cwqi-${index}`}>
                        <span className={cn(
                          "font-semibold",
                          cwqi >= 0.8 ? "text-success" : cwqi >= 0.5 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {!isNaN(cwqi) ? cwqi.toFixed(4) : '—'}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-ngc-${index}`}>
                        <span className={cn(
                          "font-semibold",
                          (ngc ?? 0) >= 0.8 ? "text-success" : (ngc ?? 0) >= 0.5 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {ngc !== null && !isNaN(ngc) ? ngc.toFixed(4) : '—'}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3 font-mono" data-testid={`text-price-${index}`}>
                        {!isNaN(currentPrice) 
                          ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}`
                          : '—'
                        }
                      </td>
                      <td className="text-right py-3 px-3 font-mono font-semibold text-success" data-testid={`text-entry-${index}`}>
                        {!isNaN(entryPrice) 
                          ? `$${entryPrice.toFixed(entryPrice < 1 ? 4 : 2)}`
                          : '—'
                        }
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-target-${index}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-mono">
                            {!isNaN(targetPrice) 
                              ? `$${targetPrice.toFixed(targetPrice < 1 ? 4 : 2)}`
                              : '—'
                            }
                          </span>
                          {!isNaN(profitPotential) && (
                            <span className="text-xs text-success">+{profitPotential.toFixed(1)}%</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-stop-${index}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-mono">
                            {!isNaN(stopPrice) 
                              ? `$${stopPrice.toFixed(stopPrice < 1 ? 4 : 2)}`
                              : '—'
                            }
                          </span>
                          {!isNaN(riskPercent) && (
                            <span className="text-xs text-destructive">-{riskPercent.toFixed(1)}%</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-quantity-${index}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-mono">
                            {signal.estimatedQuantity !== undefined && !isNaN(signal.estimatedQuantity)
                              ? new Intl.NumberFormat('en-US', { 
                                  minimumFractionDigits: signal.estimatedQuantity < 1 ? 6 : 2,
                                  maximumFractionDigits: signal.estimatedQuantity < 1 ? 6 : 2
                                }).format(signal.estimatedQuantity)
                              : '—'
                            }
                          </span>
                          {signal.estimatedValue !== undefined && !isNaN(signal.estimatedValue) && (
                            <span className="text-xs text-muted-foreground">
                              ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(signal.estimatedValue)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-volume-${index}`}>
                        {volume24h !== null && !isNaN(volume24h)
                          ? volume24h >= 1000000 
                            ? `$${(volume24h / 1000000).toFixed(2)}M`
                            : `$${(volume24h / 1000).toFixed(0)}K`
                          : '—'
                        }
                      </td>
                      <td className="py-3 px-3" data-testid={`text-strategy-${index}`}>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {formatStrategy(signal.strategy)}
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
