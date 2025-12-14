/**
 * Phase 8.8.4-B/C: Ready-to-Buy (RTB) Queue Service
 * 
 * Manages the queue of high-quality signals that pass quality guardrails
 * but are blocked by capacity constraints (MAX_TRADES, MAX_TOTAL_EXPOSURE, etc.)
 * 
 * Key Features:
 * 1. Accepts signals blocked by CAPACITY guardrails (not QUALITY guardrails)
 * 2. Ranks signals by CWQI (Confidence-Weighted Quality Index)
 * 3. Enforces uniqueness by symbol + strategy pair
 * 4. Removes stale/expired signals (TTL: 3 minutes)
 * 5. Promotes highest-CWQI signals when capacity frees up
 * 
 * Phase C Enhancements:
 * 6. CWQI Durability Decay: CWQI_decayed = CWQI_orig × e^(-λt), λ = 0.03 per minute
 *    Prioritizes fresher signals by applying time-based decay to ranking
 */

import { storage } from '../../storage';
import { 
  calculateCWQIFromSignal, 
  MIN_QUEUE_CWQI, 
  MIN_QUEUE_CONFIDENCE,
  type CWQIResult 
} from '../metrics/quality_index';
import { isCapacityBlock, type TradingMode, type CapacityGuardrailCode } from '../../services/guardrail-policy';
import { signalLifecycleAudit } from '../audit/signal_lifecycle_audit';
import type { RtbSignal, InsertRtbSignal } from '@shared/schema';

export interface RTBSignalInput {
  signalId: string;
  mode: TradingMode;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  quantity?: number;
  notional?: number;
  confidence: number;
  atr?: number;
  blockReason: string; // The capacity guardrail that blocked this signal
  metadata?: Record<string, unknown>;
}

export interface RTBQueueStats {
  mode: TradingMode;
  totalQueued: number;
  avgCWQI: number;
  oldestSignalAge: number; // seconds
  byStrategy: Record<string, number>;
  byBlockReason: Record<string, number>;
}

export interface RTBPromotionResult {
  success: boolean;
  signal?: RtbSignal;
  tradeId?: string;
  reason?: string;
}

const SIGNAL_TTL_MS = 3 * 60 * 1000; // 3 minutes

const CWQI_DECAY_LAMBDA = 0.03;

/**
 * Phase C: Calculate decayed CWQI based on signal age
 * CWQI_decayed = CWQI_orig × e^(-λt), λ = 0.03 per minute
 * 
 * @param originalCWQI - The original CWQI value
 * @param queuedAt - Timestamp when signal was queued
 * @returns Decayed CWQI value
 */
export function calculateDecayedCWQI(originalCWQI: number, queuedAt: Date | string): number {
  const ageMs = Date.now() - new Date(queuedAt).getTime();
  const ageMinutes = ageMs / (60 * 1000);
  
  const decayFactor = Math.exp(-CWQI_DECAY_LAMBDA * ageMinutes);
  const decayedCWQI = originalCWQI * decayFactor;
  
  return Math.round(decayedCWQI * 10000) / 10000;
}

/**
 * Phase C: Get CWQI decay factor for a given age
 */
export function getCWQIDecayFactor(ageMinutes: number): number {
  return Math.exp(-CWQI_DECAY_LAMBDA * ageMinutes);
}

class ReadyToBuyService {
  private initialized = false;
  
  constructor() {
    console.log('[RTB] Ready-to-Buy Queue Service initialized');
  }

