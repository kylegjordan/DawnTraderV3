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

export const buildSettingsFromGuardrails = _buildSettingsFromGuardrails;
export const calculateRiskAmount = _calculateRiskAmount;

export interface TradeCandidate {
  symbol: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  strategy: string;
  atr?: number;
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
  | 'MAX_TRADES';

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
 */
async function checkSymbolCooldown(
  mode: 'live' | 'paper',
  trade: TradeCandidate
): Promise<TradeSafetyResult> {
  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] cooldown {symbol:${trade.symbol}, mode:${mode}}`);
  
  try {
    const guardrails = await storage.getGuardrails({ mode });
    if (!guardrails || guardrails.cooldownMinutes === null || guardrails.cooldownMinutes === undefined) {
      return { ok: true };
    }

    const cooldownMinutes = guardrails.cooldownMinutes;
    if (cooldownMinutes === 0) {
      return { ok: true };
    }

    const lastTrades = await storage.getTrades(mode, {
      symbol: trade.symbol,
      status: 'closed' as const,
      limit: 1
    });

    if (!lastTrades || lastTrades.length === 0) {
      return { ok: true };
    }

    const lastTrade = lastTrades[0];
    const exitOrEntryTime = lastTrade.exitTime || lastTrade.entryTime;
    if (!exitOrEntryTime) {
      return { ok: true };
    }
    const lastTradeTime = new Date(exitOrEntryTime).getTime();
    const currentTime = Date.now();
    const minutesSinceLastTrade = (currentTime - lastTradeTime) / (1000 * 60);

    if (minutesSinceLastTrade < cooldownMinutes) {
      const remainingMinutes = Math.ceil(cooldownMinutes - minutesSinceLastTrade);
      console.warn(`[8.8.3-H4][GUARDRAIL_BLOCK] code:COOLDOWN, symbol:${trade.symbol}, remaining:${remainingMinutes}min`);
      return {
        ok: false,
        code: 'COOLDOWN',
        reason: `Symbol ${trade.symbol} is in cooldown period. ${remainingMinutes} minute(s) remaining.`
      };
    }

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
 */
async function checkPositionSizeCap(
  mode: 'live' | 'paper',
  trade: TradeCandidate,
  settings: TradingSettings
): Promise<TradeSafetyResult> {
  // J7: Parse portfolio value - no hardcoded fallback
  const rawPortfolioValue = parseFloat(settings.portfolioValue?.toString() || '0');
  
  // J7: If no valid portfolio value, skip this check (sizing already done at P2 for paper mode)
  if (!Number.isFinite(rawPortfolioValue) || rawPortfolioValue <= 0) {
    console.log(`[J7][GUARDRAIL_SKIP] No valid portfolioValue in settings - skipping position size cap check (mode: ${mode})`);
    return { ok: true };
  }
  
  const portfolioValue = rawPortfolioValue;
  const riskPerTradePct = parseFloat(settings.riskPerTradePct?.toString() || '4');
  const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
  const stopDistance = Math.abs(trade.entryPrice - trade.stopPrice);
  
  if (stopDistance === 0) {
    return { ok: true };
  }
  
  const positionSize = riskAmount / stopDistance;
  const positionValue = positionSize * trade.entryPrice;
  
  const maxPositionPercent = parseFloat(String((settings as any).maxPositionPercent || '10.00'));
  const maxPositionValue = (portfolioValue * maxPositionPercent) / 100;
  const positionPercent = (positionValue / portfolioValue) * 100;

  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] position_size_cap: ${positionPercent.toFixed(1)}% of portfolio ($${portfolioValue.toFixed(2)}), max=${maxPositionPercent}%`);

  if (positionPercent > maxPositionPercent) {
    console.warn(`[8.8.3-H4][GUARDRAIL_BLOCK] code:MAX_POSITION, position:${positionPercent.toFixed(1)}%, max:${maxPositionPercent}%`);
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
  const maxOpenTrades = (settings as any).maxOpenTrades || 5;

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
 * Phase 8.8.3-H4: Main pre-trade guardrail check
 * 
 * Replaces RiskManager.checkPreTradeRisk() with a transparent,
 * guardrail-driven implementation. All checks use values from
 * guardrails_v2 that are visible in the Guardrails tab.
 * 
 * @param mode Trading mode (live/paper)
 * @param trade Trade candidate to validate
 * @param userId Optional user ID for context lookup
 * @returns TradeSafetyResult with ok=true or ok=false with code and reason
 */
export async function checkGuardrailRisk(
  mode: 'live' | 'paper',
  trade: TradeCandidate,
  userId?: string
): Promise<TradeSafetyResult> {
  console.log(`[8.8.3-H4][GUARDRAIL_CHECK] Starting pre-trade checks for ${trade.symbol} (mode=${mode})`);
  
  const settings = await buildSettingsFromGuardrails(mode, userId);
  
  const killSwitchCheck = checkKillSwitch(settings, mode, trade.symbol);
  if (!killSwitchCheck.ok) return killSwitchCheck;
  
  const stopLossCheck = checkStopLossRequired(trade);
  if (!stopLossCheck.ok) return stopLossCheck;
  
  const assetCheck = await checkMaxPositionsPerAsset(mode, trade);
  if (!assetCheck.ok) return assetCheck;
  
  const cooldownCheck = await checkSymbolCooldown(mode, trade);
  if (!cooldownCheck.ok) return cooldownCheck;
  
  const positionSizeCheck = await checkPositionSizeCap(mode, trade, settings);
  if (!positionSizeCheck.ok) return positionSizeCheck;
  
  const lpcpCheck = await checkLowPricedCoinProtection(mode, trade, settings);
  if (!lpcpCheck.ok) return lpcpCheck;
  
  const maxTradesCheck = await checkMaxOpenTrades(mode, settings);
  if (!maxTradesCheck.ok) return maxTradesCheck;
  
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
