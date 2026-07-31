// P19-B8.1 (C1): OpenTradesTable extracted verbatim from client/src/pages/machine-learning.tsx
// (pure extraction, zero behavior change).
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AssetClassBadge } from "@/components/ui/asset-class-badge";
import { getAssetName } from "@shared/asset-names";
import { Clock } from "lucide-react";
import { format } from "date-fns";
import { getFrictionLabel } from "@/utils/frictionColor";
import { formatEntryFeeMode } from "@/lib/utils";
// P19-B8.7 Step-9 (B8.9 carry, reconciled to OLD Claude's pushed b28cf7074): the
// venue-quiet Current-price treatment is ONE portable renderer driven by the
// SERVER's single age-aware priceVenueQuiet boolean (no client-side source
// classification — the age-blind helper was removed with his push). Paper
// adapter rows carry priceVenueQuiet/priceAgeMs; VTS rows don't (normal render).
import { VenueQuietPrice } from "@/components/trading/venue-quiet-price-cell";
import {
  type OpenTrade,
  type OpenSortField,
  type SortDirection,
  SortableHeader,
  getRegimeBadgeColor,
  normalizeRegimeDisplay,
  getPoolBadgeColor,
  getSourcePoolBadgeColor,
  getProfitColor,
  formatDuration,
  formatEntryLiquidity,
  isBenchmarkSymbol,
} from "./vts-shared";

/**
 * P19-B8.7 Step-9: this table is now the SHARED open-trades component — the VTS
 * tab AND the paper mode page both mount it (paper rows arrive via
 * client/src/lib/paper-trade-adapter.ts). Paper-only affordances (Slot, Actions,
 * …) ride the two OPTIONAL append props, which DEFAULT OFF — the VTS mount
 * passes nothing and renders exactly as before (Langston shared-component
 * ruling B, condition 1).
 */
