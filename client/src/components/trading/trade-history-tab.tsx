import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatEntryFeeMode } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { apiFetch } from "@/lib/api";
import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
import { AssetClassBadge } from "@/components/ui/asset-class-badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Shield, 
  Clock,
  BarChart3,
  Award,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";

function formatNumber(value: number | string, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Phase 8.8.3-C2: Dual scroll bar component - provides scroll at top and bottom
function DualScrollTable({ children }: { children: React.ReactNode }) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  
  useEffect(() => {
    if (contentRef.current) {
      setScrollWidth(contentRef.current.scrollWidth);
    }
  }, [children]);
  
  const syncScroll = useCallback((source: 'top' | 'bottom') => {
    if (!topScrollRef.current || !bottomScrollRef.current) return;
    const scrollLeft = source === 'top' 
      ? topScrollRef.current.scrollLeft 
      : bottomScrollRef.current.scrollLeft;
    topScrollRef.current.scrollLeft = scrollLeft;
    bottomScrollRef.current.scrollLeft = scrollLeft;
  }, []);
  
  return (
    <div>
      {/* Top scroll bar */}
      <div 
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden h-3 border-b border-border/50"
        onScroll={() => syncScroll('top')}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
      {/* Table container */}
      <div 
        ref={(el) => { 
          (bottomScrollRef as any).current = el; 
          (contentRef as any).current = el;
        }}
        className="overflow-x-auto"
        onScroll={() => syncScroll('bottom')}
      >
        {children}
      </div>
    </div>
  );
}

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
  
  // Point 4: Cache analytics data in a stable React ref - NEVER loses data
  const analyticsRef = useRef<Analytics>(EMPTY_ANALYTICS);
  
  // Point 1: Updated React Query options to prevent data from becoming undefined
  const { data, isFetching, refetch } = useQuery<AnalyticsResponse>({
    queryKey: ['/api/paper-sim/trades/analytics', range],
    queryFn: async () => {
      return await apiFetch(`/api/paper-sim/trades/analytics?range=${range}`);
    },
    enabled: isPaper,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  // Point 4: Update ref when we have valid data
  useEffect(() => {
    if (data?.analytics) {
      analyticsRef.current = data.analytics;
    }
  }, [data]);
  
  // Point 2 & 4: ALWAYS use stableAnalytics, never undefined
  const stableAnalytics = data?.analytics ?? analyticsRef.current;

  // Point 2 & 5: NO conditional returns that hide analytics - always render the full card
  // Even for non-paper mode, render a message but never return null or unmount
  
  // Use stableAnalytics for all rendering - guaranteed to never be undefined
  const analytics = stableAnalytics;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {range === 'session' ? 'Current Simulation' : range === '24h' ? '24 Hour' : range === '7d' ? '7 Day' : range === '30d' ? '30 Day' : range} Performance Analytics
            {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!isPaper ? (
          <div className="p-6 text-center text-muted-foreground">
            Analytics available for Paper Trading mode only
          </div>
        ) : (
          <>
            {/* Tier 1: Primary Indicators */}
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Primary Indicators</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                  title="Avg Hold" 
                  value={formatDuration(analytics.avgHoldingTime)}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Phase 8.8.3-C5: Sortable column header component
function SortableHeader({ 
  column, 
  label, 
  currentSort, 
  currentOrder, 
  onSort,
  align = 'left'
}: { 
  column: string; 
  label: string; 
  currentSort: string; 
  currentOrder: 'asc' | 'desc'; 
  onSort: (col: string) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === column;
  return (
    <th 
      className={cn(
        "p-3 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none",
        align === 'right' ? 'text-right' : 'text-left'
      )}
      onClick={() => onSort(column)}
    >
      <div className={cn("flex items-center gap-1", align === 'right' && "justify-end")}>
        {label}
        {isActive ? (
          currentOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </div>
    </th>
  );
}

export function TradeHistoryTab() {
  const { isPaper } = useTradingMode();
  const [analyticsRange, setAnalyticsRange] = useState('session'); // B2: Default to "Since Last Simulation Start"
  
  // Phase 8.8.3-C-FINAL PART 6: Pending filters (user edits these)
  const [pendingFilters, setPendingFilters] = useState({
    symbol: '',
    strategy: 'all',
    closeReason: 'all',
    dateFrom: '',
    dateTo: ''
  });
  
  // Phase 8.8.3-C-FINAL PART 6: Applied filters (used for API calls, triggered by Apply button)
  const [appliedFilters, setAppliedFilters] = useState({
    symbol: '',
    strategy: 'all',
    closeReason: 'all',
    dateFrom: '',
    dateTo: ''
  });
  
  // Phase 8.8.3-C5: Pagination and sorting state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string>('closedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  
  // Phase 8.8.3-C-FINAL PART 6: Apply filters handler
  const handleApplyFilters = () => {
    setAppliedFilters({ ...pendingFilters });
    setPage(0); // Reset to first page when applying filters
  };
  
  // Phase 8.8.3-C-FINAL PART 6: Clear filters handler
  const handleClearFilters = () => {
    const cleared = {
      symbol: '',
      strategy: 'all',
      closeReason: 'all',
      dateFrom: '',
      dateTo: ''
    };
    setPendingFilters(cleared);
    setAppliedFilters(cleared);
    setPage(0);
  };
  
  // Phase 8.8.3-C5: Use paginated API endpoint
  // Phase 8.8.3-C-FINAL PART 5: Fixed queryFn with closeReason and applied filters
  const { data: paginatedData, isFetching, refetch } = useQuery<{
    trades: any[];
    totalCount: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['/api/paper-sim/trades', { 
      paginated: 'true',
      limit: pageSize, 
      offset: page * pageSize,
      sortBy,
      order,
      closedOnly: 'true',
      symbol: appliedFilters.symbol || undefined,
      strategy: appliedFilters.strategy !== 'all' ? appliedFilters.strategy : undefined,
      closeReason: appliedFilters.closeReason !== 'all' ? appliedFilters.closeReason : undefined,
      dateFrom: appliedFilters.dateFrom || undefined,
      dateTo: appliedFilters.dateTo || undefined
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('paginated', 'true');
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      params.set('sortBy', sortBy);
      params.set('order', order);
      params.set('closedOnly', 'true');
      if (appliedFilters.symbol) params.set('symbol', appliedFilters.symbol);
      if (appliedFilters.strategy !== 'all') params.set('strategy', appliedFilters.strategy);
      if (appliedFilters.closeReason !== 'all') params.set('closeReason', appliedFilters.closeReason);
      // Phase 8.8.3-C-FINAL-2: Convert local date to UTC ISO timestamps
      // When user selects "2025-12-10", they mean Dec 10 in their LOCAL timezone
      // We need to send the UTC boundaries for that local date
      if (appliedFilters.dateFrom) {
        // Create date at start of day in LOCAL timezone, then convert to UTC ISO string
        const localStart = new Date(appliedFilters.dateFrom + 'T00:00:00');
        params.set('dateFrom', localStart.toISOString());
        console.log(`[C-FINAL-2][FE] dateFrom local=${appliedFilters.dateFrom} -> UTC=${localStart.toISOString()}`);
      }
      if (appliedFilters.dateTo) {
        // Create date at end of day in LOCAL timezone, then convert to UTC ISO string
        const localEnd = new Date(appliedFilters.dateTo + 'T23:59:59.999');
        params.set('dateTo', localEnd.toISOString());
        console.log(`[C-FINAL-2][FE] dateTo local=${appliedFilters.dateTo} -> UTC=${localEnd.toISOString()}`);
      }
      return apiFetch(`/api/paper-sim/trades?${params.toString()}`);
    },
    enabled: isPaper,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  
  const filteredTrades = paginatedData?.trades || [];
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  // Phase 8.8.3-C5: Handle column sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setOrder('desc');
    }
    setPage(0); // Reset to first page on sort change
  };

  const getSymbolColor = (symbol: string) => {
    if (symbol.includes('BTC')) return 'text-orange-500';
    if (symbol.includes('ETH')) return 'text-blue-500';
    return 'text-primary';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Time Range:</span>
        <Select value={analyticsRange} onValueChange={setAnalyticsRange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="session">Current Simulation</SelectItem>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <Input
              placeholder="Search symbol..."
              value={pendingFilters.symbol}
              onChange={(e) => setPendingFilters(prev => ({ ...prev, symbol: e.target.value }))}
              data-testid="input-symbol-filter"
            />
            
            <Select 
              value={pendingFilters.strategy} 
              onValueChange={(value) => setPendingFilters(prev => ({ ...prev, strategy: value }))}
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
            
            {/* Phase 8.8.3-C-FINAL PART 4: Close Reason filter dropdown */}
            <Select 
              value={pendingFilters.closeReason} 
              onValueChange={(value) => setPendingFilters(prev => ({ ...prev, closeReason: value }))}
            >
              <SelectTrigger data-testid="select-close-reason-filter">
                <SelectValue placeholder="All close reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All close reasons</SelectItem>
                <SelectItem value="target_hit">Target Price Hit</SelectItem>
                <SelectItem value="stop_hit">Stop Loss</SelectItem>
                <SelectItem value="manual_stop">Manual Stop</SelectItem>
                <SelectItem value="manual_close">Manual Close</SelectItem>
                <SelectItem value="engine_stop_cleanup">Engine Stop Clean</SelectItem>
                <SelectItem value="hard_reset">Hard Reset</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="date"
              value={pendingFilters.dateFrom}
              onChange={(e) => setPendingFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              data-testid="input-date-from"
            />
            
            <Input
              type="date"
              value={pendingFilters.dateTo}
              onChange={(e) => setPendingFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              data-testid="input-date-to"
            />
            
            {/* Phase 8.8.3-C-FINAL PART 6: Apply and Clear buttons */}
            <Button
              onClick={handleApplyFilters}
              data-testid="button-apply-filters"
            >
              Apply
            </Button>
            
            <Button
              variant="outline"
              onClick={handleClearFilters}
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
            <div className="flex items-center gap-4">
              <span className="text-sm font-normal text-muted-foreground">
                {totalCount} total trade{totalCount !== 1 ? 's' : ''}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No trades match your filters</p>
            </div>
          ) : (
            <>
              <DualScrollTable>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {/* Phase 8.8.3-C2A: Final column order per directive */}
                      <SortableHeader column="symbol" label="Symbol" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class</th>
                      <SortableHeader column="strategyName" label="Strategy" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pool</th>
                      {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Fee Mode</th>
                      <SortableHeader column="quantity" label="Qty" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="entryPrice" label="Entry" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <SortableHeader column="exitPrice" label="Exit" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <SortableHeader column="closeReason" label="Reason" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <SortableHeader column="grossPnl" label="Gross P/L" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="entryFee" label="Entry Fee" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="entrySlippage" label="Entry Slip" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="exitFee" label="Exit Fee" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="exitSlippage" label="Exit Slip" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="totalCost" label="Total Cost" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="netPnl" label="Net P/L" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="confidence" label="Conf" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
                      <SortableHeader column="marketRegime" label="Regime" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <SortableHeader column="marketFrictionScore" label="Friction" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <SortableHeader column="openedAt" label="Opened" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                      <SortableHeader column="closedAt" label="Closed" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTrades.map((trade: any) => {
                      // Phase 8.8.3-C2: Parse P/L and cost fields
                      const grossPnl = parseFloat(trade.grossPnl || trade.pnl || '0');
                      const netPnl = parseFloat(trade.netPnl || trade.pnl || '0');
                      const entryFee = parseFloat(trade.entryFee || '0');
                      const exitFee = parseFloat(trade.exitFee || '0');
                      const entrySlippage = parseFloat(trade.entrySlippage || '0');
                      const exitSlippage = parseFloat(trade.exitSlippage || '0');
                      const totalCost = parseFloat(trade.totalCost || '0');
                      const isNetProfit = netPnl >= 0;
                      const isGrossProfit = grossPnl >= 0;
                      
                      const formatTimestamp = (dateStr: string | null) => {
                        if (!dateStr) return '-';
                        const d = new Date(dateStr);
                        return d.toLocaleString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          hour: '2-digit', 
                          minute: '2-digit'
                        });
                      };
                      
                      return (
                        <tr key={trade.id} className="hover:bg-muted/50" data-testid={`trade-history-${trade.id}`}>
                          {/* 1. Symbol - C2A */}
                          <td className="p-2">
                            <span className={cn("text-sm font-semibold", getSymbolColor(trade.symbol))}>
                              {trade.symbol}
                            </span>
                          </td>
                          
                          {/* B69: Asset Class */}
                          <td className="p-2">
                            <AssetClassBadge assetClass={(trade as any).assetClass} />
                          </td>

                          {/* 2. Strategy - C2A */}
                          <td className="p-2">
                            <Badge className={cn("text-xs", strategyColors[trade.strategyName as keyof typeof strategyColors] || "bg-muted/10")}>
                              {strategyNames[trade.strategyName as keyof typeof strategyNames] || trade.strategyName}
                            </Badge>
                          </td>

                          {/* Batch 19E: Source Pool */}
                          <td className="p-2">
                            {(trade as any).sourcePool ? (
                              <Badge className={cn("text-xs",
                                (trade as any).sourcePool?.startsWith('quant') ? "bg-blue-500/10 text-blue-600" :
                                (trade as any).sourcePool === 'pattern' ? "bg-purple-500/10 text-purple-600" :
                                "bg-gray-500/10 text-gray-600"
                              )}>
                                {((trade as any).sourcePool as string).toUpperCase()}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>

                          {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
                          <td className="p-2 text-xs" data-testid={`text-entry-fee-mode-${trade.id}`}>
                            {formatEntryFeeMode((trade as any).chosenEntryMode, (trade as any).entryFeeRate)}
                          </td>

                          {/* 3. Quantity - C2A */}
                          <td className="p-2 text-right font-mono text-xs">
                            {trade.quantity ? formatNumber(trade.quantity, 4) : '-'}
                          </td>
                          
                          {/* 4. Entry - C2A */}
                          <td className="p-2 font-mono text-xs">
                            {trade.entryPrice ? `$${formatNumber(trade.entryPrice, 4)}` : '-'}
                          </td>
                          
                          {/* 5. Exit - C2A */}
                          <td className="p-2 font-mono text-xs">
                            {trade.exitPrice ? `$${formatNumber(trade.exitPrice, 4)}` : '-'}
                          </td>
                          
                          {/* 6. Reason - C2A; B65.2 + HF3: trailing_stop_hit, moonbag_timeout, break_even_stop */}
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  trade.closeReason === 'target_hit' && "bg-green-500/20 text-green-600 border-green-500/50",
                                  trade.closeReason === 'trailing_stop_hit' && "bg-emerald-500/20 text-emerald-600 border-emerald-500/50",
                                  trade.closeReason === 'moonbag_timeout' && "bg-amber-500/20 text-amber-600 border-amber-500/50",
                                  trade.closeReason === 'break_even_stop' && "bg-slate-500/20 text-slate-600 border-slate-400/50",
                                  trade.closeReason === 'stop_hit' && "bg-red-500/20 text-red-600 border-red-500/50",
                                  // P19-B7.2c: a dropped pending maker (visible, excluded from stats)
                                  trade.closeReason === 'never_filled' && "bg-slate-500/20 text-slate-400 border-slate-500/40"
                                )}
                              >
                                {!trade.closedAt ? 'Open' :
                                 trade.closeReason === 'never_filled' ? 'Never filled — dropped' :
                                 trade.closeReason === 'target_hit' ? 'Target' :
                                 trade.closeReason === 'trailing_stop_hit' ? 'Trail' :
                                 trade.closeReason === 'moonbag_timeout' ? 'M.Cap' :
                                 trade.closeReason === 'break_even_stop' ? 'BE Protect' :
                                 trade.closeReason === 'stop_hit' ? 'Stop' :
                                 trade.closeReason === 'manual_close' ? 'Manual' :
                                 trade.closeReason === 'manual_stop' ? 'M.Stop' :
                                 trade.closeReason === 'engine_stop_cleanup' ? 'Engine' :
                                 trade.closeReason === 'hard_reset' ? 'Reset' :
                                 trade.closeReason === 'hard_stop' ? 'H.Stop' :
                                 trade.closeReason === 'force_close' ? 'Force' :
                                 trade.closeReason || '?'}
                              </Badge>
                              {/* B65.2: Moonbag badge for trades that entered TRAILING_TAKE mode */}
                              {/* B65.4: rung count appended (MB×N) when ladder data is present */}
                              {(trade as any).tradeMode === 'TRAILING_TAKE' && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-500/50"
                                  title={`Trade entered moonbag (trailing) mode after hitting target. Ratcheted through ${(trade as any).ladderRungsHit ?? 1} ladder rung${((trade as any).ladderRungsHit ?? 1) === 1 ? '' : 's'} before exit.`}
                                >
                                  🌙 MB×{(trade as any).ladderRungsHit ?? 1}
                                </Badge>
                              )}
                            </div>
                          </td>
                          
                          {/* 7. Gross P/L ($ + %) stacked - C2A */}
                          <td className="p-2 text-right">
                            <div className="space-y-0.5">
                              <div className={cn("font-mono text-xs font-semibold", isGrossProfit ? "text-green-600" : "text-red-600")}>
                                {isGrossProfit ? '+' : '-'}${formatNumber(Math.abs(grossPnl))}
                              </div>
                              <div className={cn("font-mono text-xs", isGrossProfit ? "text-green-600" : "text-red-600")}>
                                {isGrossProfit ? '+' : ''}{formatNumber((grossPnl / (parseFloat(trade.quantity || '1') * parseFloat(trade.entryPrice || '1'))) * 100)}%
                              </div>
                            </div>
                          </td>
                          
                          {/* 8. Entry Fee - C2A */}
                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
                            {entryFee > 0 ? `$${formatNumber(entryFee, 2)}` : '-'}
                          </td>
                          
                          {/* 9. Entry Slippage - C2A */}
                          <td className="p-2 text-right font-mono text-xs text-orange-600">
                            {entrySlippage !== 0 ? `$${formatNumber(Math.abs(entrySlippage), 2)}` : '-'}
                          </td>
                          
                          {/* 10. Exit Fee - C2A: Show positive value */}
                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
                            {exitFee !== 0 ? `$${formatNumber(Math.abs(exitFee), 2)}` : '-'}
                          </td>
                          
                          {/* 11. Exit Slippage - C2A: Show positive value */}
                          <td className="p-2 text-right font-mono text-xs text-orange-600">
                            {exitSlippage !== 0 ? `$${formatNumber(Math.abs(exitSlippage), 2)}` : '-'}
                          </td>
                          
                          {/* 12. Total Cost - C2A */}
                          <td className="p-2 text-right font-mono text-xs font-medium text-red-600">
                            {totalCost > 0 ? `$${formatNumber(totalCost, 2)}` : '-'}
                          </td>
                          
                          {/* 13. Net P/L ($ + %) stacked - C2A */}
                          <td className="p-2 text-right">
                            <div className="space-y-0.5">
                              <div className={cn("font-mono text-xs font-semibold", isNetProfit ? "text-green-600" : "text-red-600")}>
                                {isNetProfit ? '+' : '-'}${formatNumber(Math.abs(netPnl))}
                              </div>
                              <div className={cn("font-mono text-xs", isNetProfit ? "text-green-600" : "text-red-600")}>
                                {isNetProfit ? '+' : ''}{formatNumber(parseFloat(trade.netPnlPercent || trade.pnlPercent || '0'))}%
                              </div>
                            </div>
                          </td>
                          
                          {/* 14. Confidence - C2A */}
                          <td className="p-2 text-right">
                            {(() => {
                              const rawConf = parseFloat(trade.confidence || '0');
                              const confidence = rawConf > 1 ? rawConf : rawConf * 100;
                              const confColor = confidence >= 80 ? 'text-green-600' : 
                                               confidence >= 60 ? 'text-blue-600' : 
                                               confidence >= 40 ? 'text-orange-500' : 'text-red-600';
                              return (
                                <span className={cn("font-mono text-xs font-medium", confColor)}>
                                  {trade.confidence ? `${formatNumber(confidence, 0)}%` : '-'}
                                </span>
                              );
                            })()}
                          </td>
                          
                          {/* 15. Market Regime - 11.4B */}
                          <td className="p-2">
                            {trade.marketRegime ? (
                              <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClassName(trade.marketRegime))}>
                                {formatRegimeTitle(trade.marketRegime)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          
                          {/* 16. Market Friction - 11.4B */}
                          <td className="p-2">
                            {trade.marketFrictionScore !== undefined && trade.marketFrictionScore !== null ? (
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                getFrictionColorClasses(trade.marketFrictionScore).badge
                              )}>
                                {getFrictionLabel(trade.marketFrictionScore)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          
                          {/* 17. Opened - C2A */}
                          <td className="p-2 text-xs font-mono whitespace-nowrap">
                            {formatTimestamp(trade.openedAt)}
                          </td>
                          
                          {/* 16. Closed - C2A */}
                          <td className="p-2 text-xs font-mono whitespace-nowrap">
                            {formatTimestamp(trade.closedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DualScrollTable>
              
              {/* Phase 8.8.3-C5: Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(0)} 
                      disabled={page === 0}
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(0, p - 1))} 
                      disabled={page === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="px-3 text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(totalPages - 1)} 
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
