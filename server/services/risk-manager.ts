/**
 * @deprecated Phase 8.8.3-H4 DEPRECATION NOTICE
 * 
 * This module is being phased out in favor of guardrail-driven risk management.
 * 
 * MIGRATION GUIDE:
 * - For pre-trade risk checks: Use checkGuardrailRisk() from './trade-safety.ts'
 * - For settings building: Use buildSettingsFromGuardrails() from './guardrail-settings.ts'
 * - For risk calculations: Use calculateRiskAmount() from './guardrail-settings.ts'
 * 
 * COMPLETED MIGRATIONS:
 * - trading-engine.ts → uses checkGuardrailRisk
 * - trade-executor.ts → uses checkGuardrailRisk
 * - paper-execution-engine.ts → uses checkGuardrailRisk
 * - pre-execution-validator.ts → uses checkGuardrailRisk
 * - paper-execution.ts → uses checkGuardrailRisk
 * 
 * REMAINING TO MIGRATE:
 * - routes.ts (secondary endpoints)
 * - heuristic-trader.ts
 * - daily-brief.ts
 * - behavioral-template.ts
 * - paper-sim-diagnostic.ts
 * 
 * See: docs/audits/phase_8.8.3-H4_risk_manager_usage.md
 */

import { storage } from '../storage';
import { TradingSettings, PaperSimOpenPosition } from '@shared/schema';
import { TradeSignal } from './trading-engine';
import { KrakenService } from './kraken';
import { marketDataService } from './market-data';
import { AssetCapabilitiesService } from './asset-capabilities';
import { telemetryService } from './telemetry-service.js';
import { fxConversionService } from './fx-conversion-service.js';

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  code?: string; // Phase 27.F.14.DIAG: Reason code for diagnostics
}

interface BalanceCache {
  totalValueUSD: number;
  cashUSD: number;
  cryptoUSD: number;
  syncTimestamp: number;
  source: 'kraken' | 'internal';
  error?: string;
}

// Helper interface to unify live trades and paper positions
interface ActivePosition {
  symbol: string;
  quantity: string;
  entryPrice: string;
  avgPrice?: string;
}

/**
 * Phase 41F-L.E2E-FIX: Helper function to calculate risk amount from percentage
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
 * Phase 41F-L.E2E-FIX: Get risk percentage with proper fallback chain
 * Handles: new percentage field → legacy dollar conversion → default 4%
 * Guards against zero/invalid portfolio values
 * @param settings Trading settings
 * @param portfolioValue Current portfolio value in USD
 * @returns Risk percentage (e.g., 4.0 for 4%)
 * @deprecated Use getRiskPercentageV2() for mode-level configuration
 */
export function getRiskPercentage(
  settings: TradingSettings,
  portfolioValue: number
): number {
  console.warn('[DEPRECATED] getRiskPercentage(settings, portfolioValue) called. Migrate to getRiskPercentageV2(mode, guardrails)');
  
  // Primary: Use new percentage field if available
  if (settings.riskPerTradePct && parseFloat(String(settings.riskPerTradePct)) > 0) {
    return parseFloat(String(settings.riskPerTradePct));
  }
  
  // Fallback: Convert old dollar amount to percentage (guard against zero portfolio)
  if (settings.riskPerTrade && portfolioValue > 0) {
    const dollarRisk = parseFloat(String(settings.riskPerTrade));
    return (dollarRisk / portfolioValue) * 100;
  }
  
  // Default: 4% (safe fallback)
  return 4.00;
}

// ============================================================================
// Phase 41F-L.E2E-PURGE: Mode-Level Helper Functions (V2)
// Pure mode-level configuration - NO user-scoped settings
// ============================================================================

/**
 * Phase 41F-L.E2E-PURGE: Get risk percentage from mode-level guardrails
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
    console.warn(`[getRiskPercentageV2] No guardrails provided for mode=${mode}, using default 4%`);
    return 4.00;
  }

  const riskPct = Number(guardrails.portfolioRiskPerTradePct);
  if (riskPct <= 0 || isNaN(riskPct)) {
    console.warn(`[getRiskPercentageV2] Invalid risk percentage (${riskPct}) for mode=${mode}, using default 4%`);
    return 4.00;
  }

  return riskPct;
}

/**
 * Phase 41F-L.E2E-PURGE: Get portfolio balance from mode-level portfolio_state
 * Single source of truth: portfolio_state.balance (per mode + user)
 * @param mode Trading mode (live/paper)
 * @param userId User ID
 * @param globalContextId Optional global context ID
 * @returns Portfolio balance in USD, or 0 if not found
 */
export async function getPortfolioBalanceV2(
  mode: 'live' | 'paper',
  userId?: string,
  globalContextId?: string
): Promise<number> {
  try {
    const state = await storage.getPortfolioState({ 
      mode, 
      userId, 
      globalContextId 
    });
    
    if (!state) {
      console.warn(`[getPortfolioBalanceV2] No portfolio_state found for mode=${mode}, userId=${userId}`);
      return 0;
    }

    const balance = Number(state.balance);
    if (balance <= 0 || isNaN(balance)) {
      console.warn(`[getPortfolioBalanceV2] Invalid balance (${balance}) for mode=${mode}, userId=${userId}`);
      return 0;
    }

    return balance;
  } catch (error) {
    console.error(`[getPortfolioBalanceV2] Error fetching portfolio balance for mode=${mode}:`, error);
    return 0;
  }
}

/**
 * Phase 41F-L.E2E-PURGE: Build settings-compatible object from mode-level data
 * TEMPORARY ADAPTER until all risk check methods are refactored to V2
 * Fetches guardrails_v2 + portfolio_state and builds a TradingSettings-like object
 * @param mode Trading mode
 * @param userId User ID
 * @param globalContextId Optional global context ID
 * @returns Settings-compatible object with all fields populated from mode-level sources
 */
export async function buildSettingsFromModeLevel(
  mode: 'live' | 'paper',
  userId?: string,
  globalContextId?: string
): Promise<any> {
  const guardrails = await storage.getGuardrailsV2({ mode });
  if (!guardrails) {
    throw new Error(`No guardrails configured for mode=${mode}`);
  }

  const portfolioValue = await getPortfolioBalanceV2(mode, userId, globalContextId);
  const riskPct = getRiskPercentageV2(mode, guardrails);

  // REB 8.8.3-KS-B: Build settings object using killSwitchTripped (tradingSuspended removed)
  // REB 8.8.3-G: maxPositionPercent now sourced from guardrails_v2.maxPositionPercentPct (user-configurable)
  const guardrailsAny = guardrails as any;
  const maxPositionPercent = guardrailsAny.maxPositionPercentPct 
    ? String(guardrailsAny.maxPositionPercentPct) 
    : mode === 'paper' ? '30.00' : '10.00'; // Fallback for pre-8.8.3-G rows
  
  return {
    portfolioValue: portfolioValue.toString(),
    riskPerTradePct: riskPct.toString(),
    killSwitchTripped: guardrails.killSwitchTripped || false,
    maxOpenTrades: Number(guardrails.maxOpenPositions) || 5,
    dailyLossKillSwitch: guardrails.dailyLossKillSwitchPct ? guardrails.dailyLossKillSwitchPct.toString() : '7.00',
    maxExposurePercent: '50.00', // Not in guardrails_v2, using safe default
    maxPositionPercent, // REB 8.8.3-G: Sourced from guardrails_v2.maxPositionPercentPct
    autoTrade: false,
  };
}

