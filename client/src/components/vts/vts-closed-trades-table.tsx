// P19-B8.1 (C1): ClosedTradesTable extracted verbatim from client/src/pages/machine-learning.tsx
// (pure extraction, zero behavior change).
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AssetClassBadge } from "@/components/ui/asset-class-badge";
import { getAssetName } from "@shared/asset-names";
import { TrendingUp, TrendingDown, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { getFrictionLabel } from "@/utils/frictionColor";
import { formatEntryFeeMode } from "@/lib/utils";
import {
  type ClosedTrade,
  type SortDirection,
  SortableHeader,
  getRegimeBadgeColor,
  normalizeRegimeDisplay,
  getPoolBadgeColor,
  getSourcePoolBadgeColor,
  getResultBadgeColor,
  getResultLabel,
  getProfitColor,
  formatDuration,
  formatEntryLiquidity,
  isBenchmarkSymbol,
} from "./vts-shared";

// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
// P19-B8.10 (OBJ-7): Regime Wt column removed (Kyle 2026-07-18) — the value was a
// 0.5 constant on active rows (#529 rider); regimeWeight stays on the row type as data.
type ClosedSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'resultType' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'exitTime' | 'durationMinutes';

/**
 * P19-B8.7 Step-9: this table is now the SHARED closed-trades component — the
 * VTS tab AND the paper mode page both mount it (paper rows arrive via
 * client/src/lib/paper-trade-adapter.ts). Paper-only affordances ride the two
 * OPTIONAL append props, which DEFAULT OFF — the VTS mount passes nothing and
 * renders exactly as before (Langston shared-component ruling B, condition 1).
 */
export function ClosedTradesTable({
  trades,
  extraHeaders,
  renderExtraCells,
  emptyLabel = "No closed trades in the last 7 days",
}: {
  trades: ClosedTrade[];
  /** Appended <th> nodes rendered AFTER the standard columns. Default OFF. */
  extraHeaders?: React.ReactNode;
  /** Appended <td> nodes per row, matching extraHeaders. Default OFF. */
  renderExtraCells?: (trade: ClosedTrade, index: number) => React.ReactNode;
  /** Empty-state text; default keeps the VTS wording. */
  emptyLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [sortField, setSortField] = useState<ClosedSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as ClosedSortField);
      setSortDirection('desc');
    }
  }, [sortField]);

  const sortedTrades = useMemo(() => {
    if (!sortField) return trades;
    return [...trades].sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      switch (sortField) {
        case 'symbol': aVal = a.symbol; bVal = b.symbol; break;
        case 'regime': aVal = a.regime; bVal = b.regime; break;
        case 'strategy': aVal = a.strategy; bVal = b.strategy; break;
        case 'pool': aVal = a.pool; bVal = b.pool; break;
        case 'dollarValue': aVal = a.dollarValue ?? 0; bVal = b.dollarValue ?? 0; break;
        case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
        case 'resultType': aVal = a.resultType; bVal = b.resultType; break;
        // NaN-safe: adapter rows carry NaN for genuinely-null P/L (em-dash cells).
        case 'grossProfitValue': aVal = Number.isFinite(a.grossProfitValue) ? a.grossProfitValue : 0; bVal = Number.isFinite(b.grossProfitValue) ? b.grossProfitValue : 0; break;
        case 'netProfitValue': aVal = Number.isFinite(a.netProfitValue) ? a.netProfitValue : 0; bVal = Number.isFinite(b.netProfitValue) ? b.netProfitValue : 0; break;
        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
        case 'exitTime': aVal = new Date(a.exitTime).getTime(); bVal = new Date(b.exitTime).getTime(); break;
        case 'durationMinutes': aVal = a.durationMinutes; bVal = b.durationMinutes; break;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [trades, sortField, sortDirection]);

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

  // HF7: Sync top scrollbar width to match actual table content width
  useEffect(() => {
    if (scrollRef.current && topScrollRef.current) {
      const spacer = topScrollRef.current.firstElementChild as HTMLElement;
      if (spacer) spacer.style.width = `${scrollRef.current.scrollWidth}px`;
    }
  });

  return (
    <div className="relative">
      <div 
        ref={topScrollRef}
        className="overflow-x-auto scrollbar-thin mb-1"
        onScroll={handleTopScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
        <div style={{ width: '2800px', height: '1px' }} />
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin max-h-[calc(100vh-13rem)]"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* B-NEW-31 (2026-05-14): outer container scrolls both axes with bounded
            max-height so the sticky thead + sticky first-column work correctly.
            Mirrors the OpenTradesTable freeze logic. */}
        <table className="w-full min-w-[2800px] text-sm">
          <thead className="sticky top-0 bg-card z-20">
            <tr className="border-b border-border">
              {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
                  B-NEW-31 (2026-05-14): first-column header sticky-left + z-30 (top-left corner). */}
              <SortableHeader label="Symbol" field="symbol" currentSort={sortField} direction={sortDirection} onSort={handleSort} extraClass="sticky left-0 z-30 bg-card text-left" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">B/S</th>
              <SortableHeader label="Regime" field="regime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Strategy" field="strategy" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <SortableHeader label="Pool (I/R)" field="pool" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source Pool</th>
              {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="The maker/taker entry fee-mode this trade opened on (entry-side fee only). '—' for trades opened before this column existed.">Entry Fee Mode</th>
              {/* P19-B8.7 Step-9: the B8.6 maker target-exit cohort stamps — which fee
                  the EXIT actually paid, and whether a resting maker exit filled or
                  converted to taker. '—' on rows without the stamps (VTS, pre-B8.6). */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Which fee mode the EXIT actually paid: maker = resting target-exit filled; taker = market exit (stops, converts, timeouts). 'fill'/'convert' shows the resting-exit outcome. '—' for rows without the stamps.">Exit Fee Mode</th>
              {/* B65.2-HF2c: TEC State column on Closed Simulated Trades for parity with Open table */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Trailing-exit mode the trade ended in. TARGET = closed at static target/stop/timeout; MOONBAG = flipped into trailing mode at target and closed via trailing stop or moonbag-duration cap.">TEC State</th>
              {/* B.2.UI (2026-06-02): entry-liquidity captured at trade-open.
                  xStock → ask-side order-book depth USD ("$… · OB");
                  crypto → native 24h coin-unit volume ("… QTY"). */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Liquidity at trade-open. xStock: ask-side order-book depth in USD ($… · OB). Crypto: native 24h volume in coin units (… QTY). '—' for trades opened before this column existed.">Volume / Order Book</th>
              <SortableHeader label="$ Value / Qty" field="dollarValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Entry/Exit" field="entryPrice" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <SortableHeader label="Result" field="resultType" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="center" />
              <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              {/* P19-B8.7 Step-9 (Kyle cost-transparency ruling): Costs is now a
                  5-col REALIZED split. Rows without a breakdown (VTS today) show
                  the total + em-dashes. */}
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side fee actually charged at open.">Entry Fee</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side slippage vs the intended price.">Entry Slip</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Exit-side fee actually charged at close.">Exit Fee</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Exit-side slippage vs the target exit price.">Exit Slip</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Total realized round-trip cost: entry fee + entry slip + exit fee + exit slip.">Total Costs</th>
              <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />

              {/* P19-B8.7 Step-9 (Kyle 2026-07-17 ruling): FinalScore RETIRED — column removed. */}
              <SortableHeader label="Edge" field="expectedEdge" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl Regime</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Pair Fric.</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Glbl Fric.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pair DBS</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
              <SortableHeader label="Entry/Exit Time" field="exitTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Duration" field="durationMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              {/* P19-B8.7 Step-9: paper-only appended columns (default OFF) */}
              {extraHeaders}
            </tr>
          </thead>
          <tbody>
            {sortedTrades.length === 0 ? (
              <tr>
                {/* colSpan 33 = 32 standard columns post cost-split/exit-mode + headroom
                    for appended paper columns (browsers clamp overshoot). */}
                <td colSpan={32} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.exitTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
                  {/* B69.1 (2026-05-04): symbol + asset class badge stacked vertically.
                      BATCH_80 (2026-05-13): added asset-name line BETWEEN symbol and
                      full asset-class badge per Kyle directive 2026-05-13 (revised:
                      asset NAME not category). Lookup from shared/asset-names.ts:
                        BTC → Bitcoin, ETH → Ethereum, SOL → Solana,
                        AAPL → Apple, BABA → Alibaba, NIO → NIO, MRNA → Moderna, ...
                      Renders nothing if symbol isn't in the map (maintain by adding
                      entries in shared/asset-names.ts as new pairs enter universe).
                      B-NEW-31 (2026-05-14): sticky-left + bg-card so column stays
                      visible during horizontal scroll. z-10 keeps it above body cells
                      but below the sticky thead (z-20) and top-left corner (z-30). */}
                  <td className="px-3 py-2 sticky left-0 z-10 bg-card">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{trade.symbol}</span>
                      {getAssetName(trade.symbol, trade.assetClass) && (
                        <span className="text-[10px] text-muted-foreground">
                          {getAssetName(trade.symbol, trade.assetClass)}
                        </span>
                      )}
                      <AssetClassBadge assetClass={trade.assetClass} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${isBenchmarkSymbol(trade.symbol) ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                      {isBenchmarkSymbol(trade.symbol) ? 'Benchmark' : 'Standard'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {/* B67.2.1 (2026-04-29): regime label + confidence + phase in the
                        SAME column per Kyle directive. Confidence shows post-modulation
                        (raw × macro_modifier × strategy_phase_weight) effective number;
                        phase badge surfaces EARLY/PRIME/LATE for age awareness. */}
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="outline" className={`text-xs ${getRegimeBadgeColor(trade.regime)}`}>
                        {normalizeRegimeDisplay(trade.regime)}
                      </Badge>
                      {trade.regimeConfidenceModulated != null && (
                        <span className="text-[10px] text-muted-foreground" title={`raw=${trade.regimeConfidenceRaw?.toFixed(3) ?? '—'} × modifier=${trade.macroModifierValue?.toFixed(3) ?? '—'} × phase_w=${trade.strategyPhaseWeight?.toFixed(3) ?? '—'}`}>
                          conf {trade.regimeConfidenceModulated.toFixed(3)}
                        </span>
                      )}
                      {trade.phase && (
                        <Badge variant="outline" className={`text-[10px] w-fit ${
                          trade.phase === 'EARLY' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' :
                          trade.phase === 'PRIME' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                          'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`} title={`age ${trade.phaseAgeSeconds != null ? Math.floor(trade.phaseAgeSeconds / 60) : '?'}m`}>
                          {trade.phase}
                        </Badge>
                      )}
                    </div>
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
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-xs ${getSourcePoolBadgeColor(trade.sourcePool ?? 'unknown')}`}>
                      {(trade.sourcePool ?? 'unknown').toUpperCase()}
                    </Badge>
                  </td>
                  {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <span>{formatEntryFeeMode(trade.chosenEntryMode, trade.entryFeeRate)}</span>
                      {/* P19-B7.2c: a resting maker order shows PENDING until it fills or drops */}
                      {(trade as any).state === 'pending' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 w-fit">PENDING</span>
                      )}
                      {/* P19-B7.2c (Kyle): which leg the decision service actually picked */}
                      {(trade as any).mtTwin === true ? (
                        <span className="text-[10px] text-muted-foreground">twin (not chosen)</span>
                      ) : (trade as any).mtTwin === false && trade.chosenEntryMode ? (
                        <span className="text-[10px] text-muted-foreground">chosen</span>
                      ) : null}
                    </div>
                  </td>
                  {/* P19-B8.7 Step-9: Exit Fee Mode — the B8.6 exit_fee_mode stamp plus
                      the resting-exit outcome (fill/convert). '—' when unstamped. */}
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {trade.exitFeeMode ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={trade.exitFeeMode === 'maker' ? 'text-emerald-400' : 'text-muted-foreground'}>
                          {trade.exitFeeMode.toUpperCase()}
                        </span>
                        {trade.exitRestOutcome && (
                          <span className="text-[10px] text-muted-foreground">
                            {trade.exitRestOutcome === 'fill' ? 'rested — filled' : trade.exitRestOutcome === 'convert' ? 'rested — converted' : trade.exitRestOutcome}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* B65.2-HF2c: TEC State column on Closed — TARGET vs MOONBAG end-state */}
                  {/* B65.4 (2026-04-25): MOONBAG badge shows ladder rung count (MB×N) when present */}
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${(trade as any).tradeMode === 'TRAILING_TAKE' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
                      title={(trade as any).tradeMode === 'TRAILING_TAKE'
                        ? `Trade entered moonbag (trailing) mode after hitting target. ${(trade as any).ladderRungsHit > 0 ? `Ratcheted through ${(trade as any).ladderRungsHit} ladder rung target hit${(trade as any).ladderRungsHit === 1 ? '' : 's'} before exiting.` : ''}`
                        : 'Trade closed at static target, stop, or timeout — never entered trailing mode'}
                    >
                      {(trade as any).tradeMode === 'TRAILING_TAKE'
                        ? `🌙 MB×${(trade as any).ladderRungsHit ?? 1}`
                        : 'TARGET'}
                    </Badge>
                  </td>
                  {/* B.2.UI (2026-06-02): entry-liquidity at trade-open.
                      xStock → "$… · OB" (ask-side order-book depth USD);
                      crypto → "… QTY" (native 24h coin-unit volume). */}
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground whitespace-normal break-words">
                      {formatEntryLiquidity(trade.entryLiquidityValue, trade.entryLiquidityKind)}
                    </span>
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
                    {/* B65.2-HF2c: Moonbag state moved to a dedicated TEC State column.
                        This cell keeps the expanded result mapping (Trail Stop / Moonbag Cap) only. */}
                    {/* P19-B7.2c: a dropped pending maker — visible, keyed on the TYPED
                        resultType (never a display string); excluded from stats/learning. */}
                    {trade.resultType?.toLowerCase?.() === 'never_filled' ? (
                      <Badge variant="outline" className="text-xs bg-slate-500/20 text-slate-400 border-slate-500/40">
                        Never filled — dropped
                      </Badge>
                    ) : (
                    <Badge variant="outline" className={`text-xs ${getResultBadgeColor(trade.resultType)}`}>
                      {trade.resultType === 'TRAILING_STOP_HIT' || trade.resultType === 'MOONBAG_TIMEOUT' ? (
                        <TrendingUp className="w-3 h-3 mr-1 inline" />
                      ) : trade.resultType.includes('TARGET') || trade.resultType.includes('PROFIT') ? (
                        <TrendingUp className="w-3 h-3 mr-1 inline" />
                      ) : trade.resultType.includes('STOP') ? (
                        <TrendingDown className="w-3 h-3 mr-1 inline" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 mr-1 inline" />
                      )}
                      {getResultLabel(trade.resultType)}
                    </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* P19-B8.7 Step-9 (Langston note 2): a genuinely-null P/L arrives
                        as NaN from the adapter — em-dash, never a fabricated $0.00. */}
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                        {Number.isFinite(trade.grossProfitValue) ? `$${trade.grossProfitValue.toFixed(2)}` : '—'}
                      </span>
                      <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                        {trade.grossProfitPercent}
                      </span>
                    </div>
                  </td>
                  {/* P19-B8.7 Step-9: realized cost 5-col split. Breakdown absent →
                      em-dash (never a fabricated 0); the total renders either way. */}
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {trade.costEntryFee != null ? `$${trade.costEntryFee.toFixed(4)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {trade.costEntrySlippage != null ? `$${trade.costEntrySlippage.toFixed(4)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {trade.costExitFee != null ? `$${trade.costExitFee.toFixed(4)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {trade.costExitSlippage != null ? `$${trade.costExitSlippage.toFixed(4)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    ${trade.costs.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
                        {Number.isFinite(trade.netProfitValue) ? `$${trade.netProfitValue.toFixed(2)}` : '—'}
                      </span>
                      <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                        {trade.netProfitPercent}
                      </span>
                    </div>
                  </td>
                  {/* P19-B8.7 Step-9: absent values render an em-dash, never a
                      fabricated 0.00 (adapter rows may lack metadata-sourced numbers). */}
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span>{trade.pairDirectionalBias || '\u2014'}</span>
                      {trade.pairDirectionalBiasScore != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trade.pairDirectionalBiasScore >= 0 ? '+' : ''}{trade.pairDirectionalBiasScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      {/* P19-B8.10 (OBJ-6): absent global DBS renders the shared em-dash —
                          the old "pending" literal implied a state that does not exist. */}
                      <span>{trade.globalDirectionalBias || '—'}</span>
                      {trade.globalDirectionalBiasScore != null && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {trade.globalDirectionalBiasScore >= 0 ? '+' : ''}{trade.globalDirectionalBiasScore.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </td>
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
                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
                  {renderExtraCells?.(trade, idx)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
