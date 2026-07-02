import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatEntryFeeMode } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
import { AssetClassBadge } from "@/components/ui/asset-class-badge";
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
  WifiOff,
  RotateCcw
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Phase 8.8.5-E: Volume tier data from VolumeClassifier
interface VolumeTierData {
  symbol: string;
  tier: 'HIGH' | 'MID' | 'LOW';
  volume24h: number;
}

// Phase 8.8.5-E: WebSocket health metrics for Source column
interface WsHealthMetrics {
  symbolHealth: Record<string, {
    source: 'WS' | 'REST';
    cached: boolean;
    blocked: boolean;
    lastTickMs: number;
  }>;
}

// Phase 8.8.5-E: Source display states
type SourceDisplayState = 'WS' | 'WS (cached)' | 'REST' | 'REST (blocked)';

// Phase 8.8.5-E: Source state tooltips
const SOURCE_TOOLTIPS: Record<SourceDisplayState, string> = {
  'WS': 'Real-time WebSocket feed - prices update instantly',
  'WS (cached)': 'WebSocket feed using cached data - no recent ticks received',
  'REST': 'REST API fallback - polling for price updates',
  'REST (blocked)': 'REST API blocked by rate limiter - cooldown active',
};

interface ActiveTrade {
  id: string;
  symbol: string;
  strategy: string;
  side: string;
  quantity: number;
  entryPrice: number;
  intendedEntryPrice: number; // Signal price before slippage
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  // Phase 8.8.3-C2: P/L breakdown
  grossPnl: number;
  grossPnlPercent: number;
  netPnl: number;
  netPnlPercent: number;
  // Phase 8.8.3-C2: Cost breakdown
  entryFee: number;
  entrySlippage: number;
  estExitFee: number;
  estExitSlippage: number;
  estTotalCost: number;
  takeProfit: number;
  stopLoss: number;
  distanceToTP: number;
  distanceToSL: number;
  distanceToTPDollars: number; // CR-001: Dollar-based distance
  distanceToSLDollars: number; // CR-001: Dollar-based distance
  finalScore: number;
  holdingDurationMs: number;
  slotNumber: number;
  maxSlots: number;
  health: 'green' | 'yellow' | 'red';
  openedAt: string;
  confidence: number;
  positionValue: number;
  metadata?: any;
  // Phase 8.8.3-I9: New fields
  sourceLabel?: 'WS' | 'REST';
  frequency?: 'High' | 'Medium' | 'Low' | 'Very Low';
  avgIntervalMs?: number;
  volume24h?: number;
  volumeBucket?: 'High' | 'Medium' | 'Low' | 'Very Low';
  // Directive 9.2: Trade mode for trailing exit system
  tradeMode?: 'TARGET' | 'TRAILING_TAKE';
  // Directive 11.4B: Market context fields
  marketRegime?: string;
  marketFrictionScore?: number;
  marketFrictionLabel?: string;
  // Batch 19E: Source pool tracking
  sourcePool?: string | null;
  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the position opened on.
  chosenEntryMode?: string | null;
  entryFeeRate?: number | string | null;
  // P19-B7.2c: 'pending' = a resting maker order holding a slot, not yet filled.
  state?: string;
  makerLimitPrice?: string | number | null;
  makerDeadline?: string | null;
}

interface PortfolioSummary {
  startingBalance: number;
  currentBalance: number;
  realizedBalance: number; // Starting Balance + Realized P/L (renamed from cashBalance)
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

// Phase 8.8.3-C2: Updated sort fields for new P/L breakdown columns
// Directive 11.4B: Added marketRegime and marketFriction
type SortField = 'symbol' | 'strategy' | 'intendedEntryPrice' | 'entryPrice' | 'currentPrice' | 
                  'grossPnl' | 'grossPnlPercent' | 'netPnl' | 'netPnlPercent' | 
                  'entryFee' | 'entrySlippage' | 'estExitFee' | 'estExitSlippage' | 'estTotalCost' |
                  'holdingDurationMs' | 'distanceToTP' | 'distanceToSL' | 'distanceToTPDollars' | 'distanceToSLDollars' | 'slotNumber' | 
                  'health' | 'confidence' | 'finalScore' | 'quantity' | 'volume24h' | 'takeProfit' | 'stopLoss' | 'positionValue' |
                  'marketRegime' | 'marketFriction';
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

// Phase 8.8.3-I9 D1: Format numbers with commas
function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
}

