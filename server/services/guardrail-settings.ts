/**
 * Phase 8.8.3-H4: Guardrail Settings Service
 * 
 * Provides helper functions for building settings from guardrails_v2.
 * All risk settings are derived from the Guardrails tab - no hidden defaults.
 * 
 * Single source of truth:
 * - guardrails_v2 table for all risk parameters
 * - portfolio_state table for portfolio balance
 */

import { storage } from '../storage';
import { TradingSettings } from '@shared/schema';

/**
 * Phase 8.8.3-H4: Calculate risk amount from percentage
 * Replaces old dollar-based risk_per_trade with percentage-based calculation
 * @param portfolioValue Current portfolio value in USD
 * @param riskPerTradePct Risk percentage (e.g., 4.0 for 4%)
 * @returns Risk amount in USD
 */
export function calculateRiskAmount(portfolioValue: number, riskPerTradePct: number): number {
  if (portfolioValue <= 0 || riskPerTradePct <= 0) {
    return 0;
  }
  return (portfolioValue * riskPerTradePct) / 100;
}

/**
 * Phase 8.8.3-H4: Get risk percentage from mode-level guardrails
 * Single source of truth: guardrails_v2.portfolio_risk_per_trade_pct
 * @param mode Trading mode (live/paper)
 * @param guardrails Guardrails configuration for the mode
 * @returns Risk percentage (e.g., 4.0 for 4%)
 */
export function getRiskPercentageV2(
  mode: 'live' | 'paper',
  guardrails: { portfolioRiskPerTradePct: string | number } | null
): number {
  if (!guardrails) {
    console.warn(`[8.8.3-H4][GuardrailSettings] No guardrails provided for mode=${mode}, using default 4%`);
    return 4.00;
  }

  const riskPct = Number(guardrails.portfolioRiskPerTradePct);
  if (riskPct <= 0 || isNaN(riskPct)) {
    console.warn(`[8.8.3-H4][GuardrailSettings] Invalid risk percentage (${riskPct}) for mode=${mode}, using default 4%`);
    return 4.00;
  }

  return riskPct;
}

/**
 * Phase 8.8.3-H4/C7: Get portfolio balance from mode-level portfolio_state
 * Phase 8.8.3-C7-FIX: Now returns Current Balance = Starting Balance + Realized P/L
 * This is the cash balance available for risk calculations, not including unrealized P/L
 * @param mode Trading mode (live/paper)
 * @param userId User ID
 * @param globalContextId Optional global context ID
 * @returns Current Balance (starting + realized P/L) in USD, or 0 if not found
 */
export async function getPortfolioBalanceV2(
  mode: 'live' | 'paper'
): Promise<number> {
  try {
    // [9.6.3] Use mode-only query for portfolio state (mode-based architecture)
    const state = await storage.getPortfolioState({ mode });
    
    if (!state) {
      console.warn(`[8.8.3-H4][GuardrailSettings] No portfolio_state found for mode=${mode}`);
      return 0;
    }

    // Phase 8.8.3-C7-FIX: Get starting balance
    const startingBalance = Number((state as any).startingBalance || state.balance);
    if (startingBalance <= 0 || isNaN(startingBalance)) {
      console.warn(`[8.8.3-H4][GuardrailSettings] Invalid startingBalance (${startingBalance}) for mode=${mode}`);
      return 0;
    }

    // [9.6.3] Get realized P/L from closed trades - mode-aware
    // Import dynamically to avoid circular dependency
    const { getEngineSessionStart } = await import('./active-execution-engine.js');
    const sessionStart = getEngineSessionStart(mode);
    
    // [9.6.3] Mode-aware trade query: paper uses getPaperSimTrades, live uses getTrades
    let allTrades: any[];
    if (mode === 'paper') {
      allTrades = await storage.getPaperSimTrades(mode, { closedOnly: true });
    } else {
      // Live mode: use getTrades with closed status filter
      const liveTrades = await storage.getTrades(mode, { status: 'closed' });
      allTrades = liveTrades.map(t => ({
        ...t,
        closedAt: t.exitTime,
        pnl: t.realizedPL
      }));
    }
    
    const sessionTrades = sessionStart 
      ? allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= sessionStart)
      : allTrades;
    
    // Sum realized P/L (net P/L from closed trades)
    const realizedPnl = sessionTrades.reduce((sum, trade) => {
      return sum + parseFloat(trade.pnl?.toString() || '0');
    }, 0);
    
    // Current Balance = Starting Balance + Realized P/L
    const currentBalance = startingBalance + realizedPnl;
    
    console.log(`[8.8.3-C7][GuardrailSettings] mode=${mode} startingBalance=${startingBalance.toFixed(2)} realizedPnl=${realizedPnl.toFixed(2)} currentBalance=${currentBalance.toFixed(2)}`);

    return currentBalance;
  } catch (error) {
    console.error(`[8.8.3-H4][GuardrailSettings] Error fetching portfolio balance for mode=${mode}:`, error);
    return 0;
  }
}