  /**
   * Queue a signal that was blocked by a capacity constraint
   * 
   * @param input - Signal data to queue
   * @returns The queued signal record or null if rejected
   */
  async queueSignal(input: RTBSignalInput): Promise<RtbSignal | null> {
    // Validate this is a capacity block (not quality block)
    if (!isCapacityBlock(input.blockReason)) {
      console.log(`[RTB] Rejecting signal ${input.symbol}/${input.strategy} - ${input.blockReason} is a QUALITY block, not CAPACITY`);
      return null;
    }

    // Check minimum confidence threshold
    if (input.confidence < MIN_QUEUE_CONFIDENCE) {
      console.log(`[RTB] Rejecting signal ${input.symbol}/${input.strategy} - confidence ${input.confidence.toFixed(2)} below threshold ${MIN_QUEUE_CONFIDENCE}`);
      return null;
    }

    // Calculate CWQI
    const cwqiResult = calculateCWQIFromSignal({
      confidence: input.confidence,
      entryPrice: input.entryPrice,
      stopPrice: input.stopPrice,
      targetPrice: input.targetPrice,
      atr: input.atr,
    });

    // Check minimum CWQI threshold
    if (cwqiResult.cwqi < MIN_QUEUE_CWQI) {
      console.log(`[RTB] Rejecting signal ${input.symbol}/${input.strategy} - CWQI ${cwqiResult.cwqi.toFixed(4)} below threshold ${MIN_QUEUE_CWQI}`);
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SIGNAL_TTL_MS);

    // Check for existing queued signal with same symbol+strategy
    const existingSignal = await this.getQueuedSignal(input.mode, input.symbol, input.strategy);
    
    if (existingSignal) {
      // If existing signal has higher CWQI, keep it
      const existingCWQI = parseFloat(existingSignal.cwqi);
      if (existingCWQI >= cwqiResult.cwqi) {
        console.log(`[RTB] Keeping existing signal ${input.symbol}/${input.strategy} with CWQI ${existingCWQI.toFixed(4)} >= new ${cwqiResult.cwqi.toFixed(4)}`);
        return existingSignal;
      }
      
      // New signal is better - expire the old one
      await this.expireSignal(existingSignal.id, 'Replaced by higher-CWQI signal');
    }

    // Insert new signal
    const insertData: InsertRtbSignal = {
      mode: input.mode,
      signalId: input.signalId,
      symbol: input.symbol,
      strategy: input.strategy as any,
      entryPrice: input.entryPrice.toString(),
      stopPrice: input.stopPrice.toString(),
      targetPrice: input.targetPrice?.toString(),
      quantity: input.quantity?.toString(),
      notional: input.notional?.toString(),
      confidence: cwqiResult.components.confidence.toString(),
      riskScore: cwqiResult.components.riskScore.toString(),
      expectedReturn: cwqiResult.components.expectedReturn.toString(),
      cwqi: cwqiResult.cwqi.toString(),
      status: 'queued',
      queuedAt: now,
      expiresAt,
      blockReason: input.blockReason,
      metadata: input.metadata as any,
    };

    const signal = await storage.insertRtbSignal(insertData);

    // Record SLAL QUEUED event
    signalLifecycleAudit.recordQueued(
      input.signalId,
      input.mode,
      input.symbol,
      input.strategy,
      {
        cwqi: cwqiResult.cwqi,
        blockReason: input.blockReason,
        expiresAt: expiresAt.toISOString(),
      }
    );

    console.log(`[RTB] Queued signal ${input.symbol}/${input.strategy} with CWQI ${cwqiResult.cwqi.toFixed(4)}, expires at ${expiresAt.toISOString()}`);
    
    return signal;
  }

  /**
   * Get the highest-CWQI queued signal for a mode
   * Phase C: Uses decayed CWQI for ranking to prioritize fresher signals
   */
  async getTopSignal(mode: TradingMode): Promise<RtbSignal | null> {
    const signals = await storage.getRtbSignals({
      mode,
      status: 'queued',
    });
    
    if (signals.length === 0) {
      return null;
    }
    
    let bestSignal: RtbSignal | null = null;
    let bestDecayedCWQI = -1;
    
    for (const signal of signals) {
      const originalCWQI = parseFloat(signal.cwqi);
      const decayedCWQI = calculateDecayedCWQI(originalCWQI, signal.queuedAt);
      
      if (decayedCWQI > bestDecayedCWQI) {
        bestDecayedCWQI = decayedCWQI;
        bestSignal = signal;
      }
    }
    
    if (bestSignal) {
      const ageMinutes = (Date.now() - new Date(bestSignal.queuedAt).getTime()) / (60 * 1000);
      console.log(
        `[C][CWQI_DECAY] Top signal ${bestSignal.symbol}/${bestSignal.strategy}: ` +
        `originalCWQI=${parseFloat(bestSignal.cwqi).toFixed(4)}, ` +
        `decayedCWQI=${bestDecayedCWQI.toFixed(4)}, ` +
        `age=${ageMinutes.toFixed(1)}min`
      );
    }
    
    return bestSignal;
  }

  /**
   * Get a specific queued signal by symbol+strategy
   */
  async getQueuedSignal(mode: TradingMode, symbol: string, strategy: string): Promise<RtbSignal | null> {
    const signals = await storage.getRtbSignals({
      mode,
      status: 'queued',
      symbol,
      strategy: strategy as any,
      limit: 1,
    });
    
    return signals[0] || null;
  }

