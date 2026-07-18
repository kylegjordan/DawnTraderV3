import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, ArrowUpDown, Clock } from "lucide-react";
import { cn, formatEntryFeeMode } from "@/lib/utils";
import { VenueQuietPrice } from "./venue-quiet-price-cell";
import { useWebSocket } from "@/hooks/use-websocket";
import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
// P19-B8.7 Step-9: the same stacked symbol-cell name source the VTS tables use.
import { getAssetName } from "@shared/asset-names";
import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
// Kyle 2026-07-17: Duration column reuses the VTS minutes formatter (1h 5m / 2d 3h).
import { formatDuration } from "@/components/vts/vts-shared";

interface TradingSignal {
  id: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  strategy: string;
  confidence: number;
  strategyWeight: number | null;
  // P19-B8.7 Step-9 (Kyle directive): the ATTACHED rank key — whatever the active
  // ranker arm actually sorted on (server getDisplayRankKey; never recomputed here).
  rankScore: number | null;
  rankArm?: string;
  assetClass?: string | null;
  // Typed decision-time columns carried on the rtb row (reorg-B3 / B7.2).
  dbsScoreAtQueue?: number | string | null;
  chosenNetEv?: number | string | null;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
  volume24h: number | null;
  status: 'active' | 'reconfirmed' | 'promoted' | 'expired' | 'executed';
  detectedAt: string;
  // Kyle 2026-07-17: queue-entry timestamp (rtb_signals.queued_at, rides the
  // route's row spread) — the Duration column's anchor.
  queuedAt?: string | null;
  // Kyle 2026-07-18: the Signal column reads signalType/sourcePool from the row
  // metadata (where the SQE queue-write stores them; no typed columns exist).
  metadata?: Record<string, unknown> | null;
  estimatedQuantity?: number;
  estimatedValue?: number;
  marketRegime?: string;
  marketFrictionScore?: number;
  marketFrictionLabel?: string;
  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode snapshot carried on rtb_signals.
  chosenEntryMode?: string | null;
  entryFeeRate?: number | string | null;
  // P19-B8.9 (OBJ-5): venue-quiet state for the Current column — server-side cache
  // peek (never a fetch): true when no venue-tagged price fresher than the quiet
  // threshold is held for this symbol.
  priceVenueQuiet?: boolean;
  priceAgeMs?: number | null;
}

interface TradingSignalsResponse {
  signals: TradingSignal[];
  timestamp: string;
}

// Kyle 2026-07-17: 'strategyWeight' REMOVED with its column (S.Wgt — degenerate
// display, see the header comment at the removal site); 'queueAge' added (Duration).
type SortField = 'rank' | 'symbol' | 'rankScore' | 'volume' | 'price' | 'strategy' | 'entry' | 'target' | 'stop' | 'quantity' | 'status' | 'marketRegime' | 'marketFriction' | 'dbs' | 'netEv' | 'queueAge';
type SortDirection = 'asc' | 'desc';

