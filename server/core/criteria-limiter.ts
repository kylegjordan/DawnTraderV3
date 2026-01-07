/**
 * Directive 11.0 — Trade Criteria Limiter (TCL)
 * 
 * Pure eligibility gating component. This module ONLY evaluates whether
 * a trade signal meets global criteria before promotion.
 * 
 * RESPONSIBILITIES (ALLOWED):
 * - Exposure limit checks
 * - Open position cap checks
 * - Market regime evaluation
 * - Portfolio correlation checks
 * - Instrument eligibility verification
 * - Cooldown period enforcement
 * 
 * NOT ALLOWED (delegated to TEC):
 * - Position sizing
 * - Exit trigger calculation
 * - Volatility-based weighting
 * - ATR or liquidity adjustments
 */

import type {
  TradeSignal,
  TradeMode,
  EligibilityResult,
  EligibilityRejectionCode,
  TradeCriteriaLimiter
} from './interfaces/trade-flow.js';
import { storage } from '../storage.js';

export interface TCLConfig {
  maxOpenPositions: number;
  maxTotalExposurePct: number;
  maxCorrelationThreshold: number;
  minConfidenceThreshold: number;
  cooldownPeriodMs: number;
}

const DEFAULT_CONFIG: TCLConfig = {
  maxOpenPositions: 10,
  maxTotalExposurePct: 100,
  maxCorrelationThreshold: 0.75,
  minConfidenceThreshold: 0.50,
  cooldownPeriodMs: 60000
};

export class CriteriaLimiter implements TradeCriteriaLimiter {
  private config: TCLConfig;
  private cooldownMap: Map<string, number> = new Map();

  constructor(config: Partial<TCLConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async evaluate(signal: TradeSignal, mode: TradeMode): Promise<EligibilityResult> {
    const checksPerformed: string[] = [];
    const timestamp = new Date().toISOString();

    const checks: Array<{
      name: string;
      check: () => Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }>;
    }> = [
      { name: 'kill_switch', check: () => this.checkKillSwitch(mode) },
      { name: 'position_limit', check: () => this.checkOpenPositionLimit(mode) },
      { name: 'exposure_limit', check: () => this.checkExposureLimit(mode) },
      { name: 'correlation', check: () => this.checkCorrelationExposure(signal.symbol, mode) },
      { name: 'confidence', check: () => this.checkConfidence(signal.confidence) },
      { name: 'cooldown', check: () => this.checkCooldown(signal.symbol) },
      { name: 'instrument', check: () => this.checkInstrumentEligibility(signal.symbol) }
    ];

    for (const { name, check } of checks) {
      checksPerformed.push(name);
      const result = await check();
      
      if (!result.passed) {
        console.log(`[TCL][REJECT] ${signal.symbol} failed ${name}: ${result.reason}`);
        return {
          passed: false,
          rejectionCode: result.code,
          reason: result.reason,
          checksPerformed,
          timestamp
        };
      }
    }

    console.log(`[TCL][PASS] ${signal.symbol} passed all ${checksPerformed.length} eligibility checks`);
    return {
      passed: true,
      checksPerformed,
      timestamp
    };
  }

