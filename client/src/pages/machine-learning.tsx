import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, Download, TrendingUp, TrendingDown, Clock, Target, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";

interface OpenTrade {
  symbol: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  dollarValue: number;    // Directive 11.6H: Fixed USD exposure
  quantity: number;       // Directive 11.6H: Variable coin units
  entryPrice: number;
  exitPrice: null;
  target: number;
  stopLoss: number;
  currentPrice: number | null;
  distanceToTarget: string;
  distanceToStop: string;
  grossProfitValue: number;
  grossProfitPercent: string;
  costs: number;
  netProfitValue: number;
  netProfitPercent: string;
  finalScore: number;
  hybridScore: number;
  expectedEdge: number;
  regimeWeight: number;
  entryTime: string;
  durationOpenMinutes: number;
}

interface ClosedTrade {
  symbol: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  dollarValue: number;    // Directive 11.6H: Fixed USD exposure
  quantity: number;       // Directive 11.6H: Variable coin units
  entryPrice: number;
  exitPrice: number;
  target: number;
  stopLoss: number;
  resultType: string;
  grossProfitValue: number;
  grossProfitPercent: string;
  costs: number;
  netProfitValue: number;
  netProfitPercent: string;
  finalScore: number;
  hybridScore: number;
  expectedEdge: number;
  regimeWeight: number;
  entryTime: string;
  exitTime: string;
  durationMinutes: number;
}

