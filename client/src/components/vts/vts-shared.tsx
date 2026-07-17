// P19-B8.1 (C1): shared VTS trade-table types + badge/format helpers + SortableHeader,
// extracted verbatim from client/src/pages/machine-learning.tsx (pure extraction, zero behavior change).
// Consumed by vts-open-trades-table, vts-closed-trades-table, vts-filter-diagnostics-panel,
// and the machine-learning page itself.
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface OpenTrade {
  symbol: string;
  // B69.1 (2026-05-04): asset class column on Open Simulated Trades.
  assetClass?: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  sourcePool?: string;    // Batch 19F Phase 2: Filter path origin (quant/pattern)
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
  rankingScore?: number; // Batch 47f15: Cross-family desirability score
  // P19-B8.7 Step-9: OPTIONAL since the Final/Hybrid cells were deleted (Kyle's
  // FinalScore retirement, piece 2.7); the paper adapter omits them entirely.
  // Full field death rides #525 (B-FINALSCORE-PURGE).
  finalScore?: number;
  hybridScore?: number;
  // P19-B8.7 Step-9: OPTIONAL — the paper adapter sources these from signal
  // metadata, which is absent on some rows (em-dash render, never a fabricated
  // number). The VTS serializer always provides them, so VTS is unaffected.
  expectedEdge?: number;
  regimeWeight?: number;
  entryTime: string;
  durationOpenMinutes: number;
  globalRegime: string | null;
  pairFriction: number | null;
  globalFriction: number | null;
  pairDirectionalBias: string | null;
  globalDirectionalBias: string | null;
  // B61 (2026-04-15): numeric DBS scores alongside categories
  pairDirectionalBiasScore: number | null;
  globalDirectionalBiasScore: number | null;
  // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation
  pairIdHash?: number | null;
  // B67.2.1 (2026-04-29): regime classifier confidence + macro modifier + phase
  // captured at trade-open. NULL on trades opened pre-B67.2.1.
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: 'EARLY' | 'PRIME' | 'LATE' | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  // B.2.UI (2026-06-02): entry-liquidity captured at trade-open for the
  // "Volume / Order Book" column. xStock = ask-side order-book depth USD
  // (kind 'depth_usd'); crypto = native 24h coin-unit volume (kind 'volume_qty').
  // null/undefined on trades opened before B.2.UI (no backfill → renders "—").
  entryLiquidityValue?: number | null;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty' | null;
  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the VTS trade opened on.
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
  // P19-B7.2c: 'pending' = a resting maker order awaiting fill (PENDING badge);
  // mtTwin = the tagged non-chosen comparison leg (paired via mtPairId).
  state?: string;
  mtTwin?: boolean;
  mtPairId?: string | null;
  // P19-B8.7 Step-9: cost 5-col breakdown (entry fee/slip + ESTIMATED exit
  // fee/slip). Present on paper adapter rows; absent (em-dash) until the VTS
  // serializer carries a split. `costs` stays the single total either way.
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // P19-B8.7 Step-9 (B8.9 carry, b28cf7074 reconciled): the SERVER's single
  // age-aware venue-quiet verdict + price age for the Current cell. Paper rows
  // carry these; VTS rows don't (normal render).
  priceVenueQuiet?: boolean;
  priceAgeMs?: number | null;
}

