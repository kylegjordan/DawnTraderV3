import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  X, 
  AlertTriangle, 
  CheckCircle2,
  Clock,
  Target,
  Shield,
  Trash2,
  RefreshCw,
  Beaker,
  Wifi,
  WifiOff
} from "lucide-react";

interface ActiveTrade {
  id: string;
  symbol: string;
  strategy: string;
  side: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  takeProfit: number;
  stopLoss: number;
  distanceToTP: number;
  distanceToSL: number;
  holdingDurationMs: number;
  slotNumber: number;
  maxSlots: number;
  health: 'green' | 'yellow' | 'red';
  openedAt: string;
  confidence: number;
  positionValue: number;
  metadata?: any;
}

interface PortfolioSummary {
  startingBalance: number;
  currentBalance: number;
  cashBalance: number;
  totalPositionValue: number;
  netPnl: number;
  netPnlPercent: number;
}

interface IntegrityStatus {
  systemCount: number;
  maxOpenTrades: number;
  slotsAvailable: number;
  status: 'OK' | 'OVER_LIMIT';
}

interface ActiveTradesResponse {
  ok: boolean;
  positions: ActiveTrade[];
  integrity: IntegrityStatus;
  portfolio: PortfolioSummary;
}

type SortField = 'symbol' | 'strategy' | 'entryPrice' | 'currentPrice' | 'unrealizedPnlPercent' | 
                  'unrealizedPnl' | 'holdingDurationMs' | 'distanceToTP' | 'distanceToSL' | 'slotNumber' | 'health';
type SortDirection = 'asc' | 'desc';

const strategyColors: Record<string, string> = {
  vwap_pullback: "bg-primary/10 text-primary",
  abcd_long: "bg-chart-2/10 text-chart-2",
  sma_trend_ride: "bg-chart-3/10 text-chart-3",
  vwap_bounce: "bg-blue-500/10 text-blue-600",
  dhma: "bg-purple-500/10 text-purple-600",
  breakout: "bg-orange-500/10 text-orange-600",
  mean_reversion: "bg-green-500/10 text-green-600",
  liquidity_trap: "bg-red-500/10 text-red-600"
};

const strategyNames: Record<string, string> = {
  vwap_pullback: "VWAP Pullback",
  abcd_long: "ABCD Long",
  sma_trend_ride: "SMA Trend Ride",
  vwap_bounce: "VWAP Bounce",
  dhma: "DHMA",
  breakout: "Breakout",
  mean_reversion: "Mean Reversion",
  liquidity_trap: "Liquidity Trap"
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function HealthIndicator({ health }: { health: 'green' | 'yellow' | 'red' }) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  };
  
  return (
    <div className={cn("w-3 h-3 rounded-full", colors[health])} 
         title={health === 'green' ? 'Profitable' : health === 'yellow' ? 'Breakeven' : 'Losing'} 
    />
  );
}

