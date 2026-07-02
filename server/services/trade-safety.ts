/**
 * Phase 8.8.3-H4: Trade Safety Service
 * 
 * All pre-trade risk checks are driven by guardrails_v2 values.
 * No hidden risk rules - everything is visible in the Guardrails tab.
 * 
 * This replaces the legacy RiskManager class with transparent,
 * guardrail-driven helper functions.
 */

import { storage } from '../storage';
import { TradingSettings, PaperSimOpenPosition, Trade } from '@shared/schema';
import { 
  buildSettingsFromGuardrails as _buildSettingsFromGuardrails, 
  getRiskPercentageV2, 
  calculateRiskAmount as _calculateRiskAmount,
  getPortfolioBalanceV2 
} from './guardrail-settings';
import { fxConversionService } from './fx-conversion-service.js';
import { marketDataService } from './market-data';
import { aj16Diagnostic } from './aj16-rtb-diagnostic';
import { aj19Diagnostic } from './aj19-max-position-diagnostic';
import { b4Diagnostics } from './b4-diagnostics.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { i1RtbDiagnostics } from './i1-rtb-diagnostics-service.js';
import { rtbMetricsService } from './rtb-metrics-service.js';
import { getGlobalActiveEngineManager } from './active-engine-service.js';
import { signalLifecycleAudit, type RejectionReason } from '../core/audit/signal_lifecycle_audit.js';
import { isCorrelatedExposure, riskConcentrationAnalyzer } from './risk-concentration.js';
import { getCachedNumberRequired } from './module-constants-service.js';

// B72.1 (2026-05-05): guardrail_defaults — fallback values used when the
// guardrails_v2 settings row is missing or fields are unset. These do NOT
// override explicit settings; they only paper over a cold/empty settings
// table. Promoted to module_constants so operators can tune defaults without
// a redeploy. Pre-existing fallback path (LOW-risk).
const _GUARDRAIL_DEFAULTS_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
function getDefaultMaxTotalExposurePct(): number {
  // Stored as a 0–1 ratio (0.25 == 25%). Callers convert to whatever scale they need.
  return getCachedNumberRequired('guardrail_defaults', 'default_max_total_exposure_pct', _GUARDRAIL_DEFAULTS_KEY);
}
function getMaxOpenTradesDefault(): number {
  return getCachedNumberRequired('guardrail_defaults', 'max_open_trades_default', _GUARDRAIL_DEFAULTS_KEY);
}

export const buildSettingsFromGuardrails = _buildSettingsFromGuardrails;
export const calculateRiskAmount = _calculateRiskAmount;

export interface TradeCandidate {
  symbol: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  strategy: string;
  atr?: number;
  // AJ10.1: Pre-computed notional from position sizing (P2 stage)
  // When provided, MAX_POSITION check trusts this value instead of recalculating
  preComputedNotional?: number;
  // Phase 8.8.4-A: SLAL lifecycle tracking ID
  signalId?: string;
}

export type TradeSafetyResultCode = 
  | 'KILL_SWITCH'
  | 'NO_STOP_LOSS'
  | 'INVALID_STOP_LOSS'
  | 'POSITION_LIMIT'
  | 'COOLDOWN'
  | 'MAX_POSITION'
  | 'LPCP_LOW_PRICE'
  | 'LPCP_MIN_NOTIONAL'
  | 'FX_CONVERSION_FAILED'
  | 'PORTFOLIO_RISK'
  | 'INSUFFICIENT_BALANCE'
  | 'MAX_EXPOSURE'
  | 'MAX_TOTAL_EXPOSURE'
  | 'MAX_TRADES'
  | 'ENGINE_STOPPING' // Phase 8.8.3-I2: Block during hard stop
  | 'CORRELATION_EXPOSURE'; // Directive 9.4: Covariance Guard

export type TradeSafetyResult = 
  | { ok: true }
  | { ok: false; code: TradeSafetyResultCode; reason: string };

interface ActivePosition {
  symbol: string;
  quantity: string;
  entryPrice: string;
  avgPrice?: string;
}

/**
 * Phase 8.8.3-H4: Get active positions from correct table based on trading mode
 * Live mode: reads from trades table
 * Paper mode: reads from paper_sim_open_positions table
 */
async function getActivePositions(mode: 'live' | 'paper'): Promise<ActivePosition[]> {
  if (mode === 'paper') {
    const paperPositions = await storage.getPaperSimOpenPositions('paper');
    return paperPositions.map(p => ({
      symbol: p.symbol,
      quantity: p.quantity,
      entryPrice: p.avgPrice,
      avgPrice: p.avgPrice,
    }));
  } else {
    const activeTrades = await storage.getActiveTrades('live');
    return activeTrades.map(t => ({
      symbol: t.symbol,
      quantity: t.quantity,
      entryPrice: t.entryPrice,
    }));
  }
}

/**
 * Normalize symbol for comparison (handles Kraken variants)
 */