// Phase 8.8.3-I9 A2: Format volume with units (M/K) - coin count, not dollar amount
function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(0)}K`;
  }
  return `${volume.toFixed(0)}`;
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
  isClosing,
  volumeTierDisplay,
  sourceDisplayState 
}: { 
  trade: ActiveTrade; 
  onClose: (id: string) => void;
  isClosing: boolean;
  volumeTierDisplay: { tier: string; volume: string };
  sourceDisplayState: SourceDisplayState;
}) {
  const [baseCurrency, quoteCurrency] = trade.symbol.includes('/') 
    ? trade.symbol.split('/') 
    : [trade.symbol.slice(0, 3), trade.symbol.slice(3)];

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
      
      {/* B69: Asset Class */}
      <td className="px-3 py-3">
        <AssetClassBadge assetClass={(trade as any).assetClass} />
      </td>

      {/* 2. Slot */}
      <td className="px-3 py-3">
        <Badge variant="outline" className="font-mono text-xs">
          {trade.slotNumber}/{trade.maxSlots}
        </Badge>
      </td>
      
      {/* 3. Strategy */}
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <Badge className={cn("text-xs font-medium", strategyColors[trade.strategy] || "bg-gray-500/10 text-gray-600")}>
            {strategyNames[trade.strategy] || trade.strategy}
          </Badge>
          {/* Directive 9.2: Trade Mode Indicator */}
          {/* P19-B7.2c: a resting maker order shows PENDING (holds a slot, not filled)
              until the real price trades through its limit or the deadline drops it. */}
          {trade.state === 'pending' ? (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
              PENDING
            </span>
          ) : (
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-bold",
            trade.tradeMode === 'TRAILING_TAKE'
              ? 'bg-amber-100 text-amber-700 border border-amber-300'
              : 'text-gray-500'
          )}>
            {trade.tradeMode === 'TRAILING_TAKE' ? 'MOONBAG' : 'Targeting'}
          </span>
          )}
        </div>
      </td>

      {/* Batch 19E: Source Pool */}
      <td className="px-3 py-3">
        {trade.sourcePool ? (
          <Badge className={cn("text-xs font-medium",
            trade.sourcePool?.startsWith('quant') ? "bg-blue-500/10 text-blue-600" :
            trade.sourcePool === 'pattern' ? "bg-purple-500/10 text-purple-600" :
            "bg-gray-500/10 text-gray-600"
          )}>
            {trade.sourcePool.toUpperCase()}
          </Badge>
        ) : <span className="text-muted-foreground">—</span>}
      </td>

      {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
      <td className="px-3 py-3">
        <span className="text-xs font-medium" data-testid={`text-entry-fee-mode-${trade.id}`}>
          {formatEntryFeeMode(trade.chosenEntryMode, trade.entryFeeRate)}
        </span>
      </td>

      {/* 4. Qty / Value (stacked) */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          <div className="font-mono text-sm">{formatNumber(trade.quantity, 6)}</div>
          <div className="font-mono text-muted-foreground">${formatNumber(positionValue, 2)}</div>
        </div>
      </td>
      
      {/* 5. Entry (Signal) - C2A: Signal price only */}
      <td className="px-3 py-3">
        <div className="font-mono text-sm">${(trade.intendedEntryPrice || trade.entryPrice).toFixed(6)}</div>
      </td>
      
      {/* 6. Target Exit (TP) - C2A: Restored */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <Target className="w-3 h-3 text-green-500" />
          <span className="font-mono text-sm text-foreground">${trade.takeProfit.toFixed(6)}</span>
        </div>
      </td>
      
      {/* 7. Current Price - C2A: Colored based on entry comparison */}
      <td className="px-3 py-3">
        <div className={cn(
          "font-mono text-sm font-medium",
          trade.currentPrice > (trade.intendedEntryPrice || trade.entryPrice) ? "text-green-600" :
          trade.currentPrice < (trade.intendedEntryPrice || trade.entryPrice) ? "text-red-600" : "text-foreground"
        )}>
          ${trade.currentPrice.toFixed(6)}
        </div>
      </td>
      
      {/* 8. Distance (stacked: TP on top, SL on bottom) - Per-coin $ difference from Entry */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          {(() => {
            const entryPrice = trade.intendedEntryPrice || trade.entryPrice;
            const tpDistance = trade.takeProfit - entryPrice;
            const slDistance = entryPrice - trade.stopLoss;
            return (
              <>
                <div className="flex items-center gap-1">
                  <Target className="w-3 h-3 text-green-500" />
                  <span className="font-mono text-green-600">
                    +${tpDistance.toFixed(6)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-red-500" />
                  <span className="font-mono text-red-600">
                    -${slDistance.toFixed(6)}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      </td>
      
      {/* 9. Gross P/L (stacked: $ on top, % on bottom) - C2A */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          <div className={cn(
            "font-mono text-sm font-semibold",
            (trade.grossPnl || 0) >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {(trade.grossPnl || 0) >= 0 ? '+' : '-'}${formatNumber(Math.abs(trade.grossPnl || 0), 2)}
          </div>
          <div className={cn(
            "font-mono text-xs",
            (trade.grossPnlPercent || 0) >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {(trade.grossPnlPercent || 0) >= 0 ? '+' : ''}{(trade.grossPnlPercent || 0).toFixed(2)}%
          </div>
        </div>
      </td>
      
      {/* 10. Entry Fee - C2A */}
      <td className="px-3 py-3">
        <div className="font-mono text-xs text-muted-foreground">
          ${formatNumber(trade.entryFee || 0, 2)}
        </div>
      </td>
      
      {/* 11. Entry Slippage - C2A */}
      <td className="px-3 py-3">
        <div className="font-mono text-xs text-orange-600">
          ${formatNumber(trade.entrySlippage || 0, 2)}
        </div>
      </td>
      
      {/* 12. Exit Fee - C2A: Show positive value */}
      <td className="px-3 py-3">
        <div className="font-mono text-xs text-muted-foreground">
          ${formatNumber(Math.abs(Number(trade.estExitFee) || 0), 2)}
        </div>
      </td>
      
      {/* 13. Exit Slippage - C2A: Show positive value */}
      <td className="px-3 py-3">
        <div className="font-mono text-xs text-orange-600">
          ${formatNumber(Math.abs(Number(trade.estExitSlippage) || 0), 2)}
        </div>
      </td>
      
      {/* 14. Total Cost - C2A */}
      <td className="px-3 py-3">
        <div className="font-mono text-xs font-medium text-red-600">
          ${formatNumber(Math.abs(Number(trade.estTotalCost) || 0), 2)}
        </div>
      </td>
      
      {/* 15. Net P/L (stacked: $ on top, % on bottom) - C2A */}
      <td className="px-3 py-3">
        <div className="text-xs space-y-0.5">
          <div className={cn(
            "font-mono text-sm font-semibold",
            (trade.netPnl || 0) >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {(trade.netPnl || 0) >= 0 ? '+' : '-'}${formatNumber(Math.abs(trade.netPnl || 0), 2)}
          </div>
          <div className={cn(
            "font-mono text-xs",
            (trade.netPnlPercent || 0) >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {(trade.netPnlPercent || 0) >= 0 ? '+' : ''}{(trade.netPnlPercent || 0).toFixed(2)}%
          </div>
        </div>
      </td>
      
      {/* 16. FinalScore - CR-001: Added before Confidence */}
      <td className="px-3 py-3">
        {(trade.finalScore && trade.finalScore > 0) ? (
          <div className={cn(
            "font-mono text-sm font-medium",
            trade.finalScore >= 0.7 ? "text-green-600" :
            trade.finalScore >= 0.5 ? "text-blue-600" :
            trade.finalScore >= 0.3 ? "text-orange-600" : "text-red-600"
          )}>
            {(trade.finalScore * 100).toFixed(1)}%
          </div>
        ) : (
          <div className="font-mono text-sm text-muted-foreground">N/A</div>
        )}
      </td>
      
      {/* 17. Confidence */}
      <td className="px-3 py-3">
        <div className={cn(
          "font-mono text-sm font-medium",
          trade.confidence >= 80 ? "text-green-600" :
          trade.confidence >= 60 ? "text-blue-600" :
          trade.confidence >= 40 ? "text-orange-600" : "text-red-600"
        )}>
          {trade.confidence}%
        </div>
      </td>
      
      {/* 17. Volume (24h) - Phase 8.8.5-E: Format as "TIER (volume)" from VolumeClassifier */}
      <td className="px-3 py-3">
        <div className={cn(
          "font-mono text-sm font-medium",
          volumeTierDisplay.tier === 'HIGH' ? "text-green-600" :
          volumeTierDisplay.tier === 'MID' ? "text-blue-600" : "text-orange-600"
        )}>
          {volumeTierDisplay.tier} ({volumeTierDisplay.volume})
        </div>
      </td>
      
      {/* 18. Source - Phase 8.8.5-E: Display WS/WS (cached)/REST/REST (blocked) with tooltip */}
      <td className="px-3 py-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                {sourceDisplayState.startsWith('WS') ? (
                  <Wifi className={cn(
                    "w-3 h-3",
                    sourceDisplayState === 'WS' ? "text-green-500" : "text-yellow-500"
                  )} />
                ) : (
                  <WifiOff className={cn(
                    "w-3 h-3",
                    sourceDisplayState === 'REST' ? "text-orange-500" : "text-red-500"
                  )} />
                )}
                <span className={cn(
                  "font-medium text-xs",
                  sourceDisplayState === 'WS' ? "text-green-600" :
                  sourceDisplayState === 'WS (cached)' ? "text-yellow-600" :
                  sourceDisplayState === 'REST' ? "text-orange-600" : "text-red-600"
                )}>
                  {sourceDisplayState}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{SOURCE_TOOLTIPS[sourceDisplayState]}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      
      {/* 19. Market Regime - Directive 11.4B */}
      <td className="px-3 py-3">
        {trade.marketRegime ? (
          <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClassName(trade.marketRegime))}>
            {formatRegimeTitle(trade.marketRegime)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      
      {/* 20. Market Friction - Directive 11.4B */}
      <td className="px-3 py-3">
        {trade.marketFrictionScore !== undefined && trade.marketFrictionScore !== null ? (
          <span className={cn(
            "inline-flex items-center px-2 py-1 rounded text-xs font-medium",
            getFrictionColorClasses(trade.marketFrictionScore).badge
          )}>
            {getFrictionLabel(trade.marketFrictionScore)}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      
      {/* 21. Duration */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="w-3 h-3" />
          {formatDuration(trade.holdingDurationMs)}
        </div>
      </td>
      
      {/* 22. Actions */}
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
  portfolio,
  openTradesNetPnlSum,
  onClearStranded,
  isClearing,
  onResetAll,
  isResetting
}: { 
  integrity: IntegrityStatus; 
  uiCount: number;
  portfolio: PortfolioSummary;
  openTradesNetPnlSum: number;
  onClearStranded: () => void;
  isClearing: boolean;
  onResetAll: () => void;
  isResetting: boolean;
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
          {/* Phase 8.8.4-A.2: Portfolio Value (unrealized) = Current Balance + Unrealized Net P/L */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Portfolio Value (unrealized):</span>
            <span className={cn("font-bold", ((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum) >= (portfolio.startingBalance ?? 0) ? "text-green-600" : "text-red-600")}>
              ${((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          
          {/* Phase 8.8.3-I9 Part C: Clear & Reset All Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                data-testid="button-clear-reset-all"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Clear & Reset All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Paper Trading Session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will close all open positions and refresh session state. 
                  Your trade history will remain intact for review.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={onResetAll}
                  disabled={isResetting}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {isResetting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Yes, Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
  
  // Phase 8.8.3-I9 Part C: Reset Session Mutation
  const resetSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/active-engine/reset', { method: 'POST', body: JSON.stringify({ mode: 'paper' }) });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Session Reset",
        description: result?.message || "Paper trading session has been cleared. Set new balance when you restart trading.",
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
      // Directive 8.8.4-C.14.D: Clear RTB signals table
      queryClient.invalidateQueries({ queryKey: ['/api/trading-signals'] });
      console.log('[8.8.4-C.14.D][RESET] Invalidated /api/trading-signals query');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset session",
        variant: "destructive",
      });
    }
  });
  
  // Phase 8.8.3-B3.6: Local state for real-time price updates from WebSocket
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; timestamp: string }>>({});
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  
  // Phase 8.8.3-I7-PRICE-FIX (C3): Track last data refresh for diagnostics
  const [lastDataRefreshAt, setLastDataRefreshAt] = useState<string | null>(null);
  
  const { data, isLoading, refetch } = useQuery<ActiveTradesResponse>({
    queryKey: ['/api/active-engine/active-trades'],
    enabled: isPaper,
    refetchInterval: 10000, // Phase 8.8.3-B3.6: 10 second refresh for metadata only (prices from WS)
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not focused
    staleTime: 5000, // Mark data as stale after 5 seconds
    refetchOnWindowFocus: true
  });
  
  // Phase 8.8.5-E: 30-second polling for VolumeClassifier tier assignments
  const { data: volumeTiersData } = useQuery<{
    ok: boolean;
    tiers: Record<string, { tier: 'HIGH' | 'MID' | 'LOW'; volume24h: number }>;
  }>({
    queryKey: ['/api/diagnostics/8.8.5/volume-tiers'],
    enabled: isPaper,
    refetchInterval: 30000, // 30-second polling per directive
    refetchIntervalInBackground: true,
    staleTime: 25000,
  });
  
  // Phase 8.8.5-E: 30-second polling for WebSocket health metrics
  const { data: wsHealthData } = useQuery<{
    ok: boolean;
    metrics: {
      symbolSources?: Record<string, { source: 'WS' | 'REST'; cached: boolean; blocked: boolean }>;
    };
  }>({
    queryKey: ['/api/diagnostics/8.8.5/health'],
    enabled: isPaper,
    refetchInterval: 30000, // 30-second polling per directive
    refetchIntervalInBackground: true,
    staleTime: 25000,
  });
  
  // Phase 8.8.5-E: Helper to get source display state for a symbol
  const getSourceDisplayState = useCallback((symbol: string, tradeSourceLabel?: 'WS' | 'REST'): SourceDisplayState => {
    const normalized = normalizeSymbol(symbol); // Use normalizeSymbol for consistent uppercase + slash removal
    const healthInfo = wsHealthData?.metrics?.symbolSources?.[normalized];
    
    if (healthInfo) {
      if (healthInfo.source === 'WS') {
        return healthInfo.cached ? 'WS (cached)' : 'WS';
      } else {
        return healthInfo.blocked ? 'REST (blocked)' : 'REST';
      }
    }
    
    // Fallback to trade's sourceLabel if health data not available
    return tradeSourceLabel === 'WS' ? 'WS' : 'REST';
  }, [wsHealthData]);
  
  // Phase 8.8.5-E: Helper to get volume tier display for a symbol
  // Uses VolumeClassifier API data, falls back to trade's own volumeBucket/volume24h
  const getVolumeTierDisplay = useCallback((
    symbol: string, 
    fallbackVolume?: number, 
    fallbackBucket?: 'High' | 'Medium' | 'Low' | 'Very Low'
  ): { tier: string; volume: string } => {
    const normalized = normalizeSymbol(symbol); // Use normalizeSymbol for consistent uppercase + slash removal
    const tierInfo = volumeTiersData?.tiers?.[normalized];
    
    if (tierInfo) {
      return {
        tier: tierInfo.tier,
        volume: formatVolume(tierInfo.volume24h),
      };
    }
    
    // Fallback to trade's own volume data per directive 8.8.5-E
    const bucketToTier: Record<string, string> = {
      'High': 'HIGH',
      'Medium': 'MID',
      'Low': 'LOW',
      'Very Low': 'LOW',
    };
    
    return {
      tier: bucketToTier[fallbackBucket || 'Medium'] || 'MID',
      volume: formatVolume(fallbackVolume || 0),
    };
  }, [volumeTiersData]);
  
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
      'active_trade_executed',
      'trading_state_changed',
      'scan_tick'
    ];
    
    if (tradeEventTypes.includes(lastMessage.type)) {
      // Invalidate and refetch on trade events
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    }
  }, [messages, isPaper, queryClient]);
  
  // Phase 8.8.3-A1: Updated to use standardized success response
  const closeTradeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiFetch(`/api/active-engine/close-trade/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_close' })
      });
    },
    onSuccess: (result) => {
      console.log('[8.8.3-A1][DEBUG] Close trade response:', result);
      // Check for success (supports both new 'success' and legacy 'ok' fields)
      const isSuccess = result?.success === true || result?.ok === true || result?.closedTradeId;
      if (isSuccess) {
        const pnl = result?.pnl ?? 0;
        toast({
          title: "Trade Closed",
          description: result?.message || `P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        });
      } else {
        console.error('[8.8.3-A1][ERROR] Close trade failed:', result);
        toast({
          title: "Error",
          description: result?.error || "Failed to close trade",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    },
    onError: (error) => {
      console.error('[8.8.3-A1][ERROR] Close trade mutation error:', error);
      toast({
        title: "Error",
        description: "Failed to close trade",
        variant: "destructive",
      });
    }
  });
  
  // Phase 8.8.3-A3: Updated to use standardized success response
  const clearStrandedMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/active-engine/force-clear-stranded', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (result) => {
      console.log('[8.8.3-A3][DEBUG] Clear stranded response:', result);
      // Check for success (supports both new 'success' and legacy 'ok' fields)
      const isSuccess = result?.success === true || result?.ok === true;
      if (isSuccess) {
        toast({
          title: "Stranded Trades Cleared",
          description: result.message || `Cleared ${result.strandedClosed || result.clearedCount || 0} stranded trades`,
        });
      } else {
        console.error('[8.8.3-A3][ERROR] Clear stranded failed:', result);
        toast({
          title: "Error",
          description: result?.error || "Failed to clear stranded trades",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    },
    onError: (error) => {
      console.error('[8.8.3-A3][ERROR] Clear stranded mutation error:', error);
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
        // Update price and recalculate P/L (including cost-adjusted metrics)
        const newCurrentPrice = livePrice.price;
        const positionValue = position.quantity * newCurrentPrice;
        
        // Fee/slippage constants (same as backend)
        const FEE_PERCENT = 0.0010; // 0.10%
        const SLIPPAGE_PERCENT = 0.0015; // 0.15%
        
        // Recalculate exit costs based on new price
        const newEstExitFee = positionValue * FEE_PERCENT;
        const newEstExitSlippage = positionValue * SLIPPAGE_PERCENT;
        const newEstTotalCost = (position.entryFee || 0) + (position.entrySlippage || 0) + newEstExitFee + newEstExitSlippage;
        
        // Gross P/L = price difference * quantity
        const newGrossPnl = (newCurrentPrice - position.entryPrice) * position.quantity;
        const newGrossPnlPercent = ((newCurrentPrice - position.entryPrice) / position.entryPrice) * 100;
        
        // Net P/L = Gross P/L - Total Costs
        const newNetPnl = newGrossPnl - newEstTotalCost;
        const entryValue = position.quantity * position.entryPrice;
        const newNetPnlPercent = entryValue > 0 ? (newNetPnl / entryValue) * 100 : 0;
        
        const newHealth = newGrossPnlPercent > 1 ? 'green' : newGrossPnlPercent < -1 ? 'red' : 'yellow';
        
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
          unrealizedPnl: newGrossPnl,
          unrealizedPnlPercent: newGrossPnlPercent,
          grossPnl: newGrossPnl,
          grossPnlPercent: newGrossPnlPercent,
          netPnl: newNetPnl,
          netPnlPercent: newNetPnlPercent,
          estExitFee: newEstExitFee,
          estExitSlippage: newEstExitSlippage,
          estTotalCost: newEstTotalCost,
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
  const portfolio = data?.portfolio || { startingBalance: 0, currentBalance: 0, realizedBalance: 0, totalPositionValue: 0, netPnl: 0, netPnlPercent: 0 };

  // Calculate sum of all open trades' Net P/L for the green bar display
  const openTradesNetPnlSum = positions.reduce((sum, pos) => sum + (parseFloat(String(pos.netPnl)) || 0), 0);

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
        portfolio={portfolio}
        openTradesNetPnlSum={openTradesNetPnlSum}
        onClearStranded={() => clearStrandedMutation.mutate()}
        isClearing={clearStrandedMutation.isPending}
        onResetAll={() => resetSessionMutation.mutate()}
        isResetting={resetSessionMutation.isPending}
      />
      
      <Card className="rounded-xl border shadow-sm overflow-hidden">
        {positions.length === 0 ? (
          <div className="p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-muted-foreground font-medium">No active trades</p>
            <p className="text-xs text-muted-foreground">
              {integrity.slotsAvailable} slots available for new positions
            </p>
          </div>
        ) : (
          <DualScrollTable>
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {/* Phase 8.8.3-C2A: Final column order per directive */}
                  <SortableHeader field="symbol" label="Symbol" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class</th>
                  <SortableHeader field="slotNumber" label="Slot" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="strategy" label="Strategy" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pool</th>
                  {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Fee Mode</th>
                  <SortableHeader field="quantity" label="Qty / Value" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="intendedEntryPrice" label="Entry" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="takeProfit" label="Target (TP)" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="currentPrice" label="Current" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dist</th>
                  <SortableHeader field="grossPnl" label="Gross P/L" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="entryFee" label="Entry Fee" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="entrySlippage" label="Entry Slip" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="estExitFee" label="Exit Fee" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="estExitSlippage" label="Exit Slip" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="estTotalCost" label="Total Cost" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="netPnl" label="Net P/L" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="finalScore" label="FinalScore" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="confidence" label="Conf" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="volume24h" label="Volume" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <th className="px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                  <SortableHeader field="marketRegime" label="Regime" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="marketFriction" label="Friction" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader field="holdingDurationMs" label="Duration" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
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
                    volumeTierDisplay={getVolumeTierDisplay(trade.symbol, trade.volume24h, trade.volumeBucket)}
                    sourceDisplayState={getSourceDisplayState(trade.symbol, trade.sourceLabel)}
                  />
                ))}
              </tbody>
            </table>
          </DualScrollTable>
        )}
      </Card>
    </section>
  );
}
