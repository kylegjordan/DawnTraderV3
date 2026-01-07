/**
 * Directive 11.0 — Trade Control Operator (TCO)
 * 
 * The promoter layer that transitions eligible trade intents to the TEC.
 * 
 * RESPONSIBILITIES:
 * - Receive trade signals from Signal Orchestrator
 * - Delegate eligibility check to TCL
 * - Forward approved intents to TEC for execution
 * - Maintain promotion audit trail
 * 
 * NOT ALLOWED:
 * - Modifying trade size
 * - Altering exit criteria
 * - Injecting risk parameters
 * - Any execution logic
 * 
 * The TCO is a pure pass-through promoter. It ONLY decides
 * "should this trade be promoted?" and hands off to TEC.
 */

import type {
  TradeSignal,
  TradeMode,
  ExecutionIntent,
  TradeControlOperator,
  EligibilityResult
} from '../interfaces/trade-flow.js';
import { criteriaLimiter } from '../criteria-limiter.js';

async function getExecutionController() {
  const { executionController } = await import('../../services/execution-controller.js');
  return executionController;
}

export interface PromotionAuditEntry {
  signalId: string;
  symbol: string;
  mode: TradeMode;
  timestamp: string;
  eligibilityResult: EligibilityResult;
  promoted: boolean;
  promotedAt?: string;
}

export class TradeControlOperatorImpl implements TradeControlOperator {
  private promotionHistory: PromotionAuditEntry[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  async promote(signal: TradeSignal, mode: TradeMode): Promise<boolean> {
    const startTime = Date.now();
    console.log(`[TCO] Evaluating signal ${signal.signalId} for ${signal.symbol}`);

    const eligibilityResult = await criteriaLimiter.evaluate(signal, mode);

    const auditEntry: PromotionAuditEntry = {
      signalId: signal.signalId,
      symbol: signal.symbol,
      mode,
      timestamp: new Date().toISOString(),
      eligibilityResult,
      promoted: false
    };

    if (!eligibilityResult.passed) {
      console.log(`[TCO][BLOCKED] ${signal.symbol} - ${eligibilityResult.reason}`);
      this.recordAudit(auditEntry);
      return false;
    }

    const intent = this.createExecutionIntent(signal, mode);

    try {
      const tec = await getExecutionController();
      await tec.enqueueExecution(intent);
      
      auditEntry.promoted = true;
      auditEntry.promotedAt = new Date().toISOString();
      
      criteriaLimiter.recordTrade(signal.symbol);

      const durationMs = Date.now() - startTime;
      console.log(`[TCO][PROMOTED] ${signal.symbol} → TEC (${durationMs}ms)`);
      
      this.recordAudit(auditEntry);
      return true;
    } catch (err) {
      console.error(`[TCO][ERROR] Failed to promote ${signal.symbol}:`, err);
      this.recordAudit(auditEntry);
      return false;
    }
  }

  private createExecutionIntent(signal: TradeSignal, mode: TradeMode): ExecutionIntent {
    return {
      signalId: signal.signalId,
      instrument: signal.symbol,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      strategy: signal.strategy,
      confidence: signal.confidence,
      timestamp: signal.timestamp,
      mode
    };
  }

  private recordAudit(entry: PromotionAuditEntry): void {
    this.promotionHistory.unshift(entry);
    if (this.promotionHistory.length > this.MAX_HISTORY_SIZE) {
      this.promotionHistory = this.promotionHistory.slice(0, this.MAX_HISTORY_SIZE);
    }
  }

  getPromotionHistory(limit: number = 100): PromotionAuditEntry[] {
    return this.promotionHistory.slice(0, limit);
  }

  getPromotionStats(mode?: TradeMode): {
    total: number;
    promoted: number;
    blocked: number;
    promotionRate: number;
    rejectionsByCode: Record<string, number>;
  } {
    const filtered = mode 
      ? this.promotionHistory.filter(e => e.mode === mode)
      : this.promotionHistory;

    const promoted = filtered.filter(e => e.promoted).length;
    const blocked = filtered.filter(e => !e.promoted).length;
    
    const rejectionsByCode: Record<string, number> = {};
    filtered
      .filter(e => !e.promoted && e.eligibilityResult.rejectionCode)
      .forEach(e => {
        const code = e.eligibilityResult.rejectionCode!;
        rejectionsByCode[code] = (rejectionsByCode[code] || 0) + 1;
      });

    return {
      total: filtered.length,
      promoted,
      blocked,
      promotionRate: filtered.length > 0 ? promoted / filtered.length : 0,
      rejectionsByCode
    };
  }

  clearHistory(): void {
    this.promotionHistory = [];
  }
}

export const tradeControlOperator = new TradeControlOperatorImpl();