function normalizeSymbol(symbol: string): string {
  let normalized = symbol.replace(/^[XZ]+/, '');
  normalized = normalized.replace(/\/USD|USD|ZUSD|\/ZUSD/g, '');
  if (normalized === 'BT') {
    normalized = 'BTC';
  }
  return normalized;
}

/**
 * Check 1: Kill Switch
 * Guardrail: killSwitchTripped (boolean)
 * Phase 8.8.3-H7: Added audit logging to align with SafetyGuardrails event structure
 */
function checkKillSwitch(settings: TradingSettings, mode: 'paper' | 'live' = 'paper', symbol?: string): TradeSafetyResult {
  if ((settings as any).killSwitchTripped) {
    console.log(`[8.8.3-H7][KILL_SWITCH_BLOCKED] {mode:"${mode}", symbol:"${symbol || 'unknown'}", source:"trade-safety", reason:"kill_switch_tripped"}`);
    return {
      ok: false,
      code: 'KILL_SWITCH',
      reason: 'Trading stopped due to Kill Switch activation. Resume trading to continue.'
    };
  }
  return { ok: true };
}

/**
 * Check 2: Stop-Loss Required
 * Every trade must have a valid stop-loss below entry price
 */
function checkStopLossRequired(trade: TradeCandidate): TradeSafetyResult {
  if (!trade.stopPrice || trade.stopPrice === 0) {
    return {
      ok: false,
      code: 'NO_STOP_LOSS',
      reason: 'Stop-loss is required for all trades'
    };
  }

  if (trade.stopPrice >= trade.entryPrice) {
    return {
      ok: false,
      code: 'INVALID_STOP_LOSS',
      reason: 'Stop-loss must be below entry price for long positions'
    };
  }

  return { ok: true };
}

/**
 * Check 3: Max 1 Position Per Asset
 * Prevents multiple simultaneous positions in the same asset
 */
async function checkMaxPositionsPerAsset(
  mode: 'live' | 'paper',
  trade: TradeCandidate
): Promise<TradeSafetyResult> {
  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] max_positions_per_asset {symbol:${trade.symbol}, mode:${mode}}`);
  
  const activePositions = await getActivePositions(mode);
  const normalizedSymbol = normalizeSymbol(trade.symbol);
  
  const existingPosition = activePositions.find(pos => {
    const posSymbol = normalizeSymbol(pos.symbol);
    return posSymbol === normalizedSymbol;
  });

  if (existingPosition) {
    console.warn(`[8.8.3-H4][GUARDRAIL_BLOCK] code:POSITION_LIMIT, symbol:${trade.symbol}, existing:true`);
    return {
      ok: false,
      code: 'POSITION_LIMIT',
      reason: `Already have an open position in ${normalizedSymbol}. Max 1 position per asset allowed.`
    };
  }

  return { ok: true };
}

/**
 * Check 4: Symbol Cooldown Period
 * Guardrail: symbolCooldownMinutes (number)
 * Prevents trading the same symbol within specified cooldown period
 * 
 * [9.7] Migrated to guardrails_v2 – legacy dollar fields removed
 */
async function checkSymbolCooldown(
  mode: 'live' | 'paper',
  trade: TradeCandidate
): Promise<TradeSafetyResult> {
  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] cooldown {symbol:${trade.symbol}, mode:${mode}}`);
  const cycleId = aj16Diagnostic.getCycleId();
  
  try {
    // [9.7] Use guardrails_v2 instead of legacy guardrails table
    const guardrails = await storage.getGuardrailsV2({ mode });
    if (!guardrails || guardrails.symbolCooldownMinutes === null || guardrails.symbolCooldownMinutes === undefined) {
      // [AJ16.2] Log cooldown check - no guardrail configured
      aj16Diagnostic.logCooldownCheck({
        cycleId,
        symbol: trade.symbol,
        internalCooldown: false,
        guardrailCooldown: false,
        cooldownRemaining: 0
      });
      return { ok: true };
    }

    const cooldownMinutes = guardrails.symbolCooldownMinutes;
    if (cooldownMinutes === 0) {
      // [AJ16.2] Log cooldown check - cooldown disabled
      aj16Diagnostic.logCooldownCheck({
        cycleId,
        symbol: trade.symbol,
        internalCooldown: false,
        guardrailCooldown: false,
        cooldownRemaining: 0
      });
      return { ok: true };
    }

    // P19-B6.5b (F3 / audit H16): active-paper closes write to paper_sim_trades, NOT the legacy
    // `trades` table — so reading getTrades() for paper made this per-symbol cooldown a SILENT NO-OP
    // (it always found zero closed trades → returned ok:true → cooldown never enforced). Re-point paper
    // mode to paper_sim_trades (the same table daily-loss-budget already reads correctly). Live keeps
    // the legacy `trades` read until the Phase-21 live path is built. Both branches resolve a single
    // most-recent CLOSED-trade timestamp for this symbol.
    let lastTradeTime: number | null = null;
    if (mode === 'paper') {
      const { trades: paperTrades } = await storage.getPaperSimTradesPaginated(mode, {
        symbol: trade.symbol,
        closedOnly: true,
        sortBy: 'closedAt',
        order: 'desc',
        limit: 1,
      });
      const last = paperTrades?.[0];
      const t = last?.closedAt ?? last?.openedAt ?? null;
      lastTradeTime = t ? new Date(t).getTime() : null;
    } else {
      const lastTrades = await storage.getTrades(mode, {
        symbol: trade.symbol,
        status: 'closed' as const,
        limit: 1,
      });
      const last = lastTrades?.[0];
      const t = last ? (last.exitTime || last.entryTime) : null;
      lastTradeTime = t ? new Date(t).getTime() : null;
    }

    if (lastTradeTime === null) {
      // [AJ16.2] Log cooldown check - no previous closed trade for this symbol
      aj16Diagnostic.logCooldownCheck({
        cycleId,
        symbol: trade.symbol,
        internalCooldown: false,
        guardrailCooldown: false,
        cooldownRemaining: 0
      });
      return { ok: true };
    }

    const currentTime = Date.now();
    const minutesSinceLastTrade = (currentTime - lastTradeTime) / (1000 * 60);

    if (minutesSinceLastTrade < cooldownMinutes) {
      const remainingMinutes = Math.ceil(cooldownMinutes - minutesSinceLastTrade);
      const remainingSeconds = Math.ceil((cooldownMinutes - minutesSinceLastTrade) * 60);
      console.warn(`[8.8.3-H4][GUARDRAIL_BLOCK] code:COOLDOWN, symbol:${trade.symbol}, remaining:${remainingMinutes}min`);
      
      // [AJ16.2] Log cooldown block
      aj16Diagnostic.logCooldownCheck({
        cycleId,
        symbol: trade.symbol,
        internalCooldown: false,
        guardrailCooldown: true,
        cooldownRemaining: remainingSeconds,
        lastTradeTime: new Date(lastTradeTime)
      });
      aj16Diagnostic.logGuardrailBlock(cycleId, trade.symbol, 'COOLDOWN', `${remainingMinutes} minutes remaining`);
      
      return {
        ok: false,
        code: 'COOLDOWN',
        reason: `Symbol ${trade.symbol} is in cooldown period. ${remainingMinutes} minute(s) remaining.`
      };
    }

    // [AJ16.2] Log cooldown check passed
    aj16Diagnostic.logCooldownCheck({
      cycleId,
      symbol: trade.symbol,
      internalCooldown: false,
      guardrailCooldown: false,
      cooldownRemaining: 0,
      lastTradeTime: new Date(lastTradeTime)
    });

    return { ok: true };
  } catch (error) {
    console.error(`[8.8.3-H4] Error checking cooldown:`, error);
    return { ok: true };
  }
}