export function OpenTradesTable({
  trades,
  extraHeaders,
  renderExtraCells,
  afterSymbolHeaders,
  renderAfterSymbolCells,
  rankHeaderLabel = "Rank",
  rankHeaderTitle,
  emptyLabel = "No open simulated trades",
}: {
  trades: OpenTrade[];
  /** Appended <th> nodes rendered AFTER the standard columns. Default OFF. */
  extraHeaders?: React.ReactNode;
  /** Appended <td> nodes per row, matching extraHeaders. Default OFF. */
  renderExtraCells?: (trade: OpenTrade, index: number) => React.ReactNode;
  /** P19-B8.10 (OBJ-3): <th> nodes inserted directly AFTER the Symbol column
      (Kyle: Slot second). Default OFF — the VTS mount renders as before. */
  afterSymbolHeaders?: React.ReactNode;
  /** P19-B8.10 (OBJ-5): label/tooltip for the ranking column. VTS default "Rank"
      (its live-computed ranking score); the paper mount passes "Promote R" (the
      promote-frozen R-multiple) — distinct labels because they are distinct
      quantities (Langston pin-down 2). */
  rankHeaderLabel?: string;
  rankHeaderTitle?: string;
  /** <td> nodes per row, matching afterSymbolHeaders. Default OFF. */
  renderAfterSymbolCells?: (trade: OpenTrade, index: number) => React.ReactNode;
  /** Empty-state text; default keeps the VTS wording. */
  emptyLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [sortField, setSortField] = useState<OpenSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as OpenSortField);
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
        case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
        case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
        case 'entryTime': aVal = new Date(a.entryTime).getTime(); bVal = new Date(b.entryTime).getTime(); break;
        case 'durationOpenMinutes': aVal = a.durationOpenMinutes; bVal = b.durationOpenMinutes; break;
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
        <div style={{ width: '2700px', height: '1px' }} />
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin max-h-[calc(100vh-13rem)]"
        onScroll={handleMainScroll}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* B-NEW-31 (2026-05-14): outer container now scrolls both axes with bounded
            max-height so the sticky thead + sticky first-column work correctly. Header
            stays pinned on vertical scroll; Symbol column stays pinned on horizontal
            scroll. Top-left corner uses z-30 so it sits above both axes. */}
        <table className="w-full min-w-[2700px] text-sm">
          <thead className="sticky top-0 bg-card z-20">
            <tr className="border-b border-border">
              {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
                  B-NEW-31 (2026-05-14): first-column header sticky-left + z-30 (top-left corner). */}
              <SortableHeader label="Symbol" field="symbol" currentSort={sortField} direction={sortDirection} onSort={handleSort} extraClass="sticky left-0 z-30 bg-card text-left" />
              {afterSymbolHeaders}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">B/S</th>
              <SortableHeader label="Regime" field="regime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Strategy" field="strategy" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Signal/Pattern</th>
              <SortableHeader label="Pool (I/R)" field="pool" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source Pool</th>
              {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="The maker/taker entry fee-mode this trade opened on (entry-side fee only). '—' for trades opened before this column existed.">Entry Fee Mode</th>
              {/* B65.2: TEC State column — trade mode + latch flags from trailing engine */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Trailing-exit engine state: TARGET = aiming at original target; TRAILING = moonbag (trailing for more upside after target hit). BE = break-even stop locked at 1×ATR gain.">TEC State</th>
              {/* B.2.UI (2026-06-02): entry-liquidity captured at trade-open.
                  xStock → ask-side order-book depth USD ("$… · OB");
                  crypto → native 24h coin-unit volume ("… QTY"). */}
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Liquidity at trade-open. xStock: ask-side order-book depth in USD ($… · OB). Crypto: native 24h volume in coin units (… QTY). '—' for trades opened before this column existed.">Volume / Order Book</th>
              <SortableHeader label="$ Value / Qty" field="dollarValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Entry/Current" field="entryPrice" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dist. T/S</th>
              <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              {/* P19-B8.7 Step-9 (Kyle cost-transparency ruling): Costs is now a
                  5-col split — entry fee/slip + estimated exit fee/slip + total.
                  Rows without a breakdown (VTS today) show the total + em-dashes. */}
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side fee actually charged at open.">Entry Fee</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side slippage vs the intended price.">Entry Slip</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="ESTIMATED exit-side fee (realized at close).">Est Exit Fee</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="ESTIMATED exit-side slippage (realized at close).">Est Exit Slip</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Total cost estimate. ACTIVE rows: EXPLICIT costs only — entry fee + est exit fee. Slippage is shown in its own columns and is NOT deducted here (it is already inside the actual fill prices; deducting it again double-counts). VTS rows may use a different composition — this tooltip does not assert one.">Total Costs</th>
              <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />

              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title={rankHeaderTitle}>{rankHeaderLabel}</th>
              {/* P19-B8.7 Step-9 (Kyle 2026-07-17 ruling): FinalScore is RETIRED —
                  no column for it in any table in any mode. The full calc/storage
                  purge is its own named batch. */}
              <SortableHeader label="Edge" field="expectedEdge" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <SortableHeader label="Regime Wt" field="regimeWeight" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl Regime</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Pair Fric.</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Glbl Fric.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Pair DBS</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
              <SortableHeader label="Entry Time" field="entryTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="Duration" field="durationOpenMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
              {/* P19-B8.7 Step-9: paper-only appended columns (default OFF) */}
              {extraHeaders}
            </tr>
          </thead>
          <tbody>
            {sortedTrades.length === 0 ? (
              <tr>
                {/* Empty-state span. Langston Step-4 (2026-07-29): the previous comment justified
                    this number by citing "the closed table's 32+1 pattern", which the closed table
                    did not implement — the citation was wrong, not just stale. Deliberately NOT
                    re-encoding a precise count: it only has to be >= the widest mount (browsers
                    clamp overshoot). Generous by design; the paper mount currently appends Slot +
                    Lane after Symbol and Source + Actions at the end. */}
                <td colSpan={40} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade, idx) => (
                <tr key={`${trade.symbol}-${trade.entryTime}-${idx}`} className="border-b border-border/50 hover:bg-muted/30">
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
                  {renderAfterSymbolCells?.(trade, idx)}
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
                  {/* B65.2: TEC State — moonbag mode + break-even lock visibility */}
                  {/* B65.4 (2026-04-25): MOONBAG badge shows live ladder rung count (MB×N) */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <Badge
                        variant="outline"
                        className={`text-xs ${(trade as any).tradeMode === 'TRAILING_TAKE' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
                        title={(trade as any).tradeMode === 'TRAILING_TAKE'
                          ? `Target reached — now in moonbag (trailing) mode. Ratcheted through ${(trade as any).ladderRungsHit ?? 1} ladder rung${((trade as any).ladderRungsHit ?? 1) === 1 ? '' : 's'} so far.`
                          : 'Aiming for original target price'}
                      >
                        {(trade as any).tradeMode === 'TRAILING_TAKE'
                          ? `🌙 MB×${(trade as any).ladderRungsHit ?? 1}`
                          : 'TARGET'}
                      </Badge>
                      {(trade as any).breakEvenLatched && (trade as any).tradeMode !== 'TRAILING_TAKE' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-blue-500/15 text-blue-300 border-blue-500/40"
                          title="Break-even lock engaged: stop has been ratcheted to cover entry + costs. Trade cannot become a net loser."
                        >
                          🔒 BE LOCKED
                        </Badge>
                      )}
                    </div>
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
                      {/* P19-B8.7 Step-9 (B8.9 carry): the server's age-aware quiet
                          verdict drives the treatment — one notion, no per-surface
                          drift. Rows without the flag (VTS) render exactly as before. */}
                      {trade.priceVenueQuiet ? (
                        <VenueQuietPrice price={trade.currentPrice} ageMs={trade.priceAgeMs} decimals={4} className="text-xs" />
                      ) : (
                        <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                          {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
                        </span>
                      )}
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
                  {/* P19-B8.7 Step-9: cost 5-col split. Breakdown absent → em-dash
                      (never a fabricated 0); the total renders either way. */}
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
                  {/* P19-B8.7 Step-9: absent values render an em-dash, never a
                      fabricated 0.00 (adapter rows may lack metadata-sourced numbers). */}
                  <td className="px-3 py-2 text-right font-mono text-xs text-purple-400">{trade.rankingScore != null ? trade.rankingScore.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
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
                    {format(new Date(trade.entryTime), 'MM/dd HH:mm')}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {formatDuration(trade.durationOpenMinutes)}
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