  /**
   * Get all queued signals for a mode
   */
  async getQueuedSignals(mode: TradingMode): Promise<RtbSignal[]> {
    return storage.getRtbSignals({
      mode,
      status: 'queued',
      orderBy: 'cwqi',
      orderDir: 'desc',
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(mode: TradingMode): Promise<RTBQueueStats> {
    const signals = await this.getQueuedSignals(mode);
    
    const byStrategy: Record<string, number> = {};
    const byBlockReason: Record<string, number> = {};
    let totalCWQI = 0;
    let oldestAge = 0;
    const now = Date.now();

    for (const signal of signals) {
      const strategy = signal.strategy;
      byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
      
      const blockReason = signal.blockReason || 'UNKNOWN';
      byBlockReason[blockReason] = (byBlockReason[blockReason] || 0) + 1;
      
      totalCWQI += parseFloat(signal.cwqi);
      
      const age = (now - new Date(signal.queuedAt).getTime()) / 1000;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      mode,
      totalQueued: signals.length,
      avgCWQI: signals.length > 0 ? totalCWQI / signals.length : 0,
      oldestSignalAge: Math.round(oldestAge),
      byStrategy,
      byBlockReason,
    };
  }

  /**
   * Expire a signal (mark as expired)
   */
  async expireSignal(signalId: string, reason?: string): Promise<void> {
    await storage.updateRtbSignal(signalId, {
      status: 'expired',
      expiredAt: new Date(),
    });
    
    console.log(`[RTB] Expired signal ${signalId}: ${reason || 'TTL exceeded'}`);
  }

  /**
   * Promote a signal from queue to execution
   */
  async promoteSignal(signalId: string, tradeId: string): Promise<void> {
    const signal = await storage.getRtbSignalById(signalId);
    
    if (!signal) {
      console.warn(`[RTB] Cannot promote - signal ${signalId} not found`);
      return;
    }

    await storage.updateRtbSignal(signalId, {
      status: 'promoted',
      promotedAt: new Date(),
      promotedTradeId: tradeId,
    });

    // Record SLAL PROMOTED event
    signalLifecycleAudit.recordPromoted(
      signal.signalId,
      signal.mode as TradingMode,
      signal.symbol,
      signal.strategy,
      {
        tradeId,
        cwqi: parseFloat(signal.cwqi),
        queueDurationMs: Date.now() - new Date(signal.queuedAt).getTime(),
      }
    );

    console.log(`[RTB] Promoted signal ${signal.symbol}/${signal.strategy} to trade ${tradeId}`);
  }

  /**
   * Clean up expired signals
   */
  async cleanupExpiredSignals(mode: TradingMode): Promise<number> {
    const now = new Date();
    const signals = await storage.getRtbSignals({
      mode,
      status: 'queued',
    });

    let expiredCount = 0;
    for (const signal of signals) {
      if (new Date(signal.expiresAt) <= now) {
        await this.expireSignal(signal.id, 'TTL exceeded');
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[RTB] Cleaned up ${expiredCount} expired signals for ${mode} mode`);
    }

    return expiredCount;
  }

  /**
   * Re-evaluate all queued signals
   * Removes signals that no longer meet quality thresholds
   */
  async reEvaluateQueue(mode: TradingMode): Promise<{ removed: number; remaining: number }> {
    const signals = await this.getQueuedSignals(mode);
    let removed = 0;

    for (const signal of signals) {
      const confidence = parseFloat(signal.confidence);
      const cwqi = parseFloat(signal.cwqi);
      const age = (Date.now() - new Date(signal.queuedAt).getTime()) / 1000;

      // Check if signal should be removed
      if (confidence < MIN_QUEUE_CONFIDENCE) {
        await this.expireSignal(signal.id, `Confidence ${confidence.toFixed(2)} below threshold`);
        removed++;
      } else if (age > SIGNAL_TTL_MS / 1000) {
        await this.expireSignal(signal.id, 'Signal age exceeded TTL');
        removed++;
      }
    }

    const remaining = signals.length - removed;
    console.log(`[RTB] Re-evaluated queue: ${removed} removed, ${remaining} remaining`);

    return { removed, remaining };
  }

  /**
   * Check if there's capacity for promotion and get the best candidate
   */
  async checkForPromotion(mode: TradingMode): Promise<RtbSignal | null> {
    // Get the top signal
    const topSignal = await this.getTopSignal(mode);
    
    if (!topSignal) {
      return null;
    }

    // Check if signal is still valid (not expired)
    if (new Date(topSignal.expiresAt) <= new Date()) {
      await this.expireSignal(topSignal.id, 'Expired during promotion check');
      return null;
    }

    return topSignal;
  }

  /**
   * Clear all queued signals for a mode (used during engine reset)
   */
  async clearQueue(mode: TradingMode): Promise<number> {
    const signals = await this.getQueuedSignals(mode);
    
    for (const signal of signals) {
      await this.expireSignal(signal.id, 'Queue cleared');
    }

    console.log(`[RTB] Cleared ${signals.length} signals from ${mode} queue`);
    return signals.length;
  }
}

export const readyToBuyService = new ReadyToBuyService();