function SortableHeader({ 
  field, 
  label, 
  currentSort, 
  currentDirection, 
  onSort 
}: { 
  field: SortField; 
  label: string; 
  currentSort: SortField; 
  currentDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentSort === field;
  
  return (
    <th 
      className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </th>
  );
}

function TradeRow({ 
  trade, 
  onClose, 
  isClosing 
}: { 
  trade: ActiveTrade; 
  onClose: (id: string) => void;
  isClosing: boolean;
}) {
  const [baseCurrency, quoteCurrency] = trade.symbol.includes('/') 
    ? trade.symbol.split('/') 
    : [trade.symbol.slice(0, 3), trade.symbol.slice(3)];

  // Calculate distance as actual value (price difference), not percentage
  const distanceToTPValue = trade.takeProfit - trade.currentPrice;
  const distanceToSLValue = trade.currentPrice - trade.stopLoss;
  
  // B3: Calculate position value
  const positionValue = trade.quantity * trade.currentPrice;

  return (
    <tr className="transition-colors hover:bg-muted/30 border-b border-border/50">
      {/* 1. Symbol */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <HealthIndicator health={trade.health} />
          <div>
            <div className="font-semibold text-sm">{baseCurrency}<span className="text-muted-foreground">/{quoteCurrency}</span></div>
          </div>
        </div>
      </td>
      
      {/* 2. Strategy */}
      <td className="px-3 py-3">
        <Badge className={cn("text-xs font-medium", strategyColors[trade.strategy] || "bg-gray-500/10 text-gray-600")}>
          {strategyNames[trade.strategy] || trade.strategy}
        </Badge>
      </td>
      
      {/* 3. B3: Qty / Value (stacked) */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          <div className="font-mono text-sm">{trade.quantity.toFixed(6)}</div>
          <div className="font-mono text-muted-foreground">${positionValue.toFixed(2)}</div>
        </div>
      </td>
      
      {/* 4. Entry */}
      <td className="px-3 py-3">
        <div className="font-mono text-sm">${trade.entryPrice.toFixed(6)}</div>
      </td>
      
      {/* 5. TP / SL (stacked) */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-1">
            <Target className="w-3 h-3 text-green-600" />
            <span className="font-mono">${trade.takeProfit.toFixed(4)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-red-600" />
            <span className="font-mono">${trade.stopLoss.toFixed(4)}</span>
          </div>
        </div>
      </td>
      
      {/* 6. Current Price */}
      <td className="px-3 py-3">
        <div className={cn(
          "font-mono text-sm font-medium",
          trade.currentPrice > trade.entryPrice ? "text-green-600" : 
          trade.currentPrice < trade.entryPrice ? "text-red-600" : "text-muted-foreground"
        )}>
          ${trade.currentPrice.toFixed(6)}
        </div>
      </td>
      
      {/* 7. Distance to TP / SL (as actual values) */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          <div className={cn("font-mono", distanceToTPValue > 0 ? "text-green-600" : "text-muted-foreground")}>
            TP: {distanceToTPValue >= 0 ? '+' : ''}${distanceToTPValue.toFixed(4)}
          </div>
          <div className={cn("font-mono", distanceToSLValue > 0 ? "text-green-600" : "text-red-600")}>
            SL: {distanceToSLValue >= 0 ? '+' : ''}${distanceToSLValue.toFixed(4)}
          </div>
        </div>
      </td>
      
      {/* 8. P/L ($) */}
      <td className="px-3 py-3">
        <div className={cn(
          "font-mono text-sm font-semibold",
          trade.unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"
        )}>
          {trade.unrealizedPnl >= 0 ? '+' : ''}${trade.unrealizedPnl.toFixed(2)}
        </div>
      </td>
      
      {/* 9. P/L (%) */}
      <td className="px-3 py-3">
        <div className={cn(
          "font-mono text-sm font-semibold",
          trade.unrealizedPnlPercent >= 0 ? "text-green-600" : "text-red-600"
        )}>
          {trade.unrealizedPnlPercent >= 0 ? '+' : ''}{trade.unrealizedPnlPercent.toFixed(2)}%
        </div>
      </td>
      
      {/* 10. Duration */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="w-3 h-3" />
          {formatDuration(trade.holdingDurationMs)}
        </div>
      </td>
      
      {/* 11. Slot */}
      <td className="px-3 py-3">
        <Badge variant="outline" className="font-mono text-xs">
          {trade.slotNumber}/{trade.maxSlots}
        </Badge>
      </td>
      
      {/* 12. Actions */}
      <td className="px-3 py-3">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onClose(trade.id)}
          disabled={isClosing}
          className="px-2 py-1 h-7 text-xs"
        >
          <X className="w-3 h-3 mr-1" />
          Close
        </Button>
      </td>
    </tr>
  );
}

function IntegrityBanner({ 
  integrity, 
  uiCount, 
  onClearStranded,
  isClearing
}: { 
  integrity: IntegrityStatus; 
  uiCount: number;
  onClearStranded: () => void;
  isClearing: boolean;
}) {
  const isMismatch = integrity.systemCount !== uiCount;
  const status = isMismatch ? 'MISMATCH' : integrity.status;
  
  return (
    <div className={cn(
      "p-4 rounded-lg border mb-4",
      status === 'OK' ? "bg-green-500/5 border-green-500/20" :
      status === 'MISMATCH' ? "bg-yellow-500/10 border-yellow-500/30" :
      "bg-red-500/10 border-red-500/30"
    )}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">System Active Trades:</span>
            <span className="font-bold">{integrity.systemCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">UI Active Trades:</span>
            <span className="font-bold">{uiCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Guardrail Max:</span>
            <span className="font-bold">{integrity.maxOpenTrades}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Slots Available:</span>
            <span className={cn("font-bold", integrity.slotsAvailable > 0 ? "text-green-600" : "text-red-600")}>
              {integrity.slotsAvailable}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {status === 'OK' ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Status: OK</span>
            </div>
          ) : status === 'MISMATCH' ? (
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">MISMATCH - Possible Stranded Trade</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">OVER LIMIT</span>
            </div>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={onClearStranded}
            disabled={isClearing}
            className="text-xs border-red-200 text-red-600 hover:bg-red-50"
          >
            {isClearing ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
            Clear Stranded
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 8.8.3-I7: Normalize symbol for cache key matching
 * Strips slashes and uppercases - must match backend internalSymbol format after slash removal
 */
const normalizeSymbol = (s: string) => s.replace('/', '').toUpperCase();

export default function ActiveTradesV2() {
  const { isPaper } = useTradingMode();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { messages, isConnected } = useWebSocket();
  
  const [sortField, setSortField] = useState<SortField>('slotNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Phase 8.8.3-B3.6: Local state for real-time price updates from WebSocket
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; timestamp: string }>>({});
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  
  // Phase 8.8.3-I7-PRICE-FIX (C3): Track last data refresh for diagnostics
  const [lastDataRefreshAt, setLastDataRefreshAt] = useState<string | null>(null);
  
  const { data, isLoading, refetch } = useQuery<ActiveTradesResponse>({
    queryKey: ['/api/paper-sim/active-trades'],
    enabled: isPaper,
    refetchInterval: 10000, // Phase 8.8.3-B3.6: 10 second refresh for metadata only (prices from WS)
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not focused
    staleTime: 5000, // Mark data as stale after 5 seconds
    refetchOnWindowFocus: true
  });
  
  // Phase 8.8.3-I7-PRICE-FIX (C3): Log when data is refreshed
  useEffect(() => {
    if (data?.positions) {
      const ts = new Date().toISOString();
      setLastDataRefreshAt(ts);
      console.debug('[I7-PRICE-FIX][UI_ACTIVE_TRADES_UPDATE]', { ts, positions: data.positions.length });
    }
  }, [data]);
  
  // Phase 8.8.3-B3.6: WebSocket subscription for real-time price updates
  useEffect(() => {
    if (!isPaper || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    
    // Handle price_updated events for real-time price display (no full refetch needed)
    if (lastMessage.type === 'price_updated' && lastMessage.payload?.symbol) {
      const { symbol, price, timestamp, traceId } = lastMessage.payload;
      const normalized = normalizeSymbol(symbol);
      console.log(`[I6-UI] Price update received: ${symbol} -> ${normalized} = $${price}`);
      
      // Phase 8.8.3-I7-WS-C (C2 Stage 5): Log UI receive event
      if (traceId) {
        console.log(`[I7-WS-C][5] UI_RECEIVE ${JSON.stringify({ trace_id: traceId, internal_symbol: normalized, price })}`);
      }
      
      setLivePrices(prev => ({
        ...prev,
        [normalized]: { price, timestamp, traceId }
      }));
      return; // Don't trigger full refetch for price updates
    }
    
    // Handle WebSocket price engine status updates
    if (lastMessage.type === 'ws_price_engine') {
      setWsConnectionStatus(lastMessage.payload?.status === 'connected' ? 'connected' : 'disconnected');
      return;
    }
    
    // Listen for trade-related WebSocket events that require full refetch
    const tradeEventTypes = [
      'active_trade_closed',
      'trade_opened',
      'trade_closed',
      'position_update',
      'paper_trade_executed',
      'trading_state_changed',
      'scan_tick'
    ];
    
    if (tradeEventTypes.includes(lastMessage.type)) {
      // Invalidate and refetch on trade events
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/active-trades'] });
    }
  }, [messages, isPaper, queryClient]);
  
  const closeTradeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiFetch(`/api/paper-sim/close-trade/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_close' })
      });
    },
    onSuccess: (result) => {
      const pnl = result?.pnl ?? 0;
      toast({
        title: "Trade Closed",
        description: result?.message || `P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/active-trades'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to close trade",
        variant: "destructive",
      });
    }
  });
  
  const clearStrandedMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/paper-sim/force-clear-stranded', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (result) => {
      toast({
        title: "Stranded Trades Cleared",
        description: result.message || `Cleared ${result.clearedCount || 0} stranded trades`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/active-trades'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear stranded trades",
        variant: "destructive",
      });
    }
  });
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Phase 8.8.3-B3.6: Merge live prices from WebSocket with REST data
  const positionsWithLivePrices = useMemo(() => {
    if (!data?.positions) return [];
    
    return data.positions.map(position => {
      const symbolNorm = normalizeSymbol(position.symbol);
      const livePrice = livePrices[symbolNorm] as { price: number; timestamp: string; traceId?: string } | undefined;
      if (livePrice) {
        // Update price and recalculate P/L
        const newCurrentPrice = livePrice.price;
        const newPnl = (newCurrentPrice - position.entryPrice) * position.quantity;
        const newPnlPercent = ((newCurrentPrice - position.entryPrice) / position.entryPrice) * 100;
        const newHealth = newPnlPercent > 1 ? 'green' : newPnlPercent < -1 ? 'red' : 'yellow';
        
        // Phase 8.8.3-I7-WS-C (C2 Stage 6): Log UI apply to position event
        if (livePrice.traceId) {
          console.log(`[I7-WS-C][6] UI_APPLY_TO_POSITION ${JSON.stringify({ 
            trace_id: livePrice.traceId, 
            position_symbol: position.symbol, 
            applied_price: newCurrentPrice 
          })}`);
        }
        
        return {
          ...position,
          currentPrice: newCurrentPrice,
          unrealizedPnl: newPnl,
          unrealizedPnlPercent: newPnlPercent,
          health: newHealth as 'green' | 'yellow' | 'red',
          distanceToTP: position.takeProfit - newCurrentPrice,
          distanceToSL: newCurrentPrice - position.stopLoss
        };
      }
      return position;
    });
  }, [data?.positions, livePrices]);
  
  // Phase 8.8.3-I7-PM-FOCUS (C2): Deduplicate positions by symbol+side
  // Backend duplicate guard should prevent duplicates, but this is a UI safeguard
  const dedupedPositions = useMemo(() => {
    const byKey = new Map<string, ActiveTrade>();
    
    positionsWithLivePrices.forEach(pos => {
      const key = `${pos.symbol}:${pos.side}`;
      if (!byKey.has(key)) {
        byKey.set(key, pos);
      } else {
        // Keep the one with the earlier openedAt time
        const existing = byKey.get(key)!;
        if (new Date(pos.openedAt) < new Date(existing.openedAt)) {
          byKey.set(key, pos);
        }
        console.log(`[I7-PM-FOCUS][UI_DEDUP] Filtered duplicate: ${pos.symbol} (keeping earliest entry)`);
      }
    });
    
    return Array.from(byKey.values());
  }, [positionsWithLivePrices]);

  const sortedPositions = useMemo(() => {
    if (!dedupedPositions.length) return [];
    
    return [...dedupedPositions].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      
      if (sortField === 'health') {
        const healthOrder = { green: 0, yellow: 1, red: 2 };
        aVal = healthOrder[a.health];
        bVal = healthOrder[b.health];
      }
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [dedupedPositions, sortField, sortDirection]);

  if (!isPaper) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Active Trades panel is only available in Paper Trading mode</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const positions = sortedPositions;
  const integrity = data?.integrity || { systemCount: 0, maxOpenTrades: 15, slotsAvailable: 15, status: 'OK' as const };
  const portfolio = data?.portfolio || { startingBalance: 0, currentBalance: 0, cashBalance: 0, totalPositionValue: 0, netPnl: 0, netPnlPercent: 0 };

  return (
    <section data-testid="active-trades-v2" data-last-update-at={lastDataRefreshAt || ''}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Active Trades</h2>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            isConnected ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10"
          )}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isConnected ? "Connected" : "Offline"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10">
            <Beaker className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Paper Trading
            </span>
          </div>
        </div>
      </div>
      
      <IntegrityBanner 
        integrity={integrity} 
        uiCount={positions.length}
        onClearStranded={() => clearStrandedMutation.mutate()}
        isClearing={clearStrandedMutation.isPending}
      />
      
      <Card className="rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {positions.length === 0 ? (
            <div className="p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-muted-foreground font-medium">No active trades</p>
              <p className="text-xs text-muted-foreground">
                {integrity.slotsAvailable} slots available for new positions
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <SortableHeader field="symbol" label="Symbol" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="strategy" label="Strategy" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty / Value</th>
                  <SortableHeader field="entryPrice" label="Entry" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">TP / SL</th>
                  <SortableHeader field="currentPrice" label="Current" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="distanceToTP" label="Distance" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="unrealizedPnl" label="P/L $" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="unrealizedPnlPercent" label="P/L %" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="holdingDurationMs" label="Duration" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="slotNumber" label="Slot" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((trade) => (
                  <TradeRow 
                    key={trade.id} 
                    trade={trade} 
                    onClose={(id) => closeTradeMutation.mutate(id)}
                    isClosing={closeTradeMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </section>
  );
}