export class RiskManager {
  private krakenService: KrakenService;
  private assetCapabilitiesService: AssetCapabilitiesService;
  // Phase 27.F.15.B.3: Mode-based balance cache (not per-user)
  private balanceCacheMap: Map<'live' | 'paper', BalanceCache> = new Map();
  private readonly BALANCE_CACHE_TTL = 45000;

  constructor() {
    console.warn('[8.8.3-H4][DEPRECATED] RiskManager instantiated. Please migrate to checkGuardrailRisk() from trade-safety.ts');
    this.krakenService = new KrakenService();
    this.assetCapabilitiesService = new AssetCapabilitiesService();
  }

  /**
   * Phase 27.F.15.B.3: Get active positions from correct table based on trading mode
   * NO userId - mode parameter only (global architecture)
   * Live mode: reads from trades table
   * Paper mode: reads from paper_sim_open_positions table
   */
  private async getActivePositions(mode: 'live' | 'paper'): Promise<ActivePosition[]> {
    if (mode === 'paper') {
      // Phase 27.F.15.B.3: Global mode-based query (no userId)
      const paperPositions = await storage.getPaperSimOpenPositions('paper');
      console.log('[Phase-27.F.15.B.3] risk-manager.getActivePositions → mode-based (paper)');
      return paperPositions.map(p => ({
        symbol: p.symbol,
        quantity: p.quantity,
        entryPrice: p.avgPrice, // Use avgPrice for paper positions
        avgPrice: p.avgPrice,
      }));
    } else {
      // Phase 27.F.15.B.3: Global mode-based query for live trades (no userId)
      const activeTrades = await storage.getActiveTrades('live');
      console.log('[Phase-27.F.15.B.3] risk-manager.getActivePositions → mode-based (live)');
      return activeTrades.map(t => ({
        symbol: t.symbol,
        quantity: t.quantity,
        entryPrice: t.entryPrice,
      }));
    }
  }

  /**
   * Phase 27.F.15.B.3: Fetch live Kraken account balance (mode-based, global)
   * Uses 45-second cache to avoid excessive API calls
   * Falls back to internal calculation if Kraken API fails
   */
  async getLiveKrakenBalance(mode: 'live' | 'paper'): Promise<{
    totalValueUSD: number;
    cashUSD: number;
    cryptoUSD: number;
    syncTimestamp: number;
    source: 'kraken' | 'internal';
    error?: string;
  }> {
    const cachedBalance = this.balanceCacheMap.get(mode);
    if (cachedBalance && Date.now() - cachedBalance.syncTimestamp < this.BALANCE_CACHE_TTL) {
      console.log(`[Phase-27.F.15.B.3][mode=${mode}] Using cached balance (${Math.floor((Date.now() - cachedBalance.syncTimestamp) / 1000)}s old)`);
      return cachedBalance;
    }

    try {
      console.log(`[Phase-27.F.15.B.3][mode=${mode}] Fetching live Kraken balance...`);
      const balances = await this.krakenService.getAccountBalance();
      
      let cashUSD = 0;
      let cryptoUSD = 0;
      
      const USD_ASSETS = ['ZUSD', 'USD', 'USDT', 'USDC', 'DAI'];
      
      for (const [asset, balance] of Object.entries(balances)) {
        const amount = parseFloat(balance);
        if (amount === 0) continue;
        
        const normalizedAsset = asset.replace(/^[XZ]/, '');
        
        if (USD_ASSETS.includes(asset) || USD_ASSETS.includes(normalizedAsset)) {
          cashUSD += amount;
          console.log(`  [Phase-27.F.15.B.3][mode=${mode}] ${asset}: $${amount.toFixed(2)} (USD)`);
        } else {
          try {
            const marketData = await marketDataService.getMarketData(normalizedAsset);
            const valueUSD = amount * marketData.price;
            cryptoUSD += valueUSD;
            console.log(`  [Phase-27.F.15.B.3][mode=${mode}] ${asset}: ${amount.toFixed(8)} × $${marketData.price.toFixed(2)} = $${valueUSD.toFixed(2)}`);
          } catch (error) {
            console.warn(`  [Phase-27.F.15.B.3][mode=${mode}] Failed to get price for ${asset}, skipping:`, error);
          }
        }
      }
      
      const totalValueUSD = cashUSD + cryptoUSD;
      
      console.log(`[Phase-27.F.15.B.3][mode=${mode}] Kraken balance: $${totalValueUSD.toFixed(2)} (Cash: $${cashUSD.toFixed(2)}, Crypto: $${cryptoUSD.toFixed(2)})`);
      
      const krakenBalance = {
        totalValueUSD,
        cashUSD,
        cryptoUSD,
        syncTimestamp: Date.now(),
        source: 'kraken' as const
      };
      
      this.balanceCacheMap.set(mode, krakenBalance);
      return krakenBalance;
    } catch (error: any) {
      console.error(`[Phase-27.F.15.B.3][mode=${mode}] Failed to fetch Kraken balance, falling back to internal calculation:`, error.message);
      
      const metrics = await this.getPortfolioMetrics(mode);
      const cashCrypto = await this.getCashVsCrypto(mode);
      
      const fallbackResult = {
        totalValueUSD: metrics.totalValue,
        cashUSD: cashCrypto.cash,
        cryptoUSD: cashCrypto.crypto,
        syncTimestamp: Date.now(),
        source: 'internal' as const,
        error: 'Kraken API unavailable'
      };
      
      this.balanceCacheMap.set(mode, fallbackResult);
      return fallbackResult;
    }
  }

