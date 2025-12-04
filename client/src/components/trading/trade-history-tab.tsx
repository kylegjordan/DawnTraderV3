import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Shield, 
  Clock,
  BarChart3,
  Award,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

const strategyColors: Record<string, string> = {
  vwap_pullback: "bg-primary/10 text-primary",
  abcd_long: "bg-chart-2/10 text-chart-2",
  sma_trend_ride: "bg-chart-3/10 text-chart-3",
  vwap_bounce: "bg-blue-500/10 text-blue-600",
  dhma: "bg-purple-500/10 text-purple-600",
  breakout: "bg-orange-500/10 text-orange-600",
  mean_reversion: "bg-green-500/10 text-green-600",
  range_trading: "bg-cyan-500/10 text-cyan-600",
  liquidity_trap: "bg-rose-500/10 text-rose-600"
};

const strategyNames: Record<string, string> = {
  vwap_pullback: "VWAP Pullback",
  abcd_long: "ABCD Long",
  sma_trend_ride: "SMA Trend Ride",
  vwap_bounce: "VWAP Bounce",
  dhma: "DHMA",
  breakout: "Breakout",
  mean_reversion: "Mean Reversion",
  range_trading: "Range Trading",
  liquidity_trap: "Liquidity Trap"
};

// All 9 strategies that should always be displayed
const ALL_STRATEGIES = [
  'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'vwap_bounce', 
  'dhma', 'breakout', 'mean_reversion', 'range_trading', 'liquidity_trap'
];

interface Analytics {
  totalOpened: number;
  closedAtTP: { count: number; percent: number };
  closedAtSL: { count: number; percent: number };
  closedManually: { count: number; percent: number };
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  netPnl: number;
  netPnlPercent: number;
  avgProfitPercent: number; // B2: New - Avg Profit % per Trade
  avgDailyProfitPercent: number; // B2: New - Avg Daily Profit %
  avgHoldingTime: number;
  medianHoldingTime: number;
  profitFactor: number;
  byStrategy: Record<string, { count: number; pnl: number; winRate: number }>;
  largestWinner: { symbol: string; pnl: number; strategy: string } | null;
  largestLoser: { symbol: string; pnl: number; strategy: string } | null;
}

interface AnalyticsResponse {
  ok: boolean;
  range: string;
  analytics: Analytics;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function MetricCard({ 
  title, 
  value, 
  subValue, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  subValue?: string; 
  icon?: any;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{title}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className={cn(
        "text-xl font-bold",
        trend === 'up' && "text-green-600",
        trend === 'down' && "text-red-600"
      )}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-muted-foreground mt-1">{subValue}</div>
      )}
    </div>
  );
}

// Default empty analytics to prevent flickering
const EMPTY_ANALYTICS: Analytics = {
  totalOpened: 0,
  closedAtTP: { count: 0, percent: 0 },
  closedAtSL: { count: 0, percent: 0 },
  closedManually: { count: 0, percent: 0 },
  winRate: 0,
  avgProfit: 0,
  avgLoss: 0,
  netPnl: 0,
  netPnlPercent: 0,
  avgProfitPercent: 0,
  avgDailyProfitPercent: 0,
  avgHoldingTime: 0,
  medianHoldingTime: 0,
  profitFactor: 0,
  byStrategy: {},
  largestWinner: null,
  largestLoser: null
};

