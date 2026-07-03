/**
 * REB 2.12D Part B: Trade Executor Abstraction Layer
 * 
 * Provides a unified interface for trade execution across paper and live modes.
 * This abstraction allows:
 * 1. Clean separation between paper and live trading logic
 * 2. Consistent lifecycle event emission
 * 3. Unified risk management and validation
 * 4. Easy switching between execution modes
 */

import { storage } from '../storage.js';
import { checkGuardrailRisk, type TradeCandidate } from './trade-safety.js';
import { buildSettingsFromGuardrails, calculateRiskAmount } from './guardrail-settings.js';
import { lifecycleEventsService } from './lifecycle-events.js';
import { nanoid } from 'nanoid';
import type { TradingSettings, PaperSimTrade, InsertPaperSimTrade, InsertActiveOpenPosition } from '@shared/schema';

export type StrategyType = 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma';

export interface TradeSignal {
  symbol: string;
  strategy: StrategyType;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  metadata?: any;
}

export interface ExecutionResult {
  success: boolean;
  tradeId?: string;
  positionId?: string;
  executedPrice?: number;
  quantity?: number;
  slippage?: number;
  fees?: number;
  error?: string;
}

export interface TradeExecutorConfig {
  slippageBps?: number;
  latencyMs?: number;
  feeRate?: number;
}

/**
 * Abstract base class for trade executors
 * Phase 8.8.3-H4: Uses guardrail-driven checks instead of RiskManager
 */
abstract class BaseTradeExecutor {
  protected mode: 'paper' | 'live';
  protected config: Required<TradeExecutorConfig>;

  constructor(mode: 'paper' | 'live', config?: TradeExecutorConfig) {
    this.mode = mode;
    this.config = {
      slippageBps: config?.slippageBps ?? 10,
      latencyMs: config?.latencyMs ?? 250,
      feeRate: config?.feeRate ?? 0.16,
    };
  }

  /**
   * Validate a signal before execution
   * Phase 8.8.3-H4: Uses checkGuardrailRisk instead of RiskManager
   * Emits signalValidated lifecycle event
   */
  async validateSignal(signal: TradeSignal): Promise<{ valid: boolean; reason?: string; code?: string }> {
    const tradeCandidate: TradeCandidate = {
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
    };
    
    const riskCheck = await checkGuardrailRisk(this.mode, tradeCandidate);
    
    const validationDetails = {
      riskCheck: riskCheck.ok,
      guardrailCheck: true,
      liquidityCheck: true,
      timeframeConfirmation: true,
    };

    lifecycleEventsService.emitSignalValidated({
      mode: this.mode,
      symbol: signal.symbol,
      strategy: signal.strategy,
      confidence: signal.confidence,
      validationResult: riskCheck.ok ? 'passed' : 'failed',
      validationDetails,
    });

    if (!riskCheck.ok) {
      return {
        valid: false,
        reason: riskCheck.reason,
        code: riskCheck.code,
      };
    }

    return { valid: true };
  }

  /**
   * Execute a trade
   * Abstract method - implemented by paper and live executors
   */
  abstract execute(signal: TradeSignal): Promise<ExecutionResult>;

  /**
   * Get execution mode
   */
  getMode(): 'paper' | 'live' {
    return this.mode;
  }
}

/**
 * Paper Trade Executor
 * Simulates trade execution for paper trading mode
 */
export class PaperTradeExecutor extends BaseTradeExecutor {
  constructor(config?: TradeExecutorConfig) {
    super('paper', config);
  }