export interface ClosedTrade {
  symbol: string;
  // B69.1 (2026-05-04): asset class column on Closed Simulated Trades.
  assetClass?: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  sourcePool?: string;    // Batch 19F Phase 2: Filter path origin (quant/pattern)
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
  rankingScore?: number; // Batch 47f15: Cross-family desirability score
  // P19-B8.7 Step-9: OPTIONAL since the Final/Hybrid cells were deleted (Kyle's
  // FinalScore retirement, piece 2.7); the paper adapter omits them entirely.
  // Full field death rides #525 (B-FINALSCORE-PURGE).
  finalScore?: number;
  hybridScore?: number;
  // P19-B8.7 Step-9: OPTIONAL — the paper adapter sources these from signal
  // metadata, which is absent on some rows (em-dash render, never a fabricated
  // number). The VTS serializer always provides them, so VTS is unaffected.
  expectedEdge?: number;
  regimeWeight?: number;
  entryTime: string;
  exitTime: string;
  durationMinutes: number;
  globalRegime: string | null;
  pairFriction: number | null;
  globalFriction: number | null;
  pairDirectionalBias: string | null;
  globalDirectionalBias: string | null;
  // B61 (2026-04-15): numeric DBS scores alongside categories
  pairDirectionalBiasScore: number | null;
  globalDirectionalBiasScore: number | null;
  // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation
  pairIdHash?: number | null;
  // B67.2.1 (2026-04-29): regime classifier confidence + macro modifier + phase
  // captured at trade-open. NULL on trades opened pre-B67.2.1.
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: 'EARLY' | 'PRIME' | 'LATE' | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  // B.2.UI (2026-06-02): entry-liquidity captured at trade-open for the
  // "Volume / Order Book" column. xStock = ask-side order-book depth USD
  // (kind 'depth_usd'); crypto = native 24h coin-unit volume (kind 'volume_qty').
  // null/undefined on trades opened before B.2.UI (no backfill → renders "—").
  entryLiquidityValue?: number | null;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty' | null;
  // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the VTS trade opened on.
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
  // P19-B7.2c: 'never_filled' resultType = a dropped pending maker (visible, excluded
  // from stats); mtTwin = the tagged non-chosen comparison leg; countsInAggregates =
  // the TYPED exclusion flag.
  mtTwin?: boolean;
  mtPairId?: string | null;
  countsInAggregates?: boolean;
  // P19-B8.7 Step-9: realized cost 5-col breakdown + the B8.6 maker target-exit
  // cohort stamps (exit_fee_mode / exit_rest_outcome). Present on paper adapter
  // rows; em-dash on VTS rows until their serializers carry them.
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
}

// Batch 19H: Filter Pipeline Diagnostics types
export interface ScanDiagnostics {
  timestamp: string;
  mode: string;
  totalPairsScanned: number;
  allSymbolsScanned: string[];
  quant: {
    global: Record<string, number>;
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number; benchmarkBypassed: number };
    survivors: number;
  };
  pattern: {
    global: Record<string, number> | null;
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number; benchmarkBypassed: number } | null;
    survivors: number;
  };
  destination: string;
  // P19-B8.3b (OBJ-2): `destinationCount` RETIRED from the scan-diagnostic
  // shape — it was serialized here but never rendered by the panel (a mislabel
  // set to the VTS survivor count even for active_pool). The FD-response
  // top-level `destinationCount` (routes.ts, familyFanOutSum+patternFanOut) is
  // a DIFFERENT field and is unaffected.
}

export interface FilterDiagnosticsData {
  ok: boolean;
  // P19-B8.4c REV-3: scanTargetPerCycle (300 per-cycle target) + krakenUniverseSize (live total universe) are
  // surfaced read-only onto the fx5 ScanDiagnostics and ride the vts route's whole-object lastScan passthrough;
  // typed here so the VTS crypto ScannerCard reads them without an `as any` cast.
  lastScan: (ScanDiagnostics & { b63Dbs?: B63DbsSnapshot; familyPaths?: Record<string, any>; scanTargetPerCycle?: number; krakenUniverseSize?: number }) | null;
  rolling24h: {
    totalScans: number;
    totalPairsScanned: number;
    uniquePairsScanned: number;
    b63Dbs?: B63DbsAggregate;
    aggregated: {
      quant: ScanDiagnostics['quant'];
      pattern: ScanDiagnostics['pattern'];
      familyPaths?: Record<string, { imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number }; survivors: number }>;
    };
  };
  // B-DIAG-387 (#387): now optional. The crypto endpoint still emits a populated
  // signalRejections (from getSkippedSignalsSummary); the xStock endpoint dropped
  // it (it was always-empty dead scaffolding — see DELETED_COMPONENTS_LOG). No
  // component reads this field for either tab; kept optional only for the crypto
  // payload shape.
  signalRejections?: {
    total: number;
    byReason: Record<string, number>;
    byRegime: Record<string, number>;
  };
  vtsEvaluation?: any;
  lastCycleVtsEval?: any;
  // reorg-B2.2 OBJ-B: per-class reward-vs-risk / reachability guard-drop stats, keyed by strategy and
  // scoped to THIS tab's asset class (crypto tab → crypto_spot, xStock tab → xstock_spot). Absent/empty =
  // no guard evaluations recorded for this class yet (rendered as a distinct "no evaluations" state).
  guardDrops?: Record<string, GuardDropRecord>;
  trackerStartedAt?: string | null;
  // P19-B8.1 (defect a): DB-backed 24h trades-opened, emitted by
  // /api/vts/filter-diagnostics v1.6. The panel's "Trades Opened" rows
  // previously read vtsEvaluation.quantTradesOpened/patternTradesOpened —
  // keys the endpoint never carried — so they rendered the ?? 0 fallback
  // forever. This typed field is the honest, restart-proof source.
  tradesOpened24h?: { total: number; quant: number; pattern: number };
}