/**
 * Check 5: Position Size Cap
 * Guardrail: maxPositionPercentPct (number)
 * Prevents oversized positions as a percentage of portfolio
 * 
 * Phase 8.8.3-J7: Removed hardcoded $50k fallback - if portfolioValue is missing,
 * skip this check since paper-mode sizing is done at P2 using canonical portfolio source.
 * 
 * Phase 8.8.3-AJ10.1: TRUST PRE-SIZED SIGNALS
 * When trade.preComputedNotional is provided from P2 sizing, use it directly
 * instead of recalculating. This prevents MAX_POSITION blocks on properly-sized trades
 * due to price drift between sizing and execution.
 * 
 * Phase 8.8.3-AJ19: Added diagnostic logging and dry-run mode support
 */
async function checkPositionSizeCap(
  mode: 'live' | 'paper',
  trade: TradeCandidate,
  settings: TradingSettings,
  cycleId?: string
): Promise<TradeSafetyResult> {
  // J7: Parse portfolio value - no hardcoded fallback
  const rawPortfolioValue = parseFloat(settings.portfolioValue?.toString() || '0');
  
  // J7: If no valid portfolio value, skip this check (sizing already done at P2 for paper mode)
  if (!Number.isFinite(rawPortfolioValue) || rawPortfolioValue <= 0) {
    console.log(`[J7][GUARDRAIL_SKIP] No valid portfolioValue in settings - skipping position size cap check (mode: ${mode})`);
    return { ok: true };
  }
  
  const portfolioValue = rawPortfolioValue;
  const maxPositionPercent = parseFloat(String((settings as any).maxPositionPercent || '10.00'));
  const maxPositionValue = (portfolioValue * maxPositionPercent) / 100;
  
  // AJ10.1: Trust pre-computed notional from P2 sizing if available
  // This is the canonical value calculated by active-position-sizing.ts
  let positionValue: number;
  let sizingSource: string;
  const preComputedNotionalMissing = trade.preComputedNotional === undefined || 
    !Number.isFinite(trade.preComputedNotional) || 
    trade.preComputedNotional <= 0;
  
  if (!preComputedNotionalMissing) {
    // Use the pre-sized value - this was already calculated with the 3% buffer in active-position-sizing.ts
    positionValue = trade.preComputedNotional!;
    sizingSource = 'pre-sized (P2)';
    console.log(`[AJ10.1][TRUST_PRESIZED] Using pre-computed notional=$${positionValue.toFixed(2)} for ${trade.symbol}`);
  } else {
    // Fallback: Recalculate from risk parameters (only for signals without pre-sizing)
    const riskPerTradePct = parseFloat(settings.riskPerTradePct?.toString() || '4');
    const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
    const stopDistance = Math.abs(trade.entryPrice - trade.stopPrice);
    
    if (stopDistance === 0) {
      return { ok: true };
    }
    
    const positionSize = riskAmount / stopDistance;
    positionValue = positionSize * trade.entryPrice;
    sizingSource = 'recalculated';
    console.log(`[AJ10.1][RECALC_SIZING] No pre-sized value for ${trade.symbol}, recalculated notional=$${positionValue.toFixed(2)}`);
  }
  
  const positionPercent = (positionValue / portfolioValue) * 100;
  const wouldBlock = positionPercent > maxPositionPercent;

  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] position_size_cap: ${positionPercent.toFixed(1)}% of portfolio ($${portfolioValue.toFixed(2)}), max=${maxPositionPercent}%, source=${sizingSource}`);

  // [B4] Log MAX_POSITION check for diagnostics
  b4Diagnostics.logMaxPositionCheck({
    symbol: trade.symbol,
    strategy: trade.strategy,
    entry_price: trade.entryPrice,
    portfolio_balance: portfolioValue,
    max_single_position_allowed: maxPositionValue,
    max_total_exposure_allowed: portfolioValue * getDefaultMaxTotalExposurePct(), // B72.1: from guardrail_defaults.default_max_total_exposure_pct
    current_total_exposure: 0, // Would need open positions to calculate
    calculated_quantity: trade.preComputedNotional ? trade.preComputedNotional / trade.entryPrice : 0,
    calculated_notional: positionValue,
    buffered_max_notional: maxPositionValue * 0.97, // 3% buffer from active-position-sizing
    block_reason: wouldBlock ? 'MAX_POSITION' : 'PASS'
  });

  // AJ19: Log diagnostic entry with P2 data from trade candidate
  if (aj19Diagnostic.isActive()) {
    // Extract P2 sizing data if available from trade metadata
    const p2Notional = trade.preComputedNotional || undefined;
    
    // Calculate what P2 portfolio value would have been if sizing was done correctly
    // P2 notional / maxPositionPct * 100 = estimated P2 portfolio
    // This helps detect if P3 portfolio is different from P2 sizing assumptions
    const estimatedP2PortfolioValue = p2Notional && maxPositionPercent > 0 
      ? (p2Notional / maxPositionPercent) * 100 
      : undefined;
    
    // Check if P3 portfolio differs significantly from P2 estimate (>5% difference)
    const portfolioMismatchDetected = estimatedP2PortfolioValue !== undefined && 
      Math.abs(portfolioValue - estimatedP2PortfolioValue) / portfolioValue > 0.05;
    
    aj19Diagnostic.logCheck({
      cycleId: cycleId || 'unknown',
      symbol: trade.symbol,
      strategy: trade.strategy,
      // P2 Sizing Data (from trade candidate's preComputedNotional)
      p2Notional: p2Notional,
      p2SizingSource: p2Notional ? 'preComputedNotional' : undefined,
      // P3 Guardrail Check Data
      p3PortfolioValue: portfolioValue,
      p3MaxPositionPct: maxPositionPercent,
      p3MaxPositionValue: maxPositionValue,
      p3PositionValue: positionValue,
      p3PositionPct: positionPercent,
      p3SizingSource: sizingSource,
      p3Result: wouldBlock ? 'BLOCK_MAX_POSITION' : 'PASS',
      p3BlockReason: wouldBlock ? `${positionPercent.toFixed(1)}% > ${maxPositionPercent}%` : undefined,
      // Diagnostic Flags
      portfolioValueMismatch: portfolioMismatchDetected,
      preComputedNotionalMissing,
      wouldPassWithoutCheck: true // This trade would pass if MAX_POSITION was disabled
    });
  }

  if (wouldBlock) {
    // AJ10.5: Diagnostic logging for MAX_POSITION blocks
    console.warn(`[AJ10.5][MAX_POSITION_BLOCK] ${new Date().toISOString()} | symbol=${trade.symbol} | strategy=${trade.strategy} | estimatedValue=$${positionValue.toFixed(2)} | allowedMax=$${maxPositionValue.toFixed(2)} | maxPct=${maxPositionPercent}% | portfolioRiskPct=${settings.riskPerTradePct || '?'}% | sizingSource=${sizingSource}`);
    
    // AJ19: Dry-run mode - log but don't block
    if (aj19Diagnostic.isDryRunMode()) {
      console.log(`[AJ19][DRY_RUN] MAX_POSITION would block ${trade.symbol} but dry-run mode is enabled - ALLOWING`);
      return { ok: true };
    }
    
    return {
      ok: false,
      code: 'MAX_POSITION',
      reason: `Position size (${positionPercent.toFixed(1)}% = $${positionValue.toFixed(2)}) exceeds ${maxPositionPercent}% portfolio limit ($${maxPositionValue.toFixed(2)})`
    };
  }

  return { ok: true };
}

/**
 * Check 6: Low-Priced Coin Protection (LPCP)
 * 
 * Phase 8.8.3-AJ8: LPCP is now DORMANT.
 * - No LPCP logic runs during sizing or execution
 * - No LPCP block reasons triggered
 * - No LPCP thresholds evaluated
 * - LPCP guardrail fields remain persisted for future phases
 * 
 * Original Guardrails (preserved for future use):
 * - lpcpLowPriceThresholdUsd (number)
 * - lpcpMinStopAtrMultiple (number) 
 * - lpcpMinNotionalUsd (number)
 * 
 * This function structure is kept intact for future re-enablement.
 * @returns Always returns { ok: true } - no blocking
 */
async function checkLowPricedCoinProtection(
  mode: 'live' | 'paper',
  trade: TradeCandidate,
  settings: TradingSettings
): Promise<TradeSafetyResult> {
  // Phase 8.8.3-AJ8: LPCP is DORMANT - always pass, no blocking
  // This allows normal trading to proceed without LPCP interference
  // LPCP guardrail values remain in DB for future phases
  console.log(`[AJ8][LPCP_DORMANT] symbol=${trade.symbol}, price=${trade.entryPrice}, mode=${mode} → PASS (LPCP disabled per AJ8)`);
  return { ok: true };
  
  // ===============================================================
  // DORMANT CODE BELOW - Preserved for future re-enablement
  // Do not delete - will be re-enabled in a future phase
  // ===============================================================
  /*
  try {
    const extSettings = settings as any;
    const threshold = extSettings.lpcpLowPriceThresholdUsd || 0.50;
    const minStopAtrMult = extSettings.lpcpMinStopAtrMultiple || 3.0;
    const minPositionNotional = extSettings.lpcpMinNotionalUsd || 25.00;
    
    const { baseCurrency, quoteCurrency } = fxConversionService.parseSymbol(trade.symbol);
    
    let entryPriceUSD = trade.entryPrice;
    let stopPriceUSD = trade.stopPrice;
    
    if (fxConversionService.requiresConversion(quoteCurrency)) {
      try {
        entryPriceUSD = await fxConversionService.convertToUSD(trade.entryPrice, quoteCurrency);
        stopPriceUSD = await fxConversionService.convertToUSD(trade.stopPrice, quoteCurrency);
      } catch (fxError) {
        return {
          ok: false,
          code: 'FX_CONVERSION_FAILED',
          reason: `FX conversion failed for ${quoteCurrency}. Unable to verify low-priced coin protection.`
        };
      }
    }
    
    if (entryPriceUSD > threshold) {
      return { ok: true };
    }
    
    let atr = trade.atr || 0;
    if (!atr) {
      try {
        const marketData = await marketDataService.getMarketData(baseCurrency) as Record<string, any>;
        const marketDataAtr = marketData?.atr;
        if (marketDataAtr && typeof marketDataAtr === 'number') {
          atr = marketDataAtr;
          if (fxConversionService.requiresConversion(quoteCurrency)) {
            atr = await fxConversionService.convertToUSD(atr, quoteCurrency);
          }
        } else {
          atr = entryPriceUSD * 0.02;
        }
      } catch {
        atr = entryPriceUSD * 0.02;
      }
    }
    
    const strategyStopUSD = Math.abs(entryPriceUSD - stopPriceUSD);
    const atrFloorStopUSD = atr * minStopAtrMult;
    
    const rawPortfolioValue = parseFloat(settings.portfolioValue?.toString() || '0');
    
    if (!Number.isFinite(rawPortfolioValue) || rawPortfolioValue <= 0) {
      return { ok: true };
    }
    
    const portfolioValue = rawPortfolioValue;
    const riskPerTradePct = parseFloat(settings.riskPerTradePct?.toString() || '4');
    const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
    
    const effectiveStopUSD = Math.max(strategyStopUSD, atrFloorStopUSD);
    const positionSize = effectiveStopUSD > 0 ? riskAmount / effectiveStopUSD : 0;
    const positionNotionalUSD = positionSize * entryPriceUSD;
    
    if (positionNotionalUSD < minPositionNotional) {
      return {
        ok: false,
        code: 'LPCP_MIN_NOTIONAL',
        reason: `Low-priced protection: trade notional ($${positionNotionalUSD.toFixed(2)} USD) below minimum ($${minPositionNotional.toFixed(2)})`
      };
    }
    
    return { ok: true };
    
  } catch (error) {
    return { ok: true };
  }
  */
}

/**
 * Check 7: Max Open Trades
 * Guardrail: maxOpenPositions (number)
 */
async function checkMaxOpenTrades(
  mode: 'live' | 'paper',
  settings: TradingSettings
): Promise<TradeSafetyResult> {
  const activePositions = await getActivePositions(mode);
  // B72.1: fallback resolved from guardrail_defaults.max_open_trades_default
  const maxOpenTrades = (settings as any).maxOpenTrades || getMaxOpenTradesDefault();

  if (activePositions.length >= maxOpenTrades) {
    console.warn(`[8.8.3-H4][GUARDRAIL_BLOCK] code:MAX_TRADES, current:${activePositions.length}, max:${maxOpenTrades}`);
    return {
      ok: false,
      code: 'MAX_TRADES',
      reason: `Maximum open trades limit reached (${maxOpenTrades})`
    };
  }

  return { ok: true };
}

/**
 * Check 8: Max Total Portfolio Exposure
 * Guardrail: maxTotalExposurePct (percentage)
 * Phase 8.8.3-B3: Ensures total exposure across all open positions doesn't exceed limit
 */
async function checkMaxTotalExposure(
  mode: 'live' | 'paper',
  trade: TradeCandidate,
  settings: TradingSettings
): Promise<TradeSafetyResult> {
  try {
    const portfolioBalance = await getPortfolioBalanceV2(mode);
    // B72.1: fallback (settings missing) resolved from guardrail_defaults.default_max_total_exposure_pct (stored as ratio, converted to percentage here)
    const maxTotalExposurePct = parseFloat(
      (settings as any).maxTotalExposurePct?.toString()
      || (getDefaultMaxTotalExposurePct() * 100).toString()
    );
    const maxTotalExposureUSD = portfolioBalance * (maxTotalExposurePct / 100);
    
    const activePositions = await getActivePositions(mode);
    
    let currentExposure = 0;
    for (const pos of activePositions) {
      const quantity = parseFloat(pos.quantity?.toString() || '0');
      const entryPrice = parseFloat(pos.entryPrice?.toString() || pos.avgPrice?.toString() || '0');
      currentExposure += quantity * entryPrice;
    }
    
    const tradeNotional = trade.preComputedNotional || (trade.entryPrice * 1);
    const projectedExposure = currentExposure + tradeNotional;
    
    if (projectedExposure > maxTotalExposureUSD) {
      console.warn(`[8.8.3-B3][GUARDRAIL_BLOCK] code:MAX_TOTAL_EXPOSURE, current=$${currentExposure.toFixed(2)}, projected=$${projectedExposure.toFixed(2)}, max=$${maxTotalExposureUSD.toFixed(2)} (${maxTotalExposurePct}% of $${portfolioBalance.toFixed(2)})`);
      return {
        ok: false,
        code: 'MAX_TOTAL_EXPOSURE',
        reason: `Max Total Portfolio Exposure exceeded: $${projectedExposure.toFixed(2)} > $${maxTotalExposureUSD.toFixed(2)} (${maxTotalExposurePct}% limit)`
      };
    }
    
    return { ok: true };
  } catch (error) {
    console.error('[8.8.3-B3][MAX_TOTAL_EXPOSURE_ERROR]', error);
    return { ok: true };
  }
}

/**
 * Phase 8.8.3-H4: Main pre-trade guardrail check
 * 
 * Replaces RiskManager.checkPreTradeRisk() with a transparent,
 * guardrail-driven implementation. All checks use values from
 * guardrails_v2 that are visible in the Guardrails tab.
 * 
 * Phase 8.8.3-AJ19: Added cycleId for diagnostic tracking
 * 
 * @param mode Trading mode (live/paper)
 * @param trade Trade candidate to validate
 * @param userId Optional user ID for context lookup
 * @param cycleId Optional cycle ID for AJ19 diagnostic tracking
 * @returns TradeSafetyResult with ok=true or ok=false with code and reason
 */
export async function checkGuardrailRisk(
  mode: 'live' | 'paper',
  trade: TradeCandidate,
  userId?: string,
  cycleId?: string
): Promise<TradeSafetyResult> {
  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] Starting pre-trade checks for ${trade.symbol} (mode=${mode})`);
  
  // [8.8.3-I2] Record RTB attempt in central metrics service (single source of truth)
  rtbMetricsService.recordAttempt(trade.symbol, trade.strategy);
  
  // [8.8.3-I1] Also record in I1 diagnostics for detailed event history
  i1RtbDiagnostics.recordAttempt(trade.symbol, trade.strategy);
  
  // [8.8.3-I2] Check ENGINE_STOPPING first - block new trades during hard stop
  if (mode === 'paper') {
    const manager = getGlobalActiveEngineManager();
    if (manager && typeof manager.getStopInProgress === 'function' && manager.getStopInProgress()) {
      console.log(`[8.8.3-I2][ENGINE_STOPPING] Blocking trade for ${trade.symbol} - hard stop in progress`);
      const result: TradeSafetyResult = {
        ok: false,
        code: 'ENGINE_STOPPING',
        reason: 'Trade blocked: engine is stopping. No new trades allowed during hard stop.'
      };
      rtbMetricsService.recordBlock(trade.symbol, trade.strategy, 'ENGINE_STOPPING');
      i1RtbDiagnostics.recordBlock(trade.symbol, trade.strategy, 'ENGINE_STOPPING');
      return result;
    }
  }
  
  const settings = await buildSettingsFromGuardrails(mode, userId);
  
  // B5: Helper to log guardrail checks
  const logGuardrailCheck = (
    guardrailType: string, 
    result: TradeSafetyResult, 
    extra?: { maxPositionUsd?: number; totalExposureUsd?: number }
  ) => {
    b5SizingAudit.logGuardrailCheck({
      guardrailType,
      strategy: trade.strategy,
      symbol: trade.symbol,
      entryPrice: trade.entryPrice,
      incomingQuantity: trade.preComputedNotional ? trade.preComputedNotional / trade.entryPrice : null,
      incomingEstimatedValue: trade.preComputedNotional ?? null,
      computedMaxPositionUsd: extra?.maxPositionUsd ?? null,
      computedTotalExposureUsd: extra?.totalExposureUsd ?? null,
      decision: result.ok ? 'allowed' : 'blocked',
      reason: result.ok ? null : (result as any).reason,
    });
  };
  
  // [8.8.3-I2] Helper to record block in both RtbMetricsService (source of truth) and I1 diagnostics
  // [8.8.3-I5] Added diagnostic logging for guardrail fire audit
  // Phase 8.8.4-A: Added SLAL VALIDATION stage recording
  const recordBlock = (result: TradeSafetyResult): TradeSafetyResult => {
    if (!result.ok) {
      rtbMetricsService.recordBlock(trade.symbol, trade.strategy, result.code);
      i1RtbDiagnostics.recordBlock(trade.symbol, trade.strategy, result.code);
      
      // Phase 8.8.3-I5: Diagnostic logging for guardrail fire audit
      console.log(`[8.8.3-I5][GUARDRAIL_FIRE] guardrail=${result.code} symbol=${trade.symbol} strategy=${trade.strategy} reason=${(result as any).reason?.slice(0, 100)} timestamp=${Date.now()}`);
      
      // Phase 8.8.4-A: Record SLAL VALIDATION failure
      if (trade.signalId) {
        const slalReason = mapCodeToSLALReason(result.code);
        signalLifecycleAudit.recordValidation(
          trade.signalId,
          mode,
          trade.symbol,
          trade.strategy,
          false,
          { guardrailCode: result.code, reason: (result as any).reason },
          slalReason
        );
      }
    }
    return result;
  };
  
  // Phase 8.8.4-A.2: Map TradeSafetyResultCode to SLAL RejectionReason
  // Updated to use MAX_TRADES instead of MAX_POSITIONS for clarity
  const mapCodeToSLALReason = (code: TradeSafetyResultCode): RejectionReason => {
    switch (code) {
      case 'KILL_SWITCH': return 'DAILY_LOSS_LIMIT';
      case 'POSITION_LIMIT': return 'MAX_TRADES'; // Max trades per symbol/asset
      case 'COOLDOWN': return 'SYMBOL_COOLDOWN';
      case 'MAX_POSITION': return 'POSITION_CAP';
      case 'MAX_TRADES': return 'MAX_TRADES'; // Max simultaneous open trades
      case 'MAX_TOTAL_EXPOSURE': return 'POSITION_CAP';
      case 'ENGINE_STOPPING': return 'OTHER';
      case 'CORRELATION_EXPOSURE': return 'GUARDRAIL_BLOCKED';
      default: return 'GUARDRAIL_BLOCKED';
    }
  };
  
  const killSwitchCheck = checkKillSwitch(settings, mode, trade.symbol);
  if (!killSwitchCheck.ok) {
    logGuardrailCheck('KILL_SWITCH', killSwitchCheck);
    return recordBlock(killSwitchCheck);
  }
  
  const stopLossCheck = checkStopLossRequired(trade);
  if (!stopLossCheck.ok) {
    logGuardrailCheck('STOP_LOSS', stopLossCheck);
    return recordBlock(stopLossCheck);
  }
  
  const assetCheck = await checkMaxPositionsPerAsset(mode, trade);
  if (!assetCheck.ok) {
    logGuardrailCheck('MAX_POSITIONS_PER_ASSET', assetCheck);
    return recordBlock(assetCheck);
  }
  
  const cooldownCheck = await checkSymbolCooldown(mode, trade);
  if (!cooldownCheck.ok) {
    logGuardrailCheck('SYMBOL_COOLDOWN', cooldownCheck);
    return recordBlock(cooldownCheck);
  }
  
  // AJ19: Pass cycleId for diagnostic tracking
  const positionSizeCheck = await checkPositionSizeCap(mode, trade, settings, cycleId);
  if (!positionSizeCheck.ok) {
    const maxPosNum = settings.maxPositionPercent ? parseFloat(settings.maxPositionPercent) : undefined;
    logGuardrailCheck('POSITION_SIZE_CAP', positionSizeCheck, { maxPositionUsd: maxPosNum });
    return recordBlock(positionSizeCheck);
  }
  
  const lpcpCheck = await checkLowPricedCoinProtection(mode, trade, settings);
  if (!lpcpCheck.ok) {
    logGuardrailCheck('LOW_PRICED_COIN_PROTECTION', lpcpCheck);
    return recordBlock(lpcpCheck);
  }
  
  const maxTradesCheck = await checkMaxOpenTrades(mode, settings);
  if (!maxTradesCheck.ok) {
    logGuardrailCheck('MAX_OPEN_TRADES', maxTradesCheck);
    return recordBlock(maxTradesCheck);
  }
  
  // Phase 8.8.3-B3: Check total portfolio exposure
  const totalExposureCheck = await checkMaxTotalExposure(mode, trade, settings);
  if (!totalExposureCheck.ok) {
    logGuardrailCheck('MAX_TOTAL_EXPOSURE', totalExposureCheck);
    return recordBlock(totalExposureCheck);
  }
  
  // Directive 9.4: Check correlation exposure (Covariance Guard)
  // Always update position weights from active positions (even if empty, to clear stale state)
  const currentPositions = await getActivePositions(mode);
  const weights: Record<string, number> = {};
  for (const pos of currentPositions) {
    const qty = parseFloat(pos.quantity) || 0;
    const price = parseFloat(pos.entryPrice) || 0;
    weights[pos.symbol] = qty * price;
  }
  riskConcentrationAnalyzer.updatePositionWeights(mode, weights); // P19-B4b D5: per-mode weights

  if (isCorrelatedExposure(mode, trade.symbol)) { // P19-B4b D5: per-mode correlation check
    const correlationResult: TradeSafetyResult = {
      ok: false,
      code: 'CORRELATION_EXPOSURE',
      reason: `${trade.symbol} exceeds correlation threshold with existing positions`
    };
    console.warn(`[9.4][RISK] Blocking ${trade.symbol}: correlation exposure exceeded`);
    logGuardrailCheck('CORRELATION_EXPOSURE', correlationResult);
    return recordBlock(correlationResult);
  }
  
  // B5: Log successful guardrail pass
  logGuardrailCheck('ALL_PASSED', { ok: true });
  
  // Phase 8.8.4-A: Record SLAL VALIDATION success
  if (trade.signalId) {
    signalLifecycleAudit.recordValidation(
      trade.signalId,
      mode,
      trade.symbol,
      trade.strategy,
      true,
      { allChecks: 'passed' }
    );
  }
  
  console.log(`[8.8.3-H4][GUARDRAIL_PASS] All pre-trade checks passed for ${trade.symbol}`);
  return { ok: true };
}

