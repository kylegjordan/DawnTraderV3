/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.3 — Unified Trade Schema (M24 Governance Invariant)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Extends trade records with Market Regime and Market Friction fields.
 * All trade objects (signals, open trades, history exports) must include these.
 * 
 * M24: Market Regime and Friction always co-present in serialized objects
 * M26: Net P&L and Reward–Risk Net computed from canonical totalCost
 * 
 * Schema Version: v1.6.7
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { computeMarketFriction, describeFriction } from '../metrics/cost-metrics.js';
import { getCurrentRegime, getExpandedRegimeDescription } from '../../services/market-indicators.js';
import { CanonicalRegimeType, normalizeRegime, CanonicalSignalType } from '../../config/canonical-regime-strategy-map.js';
import type { SignalType } from '../../types';

export type MarketRegimeType = CanonicalRegimeType;
export type { CanonicalSignalType };
export { normalizeRegime };

export type TargetType = 'Original' | 'DSE' | 'Trailing';
export type TradeSignalType = CanonicalSignalType;
export type FeedType = 'WebSocket' | 'REST';
export type FeedFrequency = 'High' | 'Medium' | 'Low';
export type ActiveStatus = 'Active' | 'Reconfirmed';
export type FrictionColor = 'green' | 'yellow' | 'orange' | 'red';

export interface TradeRecord {
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  targetType: TargetType;
  distancePct: number;
  currentPrice: number;
  grossProfitValue: number;
  grossProfitPct: number;
  totalCostPct: number;
  netProfitValue: number;
  netProfitPct: number;
  finalScore: number;
  hybridScore?: number;
  predictiveConfidence?: number;
  expectedEdge?: number;
  rewardRisk?: number;
  rewardRiskNet?: number;
  signalType: SignalType;
  strategy: string;
  patternType: string;
  marketRegime: MarketRegimeType;
  marketFrictionScore: number;
  marketFrictionLabel: string;
  marketFrictionColor: FrictionColor;
  volume?: number;
  feedType?: FeedType;
  feedFrequency?: FeedFrequency;
  tradeDuration?: string;
  openedAt?: string;
  updatedAt?: string;
  closedAt?: string;
  closedReason?: string;
  activeStatus?: ActiveStatus;
}

export interface MarketContextFields {
  marketRegime: MarketRegimeType;
  marketRegimeTitle: string;
  marketFrictionScore: number;
  marketFrictionLabel: string;
  marketFrictionColor: FrictionColor;
}

/**
 * Directive 11.4B — Get current market context fields for trade serialization
 * Returns regime and friction data to be attached to any trade/signal object.
 */
export function getMarketContextFields(
  spread: number = 0.001,
  slippage: number = 0.0005,
  fee: number = 0.0026
): MarketContextFields {
  // B-4.7 / Phase-16 register (RUNNING_ISSUES #218): getMarketContextFields
  // has ZERO callers (dead since the cost-model consolidation) and carried a
  // hardcoded Tier-6 fee default — DO NOT wire without per-class + fee_model
  // rework. Explicit crypto_spot keeps the dead path compiling only.
  const regime = getCurrentRegime('crypto_spot') as MarketRegimeType;
  const regimeInfo = getExpandedRegimeDescription(regime);
  const frictionScore = computeMarketFriction(spread, slippage, fee);
  const frictionStatus = describeFriction(frictionScore);
  
  return {
    marketRegime: regime,
    marketRegimeTitle: regimeInfo?.title || regime.replace(/_/g, ' '),
    marketFrictionScore: frictionScore,
    marketFrictionLabel: `${frictionScore}: ${frictionStatus.status}`,
    marketFrictionColor: frictionStatus.color,
  };
}

/**
 * Directive 11.4B — Compute net metrics from gross and cost
 * Ensures M26 invariant: Net P&L computed from canonical totalCost
 */
export function computeNetMetrics(
  grossProfitValue: number,
  grossProfitPct: number,
  totalCostPct: number,
  positionValue: number
): { netProfitValue: number; netProfitPct: number } {
  const totalCostValue = positionValue * (totalCostPct / 100);
  const netProfitValue = grossProfitValue - totalCostValue;
  const netProfitPct = grossProfitPct - totalCostPct;
  
  return { netProfitValue, netProfitPct };
}

/**
 * Directive 11.4B — Compute reward-risk net from gross R:R and cost
 * Ensures M26 invariant: Reward-Risk Net accounts for trading costs
 */
export function computeRewardRiskNet(
  rewardRisk: number,
  targetPct: number,
  stopPct: number,
  totalCostPct: number
): number {
  if (stopPct === 0) return 0;
  const netTarget = targetPct - totalCostPct;
  const netStop = stopPct + totalCostPct;
  return netTarget / netStop;
}

/**
 * Directive 11.4C.3 — Determine signal type from source (uppercase canonical)
 */
export function determineSignalType(
  hasQuantSignal: boolean,
  hasPatternSignal: boolean
): SignalType {
  if (hasQuantSignal && hasPatternSignal) return 'HYBRID';
  if (hasPatternSignal) return 'PATTERN';
  return 'QUANT';
}

/**
 * Directive 11.4B — Validate trade record has required market context
 * Throws if M24 invariant violated (regime and friction must be present)
 */
export function validateMarketContext(record: Partial<TradeRecord>): boolean {
  if (!record.marketRegime) {
    console.warn('[11.4B][M24] Trade record missing marketRegime');
    return false;
  }
  if (record.marketFrictionScore === undefined || record.marketFrictionScore === null) {
    console.warn('[11.4B][M24] Trade record missing marketFrictionScore');
    return false;
  }
  if (!record.marketFrictionLabel) {
    console.warn('[11.4B][M24] Trade record missing marketFrictionLabel');
    return false;
  }
  return true;
}