  /**
   * Phase 27.F.15.B.3: Mode-based pre-trade risk checks (no userId)
   */
  async checkPreTradeRisk(
    mode: 'live' | 'paper',
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    // REB 8.8.3-KS-B: Check kill switch tripped (tradingSuspended removed)
    if ((settings as any).killSwitchTripped) {
      return {
        approved: false,
        reason: '🚨 Trading stopped due to Kill Switch activation. Resume trading to continue.'
      };
    }

    // Check 1: Stop-loss validation (Task 8 Safety Guardrail - MOVED TO TOP)
    const stopLossCheck = this.checkStopLossRequired(signal);
    if (!stopLossCheck.approved) {
      return stopLossCheck;
    }

    // Check 2: Max 1 position per asset (Task 8 Safety Guardrail - MOVED TO TOP)
    const assetCheck = await this.checkMaxPositionsPerAsset(mode, signal);
    if (!assetCheck.approved) {
      return assetCheck;
    }

    // Check 3: Symbol cooldown period (Phase 27.F.14)
    const cooldownCheck = await this.checkSymbolCooldown(mode, signal);
    if (!cooldownCheck.approved) {
      return cooldownCheck;
    }

    // Check 4: Position size cap (Task 8 Safety Guardrail - MOVED BEFORE EXPOSURE)
    const positionSizeCheck = await this.checkPositionSizeCap(mode, signal, settings);
    if (!positionSizeCheck.approved) {
      return positionSizeCheck;
    }

    // Check 4b: REB 8.8.3-H Low-Priced Coin Protection (LPCP)
    const lpcpCheck = await this.checkLowPricedCoinProtection(mode, signal, settings);
    if (!lpcpCheck.approved) {
      return lpcpCheck;
    }

    // Check 5: Risk per trade
    const riskCheck = await this.checkRiskPerTrade(mode, signal, settings);
    if (!riskCheck.approved) {
      return riskCheck;
    }

    // Check 5: Available balance (for live trading)
    const balanceCheck = await this.checkAvailableBalance(mode, signal, settings);
    if (!balanceCheck.approved) {
      return balanceCheck;
    }

    // Check 6: Maximum concurrent exposure
    const exposureCheck = await this.checkMaxExposure(mode, signal, settings);
    if (!exposureCheck.approved) {
      return exposureCheck;
    }

    // Check 7: Maximum open trades
    const maxTradesCheck = await this.checkMaxOpenTrades(mode, settings);
    if (!maxTradesCheck.approved) {
      return maxTradesCheck;
    }

    return { approved: true };
  }

  /**
   * Phase 27.F.15.B.3: Mode-based available balance check (no userId)
   */
  private async checkAvailableBalance(
    mode: 'live' | 'paper',
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    try {
      // For paper trading, always approve
      if (mode === 'paper') {
        return { approved: true };
      }

      // Phase 41F-L.E2E-FIX: Get portfolio value and calculate risk from percentage
      const portfolioMetrics = await this.getPortfolioMetrics(mode);
      const portfolioValue = portfolioMetrics.totalValue || 50000;
      const riskPerTradePct = getRiskPercentage(settings, portfolioValue);
      const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
      
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      const positionSize = riskAmount / stopDistance;
      const requiredCapital = positionSize * signal.entryPrice;

      // Phase 27.F.15.B.3: Load max capital requirement from global guardrails (mode-only)
      const guardrailsData = await storage.getGuardrails({ mode });
      
      if (!guardrailsData || !guardrailsData.maxRequiredCapital) {
        console.warn(`[Phase-27.F.15.B.3][mode=${mode}] Guardrails not configured, rejecting trade for safety`);
        return {
          approved: false,
          reason: 'Guardrails not configured - please configure risk limits in Settings'
        };
      }

      const maxCapital = parseFloat(guardrailsData.maxRequiredCapital.toString());

      if (requiredCapital > maxCapital) {
        return {
          approved: false,
          reason: `Required capital ($${requiredCapital.toFixed(2)}) exceeds maximum allowed ($${maxCapital.toFixed(2)})`
        };
      }

      return { approved: true };
    } catch (error) {
      return {
        approved: false,
        reason: 'Error checking available balance'
      };
    }
  }

  /**
   * Phase 27.F.15.B.3: Mode-based risk per trade check (no userId)
   */
  private async checkRiskPerTrade(
    mode: 'live' | 'paper',
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    // Phase 41F-L.E2E-FIX: Calculate risk from percentage instead of dollar amount
    const portfolioMetrics = await this.getPortfolioMetrics(mode);
    const portfolioValue = portfolioMetrics.totalValue || 50000;
    const riskPerTradePct = getRiskPercentage(settings, portfolioValue);
    const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
    
    if (riskAmount <= 0) {
      return {
        approved: false,
        reason: 'Risk per trade must be greater than 0'
      };
    }

    // Phase 27.F.15.B.3: Load max risk limit from global guardrails (mode-only)
    const guardrailsData = await storage.getGuardrails({ mode });
    
    if (!guardrailsData || !guardrailsData.maxRiskPerTradeLimit) {
      console.warn(`[Phase-27.F.15.B.3][mode=${mode}] Guardrails not configured, rejecting trade for safety`);
      return {
        approved: false,
        reason: 'Guardrails not configured - please configure risk limits in Settings'
      };
    }

    const maxRiskLimit = parseFloat(guardrailsData.maxRiskPerTradeLimit.toString());

    if (riskAmount > maxRiskLimit) {
      return {
        approved: false,
        reason: `Risk per trade ($${riskAmount.toFixed(2)}) exceeds maximum allowed ($${maxRiskLimit.toFixed(2)})`
      };
    }

    return { approved: true };
  }

  /**
   * Phase 27.F.15.B.3: Mode-based max exposure check (no userId)
   */
  private async checkMaxExposure(
    mode: 'live' | 'paper',
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    const activePositions = await this.getActivePositions(mode);
    const maxExposurePercent = parseFloat(settings.maxExposurePercent || '0');

    // Calculate current exposure
    let currentExposure = 0;
    for (const trade of activePositions) {
      const tradeValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      currentExposure += tradeValue;
    }

    // Calculate new trade exposure
    const riskAmount = parseFloat(settings.riskPerTrade || '0');
    const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
    const positionSize = riskAmount / stopDistance;
    const newTradeValue = positionSize * signal.entryPrice;

    // Phase 27.F.15.B.3: Get actual portfolio value from mode-based portfolio_state
    let portfolioValue = 0;
    
    const systemContext = await storage.getSystemContext(mode);
    if (!systemContext) {
      console.warn(`[Phase-27.F.15.B.3][mode=${mode}] System context not found`);
      portfolioValue = 50000; // fallback
    } else {
      const portfolioState = await storage.getPortfolioState({ globalContextId: systemContext.id, mode });
      if (portfolioState?.balance) {
        portfolioValue = parseFloat(portfolioState.balance as string);
        console.log(`[Phase-27.F.15.B.3][mode=${mode}] Using actual balance from portfolio_state: $${portfolioValue.toFixed(2)}`);
      } else {
        // Fallback to settings.portfolioValue if portfolio_state not available
        portfolioValue = settings.portfolioValue ? parseFloat(settings.portfolioValue.toString()) : 50000;
        console.log(`[Phase-27.F.15.B.3][mode=${mode}] Fallback to settings: $${portfolioValue.toFixed(2)}`);
      }
    }
    
    const totalExposure = currentExposure + newTradeValue;
    const exposurePercent = (totalExposure / portfolioValue) * 100;

    console.log(`[Phase-27.F.15.B.3][mode=${mode}] Current=$${currentExposure.toFixed(0)}, New=$${newTradeValue.toFixed(0)}, Total=$${totalExposure.toFixed(0)} (${exposurePercent.toFixed(1)}% of $${portfolioValue.toFixed(0)}), Max=${maxExposurePercent}%`);

    if (exposurePercent > maxExposurePercent) {
      return {
        approved: false,
        reason: `Total exposure (${exposurePercent.toFixed(1)}% = $${totalExposure.toFixed(2)}) would exceed maximum allowed (${maxExposurePercent}% = $${(portfolioValue * maxExposurePercent / 100).toFixed(2)})`
      };
    }

    return { approved: true };
  }