export default function ReadyToBuyTable() {
  // P19-B8.7 Step-9: name overlays loaded where the names render (the B8.1 gap fix).
  useAssetNameOverlays();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // P19-B8.7 Step-9: default sort = the attached rank key — what you see first is
  // what the system promotes first.
  const [sortField, setSortField] = useState<SortField>('rankScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const queryClient = useQueryClient();
  const { messages } = useWebSocket();
  
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  
  const syncScroll = useCallback((source: 'top' | 'bottom') => {
    const topEl = topScrollRef.current;
    const bottomEl = bottomScrollRef.current;
    if (!topEl || !bottomEl) return;
    
    if (source === 'top') {
      bottomEl.scrollLeft = topEl.scrollLeft;
    } else {
      topEl.scrollLeft = bottomEl.scrollLeft;
    }
  }, []);

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

  useEffect(() => {
    const updateScrollWidth = () => {
      if (bottomScrollRef.current) {
        setScrollWidth(bottomScrollRef.current.scrollWidth);
      }
    };
    updateScrollWidth();
    const timeoutId = setTimeout(updateScrollWidth, 100);
    window.addEventListener('resize', updateScrollWidth);
    return () => {
      window.removeEventListener('resize', updateScrollWidth);
      clearTimeout(timeoutId);
    };
  }, [data]);

  // Directive 8.8.4-C.14.D: Listen for rtb:cleared event directly
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.type === 'rtb:cleared') {
      console.log('[8.8.4-C.14.D][RTB_CLEARED] Received rtb:cleared event, clearing table');
      // Clear table immediately
      queryClient.setQueryData(['/api/trading-signals'], []);
      setLastUpdated(new Date());
    }
  }, [messages, queryClient]);

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
      case 'rankScore':
        // null (unpriceable) sorts to the bottom under desc — mirrors the ranker's
        // own -Infinity handling.
        aValue = a.rankScore ?? -Infinity;
        bValue = b.rankScore ?? -Infinity;
        break;
      case 'dbs':
        aValue = a.dbsScoreAtQueue != null ? Number(a.dbsScoreAtQueue) : -Infinity;
        bValue = b.dbsScoreAtQueue != null ? Number(b.dbsScoreAtQueue) : -Infinity;
        break;
      case 'netEv':
        aValue = a.chosenNetEv != null ? Number(a.chosenNetEv) : -Infinity;
        bValue = b.chosenNetEv != null ? Number(b.chosenNetEv) : -Infinity;
        break;
      case 'queueAge':
        // Older queue entry = larger age; missing timestamp sorts newest.
        aValue = a.queuedAt ? Date.now() - new Date(a.queuedAt).getTime() : 0;
        bValue = b.queuedAt ? Date.now() - new Date(b.queuedAt).getTime() : 0;
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
      case 'status':
        aValue = a.status || '';
        bValue = b.status || '';
        break;
      case 'marketRegime':
        aValue = a.marketRegime || '';
        bValue = b.marketRegime || '';
        break;
      case 'marketFriction':
        aValue = a.marketFrictionScore ?? 0;
        bValue = b.marketFrictionScore ?? 0;
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
        {/* P19-B8.7 Step-9 (Kyle 00:45Z screenshot): the description advertised the
            retired FinalScore — rewritten to the attached-rank-key truth. */}
        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p>
            <strong>Ready-to-Buy Signals:</strong> All SQE-qualified signals, ordered by RankingScore —
            the exact value the promotion ranker sorts on (reward per unit of risk under the active
            ranker configuration). The top-ranked signal is next in line to be promoted to an open
            trade; signals remain in this pool until promotion, re-evaluation removal, or expiration,
            and the order adjusts continuously as current and new signals are re-ranked.
          </p>
        </div>
        
        {isLoading && !data ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading trading signals...</p>
          </div>
        ) : sortedSignals.length > 0 ? (
          <>
            <div 
              ref={topScrollRef}
              className="overflow-x-auto mb-1"
              onScroll={() => syncScroll('top')}
              style={{ overflowY: 'hidden' }}
            >
              <div style={{ width: scrollWidth, height: 1 }} />
            </div>
            <div 
              ref={bottomScrollRef}
              className="overflow-x-auto"
              onScroll={() => syncScroll('bottom')}
            >
            <table className="w-full" data-testid="table-trading-signals">
              <thead>
                <tr className="border-b">
                  {/* P19-B8.7 Step-9 (Kyle directive): Rank = position in the true
                      promotion order; RankingScore = the ATTACHED active rank key;
                      FinalScore + ML Conf columns REMOVED (inert/fabricated). */}
                  <SortHeader field="rankScore" label="Rank" />
                  {/* Kyle 2026-07-18 (supersedes 07-17): Symbol BEFORE RankingScore. */}
                  <SortHeader field="symbol" label="Symbol" />
                  <SortHeader field="rankScore" label="RankingScore" />
                  {/* Kyle 2026-07-17: S.Wgt column REMOVED — the displayed value was
                      degenerate (every row at the 0.2 equal-weight/fallback), so it
                      conveyed nothing. The L9 weight MACHINERY is NOT dead (it feeds
                      the L10 exposure-bias multipliers) — its functioning-vs-degenerate
                      investigation is #529 (B-STRATEGY-WEIGHT-INVESTIGATION), its own
                      batch sequenced immediately BEFORE the #522 runtime audit (Kyle);
                      full metric retirement only after that trace. */}
                  <SortHeader field="price" label="Price" />
                  <SortHeader field="entry" label="Entry" />
                  <SortHeader field="target" label="Target" />
                  <SortHeader field="stop" label="Stop" />
                  <SortHeader field="quantity" label="Qty" />
                  <SortHeader field="volume" label="24h Vol" />
                  <SortHeader field="strategy" label="Strategy" />
                  {/* Kyle 2026-07-18: pattern-vs-quant visibility on the queue. */}
                  <th className="text-left py-2 px-3 font-medium" data-testid="header-signal-type" title="How this signal was generated: QUANT (regime-driven strategy selection), PATTERN (candlestick-pattern trigger), or HYBRID (quant + pattern confluence).">Signal</th>
                  <SortHeader field="marketRegime" label="Regime" />
                  <SortHeader field="marketFriction" label="Friction" />
                  {/* P19-B8.7 Step-9: decision-time DBS + the chosen net EV the
                      admission gate runs on (typed rtb columns, reorg-B3/B7.2). */}
                  <SortHeader field="dbs" label="DBS" />
                  <SortHeader field="netEv" label="Net EV" />
                  {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column — non-sortable */}
                  <th className="text-left py-2 px-3 font-medium" data-testid="header-entry-fee-mode">Entry Fee Mode</th>
                  {/* Kyle 2026-07-17: time in the ready-to-buy queue (queued_at → now). */}
                  <SortHeader field="queueAge" label="Duration" />
                  <SortHeader field="status" label="Status" />
                </tr>
              </thead>
              <tbody>
                {sortedSignals.map((signal, index) => {
                  const entryPrice = Number(signal.entryPrice);
                  const targetPrice = Number(signal.targetPrice);
                  const stopPrice = Number(signal.stopPrice);
                  const currentPrice = Number(signal.currentPrice);
                  // P19-B8.7 Step-9: the score/mlConfidence/finalRank locals are GONE
                  // with their columns (inert finalScore, fabricated mlConfidence,
                  // display-only finalRank formula — see the route mapper comment).
                  const volume24h = signal.volume24h !== null ? Number(signal.volume24h) : null;

                  const profitPotential = ((targetPrice - entryPrice) / entryPrice) * 100;
                  const riskPercent = ((entryPrice - stopPrice) / entryPrice) * 100;
                  const rank = index + 1;
                  // P19-B8.7 Step-9: the attached rank key + the typed decision columns.
                  const rankScore = signal.rankScore != null ? Number(signal.rankScore) : null;
                  const dbsAtQueue = signal.dbsScoreAtQueue != null ? Number(signal.dbsScoreAtQueue) : null;
                  const chosenNetEv = signal.chosenNetEv != null ? Number(signal.chosenNetEv) : null;
                  const assetName = getAssetName(signal.symbol, signal.assetClass ?? undefined);

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
                      {/* Kyle 2026-07-18: Symbol cell BEFORE RankingScore (supersedes the
                          07-17 order). Stacked symbol — pair + display name + class
                          badge, the same getAssetName composition the VTS tables use. */}
                      <td className="py-3 px-3" data-testid={`text-symbol-${index}`}>
                        <div className="flex flex-col">
                          <span className="font-semibold">{signal.symbol}</span>
                          {assetName && (
                            <span className="text-xs text-muted-foreground">{assetName}</span>
                          )}
                          {signal.assetClass && (
                            <Badge variant="outline" className="text-[10px] w-fit mt-0.5">
                              {signal.assetClass === 'xstock_spot' ? 'xStock' : signal.assetClass === 'crypto_spot' ? 'Crypto' : signal.assetClass}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-ranking-score-${index}`}>
                        <span className={cn(
                          "font-semibold font-mono",
                          rankScore !== null && rankScore > 0 ? "text-success" : "text-muted-foreground"
                        )}>
                          {rankScore !== null && !isNaN(rankScore) ? rankScore.toFixed(4) : '—'}
                        </span>
                      </td>
                      {/* P19-B8.9 (OBJ-5): the stored row price wears the venue-quiet badge
                          when we hold no fresh venue-tagged value for the symbol (server-side
                          cache peek — never a fetch). */}
                      <td className="text-right py-3 px-3 font-mono" data-testid={`text-price-${index}`}>
                        {signal.priceVenueQuiet ? (
                          <VenueQuietPrice
                            price={!isNaN(currentPrice) ? currentPrice : null}
                            ageMs={signal.priceAgeMs}
                            decimals={currentPrice < 1 ? 4 : 2}
                            className="text-right"
                            testId={`cell-current-venue-quiet-${index}`}
                          />
                        ) : (
                          !isNaN(currentPrice)
                            ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}`
                            : '—'
                        )}
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
                            ? `${(volume24h / 1000000).toFixed(2)}M`
                            : `${(volume24h / 1000).toFixed(0)}K`
                          : '—'
                        }
                      </td>
                      <td className="py-3 px-3" data-testid={`text-strategy-${index}`}>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {formatStrategy(signal.strategy)}
                        </span>
                      </td>
                      {/* Kyle 2026-07-18: QUANT / PATTERN / HYBRID origin, from the
                          queue-time metadata (honest em-dash when absent). Colors match
                          the VTS source-pool convention (blue/purple/orange). */}
                      <td className="py-3 px-3" data-testid={`text-signal-type-${index}`}>
                        {(() => {
                          const st = typeof (signal.metadata as any)?.signalType === 'string' ? (signal.metadata as any).signalType as string : null;
                          if (!st) return <span className="text-muted-foreground">—</span>;
                          const cls = st === 'QUANT' ? 'bg-blue-500/10 text-blue-500'
                            : st === 'PATTERN' ? 'bg-purple-500/10 text-purple-500'
                            : st === 'HYBRID' ? 'bg-orange-500/10 text-orange-500'
                            : 'bg-muted text-muted-foreground';
                          return <span className={cn('inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', cls)}>{st}</span>;
                        })()}
                      </td>
                      <td className="py-3 px-3" data-testid={`text-regime-${index}`}>
                        {signal.marketRegime ? (
                          <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClassName(signal.marketRegime))}>
                            {formatRegimeTitle(signal.marketRegime)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3" data-testid={`text-friction-${index}`}>
                        {signal.marketFrictionScore !== undefined && signal.marketFrictionScore !== null ? (
                          <span className={cn(
                            "inline-flex items-center px-2 py-1 rounded text-xs font-medium",
                            getFrictionColorClasses(signal.marketFrictionScore).badge
                          )}>
                            {getFrictionLabel(signal.marketFrictionScore)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      {/* P19-B8.7 Step-9: decision-time DBS + the chosen net EV the
                          admission gate runs on. Both typed-column-sourced; honest
                          em-dash on absent, never a substituted number. */}
                      <td className="text-right py-3 px-3 font-mono" data-testid={`text-dbs-${index}`}>
                        {dbsAtQueue !== null && !isNaN(dbsAtQueue) ? dbsAtQueue.toFixed(4) : '—'}
                      </td>
                      <td className="text-right py-3 px-3" data-testid={`text-net-ev-${index}`}>
                        <span className={cn(
                          "font-mono font-semibold",
                          chosenNetEv !== null && chosenNetEv > 0 ? "text-success" : chosenNetEv !== null ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {chosenNetEv !== null && !isNaN(chosenNetEv) ? chosenNetEv.toFixed(6) : '—'}
                        </span>
                      </td>
                      {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) — NULL renders em-dash */}
                      <td className="py-3 px-3 text-xs" data-testid={`text-entry-fee-mode-${index}`}>
                        {formatEntryFeeMode(signal.chosenEntryMode, signal.entryFeeRate)}
                      </td>
                      {/* Kyle 2026-07-17: time in the queue since queued_at; the 30s
                          auto-refresh keeps it current. Missing timestamp → em-dash. */}
                      <td className="py-3 px-3 text-xs whitespace-nowrap" data-testid={`text-queue-age-${index}`}>
                        {signal.queuedAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            {formatDuration(Math.max(0, Math.floor((Date.now() - new Date(signal.queuedAt).getTime()) / 60000)))}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-3" data-testid={`text-status-${index}`}>
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                          signal.status === 'active' ? "bg-blue-500/10 text-blue-500" :
                          signal.status === 'reconfirmed' ? "bg-success/10 text-success" :
                          signal.status === 'promoted' ? "bg-amber-500/10 text-amber-500" :
                          signal.status === 'expired' ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {signal.status || 'queued'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
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