// reorg-B2.2 OBJ-B: one strategy's shared-guard suppression for a single asset class. Raw counters + the
// two derived ratios (computed server-side from raw — never re-derived in the UI).
export interface GuardDropRecord {
  evals: number;        // total guard evaluations (the suppression denominator)
  passes: number;
  atrDrops: number;     // dropped by invalid ATR
  stopDrops: number;    // dropped by stop-distance
  rrDrops: number;      // dropped by RR < per-class minRR (the #372 suppression signal)
  reachDrops: number;   // dropped by reachability > per-class reachAtrMax
  rrEvals: number;      // evals that reached the RR check (meanRR denominator)
  rrSum: number;
  rrMin: number;
  rrMax: number;
  meanRR: number;
  rrSuppressionRate: number; // rrDrops / total evals
}

export interface B63DbsSnapshot {
  // B63.4: Pre-global stage (the TRUE high-DBS count before any filter)
  preGlobalDbsComputed?: number;
  preGlobalStrongDbs?: number;
  preGlobalStrongDbsSymbols?: string[];
  // Post-global stage
  totalClassified: number;
  strongDbsPairs: number;
  strongDbsPct: number;
  strongTrendPoolPassed: number;
  strongTrendPoolPct: number;
  strongDbsSymbols: string[];
}

export interface B63DbsAggregate {
  totalClassified: number;
  strongDbsPairs: number;
  strongDbsPct: number;
  strongTrendPoolPassed: number;
  strongTrendPoolPct: number;
  uniqueStrongDbsSymbols: string[];
}