  /**
   * Phase 27.F.15.B.3: Mode-based max open trades check (no userId)
   */
  private async checkMaxOpenTrades(
    mode: 'live' | 'paper',
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    const activePositions = await this.getActivePositions(mode);
    const maxOpenTrades = settings.maxOpenTrades || 0;

    if (activePositions.length >= maxOpenTrades) {
      return {
        approved: false,
        reason: `Maximum open trades limit reached (${maxOpenTrades})`
      };
    }

    return { approved: true };
  }

  /**
   * Phase 27.F.14: Symbol cooldown period check
   * Prevents trading the same symbol within specified cooldown period
   */
  private async checkSymbolCooldown(
    mode: 'live' | 'paper',
    signal: TradeSignal
  ): Promise<RiskCheckResult> {
    // [27.F.14.DIAG] DIAGNOSTIC: Check start
    console.log(`[Risk] check_start {symbol:${signal.symbol}, check:cooldown, mode:${mode}}`);
    
    try {
      // Get cooldown setting from guardrails
      const guardrails = await storage.getGuardrails({ mode });
      if (!guardrails || guardrails.cooldownMinutes === null || guardrails.cooldownMinutes === undefined) {
        // No cooldown configured, approve
        return { approved: true };
      }

      const cooldownMinutes = guardrails.cooldownMinutes;
      if (cooldownMinutes === 0) {
        // Cooldown disabled, approve
        return { approved: true };
      }

      // Get last trade for this symbol
      const lastTrades = await storage.getTrades(mode, {
        symbol: signal.symbol,
        status: 'closed' as const,
        limit: 1
      });

      if (!lastTrades || lastTrades.length === 0) {
        // No previous trades, approve
        console.log(`[Risk] cooldown_skip {symbol:${signal.symbol}, reason:no_previous_trades, cooldownMinutes:${cooldownMinutes}}`);
        return { approved: true };
      }

      const lastTrade = lastTrades[0];
      const exitOrEntryTime = lastTrade.exitTime || lastTrade.entryTime;
      if (!exitOrEntryTime) {
        return { approved: true };
      }
      const lastTradeTime = new Date(exitOrEntryTime).getTime();
      const currentTime = Date.now();
      const minutesSinceLastTrade = (currentTime - lastTradeTime) / (1000 * 60);

      if (minutesSinceLastTrade < cooldownMinutes) {
        const remainingMinutes = Math.ceil(cooldownMinutes - minutesSinceLastTrade);
        // [27.F.14.DIAG] DIAGNOSTIC: Risk check failed with reason code
        console.warn(`[Risk] risk_check_failed {code:COOLDOWN, symbol:${signal.symbol}, details:{minutesSince:${minutesSinceLastTrade.toFixed(1)}, cooldownMinutes:${cooldownMinutes}, remainingMinutes:${remainingMinutes}}}`);
        return {
          approved: false,
          code: 'COOLDOWN',
          reason: `Symbol ${signal.symbol} is in cooldown period. ${remainingMinutes} minute(s) remaining (last traded ${Math.floor(minutesSinceLastTrade)} minute(s) ago).`
        };
      }

      // [27.F.14.DIAG] DIAGNOSTIC: Cooldown check passed
      console.log(`[Risk] cooldown_skip {symbol:${signal.symbol}, lastCloseTs:${lastTradeTime}, minutesSince:${minutesSinceLastTrade.toFixed(1)}, cooldownMinutes:${cooldownMinutes}}`);
      return { approved: true };
    } catch (error) {
      console.error(`[Risk] Error checking cooldown:`, error);
      // On error, approve to avoid blocking trades
      return { approved: true };
    }
  }

  /**
   * Phase 27.F.15.B.3: Mode-based max positions per asset check (no userId)
   * Prevents multiple simultaneous positions in the same asset
   */
  private async checkMaxPositionsPerAsset(
    mode: 'live' | 'paper',
    signal: TradeSignal
  ): Promise<RiskCheckResult> {
    // [27.F.14.DIAG] DIAGNOSTIC: Check start
    console.log(`[Risk] check_start {symbol:${signal.symbol}, check:max_positions_per_asset, mode:${mode}}`);
    
    const activePositions = await this.getActivePositions(mode);
    
    // Extract base asset from symbol - handles all Kraken variants
    // Kraken uses: XXBTZUSD (double prefix), XBTUSD, XBT/USD, BTC/USD
    const normalizeSymbol = (symbol: string): string => {
      // Strip all X and Z prefixes from start (Kraken adds X for crypto, Z for fiat)
      let normalized = symbol.replace(/^[XZ]+/, '');
      
      // Remove quote currency (USD variants and slashes)
      normalized = normalized.replace(/\/USD|USD|ZUSD|\/ZUSD/g, '');
      
      // Map Kraken's XBT to standard BTC
      if (normalized === 'BT') {
        normalized = 'BTC';
      }
      
      return normalized;
    };
    
    const normalizedSymbol = normalizeSymbol(signal.symbol);
    
    const existingPosition = activePositions.find(trade => {
      const tradeSymbol = normalizeSymbol(trade.symbol);
      return tradeSymbol === normalizedSymbol;
    });

    if (existingPosition) {
      // [27.F.14.DIAG] DIAGNOSTIC: Risk check failed
      console.warn(`[Risk] risk_check_failed {code:POSITION_LIMIT, symbol:${signal.symbol}, details:{normalizedSymbol:${normalizedSymbol}, existingPosition:true}}`);
      return {
        approved: false,
        code: 'POSITION_LIMIT',
        reason: `🛡️ Safety: Already have an open position in ${normalizedSymbol}. Max 1 position per asset allowed.`
      };
    }

    return { approved: true };
  }

  /**
   * Task 8 Safety Guardrail: Stop-loss required
   * Ensures every trade has a stop-loss defined
   */
  private checkStopLossRequired(signal: TradeSignal): RiskCheckResult {
    if (!signal.stopPrice || signal.stopPrice === 0) {
      return {
        approved: false,
        reason: '🛡️ Safety: Stop-loss is required for all trades'
      };
    }

    // Validate stop-loss is on correct side for long positions
    if (signal.stopPrice >= signal.entryPrice) {
      return {
        approved: false,
        reason: '🛡️ Safety: Stop-loss must be below entry price for long positions'
      };
    }

    return { approved: true };
  }