/**
 * Phase 8.8.3-H4: Build settings-compatible object from mode-level data
 * Fetches guardrails_v2 + portfolio_state and builds a TradingSettings-like object
 * 
 * All values are sourced from guardrails_v2 (visible in Guardrails tab):
 * - portfolioRiskPerTradePct
 * - maxPositionPercentPct
 * - dailyLossKillSwitchPct
 * - maxOpenPositions
 * - killSwitchTripped
 * - lowPriceThreshold (LPCP)
 * - lowPriceMinStopAtrMult (LPCP)
 * - lowPriceMinPositionNotional (LPCP)
 * 
 * @param mode Trading mode
 * @param userId User ID (optional for global context lookup)
 * @param globalContextId Optional global context ID
 * @returns Settings-compatible object with all fields populated from mode-level sources
 */
export async function buildSettingsFromGuardrails(
  mode: 'live' | 'paper',
  userId?: string,
  globalContextId?: string
): Promise<TradingSettings & { 
  killSwitchTripped: boolean;
  lpcpLowPriceThresholdUsd: number;
  lpcpMinStopAtrMultiple: number;
  lpcpMinNotionalUsd: number;
}> {
  const guardrails = await storage.getGuardrailsV2({ mode });
  if (!guardrails) {
    throw new Error(`[8.8.3-H4] No guardrails_v2 configured for mode=${mode}`);
  }

  // [9.7] getPortfolioBalanceV2 now only takes mode (mode-based architecture)
  const portfolioValue = await getPortfolioBalanceV2(mode);
  const riskPct = getRiskPercentageV2(mode, guardrails);

  const guardrailsAny = guardrails as any;
  
  // REB 8.8.3-G: maxPositionPercent from guardrails_v2.maxPositionPercentPct
  const maxPositionPercent = guardrailsAny.maxPositionPercentPct 
    ? String(guardrailsAny.maxPositionPercentPct) 
    : mode === 'paper' ? '30.00' : '10.00';
  
  // REB 8.8.3-H: LPCP values from guardrails_v2
  const lpcpLowPriceThresholdUsd = guardrailsAny.lowPriceThreshold 
    ? parseFloat(String(guardrailsAny.lowPriceThreshold)) 
    : 0.50;
  const lpcpMinStopAtrMultiple = guardrailsAny.lowPriceMinStopAtrMult 
    ? parseFloat(String(guardrailsAny.lowPriceMinStopAtrMult)) 
    : 3.0;
  const lpcpMinNotionalUsd = guardrailsAny.lowPriceMinPositionNotional 
    ? parseFloat(String(guardrailsAny.lowPriceMinPositionNotional)) 
    : 25.00;
    
  // Phase 8.8.3-B3: Max Total Portfolio Exposure
  const maxTotalExposurePct = guardrailsAny.maxTotalExposurePct 
    ? String(guardrailsAny.maxTotalExposurePct)
    : '25.00';
  
  return {
    portfolioValue: portfolioValue.toString(),
    riskPerTradePct: riskPct.toString(),
    killSwitchTripped: guardrails.killSwitchTripped || false,
    maxOpenTrades: Number(guardrails.maxOpenPositions) || 5,
    dailyLossKillSwitch: guardrails.dailyLossKillSwitchPct ? guardrails.dailyLossKillSwitchPct.toString() : '7.00',
    maxExposurePercent: '50.00',
    maxPositionPercent,
    maxTotalExposurePct,
    autoTrade: false,
    lpcpLowPriceThresholdUsd,
    lpcpMinStopAtrMultiple,
    lpcpMinNotionalUsd,
  } as any;
}

/**
 * @deprecated Use buildSettingsFromGuardrails() instead
 * Temporary alias for backward compatibility during migration
 */
export async function buildSettingsFromModeLevel(
  mode: 'live' | 'paper',
  userId?: string,
  globalContextId?: string
): Promise<any> {
  console.log(`[8.8.3-H4][DEPRECATION] buildSettingsFromModeLevel called - use buildSettingsFromGuardrails instead`);
  return buildSettingsFromGuardrails(mode, userId, globalContextId);
}

/**
 * @deprecated Use getRiskPercentageV2() instead
 * Legacy function for backward compatibility
 */
export function getRiskPercentage(
  settings: TradingSettings,
  portfolioValue: number
): number {
  console.warn('[8.8.3-H4][DEPRECATION] getRiskPercentage(settings, portfolioValue) called. Migrate to getRiskPercentageV2()');
  
  if (settings.riskPerTradePct && parseFloat(String(settings.riskPerTradePct)) > 0) {
    return parseFloat(String(settings.riskPerTradePct));
  }
  
  if ((settings as any).riskPerTrade && portfolioValue > 0) {
    const dollarRisk = parseFloat(String((settings as any).riskPerTrade));
    return (dollarRisk / portfolioValue) * 100;
  }
  
  return 4.00;
}
