/**
 * P19-B8.7 Step-9 — the paper→VTS-shape trade adapter (PURE, no React, no I/O).
 *
 * The paper open/closed tabs mount the SAME shared table components the VTS
 * tabs use (Langston shared-component ruling B, 2026-07-17). Those components
 * consume the VTS OpenTrade/ClosedTrade shapes; the paper API rows carry the
 * same facts under different names/encodings. This module is the single seam:
 * one function per table, mapping a paper row to the VTS shape — matching the
 * VTS serializer's EXACT wire formats (vts-runner.ts buildOpenTradeRow):
 *   distanceToTarget  '+X.XX%' (signed) | 'N/A' when no target
 *   distanceToStop    'X.XX%' (unsigned) | 'N/A' when no stop
 *   gross/net %       '+X.XX%' (signed)
 *   dollarValue 2dp · quantity 6dp · costs 4dp · entryTime/exitTime ISO
 *
 * Honesty rules (B8.7 no-fabrication):
 *  - metadata-sourced fields absent → undefined/'—' (cells render em-dash),
 *    NEVER a fabricated number (the deleted mlConfidence ?? ngc×0.9 lesson).
 *  - #515-family global/pair context (globalRegime, frictions, DBS) is NOT
 *    captured on paper rows today → explicit null, rendered '—'.
 *
 * Relative type-only imports on purpose: vitest has no '@' alias, and a
 * type-only import of the .tsx is erased at runtime, keeping this module
 * loadable in the node test environment.
 */
import type { OpenTrade, ClosedTrade } from "../components/vts/vts-shared";

// ---------------------------------------------------------------------------
// Input row shapes (what the paper routes actually serialize)
// ---------------------------------------------------------------------------

/** One enriched position row from GET /api/active-engine/active-trades. */
export interface PaperActiveTradeRow {
  id: string;
  symbol: string;
  strategy: string;
  assetClass?: string | null;
  patternType?: string | null;
  side?: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  grossPnl: number;
  grossPnlPercent: number;
  netPnl: number;
  netPnlPercent: number;
  entryFee?: number;
  entrySlippage?: number;
  estExitFee?: number;
  estExitSlippage?: number;
  estTotalCost: number;
  takeProfit: number;
  stopLoss: number;
  holdingDurationMs: number;
  openedAt: string;
  metadata?: Record<string, unknown> | null;
  volume24h?: number;
  positionValue: number;
  tradeMode?: string;
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
  state?: string;
  // paper-only affordances the shared components take as OPTIONAL props
  slotNumber?: number;
  maxSlots?: number;
  health?: unknown;
  confidence?: number;
  frequency?: string;
  sourceLabel?: string;
  // The server's age-aware venue-quiet verdict + price age (B8.9 carry,
  // b28cf7074: /active-engine/active-trades now serializes the boolean).
  priceVenueQuiet?: boolean;
  priceAgeMs?: number;
}

/** One raw closed_trades row from GET /api/active-engine/trades?paginated=true.
 *  Drizzle serializes decimal columns as STRINGS — every numeric passes
 *  through num()/pct() below. */