  /**
   * Phase 27.F.15.B.3: Mode-based position size cap check (no userId)
   * Prevents oversized positions (max 10% of portfolio per position)
   */
  private async checkPositionSizeCap(
    mode: 'live' | 'paper',
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    // Phase 27.F.15.B.3: Get actual portfolio value from mode-based portfolio_state FIRST
    let portfolioValue = 0;
    
    const systemContext = await storage.getSystemContext(mode);
    if (!systemContext) {
      console.warn(`[Phase-27.F.15.B.3][mode=${mode}] System context not found`);
      portfolioValue = 50000; // fallback
    } else {
      const portfolioState = await storage.getPortfolioState({ globalContextId: systemContext.id, mode });
      if (portfolioState?.balance) {
        portfolioValue = parseFloat(portfolioState.balance as string);
        console.log(`[Phase-27.F.15.B.3][mode=${mode}] Using actual balance from portfolio_state: $${portfolioValue.toFixed(2)}`);
      } else {
        // Fallback to settings.portfolioValue if portfolio_state not available
        portfolioValue = settings.portfolioValue ? parseFloat(settings.portfolioValue.toString()) : 0;
        console.log(`[Phase-27.F.15.B.3][mode=${mode}] Fallback to settings.portfolioValue: $${portfolioValue.toFixed(2)}`);
      }
    }
    
    // Final fallback if still zero
    if (portfolioValue === 0) {
      const metrics = await this.getPortfolioMetrics(mode);
      portfolioValue = metrics.totalValue || 50000;
      console.log(`[Phase-27.F.15.B.3][mode=${mode}] Final fallback to metrics: $${portfolioValue.toFixed(2)}`);
    }
    
    // Phase 41F-L.E2E-FIX: Use percentage-based risk calculation with safe fallback
    const riskPerTradePct = getRiskPercentage(settings, portfolioValue);
    const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
    const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
    
    if (stopDistance === 0) {
      return { approved: true }; // Can't calculate if no stop distance
    }
    
    const positionSize = riskAmount / stopDistance;
    const positionValue = positionSize * signal.entryPrice;
    
    // Maximum single position: dynamically configured (default 10% of portfolio)
    const maxPositionPercent = parseFloat(String(settings.maxPositionPercent || '10.00'));
    const maxPositionValue = (portfolioValue * maxPositionPercent) / 100;
    const positionPercent = (positionValue / portfolioValue) * 100;

    console.log(`[Phase-27.F.15.B.3][mode=${mode}] RiskPct=${riskPerTradePct.toFixed(2)}%, Risk=$${riskAmount.toFixed(2)}, Stop=${stopDistance.toFixed(4)}, Qty=${positionSize.toFixed(2)}, Value=$${positionValue.toFixed(0)} (${positionPercent.toFixed(1)}% of $${portfolioValue.toFixed(0)} portfolio), Max=${maxPositionPercent}%`);

    if (positionPercent > maxPositionPercent) {
      return {
        approved: false,
        reason: `🛡️ Safety: Position size (${positionPercent.toFixed(1)}% = $${positionValue.toFixed(2)}) exceeds ${maxPositionPercent}% portfolio limit ($${maxPositionValue.toFixed(2)})`
      };
    }

    return { approved: true };
  }

  /**
   * REB 8.8.3-H: Low-Priced Coin Protection (LPCP) Check
   * REB 8.8.3-H3: Multi-Currency Support - converts all values to USD before LPCP checks
   * 
   * For coins with price ≤ threshold (in USD):
   * 1. Applies ATR-floor stop distance rule: effective_stop = max(strategy_stop, ATR × atrMult)
   * 2. Applies minimum notional rule: reject if position value < minNotional
   * 
   * NOTE: This check runs BEFORE position size cap and AFTER basic validation.
   * It augments the signal's stop distance for low-priced coins, does NOT bypass other guardrails.
   */
  private async checkLowPricedCoinProtection(
    mode: 'live' | 'paper',
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    console.log(`[8.8.3-H] LPCP check_start {symbol:${signal.symbol}, price:${signal.entryPrice}, mode:${mode}}`);
    
    try {
      // Get LPCP settings from guardrails_v2
      const guardrails = await storage.getGuardrailsV2({ mode });
      if (!guardrails) {
        console.warn(`[8.8.3-H] No guardrails_v2 configured for mode=${mode}, skipping LPCP check`);
        return { approved: true };
      }
      
      // Parse LPCP thresholds with safe defaults (all thresholds are in USD)
      const guardrailsAny = guardrails as any;
      const threshold = guardrailsAny.lowPriceThreshold 
        ? parseFloat(String(guardrailsAny.lowPriceThreshold)) 
        : 0.50;
      const minStopAtrMult = guardrailsAny.lowPriceMinStopAtrMult 
        ? parseFloat(String(guardrailsAny.lowPriceMinStopAtrMult)) 
        : 3.0;
      const minPositionNotional = guardrailsAny.lowPriceMinPositionNotional 
        ? parseFloat(String(guardrailsAny.lowPriceMinPositionNotional)) 
        : 25.00;
      
      // REB 8.8.3-H3: Parse symbol to extract quote currency
      const { baseCurrency, quoteCurrency, success: parseSuccess } = fxConversionService.parseSymbol(signal.symbol);
      console.log(`[8.8.3-H3][FX] Symbol parsed: ${signal.symbol} → base=${baseCurrency}, quote=${quoteCurrency}`);
      
      // REB 8.8.3-H3: Convert entry price to USD
      let entryPriceUSD = signal.entryPrice;
      let stopPriceUSD = signal.stopPrice;
      
      if (fxConversionService.requiresConversion(quoteCurrency)) {
        try {
          entryPriceUSD = await fxConversionService.convertToUSD(signal.entryPrice, quoteCurrency);
          stopPriceUSD = await fxConversionService.convertToUSD(signal.stopPrice, quoteCurrency);
          console.log(`[8.8.3-H3][FX] Converted prices: entry ${signal.entryPrice} ${quoteCurrency} → $${entryPriceUSD.toFixed(6)} USD, stop ${signal.stopPrice} ${quoteCurrency} → $${stopPriceUSD.toFixed(6)} USD`);
        } catch (fxError) {
          // REB 8.8.3-H3: Fail-safe - block trade if FX conversion fails
          console.error(`[8.8.3-H3][FX_FAIL] FX conversion failed, blocking trade for safety:`, fxError);
          return {
            approved: false,
            code: 'FX_CONVERSION_FAILED',
            reason: `🛡️ FX conversion failed for ${quoteCurrency}. Unable to verify low-priced coin protection.`
          };
        }
      } else {
        console.log(`[8.8.3-H3][FX] No conversion needed: ${quoteCurrency} is USD-equivalent`);
      }
      
      // Check if coin price (in USD) is below threshold
      if (entryPriceUSD > threshold) {
        console.log(`[8.8.3-H] LPCP skipped: priceUSD ${entryPriceUSD.toFixed(6)} > threshold ${threshold}`);
        return { approved: true };
      }
      
      console.log(`[8.8.3-H] LPCP active: priceUSD ${entryPriceUSD.toFixed(6)} ≤ threshold ${threshold}`);
      
      // REB 8.8.3-H3: Determine if this pair needs FX conversion (cached for reuse)
      const needsFxConversion = fxConversionService.requiresConversion(quoteCurrency);
      
      // Get ATR for the symbol (try to get from market data)
      let atr = 0;
      try {
        const marketData = await marketDataService.getMarketData(baseCurrency) as Record<string, any>;
        const marketDataAtr = marketData?.atr;
        // Use ATR if available, otherwise estimate from price volatility
        if (marketDataAtr && typeof marketDataAtr === 'number') {
          atr = marketDataAtr;
          // REB 8.8.3-H3: Convert ATR to USD if needed
          if (needsFxConversion) {
            try {
              atr = await fxConversionService.convertToUSD(atr, quoteCurrency);
              console.log(`[8.8.3-H3][FX] ATR converted to USD: ${atr.toFixed(6)}`);
            } catch (fxError) {
              // REB 8.8.3-H3: Fail-safe - block trade if FX conversion fails for non-USD pairs
              console.error(`[8.8.3-H3][FX_FAIL] ATR FX conversion failed, blocking trade:`, fxError);
              return {
                approved: false,
                code: 'FX_CONVERSION_FAILED',
                reason: `🛡️ FX conversion failed for ${quoteCurrency} ATR. Unable to verify low-priced coin protection.`
              };
            }
          }
        } else {
          // Fallback: estimate ATR as ~2% of USD price for low-priced coins
          atr = entryPriceUSD * 0.02;
          console.log(`[8.8.3-H] ATR not available, estimating: ${atr.toFixed(6)} USD`);
        }
      } catch (err) {
        // Fallback: use conservative ATR estimate based on USD price
        atr = entryPriceUSD * 0.02;
        console.log(`[8.8.3-H] Market data error, using fallback ATR: ${atr.toFixed(6)} USD`);
      }
      
      // Rule 1: ATR-floor stop distance (all in USD)
      const strategyStopUSD = Math.abs(entryPriceUSD - stopPriceUSD);
      const atrFloorStopUSD = atr * minStopAtrMult;
      
      if (strategyStopUSD < atrFloorStopUSD) {
        console.log(`[8.8.3-H] LPCP ATR-floor applied: strategy_stop=$${strategyStopUSD.toFixed(6)} < atr_floor=$${atrFloorStopUSD.toFixed(6)}`);
        // Note: We don't modify the signal here - just log and potentially reject
        // The strategy should respect this floor distance
      }
      
      // Rule 2: Minimum notional check (all in USD)
      // Calculate position value based on risk and effective stop distance
      const portfolioMetrics = await this.getPortfolioMetrics(mode);
      const portfolioValue = portfolioMetrics.totalValue || 50000;
      const riskPerTradePct = getRiskPercentage(settings, portfolioValue);
      const riskAmount = calculateRiskAmount(portfolioValue, riskPerTradePct);
      
      // Use effective stop (max of strategy stop and ATR floor) - all in USD
      const effectiveStopUSD = Math.max(strategyStopUSD, atrFloorStopUSD);
      const positionSize = effectiveStopUSD > 0 ? riskAmount / effectiveStopUSD : 0;
      const positionNotionalUSD = positionSize * entryPriceUSD;
      
      console.log(`[8.8.3-H] LPCP notional check: notional=$${positionNotionalUSD.toFixed(2)} USD, min=$${minPositionNotional.toFixed(2)}, effectiveStop=$${effectiveStopUSD.toFixed(6)} USD`);
      
      if (positionNotionalUSD < minPositionNotional) {
        console.warn(`[8.8.3-H] LPCP reject: notional $${positionNotionalUSD.toFixed(2)} USD < min $${minPositionNotional.toFixed(2)}`);
        return {
          approved: false,
          code: 'LPCP_MIN_NOTIONAL',
          reason: `🛡️ Low-priced protection: trade notional ($${positionNotionalUSD.toFixed(2)} USD) below minimum ($${minPositionNotional.toFixed(2)})`
        };
      }
      
      console.log(`[8.8.3-H] LPCP check passed: notional=$${positionNotionalUSD.toFixed(2)} USD ≥ min=$${minPositionNotional.toFixed(2)}`);
      return { approved: true };
      
    } catch (error) {
      console.error(`[8.8.3-H] LPCP check error:`, error);
      // On error, approve to avoid blocking trades (LPCP is protective, not blocking)
      return { approved: true };
    }
  }