/**
 * Calculate position size based on risk amount and stop distance
 * @param symbol Trading pair symbol
 * @param riskAmount Risk amount in USD
 * @param entryPrice Entry price
 * @param stopPrice Stop loss price
 * @returns Position sizing info
 */
export function calculatePositionSize(
  riskAmount: number,
  entryPrice: number,
  stopPrice: number
): {
  quantity: number;
  notionalValue: number;
} {
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance === 0) {
    return { quantity: 0, notionalValue: 0 };
  }
  
  const quantity = riskAmount / stopDistance;
  const notionalValue = quantity * entryPrice;
  
  return { quantity, notionalValue };
}

/**
 * Calculate risk/reward ratio
 */
export function calculateRiskReward(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number
): { risk: number; reward: number; ratio: number } {
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  const ratio = risk > 0 ? reward / risk : 0;

  return { risk, reward, ratio };
}

// ==========================================
// Directive 9.2.D — Trailing State Persistence
// In-memory cache with JSON file backup for trailing states
// ==========================================

import { 
  exportAllStates, 
  importStates, 
  type TrailingState 
} from './trailing-exit-controller.js';
import * as fs from 'fs';
import * as path from 'path';

const TRAILING_STATE_FILE = '/tmp/trailing-states.json';

/**
 * Directive 9.2.D: Save trailing states to file for persistence
 */