function AnalyticsPanel({ range }: { range: string }) {
  const { isPaper } = useTradingMode();
  
  // Use ref to cache last known analytics to prevent flickering during refetch
  const cachedAnalyticsRef = useRef<Analytics>(EMPTY_ANALYTICS);
  const [displayAnalytics, setDisplayAnalytics] = useState<Analytics>(EMPTY_ANALYTICS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { data, isLoading, isFetching, refetch } = useQuery<AnalyticsResponse>({
    queryKey: ['/api/paper-sim/trades/analytics', range],
    queryFn: async () => {
      const response = await fetch(`/api/paper-sim/trades/analytics?range=${range}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    enabled: isPaper,
    refetchInterval: 30000,
    staleTime: 15000,
    gcTime: 60000, // Keep cached data for 60 seconds
  });

  // Update cached analytics only when we have new valid data
  useEffect(() => {
    if (data?.analytics) {
      cachedAnalyticsRef.current = data.analytics;
      setDisplayAnalytics(data.analytics);
    }
  }, [data]);
  
  // Track refreshing state separately
  useEffect(() => {
    setIsRefreshing(isFetching);
  }, [isFetching]);

  if (!isPaper) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6 text-center text-muted-foreground">
          Analytics available for Paper Trading mode only
        </CardContent>
      </Card>
    );
  }

  // Only show loading skeleton on initial load when we have no cached data
  if (isLoading && !data && displayAnalytics === EMPTY_ANALYTICS) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Always use displayAnalytics which is cached and stable
  const analytics = displayAnalytics;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {range === 'session' ? 'Session' : range === '24h' ? '24 Hour' : range === '7d' ? '7 Day' : range === '30d' ? '30 Day' : range} Performance Analytics
            {isRefreshing && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isRefreshing}>
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Tier 1: Primary Indicators */}
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Primary Indicators</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <MetricCard 
              title="Total Trades" 
              value={analytics.totalOpened}
              icon={BarChart3}
            />
            <MetricCard 
              title="Win Rate" 
              value={`${analytics.winRate.toFixed(1)}%`}
              trend={analytics.winRate >= 50 ? 'up' : 'down'}
            />
            <MetricCard 
              title="Net P/L" 
              value={`${analytics.netPnl >= 0 ? '+' : ''}$${analytics.netPnl.toFixed(2)}`}
              trend={analytics.netPnl >= 0 ? 'up' : 'down'}
            />
            <MetricCard 
              title="Avg Profit %" 
              value={`${(analytics.avgProfitPercent || 0) >= 0 ? '+' : ''}${(analytics.avgProfitPercent || 0).toFixed(2)}%`}
              subValue="per trade"
              trend={(analytics.avgProfitPercent || 0) >= 0 ? 'up' : 'down'}
            />
            <MetricCard 
              title="Avg Daily %" 
              value={`${(analytics.avgDailyProfitPercent || 0) >= 0 ? '+' : ''}${(analytics.avgDailyProfitPercent || 0).toFixed(2)}%`}
              subValue="daily profit"
              trend={(analytics.avgDailyProfitPercent || 0) >= 0 ? 'up' : 'down'}
            />
            <MetricCard 
              title="Profit Factor" 
              value={analytics.profitFactor.toFixed(2)}
              trend={analytics.profitFactor >= 1 ? 'up' : 'down'}
            />
            <MetricCard 
              title="Avg Hold" 
              value={formatDuration(analytics.avgHoldingTime)}
              icon={Clock}
            />
            <MetricCard 
              title="Median Hold" 
              value={formatDuration(analytics.medianHoldingTime)}
              icon={Clock}
            />
          </div>
        </div>

        {/* Tier 2: Secondary Indicators */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Secondary Indicators</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard 
              title="Closed at TP" 
              value={analytics.closedAtTP.count}
              subValue={`${analytics.closedAtTP.percent.toFixed(1)}%`}
              icon={Target}
              trend="up"
            />
            <MetricCard 
              title="Closed at SL" 
              value={analytics.closedAtSL.count}
              subValue={`${analytics.closedAtSL.percent.toFixed(1)}%`}
              icon={Shield}
              trend="down"
            />
            <MetricCard 
              title="Manual Close" 
              value={analytics.closedManually.count}
              subValue={`${analytics.closedManually.percent.toFixed(1)}%`}
            />
            <MetricCard 
              title="Avg Profit $" 
              value={`+$${analytics.avgProfit.toFixed(2)}`}
              icon={TrendingUp}
              trend="up"
            />
            <MetricCard 
              title="Avg Loss $" 
              value={`-$${analytics.avgLoss.toFixed(2)}`}
              icon={TrendingDown}
              trend="down"
            />
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Best / Worst
              </div>
              {analytics.largestWinner && (
                <div className="flex items-center gap-1 text-green-600 text-xs">
                  <Award className="w-3 h-3" />
                  <span className="font-medium truncate">{analytics.largestWinner.symbol}</span>
                  <span className="font-mono">+${analytics.largestWinner.pnl.toFixed(2)}</span>
                </div>
              )}
              {analytics.largestLoser && (
                <div className="flex items-center gap-1 text-red-600 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="font-medium truncate">{analytics.largestLoser.symbol}</span>
                  <span className="font-mono">${analytics.largestLoser.pnl.toFixed(2)}</span>
                </div>
              )}
              {!analytics.largestWinner && !analytics.largestLoser && (
                <span className="text-xs text-muted-foreground">No trades yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Strategy Performance - Always show all 9 strategies */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Performance by Strategy
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_STRATEGIES.map((strategy) => {
              const stats = analytics.byStrategy[strategy] || { count: 0, pnl: 0, winRate: 0 };
              return (
                <div key={strategy} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs", strategyColors[strategy] || "bg-gray-500/10")}>
                      {strategyNames[strategy] || strategy}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {stats.count} trades
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "font-mono text-sm font-semibold",
                      stats.pnl > 0 ? "text-green-600" : stats.pnl < 0 ? "text-red-600" : "text-muted-foreground"
                    )}>
                      {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stats.winRate.toFixed(0)}% WR
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TradeHistoryTab() {
  const { isPaper } = useTradingMode();
  const [analyticsRange, setAnalyticsRange] = useState('session'); // B2: Default to "Since Last Simulation Start"
  const [filters, setFilters] = useState({
    symbol: '',
    strategy: 'all',
    status: 'closed',
    dateFrom: '',
    dateTo: ''
  });
  
  const { data: tradesData = [], isLoading, isFetching } = useQuery<any[]>({
    queryKey: ['/api/paper-sim/trades'],
    enabled: isPaper,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const filteredTrades = tradesData.filter((trade: any) => {
    if (filters.symbol && !trade.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) {
      return false;
    }
    if (filters.strategy && filters.strategy !== 'all' && trade.strategyName !== filters.strategy) {
      return false;
    }
    return true;
  });

  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'text-orange-500';
    if (symbol.includes('ETH')) return 'text-blue-500';
    return 'text-primary';
  };

  // Determine if we should show loading state for trades table only (not the whole page)
  const isTradesLoading = isLoading && tradesData.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Time Range:</span>
        <Select value={analyticsRange} onValueChange={setAnalyticsRange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="session">Since Last Simulation</SelectItem>
            <SelectItem value="1h">Last 1 Hour</SelectItem>
            <SelectItem value="24h">Last 24 Hours</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AnalyticsPanel range={analyticsRange} />

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-normal mb-2">
              Historical trade data for Paper Trading mode
            </div>
            <div className="text-2xl">Trade Filters</div>
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
                <SelectItem value="vwap_bounce">VWAP Bounce</SelectItem>
                <SelectItem value="dhma">DHMA</SelectItem>
                <SelectItem value="breakout">Breakout</SelectItem>
                <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                <SelectItem value="range_trading">Range Trading</SelectItem>
                <SelectItem value="liquidity_trap">Liquidity Trap</SelectItem>
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
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Trade History</span>
              {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <span className="text-sm font-normal text-muted-foreground">
              {filteredTrades.length} trade{filteredTrades.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isTradesLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No trades match your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Opened At</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Closed At</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Symbol</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Strategy</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Entry</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Exit</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">Close Reason</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">P/L</th>
                    <th className="text-left p-3 text-sm font-semibold text-muted-foreground">P/L %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTrades.map((trade: any) => {
                    const pnl = parseFloat(trade.pnl || '0');
                    const pnlPercent = parseFloat(trade.pnlPercent || '0');
                    const isProfit = pnl > 0;
                    
                    // B2: Format with full timestamps
                    const formatTimestamp = (dateStr: string | null) => {
                      if (!dateStr) return '-';
                      const d = new Date(dateStr);
                      return d.toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      });
                    };
                    
                    return (
                      <tr key={trade.id} className="hover:bg-muted/50" data-testid={`trade-history-${trade.id}`}>
                        <td className="p-3 text-xs font-mono">
                          {formatTimestamp(trade.openedAt)}
                        </td>
                        <td className="p-3 text-xs font-mono">
                          {formatTimestamp(trade.closedAt)}
                        </td>
                        
                        <td className="p-3">
                          <span className={cn("text-sm font-semibold", getSymbolColor(trade.symbol))}>
                            {trade.symbol}
                          </span>
                        </td>
                        
                        <td className="p-3">
                          <Badge className={cn("text-xs", strategyColors[trade.strategyName as keyof typeof strategyColors] || "bg-muted/10")}>
                            {strategyNames[trade.strategyName as keyof typeof strategyNames] || trade.strategyName}
                          </Badge>
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.entryPrice ? `$${parseFloat(trade.entryPrice).toFixed(4)}` : '-'}
                        </td>
                        
                        <td className="p-3 font-mono text-sm">
                          {trade.exitPrice ? `$${parseFloat(trade.exitPrice).toFixed(4)}` : '-'}
                        </td>
                        
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {trade.closeReason === 'target_hit' ? 'Target Hit' :
                             trade.closeReason === 'stop_hit' ? 'Stop Hit' :
                             trade.closeReason === 'manual_close' ? 'Manual' :
                             trade.closeReason || 'Unknown'}
                          </Badge>
                        </td>
                        
                        <td className="p-3">
                          <div className={cn("font-mono text-sm font-semibold", isProfit ? "text-green-600" : "text-red-600")}>
                            {isProfit ? '+' : ''}${pnl.toFixed(2)}
                          </div>
                        </td>
                        
                        <td className="p-3">
                          <div className={cn("font-mono text-sm font-semibold", isProfit ? "text-green-600" : "text-red-600")}>
                            {isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%
                          </div>
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