  /**
   * Calculate position size based on risk amount and asset capabilities
   * Uses capability-aware sizing for fractional vs whole shares
   * @param symbol Trading pair symbol (e.g., 'BTC/USD', 'AAPL/USD')
   * @param riskAmount Risk amount in USD
   * @param entryPrice Entry price
   * @param stopPrice Stop loss price
   * @returns Position size object with quantity, notional value, and capability info
   */
  async calculatePositionSize(
    symbol: string,
    riskAmount: number,
    entryPrice: number,
    stopPrice: number
  ): Promise<{
    quantity: number;
    notionalValue: number;
    isFractional: boolean;
    meetsMinimum: boolean;
    reason?: string;
  }> {
    const stopDistance = Math.abs(entryPrice - stopPrice);
    if (stopDistance === 0) {
      return {
        quantity: 0,
        notionalValue: 0,
        isFractional: true,
        meetsMinimum: false,
        reason: 'Stop distance is zero'
      };
    }
    
    // Calculate position size in units based on risk
    // Formula: quantity = riskAmount / stopDistance
    const quantity = riskAmount / stopDistance;
    
    // Calculate notional value (max investment in USD)
    const maxInvestment = quantity * entryPrice;
    
    // Try to get asset capabilities for sizing rules
    try {
      const sizing = await this.assetCapabilitiesService.calculatePositionSize({
        symbol,
        maxInvestment,
        price: entryPrice
      });
      
      // Phase 41F-I: Record risk evaluation metric
      await telemetryService.recordTradeMetric('risk_eval', {
        symbol,
        riskPct: (riskAmount / maxInvestment) * 100,
        quantity: sizing.quantity,
        notionalValue: sizing.notionalValue
      });
      
      return sizing;
    } catch (error) {
      // Fallback: use basic calculation if capabilities not available
      console.warn(`[RiskManager] Asset capabilities not available for ${symbol}, using basic sizing:`, error);
      
      // Phase 41F-I: Record risk evaluation metric (fallback path)
      await telemetryService.recordTradeMetric('risk_eval', {
        symbol,
        riskPct: (riskAmount / maxInvestment) * 100,
        quantity,
        notionalValue: maxInvestment
      });
      
      return {
        quantity,
        notionalValue: maxInvestment,
        isFractional: true,
        meetsMinimum: true,
        reason: 'Using basic sizing (capabilities unavailable)'
      };
    }
  }
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use calculatePositionSize with symbol parameter instead
   */
  calculatePositionSizeBasic(
    riskAmount: number,
    entryPrice: number,
    stopPrice: number
  ): number {
    const stopDistance = Math.abs(entryPrice - stopPrice);
    if (stopDistance === 0) return 0;
    
    return riskAmount / stopDistance;
  }

  calculateRiskReward(
    entryPrice: number,
    stopPrice: number,
    targetPrice: number
  ): { risk: number; reward: number; ratio: number } {
    const risk = Math.abs(entryPrice - stopPrice);
    const reward = Math.abs(targetPrice - entryPrice);
    const ratio = reward / risk;

    return { risk, reward, ratio };
  }

