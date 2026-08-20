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

    // ★★ B-COST-MATH-CONSOLIDATION SITE 9 — PHANTOM READ DELETED (#614). Found by running the
    // batch's own fence (`as any` on a schema-typed row) across ALL of server/ rather than only the
    // files already known — the four earlier sites were found by narrower searches that could not
    // have returned this one.
    // Was: `Number((state as any).startingBalance || state.balance)`. `portfolio_state` HAS NO
    // `startingBalance` column, so the first operand was ALWAYS undefined and this ALWAYS resolved
    // to `state.balance` — which IS the anchor, so the VALUE was and remains correct. Same
    // no-behaviour-change repair as site 7: read it under its true name, drop the cast.
    //
    // ⚠️ WHAT IS *NOT* FIXED HERE, AND WHY IT MATTERS MORE ON THIS PATH THAN ON A DISPLAY:
    // this function is `getPortfolioBalanceV2` — the GUARDRAIL balance. Below, it pairs this
    // anchor with a SESSION-SCOPED realized P/L (`getEngineSessionStart`) drawn from
    // `getClosedTrades(mode, { closedOnly: true })`, which carries a silent default cap of 100 rows
    // ordered by `opened_at`. That is #618 legs 1 and 2 — filed against the reporting routes —
    // reaching the RISK-SIZING path. Repairing the pairing is #618's decision, NOT this batch's
    // bound; it is flagged rather than quietly widened. See #618.
    const anchorBalance = Number(state.balance);
    const startingBalance = anchorBalance;
    if (startingBalance <= 0 || isNaN(startingBalance)) {
      console.warn(`[8.8.3-H4][GuardrailSettings] Invalid anchor balance (${startingBalance}) for mode=${mode}`);
      return 0;
    }

    // [9.6.3] Get realized P/L from closed trades - mode-aware
    // Import dynamically to avoid circular dependency
    const { getEngineSessionStart } = await import('./active-execution-engine.js');
    const sessionStart = getEngineSessionStart(mode);
    
    // [9.6.3] Mode-aware trade query: paper uses getClosedTrades, live uses getTrades
    let allTrades: any[];
    if (mode === 'paper') {
      // Step A (#618): the DEFECT IS DELIBERATELY CODIFIED here for one deploy -- this is the
      // kill-switch denominator and its conversion is Step B, kept out of the mechanical step so
      // Step A stays behaviour-free and trivially revertible (Langston's Step-2 condition).
      allTrades = await storage.getClosedTrades(mode, { limit: 100, closedOnly: true });
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
  
  // P19-B8.8: field-level fallbacks retired. The throw at the top of this function
  // is the loud gate for a missing row; every column below is notNull-with-default
  // in the schema, so a falsy field here can only mean schema drift or a projection
  // change — exactly the fault the old '30.00'/'10.00'/'0.50'/'3.0'/'25.00' ternaries
  // silently absorbed. Raw values flow (NaN/'undefined' when broken); the blocking
  // consumers (trade-safety, the sizer) refuse loudly on unreadable input.
  const maxPositionPercent = String(guardrailsAny.maxPositionPercentPct);
  const lpcpLowPriceThresholdUsd = parseFloat(String(guardrailsAny.lowPriceThreshold));
  const lpcpMinStopAtrMultiple = parseFloat(String(guardrailsAny.lowPriceMinStopAtrMult));
  const lpcpMinNotionalUsd = parseFloat(String(guardrailsAny.lowPriceMinPositionNotional));
  const maxTotalExposurePct = String(guardrailsAny.maxTotalExposurePct);
  
  return {
    portfolioValue: portfolioValue.toString(),
    riskPerTradePct: riskPct.toString(),
    killSwitchTripped: guardrails.killSwitchTripped || false,
    // P19-B8.7 (OBJ-3): the `|| 5` fallback is GONE — it silently substituted a
    // made-up concurrency cap whenever the DB value was absent/unparseable (and was
    // the ancestor of the UI's phantom "5"). The raw Number flows through (NaN when
    // unreadable); every consumer must handle it loudly: the engine promotion loop
    // HALTS admissions for the tick (safe-degrade, never a fabricated cap), the API
    // ships it to an honest em-dash. No-hardcoded-fallbacks (CLAUDE.md §11).
    maxOpenTrades: Number(guardrails.maxOpenPositions),
    // P19-B8.8: the ': "7.00"' kill-switch default is GONE (same dead-but-dangerous
    // family as above — a defaulted KILL SWITCH is the worst number to fabricate).
    dailyLossKillSwitch: String(guardrails.dailyLossKillSwitchPct),
    // P19-B8.7 (OBJ-3): was a hardcoded '50.00' — a fiction that leaked into the AI
    // briefing text and diagnostics exports. Now the SAME DB-governed exposure cap
    // the sizer uses (maxTotalExposurePct, read above). Reporting-only consumers.
    maxExposurePercent: maxTotalExposurePct,
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