export const getRegimeBadgeColor = (regime: string) => {
  if (regime.includes('TREND_FRIENDLY_STABLE') || regime.includes('BULL_STABLE')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (regime.includes('IMPULSE_EXPANSION') || regime.includes('HIGH_VOL_IMPULSE') || regime.includes('BULL_VOLATILE')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (regime.includes('HIGH_VOLATILITY_UNSTABLE') || regime.includes('BEAR_VOLATILE') || regime.includes('BEAR_STABLE')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  if (regime.includes('RANGE_BOUND_STABLE') || regime.includes('LOW_VOL_CHOP')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  if (regime === 'EXTREME_NOISE') return 'bg-red-600/30 text-red-300 border-red-600/50';
  if (regime.includes('STRUCTURAL_TRANSITION') || regime.includes('TRANSITION')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

export const normalizeRegimeDisplay = (regime: string): string => {
  const displayMap: Record<string, string> = {
    // Old canonical → new canonical
    BULL_STABLE: 'TREND_FRIENDLY_STABLE',
    BEAR_VOLATILE: 'HIGH_VOLATILITY_UNSTABLE',
    LOW_VOL_CHOP: 'RANGE_BOUND_STABLE',
    HIGH_VOL_IMPULSE: 'IMPULSE_EXPANSION',
    TRANSITION: 'STRUCTURAL_TRANSITION',
    // Ghost regimes → new canonical
    BULL_VOLATILE: 'IMPULSE_EXPANSION',
    BEAR_STABLE: 'HIGH_VOLATILITY_UNSTABLE',
    EXTREME_NOISE: 'RANGE_BOUND_STABLE',
    HIGH_VOL_CHOP: 'IMPULSE_EXPANSION',
    MIXED_TRANSITION: 'STRUCTURAL_TRANSITION',
  };
  return displayMap[regime] ?? regime;
};

export const getPoolBadgeColor = (pool: string) => {
  if (pool === 'IDEAL') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (pool === 'ROTATIONAL') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

// Batch 19F Phase 2: Source pool badge colors
export const getSourcePoolBadgeColor = (sourcePool: string) => {
  if (sourcePool?.startsWith('QUANT-') || sourcePool?.startsWith('quant-')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  const sp = sourcePool?.toUpperCase() ?? 'QUANT';
  if (sp === 'QUANT') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (sp === 'PATTERN') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (sp === 'HYBRID') return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

export const getResultBadgeColor = (result: string) => {
  // B65.2-HF3 (2026-04-24): distinct colors for B65.2 exit outcomes:
  // TRAIL STOP (emerald) = genuine moonbag trailing close, real upside past target
  // MOONBAG CAP (amber) = moonbag held past 4h duration cap
  // BE PROTECT (slate blue) = break-even lock ratcheted stop was hit, near-breakeven exit
  // TAKE PROFIT (green) = static target hit, no trailing
  // STOP LOSS (red) = original stop hit, real loss
  if (result === 'TRAILING_STOP_HIT') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (result === 'MOONBAG_TIMEOUT') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (result === 'BREAK_EVEN_STOP') return 'bg-slate-500/20 text-slate-300 border-slate-400/40';
  if (result.includes('TARGET') || result.includes('PROFIT')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (result.includes('STOP')) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
};

// B65.2: human-friendly label for the expanded result set.
export const getResultLabel = (result: string): string => {
  if (result === 'TRAILING_STOP_HIT') return 'TRAIL STOP';
  if (result === 'MOONBAG_TIMEOUT') return 'MOONBAG CAP';
  if (result === 'BREAK_EVEN_STOP') return 'BE PROTECT';
  if (result === 'TAKE_PROFIT' || result === 'TARGET_HIT') return 'TAKE PROFIT';
  if (result === 'STOP_LOSS' || result === 'STOP_HIT') return 'STOP LOSS';
  return result;
};

export const getProfitColor = (value: number) => {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
};

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

// B.2.UI (2026-06-02): format the asset-aware entry-liquidity cell.
//   xStock (kind 'depth_usd')  → "$6,309 · OB"  (ask-side order-book depth USD)
//   crypto (kind 'volume_qty') → "1,234.56 QTY" (native 24h coin-unit volume, no $)
// Returns "—" when the value wasn't captured (trade opened before B.2.UI, or kind/value missing).
export function formatEntryLiquidity(value?: number | null, kind?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (kind === 'depth_usd') return `$${Math.round(value).toLocaleString()} · OB`;
  if (kind === 'volume_qty') return `${Math.round(value).toLocaleString()} QTY`;
  return '—';
}

// Client-side benchmark detection matching server-side benchmark-regex.ts
const BENCHMARK_BASE_COINS = ['BTC', 'XBT', 'ETH', 'SOL', 'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'];
export function isBenchmarkSymbol(symbol: string): boolean {
  if (!symbol) return false;
  const upper = symbol.toUpperCase().trim();
  const base = upper.split(/[-_/]/)[0];
  return BENCHMARK_BASE_COINS.includes(base);
}

// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
export type SortDirection = 'asc' | 'desc';

export function SortableHeader({
  label,
  field,
  currentSort,
  direction,
  onSort,
  align = 'left',
  extraClass = ''
}: {
  label: string;
  field: string;
  currentSort: string | null;
  direction: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
  extraClass?: string;
}) {
  const isActive = currentSort === field;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      className={`px-3 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${extraClass}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </th>
  );
}