  /**
   * Phase 27.F.15.B.3: Mode-based portfolio metrics (no userId)
   */
  async getPortfolioMetrics(mode: 'live' | 'paper'): Promise<{
    totalValue: number;
    unrealizedPL: number;
    realizedPL: number;
    currentExposure: number;
    openTradesCount: number;
  }> {
    const [activeTrades, closedTrades] = await Promise.all([
      storage.getActiveTrades(mode),
      storage.getTrades(mode, { status: 'closed', limit: 1000 })
    ]);

    let unrealizedPL = 0;
    let currentExposure = 0;

    // Calculate unrealized P/L and exposure from active trades
    for (const trade of activeTrades) {
      const tradeValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      currentExposure += tradeValue;
      
      // For unrealized P/L, we'd need current market prices
      // This is simplified - in reality we'd fetch current prices
    }

    // Calculate realized P/L from closed trades
    const realizedPL = closedTrades.reduce((total, trade) => {
      return total + (parseFloat(trade.realizedPL || '0'));
    }, 0);

    // Phase 41F-L.E2E-PURGE: Use mode-level portfolio balance
    const baseValue = await getPortfolioBalanceV2(mode);

    // Total value = base + realized P/L + unrealized P/L
    const totalValue = baseValue + realizedPL + unrealizedPL;

    return {
      totalValue,
      unrealizedPL,
      realizedPL,
      currentExposure,
      openTradesCount: activeTrades.length
    };
  }

  async getWinRate(mode: 'live' | 'paper', days = 30): Promise<{
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
    profitFactor: number;
  }> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const trades = await storage.getTrades(mode, { status: 'closed' });
    const recentTrades = trades.filter(trade => 
      trade.exitTime && new Date(trade.exitTime) >= fromDate
    );

    const wins = recentTrades.filter(trade => 
      parseFloat(trade.realizedPL || '0') > 0
    );
    const losses = recentTrades.filter(trade => 
      parseFloat(trade.realizedPL || '0') < 0
    );

    const totalWins = wins.reduce((sum, trade) => 
      sum + parseFloat(trade.realizedPL || '0'), 0
    );
    const totalLosses = Math.abs(losses.reduce((sum, trade) => 
      sum + parseFloat(trade.realizedPL || '0'), 0
    ));