  private async checkKillSwitch(mode: TradeMode): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    try {
      const guardrails = await storage.getGuardrailsV2({ mode });
      if (guardrails?.killSwitchTripped) {
        return {
          passed: false,
          code: 'KILL_SWITCH',
          reason: 'Kill switch is active - trading halted'
        };
      }
    } catch (err) {
      console.warn('[TCL] Error checking kill switch, allowing trade:', err);
    }
    return { passed: true };
  }

  private async checkOpenPositionLimit(mode: TradeMode): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    try {
      const positions = mode === 'paper' 
        ? await storage.getPaperSimOpenPositions(mode)
        : await storage.getActiveTrades(mode);
      
      const guardrails = await storage.getGuardrailsV2({ mode });
      const maxPositions = guardrails?.maxOpenPositions ?? this.config.maxOpenPositions;

      if (positions.length >= maxPositions) {
        return {
          passed: false,
          code: 'MAX_OPEN_POSITIONS',
          reason: `Max open positions reached (${positions.length}/${maxPositions})`
        };
      }
    } catch (err) {
      console.warn('[TCL] Error checking position limit:', err);
    }
    return { passed: true };
  }

  private async checkExposureLimit(mode: TradeMode): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    try {
      const guardrails = await storage.getGuardrailsV2({ mode });
      const maxExposurePct = parseFloat(String(guardrails?.maxTotalExposurePct ?? this.config.maxTotalExposurePct));

      const portfolioState = await storage.getPortfolioState({ mode });
      if (!portfolioState) return { passed: true };

      const balance = parseFloat(String(portfolioState.balance || 0));
      
      if (balance <= 0) return { passed: true };

      const positions = mode === 'paper' 
        ? await storage.getPaperSimOpenPositions(mode)
        : await storage.getActiveTrades(mode);
      
      const exposedValue = positions.reduce((sum, p) => {
        const qty = parseFloat(String((p as any).quantity || 0));
        const price = parseFloat(String((p as any).avgPrice || (p as any).entryPrice || 0));
        return sum + (qty * price);
      }, 0);
      
      const totalValue = balance + exposedValue;
      const currentExposurePct = totalValue > 0 ? (exposedValue / totalValue) * 100 : 0;

      if (currentExposurePct >= maxExposurePct) {
        return {
          passed: false,
          code: 'MAX_TOTAL_EXPOSURE',
          reason: `Max exposure reached (${currentExposurePct.toFixed(1)}% >= ${maxExposurePct}%)`
        };
      }
    } catch (err) {
      console.warn('[TCL] Error checking exposure limit:', err);
    }
    return { passed: true };
  }

  private async checkCorrelationExposure(symbol: string, mode: TradeMode): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    try {
      const { isCorrelatedExposure } = await import('../services/risk-concentration.js');
      
      if (isCorrelatedExposure(symbol)) {
        return {
          passed: false,
          code: 'CORRELATION_EXPOSURE',
          reason: `High correlation with existing positions detected for ${symbol}`
        };
      }
    } catch (err) {
      console.warn('[TCL] Error checking correlation:', err);
    }
    return { passed: true };
  }

  private async checkConfidence(confidence: number): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    if (confidence < this.config.minConfidenceThreshold) {
      return {
        passed: false,
        code: 'INSUFFICIENT_CONFIDENCE',
        reason: `Confidence ${(confidence * 100).toFixed(1)}% below threshold ${(this.config.minConfidenceThreshold * 100).toFixed(1)}%`
      };
    }
    return { passed: true };
  }

  private async checkCooldown(symbol: string): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    const lastTradeTime = this.cooldownMap.get(symbol);
    if (lastTradeTime) {
      const elapsed = Date.now() - lastTradeTime;
      if (elapsed < this.config.cooldownPeriodMs) {
        const remainingMs = this.config.cooldownPeriodMs - elapsed;
        return {
          passed: false,
          code: 'COOLDOWN_ACTIVE',
          reason: `Cooldown active for ${symbol} (${Math.ceil(remainingMs / 1000)}s remaining)`
        };
      }
    }
    return { passed: true };
  }

  private async checkInstrumentEligibility(symbol: string): Promise<{ passed: boolean; code?: EligibilityRejectionCode; reason?: string }> {
    const blockedPatterns = ['USDT/USD', 'USDC/USD', 'DAI/USD', 'TUSD/USD'];
    if (blockedPatterns.some(pattern => symbol.includes(pattern.replace('/USD', '')))) {
      return {
        passed: false,
        code: 'INSTRUMENT_BLOCKED',
        reason: `Stablecoin pairs are not eligible for trading: ${symbol}`
      };
    }
    return { passed: true };
  }

  recordTrade(symbol: string): void {
    this.cooldownMap.set(symbol, Date.now());
  }

  clearCooldown(symbol: string): void {
    this.cooldownMap.delete(symbol);
  }

  updateConfig(newConfig: Partial<TCLConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): TCLConfig {
    return { ...this.config };
  }
}

export const criteriaLimiter = new CriteriaLimiter();