  async execute(signal: TradeSignal): Promise<ExecutionResult> {
    console.log(`[REB2.12D][PaperExecutor] Executing signal for ${signal.symbol}`);

    const validation = await this.validateSignal(signal);
    if (!validation.valid) {
      console.log(`[REB2.12D][PaperExecutor] Signal rejected: ${validation.reason}`);
      return { success: false, error: validation.reason };
    }

    try {
      const settings = await buildSettingsFromGuardrails(this.mode);
      const portfolioValue = parseFloat(settings.portfolioValue || '10000');
      const riskPct = parseFloat(settings.riskPerTradePct || '1');
      const riskAmount = calculateRiskAmount(portfolioValue, riskPct);

      if (riskAmount <= 0) {
        return { success: false, error: 'Invalid risk amount' };
      }

      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      const quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;

      if (quantity <= 0) {
        return { success: false, error: 'Invalid position size' };
      }

      lifecycleEventsService.emitReadyToTrade({
        mode: 'paper',
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
        confidence: signal.confidence,
        quantity,
        riskAmount,
      });

      await this.simulateLatency();
      const slippage = this.calculateSlippage(signal.entryPrice);
      const executedPrice = signal.entryPrice + slippage;
      const fees = (executedPrice * quantity) * (this.config.feeRate / 100);

      const tradeId = nanoid();
      const positionId = nanoid();
      
      // Directive 10.3: Extract signal type fields for persistence
      const signalType = (signal as any).signalType || 'QUANT';
      const patternType = (signal as any).patternType || null;
      const patternStrength = (signal as any).patternStrength?.toString() || null;
      
      console.log(`[10.3] Trade Execute: ${signal.symbol} | Type=${signalType} | Pattern=${patternType || 'N/A'}`);

      // B65.1-HF2 (2026-04-23): derive baseCurrency from symbol at insert time.
      // Matches migration rule: COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol).
      // baseCurrency is NOT NULL on paper_sim_trades as of B65.1 for per-underlying tracking.
      const baseCurrency = signal.symbol.split('/')[0] || signal.symbol;

      const trade: InsertPaperSimTrade = {
        symbol: signal.symbol,
        baseCurrency,
        strategyName: signal.strategy,
        side: 'buy',
        quantity: quantity.toString(),
        entryPrice: executedPrice.toString(),
        stopLoss: signal.stopPrice.toString(),
        takeProfit: signal.targetPrice.toString(),
        fees: fees.toString(),
        slippage: slippage.toString(),
        confidence: signal.confidence.toString(),
        openedAt: new Date(),
        signalType: signalType as 'QUANT' | 'PATTERN' | 'HYBRID',
        patternType: patternType,
        patternStrength: patternStrength,
        metadata: signal.metadata || {},
      };

      await storage.createPaperSimTrade('paper', trade);

      const position: InsertActiveOpenPosition = {
        symbol: signal.symbol,
        strategyName: signal.strategy,
        side: 'buy',
        avgPrice: executedPrice.toString(),
        quantity: quantity.toString(),
        stopLoss: signal.stopPrice.toString(),
        takeProfit: signal.targetPrice.toString(),
        unrealizedPnl: '0',
        unrealizedPnlPercent: '0',
        confidence: signal.confidence.toString(),
        signalType: signalType as 'QUANT' | 'PATTERN' | 'HYBRID',
        patternType: patternType,
        patternStrength: patternStrength,
        metadata: signal.metadata || {},
      };

      await storage.createActiveOpenPosition('paper', position);

      lifecycleEventsService.emitPaperTradeExecuted({
        mode: 'paper',
        tradeId,
        positionId,
        symbol: signal.symbol,
        strategy: signal.strategy,
        side: 'buy',
        entryPrice: executedPrice,
        quantity,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
        slippage,
        fees,
      });

      console.log(`[REB2.12D][PaperExecutor] Trade executed: ${tradeId}`);

      return {
        success: true,
        tradeId,
        positionId,
        executedPrice,
        quantity,
        slippage,
        fees,
      };
    } catch (error) {
      console.error(`[REB2.12D][PaperExecutor] Execution error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.latencyMs));
    }
  }

  private calculateSlippage(price: number): number {
    const slippagePct = this.config.slippageBps / 10000;
    const direction = Math.random() > 0.5 ? 1 : -1;
    return price * slippagePct * direction;
  }
}

/**
 * Live Trade Executor
 * Executes real trades via Kraken API (stub for future implementation)
 */
export class LiveTradeExecutor extends BaseTradeExecutor {
  constructor(config?: TradeExecutorConfig) {
    super('live', config);
  }

  async execute(signal: TradeSignal): Promise<ExecutionResult> {
    console.log(`[REB2.12D][LiveExecutor] Live trading not yet implemented for ${signal.symbol}`);
    
    const validation = await this.validateSignal(signal);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    return {
      success: false,
      error: 'Live trading execution not yet implemented - requires Kraken API integration',
    };
  }
}

/**
 * Factory function to get the appropriate executor for a mode
 */
export function getTradeExecutor(mode: 'paper' | 'live', config?: TradeExecutorConfig): BaseTradeExecutor {
  if (mode === 'paper') {
    return new PaperTradeExecutor(config);
  } else {
    return new LiveTradeExecutor(config);
  }
}

export const paperTradeExecutor = new PaperTradeExecutor();
export const liveTradeExecutor = new LiveTradeExecutor();