    const winRate = recentTrades.length > 0 ? 
      (wins.length / recentTrades.length) * 100 : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    return {
      winRate,
      totalTrades: recentTrades.length,
      wins: wins.length,
      losses: losses.length,
      profitFactor
    };
  }

  /**
   * Calculate rolling 24h P/L (realized + unrealized)
   */
  async calculate24hPL(mode: 'live' | 'paper', settings?: TradingSettings): Promise<{
    totalPL: number;
    realizedPL: number;
    unrealizedPL: number;
    portfolioValueBefore: number;
    portfolioValueCurrent: number;
    lossPercent: number;
  }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Get all closed trades in last 24h
    const closedTrades = await storage.getTrades(mode, { status: 'closed' });
    const recentClosed = closedTrades.filter(trade => 
      trade.exitTime && new Date(trade.exitTime) >= twentyFourHoursAgo
    );
    
    // Calculate realized P/L from closed trades
    const realizedPL = recentClosed.reduce((sum, trade) => 
      sum + parseFloat(trade.realizedPL || '0'), 0
    );
    
    // Get active positions (Phase 27.F.13.A: Mode-aware)
    const activePositions = await this.getActivePositions(mode);
    
    // Calculate unrealized P/L (simplified - in reality would need current market prices)
    let unrealizedPL = 0;
    // TODO: Fetch current market prices and calculate unrealized P/L for active positions
    
    const totalPL = realizedPL + unrealizedPL;
    
    // Phase 41F-L.E2E-PURGE: Use mode-level portfolio balance
    let basePortfolioValue = 50000; // Fallback only
    if (settings?.portfolioValue) {
      basePortfolioValue = parseFloat(settings.portfolioValue.toString());
    } else {
      // Use mode-level portfolio balance (V2)
      basePortfolioValue = await getPortfolioBalanceV2(mode);
    }
    
    const portfolioValueCurrent = basePortfolioValue + realizedPL + unrealizedPL;
    const portfolioValueBefore = portfolioValueCurrent - totalPL;
    const lossPercent = portfolioValueBefore > 0 ? 
      (Math.abs(totalPL) / portfolioValueBefore) * 100 : 0;
    
    return {
      totalPL,
      realizedPL,
      unrealizedPL,
      portfolioValueBefore,
      portfolioValueCurrent,
      lossPercent
    };
  }

  /**
   * REB 8.8.3-KS-B: Check kill switch thresholds and trigger if needed
   * Uses guardrailPolicy.tripKillSwitch() which stops trading via same path as /api/trading/stop
   */
  async checkKillSwitch(mode: 'live' | 'paper', settings: TradingSettings): Promise<{
    triggered: boolean;
    eventType: 'none' | 'warning' | 'kill_switch';
    message: string;
  }> {
    // REB 8.8.3-KS-B: Skip if kill switch already tripped (not tradingSuspended)
    if ((settings as any).killSwitchTripped) {
      return { triggered: false, eventType: 'none', message: '' };
    }
    
    const pl24h = await this.calculate24hPL(mode, settings);
    
    // Only check if there's a loss
    if (pl24h.totalPL >= 0) {
      return { triggered: false, eventType: 'none', message: '' };
    }
    
    const killSwitchThreshold = parseFloat(settings.dailyLossKillSwitch || '7.00');
    const warningTriggerPercent = parseFloat((settings as any).dailyLossWarningTrigger || '75.00');
    const warningThreshold = (warningTriggerPercent / 100) * killSwitchThreshold;
    
    console.log(`\n🛡️  Kill Switch Monitor [${mode}]:`);
    console.log(`   24h Loss: ${pl24h.lossPercent.toFixed(2)}% ($${Math.abs(pl24h.totalPL).toFixed(2)})`);
    console.log(`   Warning Threshold: ${warningThreshold.toFixed(2)}%`);
    console.log(`   Kill Switch Threshold: ${killSwitchThreshold.toFixed(2)}%`);
    
    // Check kill switch threshold
    if (pl24h.lossPercent >= killSwitchThreshold) {
      console.log(`   🚨 KILL SWITCH TRIGGERED!`);
      
      // Close all open trades
      const closedTrades = await this.closeAllTrades(mode);
      
      // Log kill switch event
      await storage.createKillSwitchEvent({
        userId: 'system',
        eventType: 'kill_switch',
        portfolioValueBefore: pl24h.portfolioValueBefore.toString(),
        portfolioValueAfter: pl24h.portfolioValueCurrent.toString(),
        lossAmount: Math.abs(pl24h.totalPL).toString(),
        lossPercent: pl24h.lossPercent.toString(),
        killSwitchThreshold: killSwitchThreshold.toString(),
        tradesClosed: JSON.stringify(closedTrades)
      });
      
      // REB 8.8.3-KS-B: Use guardrailPolicy.tripKillSwitch() to stop trading
      // This sets killSwitchTripped=true AND stops trading (isEngineActive=false)
      const { guardrailPolicy } = await import('./guardrail-policy.js');
      await guardrailPolicy.tripKillSwitch(
        mode, 
        `DAILY_LOSS_THRESHOLD_EXCEEDED: ${pl24h.lossPercent.toFixed(2)}% >= ${killSwitchThreshold}%`,
        pl24h.lossPercent,
        killSwitchThreshold
      );
      
      return {
        triggered: true,
        eventType: 'kill_switch',
        message: `🚨 Kill Switch Triggered: Portfolio down ${pl24h.lossPercent.toFixed(2)}% in last 24h. All trades closed. Trading stopped.`
      };
    }
    
    // Check warning threshold
    if (pl24h.lossPercent >= warningThreshold) {
      console.log(`   ⚠️  WARNING triggered!`);
      
      // Log warning event
      await storage.createKillSwitchEvent({
        userId: 'system',
        eventType: 'warning',
        portfolioValueBefore: pl24h.portfolioValueBefore.toString(),
        portfolioValueAfter: pl24h.portfolioValueCurrent.toString(),
        lossAmount: Math.abs(pl24h.totalPL).toString(),
        lossPercent: pl24h.lossPercent.toString(),
        killSwitchThreshold: killSwitchThreshold.toString(),
        tradesClosed: JSON.stringify([])
      });
      
      return {
        triggered: true,
        eventType: 'warning',
        message: `⚠️ Portfolio down ${pl24h.lossPercent.toFixed(2)}% in last 24h. Approaching Kill Switch limit of ${killSwitchThreshold}%.`
      };
    }
    
    return { triggered: false, eventType: 'none', message: '' };
  }

  /**
   * REB 8.8.3-KS-B: Close all open trades (called when kill switch triggers)
   * Phase 27.F.13.A: Mode-aware - closes positions from correct table
   */
  private async closeAllTrades(mode: 'live' | 'paper'): Promise<any[]> {
    const closedTrades = [];
    
    if (mode === 'paper') {
      // Close paper positions
      const paperPositions = await storage.getPaperSimOpenPositions(mode);
      console.log(`   Closing ${paperPositions.length} open paper positions...`);
      
      for (const position of paperPositions) {
        try {
          // Get current market price (simplified - would need real-time price)
          const exitPrice = parseFloat(position.currentPrice || position.avgPrice) * 0.99; // Simulate 1% loss
          
          // For paper mode, we'd need to call paper trading close logic
          // For now, just delete the position (simplified)
          await storage.deletePaperSimOpenPosition(mode, position.id);
          
          closedTrades.push({
            symbol: position.symbol,
            strategy: position.strategyName,
            entryPrice: position.avgPrice,
            exitPrice: exitPrice.toString(),
            pnl: '-' // Would need to calculate
          });
          
          console.log(`   ✓ Closed paper position ${position.symbol}`);
        } catch (error) {
          console.error(`   ✗ Failed to close ${position.symbol}:`, error);
        }
      }
    } else {
      // Close live trades
      const activeTrades = await storage.getActiveTrades(mode);
      console.log(`   Closing ${activeTrades.length} open live trades...`);
      
      for (const trade of activeTrades) {
        try {
          // Get current market price (simplified - would need real-time price)
          const exitPrice = parseFloat(trade.entryPrice) * 0.99; // Simulate 1% loss
          
          // Close the trade
          const closed = await storage.closeTrade(trade.id, exitPrice, 0, 0);
          closedTrades.push({
            symbol: trade.symbol,
            strategy: trade.strategy,
            entryPrice: trade.entryPrice,
            exitPrice: exitPrice.toString(),
            pnl: closed.realizedPL
          });
          
          console.log(`   ✓ Closed ${trade.symbol}: ${closed.realizedPL}`);
        } catch (error) {
          console.error(`   ✗ Failed to close ${trade.symbol}:`, error);
        }
      }
    }
    
    return closedTrades;
  }

  /**
   * Calculate earnings for different time periods
   * Excludes paper trades and only includes realized P/L from live trades
   */
  async getEarnings(mode: 'live' | 'paper'): Promise<{
    today: number;
    yesterday: number;
    thisWeek: number;
    thisMonth: number;
    thisYear: number;
    lifetime: number;
  }> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
    const yesterdayEnd = todayStart;
    
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    const closedTrades = await storage.getTrades(mode, { status: 'closed' });
    
    const liveTrades = closedTrades.filter(trade => trade.exitTime && trade.realizedPL);

    const safeParseFloat = (value: string | null | undefined): number => {
      if (!value) return 0;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    const today = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= todayStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const yesterday = liveTrades
      .filter(trade => {
        const exitDate = new Date(trade.exitTime!);
        return exitDate >= yesterdayStart && exitDate < yesterdayEnd;
      })
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const thisWeek = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= weekStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const thisMonth = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= monthStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const thisYear = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= yearStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const lifetime = liveTrades
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    return {
      today,
      yesterday,
      thisWeek,
      thisMonth,
      thisYear,
      lifetime
    };
  }

  /**
   * Get daily earnings data for chart
   * Returns one data point per day showing total earnings for that day
   */
  async getEarningsChartData(mode: 'live' | 'paper', days = 30): Promise<Array<{
    date: string;
    earnings: number;
    timestamp: number;
  }>> {
    const closedTrades = await storage.getTrades(mode, { status: 'closed' });
    const liveTrades = closedTrades.filter(trade => trade.exitTime);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    const dailyEarnings = new Map<string, number>();

    liveTrades.forEach(trade => {
      if (!trade.exitTime) return;
      
      const exitDate = new Date(trade.exitTime);
      if (exitDate < startDate) return;

      const dateKey = exitDate.toISOString().split('T')[0];
      const earnings = parseFloat(trade.realizedPL || '0');
      
      dailyEarnings.set(dateKey, (dailyEarnings.get(dateKey) || 0) + earnings);
    });

    const chartData: Array<{ date: string; earnings: number; timestamp: number }> = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      
      chartData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        earnings: dailyEarnings.get(dateKey) || 0,
        timestamp: date.getTime()
      });
    }

    return chartData;
  }

  /**
   * Phase 27.F.15.B.3: Mode-based cash vs crypto allocation (no userId)
   */
  async getCashVsCrypto(mode: 'live' | 'paper'): Promise<{
    cash: number;
    crypto: number;
    cashPercent: number;
    cryptoPercent: number;
  }> {
    const activePositions = await this.getActivePositions(mode);
    const metrics = await this.getPortfolioMetrics(mode);
    
    const cryptoValue = activePositions.reduce((sum, position) => {
      return sum + (parseFloat(position.entryPrice) * parseFloat(position.quantity));
    }, 0);
    
    const totalValue = metrics.totalValue || 50000;
    const cash = totalValue - cryptoValue;
    
    const cashPercent = (cash / totalValue) * 100;
    const cryptoPercent = (cryptoValue / totalValue) * 100;

    return {
      cash,
      crypto: cryptoValue,
      cashPercent,
      cryptoPercent
    };
  }
}