export interface PaperClosedTradeRow {
  id: string;
  symbol: string;
  assetClass?: string | null;
  strategyName: string;
  side?: string;
  quantity: string | number;
  entryPrice: string | number;
  exitPrice?: string | number | null;
  stopLoss?: string | number | null;
  takeProfit?: string | number | null;
  grossPnl?: string | number | null;
  netPnl?: string | number | null;
  netPnlPercent?: string | number | null;
  totalCost?: string | number | null;
  entryFee?: string | number | null;
  exitFee?: string | number | null;
  entrySlippage?: string | number | null;
  exitSlippage?: string | number | null;
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  closeReason?: string | null;
  signalType?: string | null;
  patternType?: string | null;
  sourcePool?: string | null;
  tradeMode?: string | null;
  chosenEntryMode?: string | null;
  entryFeeRate?: string | number | null;
  pairIdHash?: number | null;
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: string | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** OpenTrade plus the loose TEC fields the shared open table reads off the
 *  row (the VTS serializer emits them outside the declared interface), plus
 *  the cost 5-col breakdown (present on paper rows; the shared Costs cell
 *  renders the split when these exist, the single total + em-dashes when not). */
export type AdaptedOpenTrade = OpenTrade & {
  tradeMode?: string;
  breakEvenLatched?: boolean;
  targetLatched?: boolean;
  engineStopPrice?: number | null;
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // Paper-only affordances carried through for the appended columns (the shared
  // table sorts internally, so extras must ride the row — index math would lie).
  id?: string;
  slotNumber?: number;
  maxSlots?: number;
  sourceLabel?: string;
};

/** ClosedTrade plus the realized cost 5-col breakdown (closed_trades columns
 *  entry_fee / entry_slippage / exit_fee / exit_slippage). */
export type AdaptedClosedTrade = ClosedTrade & {
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // P19-B8.6 maker target-exit cohort stamps for the maker-exit columns.
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decimal-string/number → finite number, else null. Never coerces to 0. */
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Signed percent string matching the VTS wire format: '+2.35%' / '-0.80%'. */
function signedPct(v: number | null): string {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

/** metadata scalar → number when it genuinely is one, else undefined. */
function metaNum(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------------------------------------------------------------------------
// Open trades
// ---------------------------------------------------------------------------

export function adaptPaperOpenTrade(row: PaperActiveTradeRow): AdaptedOpenTrade {
  const meta = row.metadata ?? null;
  const priceForCalc = Number.isFinite(row.currentPrice) && row.currentPrice > 0 ? row.currentPrice : row.entryPrice;

  // Same formulas + formats as the VTS serializer (vts-runner buildOpenTradeRow).
  const distanceToTarget =
    row.takeProfit > 0 && priceForCalc > 0
      ? signedPct(((row.takeProfit - priceForCalc) / priceForCalc) * 100)
      : "N/A";
  const distanceToStop =
    row.stopLoss > 0 && priceForCalc > 0
      ? (((row.stopLoss - priceForCalc) / priceForCalc) * 100).toFixed(2) + "%"
      : "N/A";

  return {
    symbol: row.symbol,
    assetClass: row.assetClass ?? undefined,
    // Metadata-sourced context; absent → '—' (string fields) / undefined (numbers).
    regime: metaStr(meta, "regime") ?? "—",
    strategy: row.strategy,
    signalType: metaStr(meta, "signalType") ?? "—",
    patternType: row.patternType ?? metaStr(meta, "patternType") ?? null,
    pool: (metaStr(meta, "pool") ?? "—").toUpperCase(),
    sourcePool: metaStr(meta, "sourcePool"),
    dollarValue: parseFloat(row.positionValue.toFixed(2)),
    quantity: parseFloat(row.quantity.toFixed(6)),
    entryPrice: row.entryPrice,
    exitPrice: null,
    target: row.takeProfit,
    stopLoss: row.stopLoss,
    currentPrice: Number.isFinite(row.currentPrice) ? row.currentPrice : null,
    distanceToTarget,
    distanceToStop,
    grossProfitValue: parseFloat((num(row.grossPnl) ?? 0).toFixed(2)),
    grossProfitPercent: signedPct(num(row.grossPnlPercent)),
    costs: parseFloat((num(row.estTotalCost) ?? 0).toFixed(4)),
    netProfitValue: parseFloat((num(row.netPnl) ?? 0).toFixed(2)),
    netProfitPercent: signedPct(num(row.netPnlPercent)),
    rankingScore: metaNum(meta, "rankingScore"), // inert shadow value — display only
    // finalScore/hybridScore OMITTED on purpose (retired metric, piece 2.7 / #525).
    expectedEdge: metaNum(meta, "expectedEdge"),
    regimeWeight: metaNum(meta, "regimeWeight"),
    entryTime: row.openedAt,
    durationOpenMinutes: Math.floor((num(row.holdingDurationMs) ?? 0) / 60000),
    // #515 family: global/pair context is not captured on paper rows today.
    globalRegime: null,
    pairFriction: null,
    globalFriction: null,
    pairDirectionalBias: null,
    globalDirectionalBias: null,
    pairDirectionalBiasScore: null,
    globalDirectionalBiasScore: null,
    // Entry-liquidity: paper rows carry 24h volume only (crypto convention);
    // 0/absent → null → '—'.
    entryLiquidityValue: (num(row.volume24h) ?? 0) > 0 ? (num(row.volume24h) as number) : null,
    entryLiquidityKind: (num(row.volume24h) ?? 0) > 0 ? "volume_qty" : null,
    chosenEntryMode: row.chosenEntryMode ?? null,
    entryFeeRate: num(row.entryFeeRate),
    state: row.state ?? "open",
    // TEC state: paper serializes tradeMode only; latch flags aren't on the row —
    // left undefined (cell renders the mode without latch badges), never guessed.
    tradeMode: row.tradeMode ?? "TARGET",
    // Cost 5-col breakdown (entry fee/slip + ESTIMATED exit fee/slip on open rows).
    costEntryFee: num(row.entryFee),
    costEntrySlippage: num(row.entrySlippage),
    costExitFee: num(row.estExitFee),
    costExitSlippage: num(row.estExitSlippage),
    // The server's venue-quiet verdict → the shared Current cell renders the
    // quiet treatment (B8.9 carry; server-decided, age-aware, one notion).
    priceVenueQuiet: row.priceVenueQuiet === true,
    priceAgeMs: num(row.priceAgeMs),
    // Paper-only affordances for the appended Slot/Source/Actions columns.
    id: row.id,
    slotNumber: row.slotNumber,
    maxSlots: row.maxSlots,
    sourceLabel: row.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Closed trades
// ---------------------------------------------------------------------------

export function adaptPaperClosedTrade(row: PaperClosedTradeRow): AdaptedClosedTrade {
  const meta = row.metadata ?? null;
  const quantity = num(row.quantity) ?? 0;
  const entryPrice = num(row.entryPrice) ?? 0;
  const notional = quantity * entryPrice;
  const grossPnl = num(row.grossPnl);
  const openedAt = new Date(row.openedAt);
  const closedAt = row.closedAt ? new Date(row.closedAt) : null;

  return {
    symbol: row.symbol,
    assetClass: row.assetClass ?? undefined,
    regime: metaStr(meta, "regime") ?? "—",
    strategy: row.strategyName,
    signalType: row.signalType ?? "—",
    patternType: row.patternType ?? null,
    pool: (metaStr(meta, "pool") ?? "—").toUpperCase(),
    sourcePool: row.sourcePool ?? undefined,
    dollarValue: parseFloat(notional.toFixed(2)),
    quantity: parseFloat(quantity.toFixed(6)),
    entryPrice,
    exitPrice: num(row.exitPrice) ?? 0,
    target: num(row.takeProfit) ?? 0,
    stopLoss: num(row.stopLoss) ?? 0,
    // closeReason uppercased lands on the shared badge/label maps directly
    // ('target_hit' → TAKE PROFIT, 'trailing_stop_hit' → TRAIL STOP, …).
    resultType: (row.closeReason ?? "UNKNOWN").toUpperCase(),
    // Genuinely-null P/L → NaN (the cells isFinite-guard to an em-dash), never a
    // fabricated $0.00 next to a '—%' (Langston Step-4 note 2 — symmetry).
    grossProfitValue: grossPnl !== null ? parseFloat(grossPnl.toFixed(2)) : NaN,
    grossProfitPercent:
      grossPnl !== null && notional > 0 ? signedPct((grossPnl / notional) * 100) : "—",
    costs: parseFloat((num(row.totalCost) ?? 0).toFixed(4)),
    netProfitValue: num(row.netPnl) !== null ? parseFloat((num(row.netPnl) as number).toFixed(2)) : NaN,
    netProfitPercent: signedPct(num(row.netPnlPercent)),
    rankingScore: metaNum(meta, "rankingScore"),
    // finalScore/hybridScore OMITTED (retired metric).
    expectedEdge: metaNum(meta, "expectedEdge"),
    regimeWeight: metaNum(meta, "regimeWeight"),
    entryTime: openedAt.toISOString(),
    exitTime: closedAt ? closedAt.toISOString() : "",
    durationMinutes: closedAt ? Math.max(0, Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000)) : 0,
    globalRegime: null,
    pairFriction: null,
    globalFriction: null,
    pairDirectionalBias: null,
    globalDirectionalBias: null,
    pairDirectionalBiasScore: null,
    globalDirectionalBiasScore: null,
    pairIdHash: row.pairIdHash ?? null,
    regimeConfidenceRaw: row.regimeConfidenceRaw ?? null,
    macroModifierValue: row.macroModifierValue ?? null,
    phase: (row.phase as ClosedTrade["phase"]) ?? null,
    phaseAgeSeconds: row.phaseAgeSeconds ?? null,
    strategyPhaseWeight: row.strategyPhaseWeight ?? null,
    regimeConfidenceModulated: row.regimeConfidenceModulated ?? null,
    entryLiquidityValue: metaNum(meta, "entryLiquidityValue") ?? null,
    entryLiquidityKind:
      (metaStr(meta, "entryLiquidityKind") as ClosedTrade["entryLiquidityKind"]) ?? null,
    chosenEntryMode: row.chosenEntryMode ?? null,
    entryFeeRate: num(row.entryFeeRate),
    // never_filled dropped-pending rows are visible but excluded from stats,
    // same convention as VTS (B7.2c).
    countsInAggregates: (row.closeReason ?? "") !== "never_filled",
    // Realized cost 5-col breakdown + B8.6 maker target-exit cohort stamps.
    costEntryFee: num(row.entryFee),
    costEntrySlippage: num(row.entrySlippage),
    costExitFee: num(row.exitFee),
    costExitSlippage: num(row.exitSlippage),
    exitFeeMode: row.exitFeeMode ?? null,
    exitRestOutcome: row.exitRestOutcome ?? null,
  };
}