const getRegimeBadgeColor = (regime: string) => {
  if (regime.includes('BULL_STABLE')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (regime.includes('BULL_VOLATILE')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (regime.includes('BEAR_STABLE')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (regime.includes('BEAR_VOLATILE')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  if (regime === 'EXTREME_NOISE') return 'bg-red-600/30 text-red-300 border-red-600/50';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

const getPoolBadgeColor = (pool: string) => {
  if (pool === 'IDEAL') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (pool === 'ROTATIONAL') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

const getResultBadgeColor = (result: string) => {
  if (result.includes('TARGET') || result.includes('PROFIT')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (result.includes('STOP')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

const getProfitColor = (value: number) => {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const handleTopScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  return (
    <div className="relative">
      <div 
        ref={topScrollRef}
        className="overflow-x-auto scrollbar-thin mb-1"
        onScroll={handleTopScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div style={{ width: '1800px', height: '1px' }} />
      </div>
      <div 
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <table className="w-full min-w-[1800px] text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Symbol</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Regime</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Strategy</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pool</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">$ Value / Qty</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Entry/Current</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dist. T/S</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Gross P/L</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Net P/L</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Final/Hybrid</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Edge</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Regime Wt</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entry Time</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Duration</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-3 py-8 text-center text-muted-foreground">
                  No open simulated trades
                </td>
              </tr>
            ) : (
              trades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.entryTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{trade.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                      {trade.regime}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{trade.strategy}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs">{trade.signalType}</span>
                      <span className="text-xs text-muted-foreground">{trade.patternType || '-'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getPoolBadgeColor(trade.pool)}`}>
                      {trade.pool}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-blue-400">${trade.dollarValue?.toFixed(2) ?? '0.00'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.quantity?.toFixed(4) ?? '0'} units</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
                      <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-green-400">${trade.target.toFixed(4)}</span>
                      <span className="font-mono text-xs text-red-400">${trade.stopLoss.toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-green-400">${(trade.target - trade.entryPrice).toFixed(4)}</span>
                      <span className="font-mono text-xs text-red-400">${(trade.entryPrice - trade.stopLoss).toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {trade.currentPrice !== null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                          ${trade.grossProfitValue.toFixed(2)}
                        </span>
                        <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                          {trade.grossProfitPercent}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    ${trade.costs.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {trade.currentPrice !== null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
                          ${trade.netProfitValue.toFixed(2)}
                        </span>
                        <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                          {trade.netProfitPercent}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{(trade.finalScore * 100).toFixed(0)}%</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.hybridScore.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">
                    {format(new Date(trade.entryTime), 'MM/dd HH:mm')}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {formatDuration(trade.durationOpenMinutes)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);

  const handleMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const handleTopScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  return (
    <div className="relative">
      <div 
        ref={topScrollRef}
        className="overflow-x-auto scrollbar-thin mb-1"
        onScroll={handleTopScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div style={{ width: '1800px', height: '1px' }} />
      </div>
      <div 
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        <table className="w-full min-w-[1800px] text-sm">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Symbol</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Regime</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Strategy</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pool</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">$ Value / Qty</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Entry/Exit</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground">Result</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Gross P/L</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Net P/L</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Final/Hybrid</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Edge</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Regime Wt</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entry/Exit Time</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Duration</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-3 py-8 text-center text-muted-foreground">
                  No closed trades in the last 7 days
                </td>
              </tr>
            ) : (
              trades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.exitTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{trade.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                      {trade.regime}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{trade.strategy}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs">{trade.signalType}</span>
                      <span className="text-xs text-muted-foreground">{trade.patternType || '-'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getPoolBadgeColor(trade.pool)}`}>
                      {trade.pool}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-blue-400">${trade.dollarValue?.toFixed(2) ?? '0.00'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.quantity?.toFixed(4) ?? '0'} units</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
                      <span className="font-mono text-xs text-muted-foreground">${trade.exitPrice.toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-green-400">${trade.target.toFixed(4)}</span>
                      <span className="font-mono text-xs text-red-400">${trade.stopLoss.toFixed(4)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className={`text-xs ${getResultBadgeColor(trade.resultType)}`}>
                      {trade.resultType.includes('TARGET') ? (
                        <TrendingUp className="w-3 h-3 mr-1 inline" />
                      ) : trade.resultType.includes('STOP') ? (
                        <TrendingDown className="w-3 h-3 mr-1 inline" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 mr-1 inline" />
                      )}
                      {trade.resultType.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                        ${trade.grossProfitValue.toFixed(2)}
                      </span>
                      <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                        {trade.grossProfitPercent}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    ${trade.costs.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
                        ${trade.netProfitValue.toFixed(2)}
                      </span>
                      <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                        {trade.netProfitPercent}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{trade.finalScore.toFixed(1)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{trade.hybridScore.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{format(new Date(trade.entryTime), 'MM/dd HH:mm')}</span>
                      <span className="text-muted-foreground">{format(new Date(trade.exitTime), 'MM/dd HH:mm')}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {formatDuration(trade.durationMinutes)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MachineLearningPage() {
  const [activeTab, setActiveTab] = useState("open");
  const queryClient = useQueryClient();

  const { data: openData, isLoading: openLoading, refetch: refetchOpen } = useQuery<{
    success: boolean;
    count: number;
    trades: OpenTrade[];
  }>({
    queryKey: ['/api/vts/ml/open'],
    queryFn: () => apiFetch('/api/vts/ml/open'),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: closedData, isLoading: closedLoading, refetch: refetchClosed } = useQuery<{
    success: boolean;
    count: number;
    days: number;
    trades: ClosedTrade[];
  }>({
    queryKey: ['/api/vts/ml/closed'],
    queryFn: () => apiFetch('/api/vts/ml/closed?days=7'),
    refetchInterval: 300000,
    staleTime: 60000,
  });

  const handleExportOpen = async () => {
    try {
      const response = await apiFetch('/api/vts/ml/open/export');
      if (response.success) {
        alert(`Exported ${response.count} open trades to ${response.filepath}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleExportClosed = async () => {
    try {
      const response = await apiFetch('/api/vts/ml/closed/export?days=7');
      if (response.success) {
        alert(`Exported ${response.count} closed trades to ${response.filepath}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const openTrades = openData?.trades || [];
  const closedTrades = closedData?.trades || [];

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Machine Learning</h1>
            <p className="text-muted-foreground">VTS Trade Data for ML Pipeline</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="open" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Open Trades
              <Badge variant="secondary" className="ml-1">{openTrades.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="closed" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Closed Trades (7d)
              <Badge variant="secondary" className="ml-1">{closedTrades.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {activeTab === 'open' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => refetchOpen()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportOpen}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => refetchClosed()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportClosed}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value="open">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Open Simulated Trades</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Auto-refresh: 60s | Max: 300 trades
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {openLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <OpenTradesTable trades={openTrades} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Closed Simulated Trades (Last 7 Days)</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Auto-refresh: 5 min
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {closedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ClosedTradesTable trades={closedTrades} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