export function persistTrailingStates(): void {
  try {
    const states = exportAllStates();
    fs.writeFileSync(TRAILING_STATE_FILE, JSON.stringify(states, null, 2));
    console.log(`[9.2][PERSIST] Saved ${states.length} trailing states to file`);
  } catch (error) {
    console.error(`[9.2][PERSIST] Failed to save trailing states:`, error);
  }
}

/**
 * Directive 9.2.D: Load trailing states from file on startup
 */
export function loadTrailingStates(): void {
  try {
    if (fs.existsSync(TRAILING_STATE_FILE)) {
      const data = fs.readFileSync(TRAILING_STATE_FILE, 'utf-8');
      const states: TrailingState[] = JSON.parse(data);
      importStates(states);
      console.log(`[9.2][PERSIST] Loaded ${states.length} trailing states from file`);
    } else {
      console.log(`[9.2][PERSIST] No trailing states file found, starting fresh`);
    }
  } catch (error) {
    console.error(`[9.2][PERSIST] Failed to load trailing states:`, error);
  }
}

/**
 * Directive 9.2.D: Clear persisted trailing states
 */
export function clearPersistedStates(): void {
  try {
    if (fs.existsSync(TRAILING_STATE_FILE)) {
      fs.unlinkSync(TRAILING_STATE_FILE);
      console.log(`[9.2][PERSIST] Cleared trailing states file`);
    }
  } catch (error) {
    console.error(`[9.2][PERSIST] Failed to clear trailing states:`, error);
  }
}
