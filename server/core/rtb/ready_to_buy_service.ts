/**
 * Phase 8.8.4-B/C/C.5: Ready-to-Buy (RTB) Queue Service
 * 
 * Manages the unified pool of high-quality, SQE-qualified signals.
 * 
 * Key Features:
 * 1. Accepts ALL SQE-qualified signals into unified pool (Phase C.5)
 * 2. Ranks signals by CWQI (Confidence-Weighted Quality Index)
 * 3. Enforces uniqueness by symbol + strategy pair
 * 4. Removes stale/expired signals (TTL: 5 minutes for unified pool)
 * 5. Promotes highest-CWQI signals when TCL is active and capacity available
 * 
 * Phase C Enhancements:
 * 6. CWQI Durability Decay: CWQI_decayed = CWQI_orig × e^(-λt), λ = 0.03 per minute
 *    Prioritizes fresher signals by applying time-based decay to ranking
 * 
 * Phase C.5 Enhancements:
 * 7. TCL Warm-Up: Trading Capacity Limit only activates after ≥100 signals
 * 8. Unified RTB Pool: All SQE-qualified signals flow here regardless of capacity
 * 9. 30-second refresh cycle for continuous re-evaluation
 */

import { storage } from '../../storage';
import { 
  calculateCWQIFromSignal, 
  MIN_QUEUE_CWQI, 
  MIN_QUEUE_CONFIDENCE,
  SQE_THRESHOLDS,
  type CWQIResult 
} from '../metrics/quality_index';
import { evaluateSignalQuality, type SQEInput } from '../filters/signal_quality_evaluator';
import { isCapacityBlock, type TradingMode, type CapacityGuardrailCode } from '../../services/guardrail-policy';
import { signalLifecycleAudit } from '../audit/signal_lifecycle_audit';
import type { RtbSignal, InsertRtbSignal } from '@shared/schema';
import { tclWatchdog } from './tcl_watchdog';
import { eventBus, type PromotionEvent } from '../../lib/event-bus';
import { contextBridge } from '../../services/context-bridge';

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

/**
 * Phase 8.8.4-C.5: SQE-qualified signal input for unified RTB pool
 * All signals that pass SQE go directly into the pool regardless of capacity
 */
export interface SQESignalInput {
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
  ngc: number;
  riskScore: number;
  expectedReturn?: number;
  profitRate: number;
  cwqi: number;
  atr?: number;
  currentPrice?: number; // Directive 8.8.4-C.14.B: Market price at queue time
  volume24h?: number | null; // Directive 8.8.4-C.14.B: 24h USD volume (NULL if not in FX5 pool)
  metadata?: Record<string, unknown>;
  skipSelfCheck?: boolean; // Directive 8.8.4-A3.R2: Skip self-dedupe during refreshAndRank
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

// Directive 8.8.4-A3.R2: Conditional expiry - signals expire after missing ≥4 refreshes
// Each refresh is 30s, so 4 missed refreshes = 2 minutes of inactivity
const MISSED_REFRESH_THRESHOLD = 4;
const RTB_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

// Directive 8.8.4-A3.R2: Fallback TTL for backwards compatibility (used if no refresh tracking)
const SIGNAL_TTL_MS = 10 * 60 * 1000; // 10 minutes (extended fallback)

// Directive 8.8.4-A3.R2: TCL Warm-Up threshold (reduced for faster activation)
const TCL_WARMUP_THRESHOLD = parseInt(process.env.TCL_SIGNAL_THRESHOLD || '15', 10);

// Directive 8.8.4-A3.R2: TCL failsafe (reduced to 2 minutes)
const TCL_FAILSAFE_MS = 2 * 60 * 1000; // 2 minutes

// Directive 8.8.4-A3.R2: CWQI floor to prevent decay cascade
const CWQI_FLOOR = 0.05;

// Directive 8.8.4-A3.R1: CWQI decay rate is configurable via environment variable
// Default: 0.03 per minute (λ = 0.03/min)
const rawDecayRate = parseFloat(process.env.CWQI_DECAY_RATE || '0.03');
const CWQI_DECAY_LAMBDA = isNaN(rawDecayRate) ? 0.03 : rawDecayRate;
console.log(`[8.8.4-A3.R1][CONFIG] CWQI_DECAY_RATE=${CWQI_DECAY_LAMBDA} (per minute)`);

/**
 * Directive 8.8.4-A3.R2: Calculate decayed CWQI with floor clamping
 * CWQI_decayed = max(CWQI_orig × e^(-λt), CWQI_FLOOR)
 * Clamps to CWQI_FLOOR (0.05) to prevent decay cascade driving NGC < thresholds
 * 
 * @param originalCWQI - The original CWQI value
 * @param queuedAt - Timestamp when signal was queued
 * @returns Decayed CWQI value (minimum CWQI_FLOOR)
 */
export function calculateDecayedCWQI(originalCWQI: number, queuedAt: Date | string): number {
  const ageMs = Date.now() - new Date(queuedAt).getTime();
  const ageMinutes = ageMs / (60 * 1000);
  
  const decayFactor = Math.exp(-CWQI_DECAY_LAMBDA * ageMinutes);
  let decayedCWQI = originalCWQI * decayFactor;
  
  // Directive 8.8.4-A3.R2: Clamp to floor to prevent decay cascade
  decayedCWQI = Math.max(decayedCWQI, CWQI_FLOOR);
  
  return Math.round(decayedCWQI * 10000) / 10000;
}

/**
 * Phase C: Get CWQI decay factor for a given age
 */
export function getCWQIDecayFactor(ageMinutes: number): number {
  return Math.exp(-CWQI_DECAY_LAMBDA * ageMinutes);
}

/**
 * Directive 8.8.4-A3.R1: Normalize pair key to uppercase BASE/QUOTE format
 * Ensures consistent comparison and storage of trading pairs
 * 
 * @param symbol - The trading pair (e.g., 'btc/usd', 'BTC/USD')
 * @returns Normalized uppercase pair key (e.g., 'BTC/USD')
 */
export function normalizePairKey(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed.includes('/')) {
    const [base, quote] = trimmed.split('/');
    return `${base.toUpperCase()}/${quote.toUpperCase()}`;
  }
  return trimmed.toUpperCase();
}

class ReadyToBuyService {
  private initialized = false;
  private refreshIntervals: Map<TradingMode, NodeJS.Timeout> = new Map();
  private engineStartTimes: Map<TradingMode, number> = new Map(); // Phase 8.8.4-C.6: Track engine start for TCL failsafe
  private tclFailsafeTriggered: Map<TradingMode, boolean> = new Map(); // Phase 8.8.4-C.6: Track if failsafe was triggered
  private promotionHandlerRegistered = false; // Directive 8.8.4-A1: Track handler registration
  
  constructor() {
    console.log('[RTB] Ready-to-Buy Queue Service initialized');
    this.registerPromotionHandler();
  }

  /**
   * Directive 8.8.4-A1: Register PROMOTION event handler for cleanup
   * When a signal is promoted to active trade, immediately remove it from RTB queue
   * and broadcast rtb:cleared to all clients
   */
  private registerPromotionHandler(): void {
    if (this.promotionHandlerRegistered) {
      return;
    }

    eventBus.onPromotion(async (event: PromotionEvent) => {
      try {
        console.log(`[8.8.4-A1][RTB_CLEANUP] Processing promotion event: ${event.symbol}/${event.strategy} (mode=${event.mode})`);
        
        // Remove the promoted signal from the queue by symbol/mode
        const removed = await this.removeSignalBySymbol(event.symbol, event.mode);
        
        if (removed) {
          // Broadcast rtb:cleared for the promoted symbol
          await contextBridge.broadcast({
            type: 'rtb:cleared',
            payload: {
              mode: event.mode,
              symbol: event.symbol,
              reason: 'promoted',
              timestamp: new Date().toISOString()
            },
            mode: event.mode
          });
          console.log(`[8.8.4-A1][RTB_CLEANUP] ✅ Signal ${event.symbol} removed and rtb:cleared broadcasted`);
        }
      } catch (err: any) {
        console.error(`[8.8.4-A1][RTB_CLEANUP][ERROR] Failed to cleanup promoted signal:`, err);
      }
    });

    this.promotionHandlerRegistered = true;
    console.log('[8.8.4-A1][RTB_CLEANUP] PROMOTION event handler registered');
  }

  /**
   * Directive 8.8.4-A3: Check if a pair exists in the RTB queue
   * Used for pair-level duplicate validation
   * 
   * @param symbol - The trading pair in BASE/QUOTE format (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if the pair exists in the RTB queue
   */
  async hasPair(symbol: string, mode: TradingMode): Promise<boolean> {
    // Directive 8.8.4-A3.R1: Normalize pair key for consistent comparison
    const normalizedSymbol = normalizePairKey(symbol);
    const signals = await storage.getRtbSignals({ mode, status: 'queued', symbol: normalizedSymbol });
    return signals.length > 0;
  }

  /**
   * Directive 8.8.4-A1: Remove a signal by symbol and mode
   * Used when a signal is promoted to an active trade
   * 
   * @param symbol - The symbol to remove (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if a signal was removed
   */
  async removeSignalBySymbol(symbol: string, mode: TradingMode): Promise<boolean> {
    const signals = await storage.getRtbSignals({ mode, status: 'queued' });
    const matchingSignal = signals.find(s => s.symbol === symbol);
    
    if (matchingSignal) {
      // Mark as promoted (removes from queued pool)
      await storage.updateRtbSignal(matchingSignal.id, {
        status: 'promoted',
        promotedAt: new Date()
      });
      console.log(`[8.8.4-A1][RTB] Removed signal ${symbol} (id=${matchingSignal.id}) from ${mode} queue`);
      return true;
    }
    
    return false;
  }

  /**
   * Phase 8.8.4-C.6: Set engine start time for TCL failsafe tracking
   * Called when trading engine starts
   */
  setEngineStartTime(mode: TradingMode): void {
    this.engineStartTimes.set(mode, Date.now());
    this.tclFailsafeTriggered.set(mode, false);
    console.log(`[8.8.4-C.6][TCL_FAILSAFE] Engine start time set for ${mode} mode`);
  }

  /**
   * Phase 8.8.4-C.6: Clear engine start time
   * Called when trading engine stops
   */
  clearEngineStartTime(mode: TradingMode): void {
    this.engineStartTimes.delete(mode);
    this.tclFailsafeTriggered.delete(mode);
  }

  /**
   * Phase 8.8.4-C.5: Start the 30-second refresh cycle for a mode
   * Continuously cleans up expired signals and re-evaluates the queue
   */
  startRefreshCycle(mode: TradingMode): void {
    // Prevent duplicate intervals
    if (this.refreshIntervals.has(mode)) {
      console.log(`[8.8.4-C.5][RTB_REFRESH] Refresh cycle already running for ${mode} mode`);
      return;
    }

    console.log(`[8.8.4-C.5][RTB_REFRESH] Starting 30s refresh cycle for ${mode} mode`);

    const interval = setInterval(async () => {
      try {
        await this.executeRefreshCycle(mode);
      } catch (error) {
        console.error(`[8.8.4-C.5][RTB_ERROR] Refresh cycle error for ${mode}:`, error);
      }
    }, RTB_REFRESH_INTERVAL_MS);

    this.refreshIntervals.set(mode, interval);
  }

  /**
   * Phase 8.8.4-C.5: Stop the refresh cycle for a mode
   */
  stopRefreshCycle(mode: TradingMode): void {
    const interval = this.refreshIntervals.get(mode);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(mode);
      console.log(`[8.8.4-C.5][RTB_REFRESH] Stopped refresh cycle for ${mode} mode`);
    }
  }

  /**
   * Phase 8.8.4-C.5: Execute a single refresh cycle
   * - Cleans up expired signals
   * - Re-evaluates queue quality
   * - Logs pool status
   * 
   * Directive 8.8.4-A1-Extended: Also triggers refreshAndRank for dynamic re-ranking
   * Directive 8.8.4-A3.R1: Only runs when engine is active for this mode
   */
  private async executeRefreshCycle(mode: TradingMode): Promise<void> {
    // Directive 8.8.4-A3.R1: Engine-aware refresh control
    // Only run refresh cycle when trading engine is active for this mode
    const systemContext = await storage.getSystemContext(mode);
    if (!systemContext?.isEngineActive) {
      return; // Skip refresh when engine is inactive (passive learning mode)
    }
    
    const startTime = Date.now();
    
    // Step 1: Clean up expired signals
    const expiredCount = await this.cleanupExpiredSignals(mode);
    
    // Step 2: Re-evaluate remaining signals
    const { removed, remaining } = await this.reEvaluateQueue(mode);
    
    // Step 3: Directive 8.8.4-A1-Extended: Refresh and re-rank signals by CWQI
    await this.refreshAndRank(mode);
    
    // Step 4: Get TCL status
    const tclStatus = await this.getTCLStatus(mode);
    
    const elapsedMs = Date.now() - startTime;
    
    console.log(
      `[8.8.4-C.5][RTB_REFRESH] mode=${mode}, expired=${expiredCount}, removed=${removed}, ` +
      `remaining=${remaining}, poolSize=${tclStatus.poolSize}, TCL=${tclStatus.isActive ? 'ACTIVE' : 'WARMING'} ` +
      `(${tclStatus.progressPercent.toFixed(1)}%), elapsed=${elapsedMs}ms`
    );
  }

  /**
   * Directive 8.8.4-A1-Extended + A3 + A3.R2: Refresh and dynamically re-rank RTB signals
   * 
   * Every 30 seconds (at end of FX5 cycle or RTB refresh cycle):
   * 1. Recalculate CWQI with decay for each signal (fresher signals rank higher)
   * 2. Apply CWQI floor clamping to prevent decay cascade
   * 3. Re-validate signals through SQE with skipSelfCheck=true (allows reconfirmation)
   * 4. Update lastReconfirmedAt timestamp and reset missedRefreshCount
   * 5. Sort queue by CWQI descending (highest quality first)
   * 6. Broadcast rtb:updated to clients for UI refresh
   * 
   * @param mode - Trading mode ('paper' or 'live')
   */
  async refreshAndRank(mode: TradingMode): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get all queued signals for this mode
      const signals = await this.getQueuedSignals(mode);
      
      if (signals.length === 0) {
        console.log(`[A3.R2][RTB_REFRESH] mode=${mode} no signals to refresh`);
        return; // Nothing to refresh
      }

      // Recalculate CWQI with decay and update lastReconfirmedAt
      const now = new Date();
      let updatedCount = 0;
      let removedCount = 0;
      
      for (const signal of signals) {
        const originalCWQI = parseFloat(signal.cwqi || '0');
        const queuedAt = signal.queuedAt;
        
        // Directive 8.8.4-A3.R2: Apply CWQI decay with floor clamping
        const decayedCWQI = calculateDecayedCWQI(originalCWQI, queuedAt);
        
        // Use original NGC value (no artificial boosting per directive scope)
        const ngc = parseFloat(signal.ngc || signal.confidence || '0');
        const riskScore = parseFloat(signal.riskScore || '0.5');
        const profitRate = signal.expectedReturn ? parseFloat(signal.expectedReturn) : 0.15;
        
        const sqeInput: SQEInput = {
          signalId: signal.signalId,
          symbol: signal.symbol,
          strategy: signal.strategy,
          ngc,
          riskScore,
          profitRate,
          cwqi: decayedCWQI
        };
        
        // Directive 8.8.4-A3.R2: Self-dedupe is inherently skipped during reconfirmation
        // because we're updating existing signals in-place, not calling queueSQESignal().
        // The skipSelfCheck flag in queueSQESignal is for external callers that may
        // re-queue existing RTB signals (e.g., manual reconfirmation workflows).
        console.log(`[A3.R2][RECONFIRM] pair=${signal.symbol} skipSelfCheck=implicit (in-place update)`);
        const sqeResult = evaluateSignalQuality(sqeInput);
        
        // Remove signal if it fails SQE re-validation AND has been in queue too long
        if (!sqeResult.passed) {
          // Directive 8.8.4-A3.R2: Track missed refreshes instead of immediate expiry
          const metadata = signal.metadata as Record<string, any> || {};
          const missedRefreshes = (metadata.missedRefreshCount || 0) + 1;
          
          if (missedRefreshes >= MISSED_REFRESH_THRESHOLD) {
            await this.expireSignal(signal.id, `SQE re-validation failed after ${missedRefreshes} refreshes: ${sqeResult.reason}`);
            this.logSqeRejection(signal, sqeResult.reason || 'unknown', ngc, decayedCWQI);
            console.log(`[8.8.4-A3.R2][SQE][EXPIRED] pair=${signal.symbol} missedRefreshes=${missedRefreshes}`);
            removedCount++;
          } else {
            // Update missed refresh count but keep signal
            await storage.updateRtbSignal(signal.id, {
              metadata: { ...metadata, missedRefreshCount: missedRefreshes }
            });
            console.log(`[8.8.4-A3.R2][SQE][WARN] pair=${signal.symbol} missedRefreshes=${missedRefreshes}/${MISSED_REFRESH_THRESHOLD}`);
          }
          continue;
        }
        
        // Directive 8.8.4-A3.R2: Requeue via queueSQESignal with skipSelfCheck=true
        // This is the mandated reconfirmation path that bypasses self-dedupe
        const metadata = signal.metadata as Record<string, any> || {};
        const reconfirmInput: SQESignalInput = {
          signalId: signal.signalId,
          mode,
          symbol: signal.symbol,
          strategy: signal.strategy,
          entryPrice: parseFloat(signal.entryPrice || '0'),
          stopPrice: parseFloat(signal.stopPrice || '0'),
          targetPrice: signal.targetPrice ? parseFloat(signal.targetPrice) : undefined,
          quantity: signal.quantity ? parseFloat(signal.quantity) : undefined,
          notional: signal.notional ? parseFloat(signal.notional) : undefined,
          confidence: ngc,
          ngc,
          riskScore,
          expectedReturn: profitRate,
          profitRate,
          cwqi: decayedCWQI,
          currentPrice: signal.currentPrice ? parseFloat(signal.currentPrice) : undefined,
          volume24h: signal.volume24h ? parseFloat(signal.volume24h) : undefined,
          skipSelfCheck: true, // Directive 8.8.4-A3.R2: Skip self-dedupe for reconfirmation
          metadata: {
            ...metadata,
            lastReconfirmedAt: now.toISOString(),
            originalCwqi: originalCWQI.toString(),
            decayApplied: true,
            missedRefreshCount: 0 // Reset on successful refresh
          }
        };
        
        console.log(`[A3.R2][RECONFIRM] pair=${signal.symbol} skipSelfCheck=true via queueSQESignal`);
        const requeued = await this.queueSQESignal(reconfirmInput);
        
        if (requeued) {
          updatedCount++;
        } else {
          // queueSQESignal returned null - likely duplicate_pair_active
          console.log(`[A3.R2][RECONFIRM] pair=${signal.symbol} rejected by queueSQESignal (likely active position)`);
          removedCount++;
        }
      }

      // Broadcast rtb:updated to clients for UI refresh
      await contextBridge.broadcast({
        type: 'rtb:updated',
        payload: {
          mode,
          timestamp: now.toISOString(),
          signalCount: signals.length,
          refreshedCount: updatedCount,
          removedCount
        },
        mode
      });

      const elapsedMs = Date.now() - startTime;
      console.log(`[A3.R2][RTB_REFRESH] mode=${mode} updated=${updatedCount} removed=${removedCount} remaining=${signals.length - removedCount} elapsed=${elapsedMs}ms`);
      
    } catch (error) {
      console.error(`[8.8.4-A3][RTB_RERANK][ERROR] mode=${mode}:`, error);
    }
  }

  /**
   * Directive 8.8.4-A3.R2: Log SQE rejection to diagnostic file
   */
  private logSqeRejection(signal: RtbSignal, reason: string, ngc: number, cwqi: number): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'logs', 'diagnostics');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        symbol: signal.symbol,
        strategy: signal.strategy,
        ngc: ngc.toFixed(4),
        cwqi: cwqi.toFixed(4),
        reason,
        signalId: signal.signalId
      };
      
      const logPath = path.join(logDir, 'sqe_rejections.log');
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Silent fail - diagnostic logging should not break refresh cycle
    }
  }

  /**
   * Phase 8.8.4-C.5: Check if refresh cycle is running for a mode
   */
  isRefreshCycleRunning(mode: TradingMode): boolean {
    return this.refreshIntervals.has(mode);
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

    // Phase 8.8.4-C.13.B: Use upsert to prevent duplicate key errors
    const signal = await storage.upsertRtbSignal(insertData);

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
   * Phase 8.8.4-A3.R3: Pre-cleanup step to delete prior expired entries before updating
   */
  async expireSignal(signalId: string, reason?: string): Promise<void> {
    const signal = await storage.getRtbSignalById(signalId);
    
    if (!signal) {
      console.warn(`[RTB] Cannot expire - signal ${signalId} not found`);
      return;
    }
    
    const deletedCount = await storage.deleteRtbSignals({
      mode: signal.mode as 'live' | 'paper',
      symbol: signal.symbol,
      strategy: signal.strategy,
      status: 'expired'
    });
    
    if (deletedCount > 0) {
      console.log(`[8.8.4-A3.R3][RTB_EXPIRE] Cleared ${deletedCount} prior expired entries for ${signal.symbol}/${signal.strategy}`);
    }
    
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
   * Phase 8.8.4-C.14.B: Get ranked signals for multi-signal promotion
   * Returns top N signals sorted by CWQI descending
   */
  async getRankedSignals(mode: TradingMode, limit: number = 15): Promise<RtbSignal[]> {
    const signals = await this.getQueuedSignals(mode);
    
    if (signals.length === 0) {
      return [];
    }

    // Filter out expired signals and sort by CWQI descending
    const now = new Date();
    const validSignals = signals.filter(s => new Date(s.expiresAt) > now);
    
    // Sort by CWQI descending (highest quality first)
    validSignals.sort((a, b) => {
      const cwqiA = parseFloat(a.cwqi || '0');
      const cwqiB = parseFloat(b.cwqi || '0');
      return cwqiB - cwqiA;
    });

    console.log(`[8.8.4-C.14.B][RTB_RANKED] mode=${mode}, total=${signals.length}, valid=${validSignals.length}, returning top ${Math.min(limit, validSignals.length)}`);
    
    return validSignals.slice(0, limit);
  }

  /**
   * Clear all queued signals for a mode (used during engine reset)
   * Directive 8.8.4-C.14.D: Actually DELETE records instead of just expiring them
   */
  async clearQueue(mode: TradingMode): Promise<number> {
    // Delete ALL RTB signals for this mode (not just queued ones)
    const deleted = await storage.deleteRtbSignals({ mode });
    
    console.log(`[8.8.4-C.14.D][RTB] Deleted ${deleted} signals from ${mode} queue`);
    return deleted;
  }

  /**
   * Phase 8.8.4-C.5: Queue an SQE-qualified signal into the unified RTB pool
   * 
   * Unlike queueSignal(), this method:
   * - Accepts ALL SQE-qualified signals regardless of capacity blocks
   * - Uses pre-computed CWQI from SQE instead of re-calculating
   * - Supports TCL warm-up tracking
   * 
   * Directive 8.8.4-A3.R2: Supports skipSelfCheck flag for reconfirmation
   * When skipSelfCheck=true, skips the existing RTB signal check to allow
   * re-queuing during refresh cycles without self-rejection
   * 
   * @param input - SQE-qualified signal with pre-computed metrics
   * @returns The queued signal record or null if rejected
   */
  async queueSQESignal(input: SQESignalInput): Promise<RtbSignal | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SIGNAL_TTL_MS);
    
    // Directive 8.8.4-A3.R1: Normalize pair key to uppercase BASE/QUOTE format
    const normalizedSymbol = normalizePairKey(input.symbol);

    // Directive 8.8.4-A3: Pair-level duplicate validation
    // Check if this pair already exists in active trades (duplicate_pair_active)
    // NOTE: Always check active positions even with skipSelfCheck (trade may have opened)
    const hasActivePosition = await storage.hasActivePair(normalizedSymbol, input.mode);
    if (hasActivePosition) {
      console.log(`[8.8.4-A3][SQE][Validation] pair=${normalizedSymbol} status=duplicate_pair_active`);
      return null;
    }

    // Directive 8.8.4-A3.R2: Skip self-dedupe check when reconfirming existing RTB signals
    if (input.skipSelfCheck) {
      console.log(`[A3.R2][RTB] skipSelfCheck=true for ${normalizedSymbol}/${input.strategy}`);
    }

    // Check for existing queued signal with same symbol+strategy
    // Directive 8.8.4-A3.R2: Skip this check when reconfirming (skipSelfCheck=true)
    const existingSignal = input.skipSelfCheck 
      ? null 
      : await this.getQueuedSignal(input.mode, normalizedSymbol, input.strategy);
    
    if (existingSignal) {
      // If existing signal has higher CWQI, keep it
      const existingCWQI = parseFloat(existingSignal.cwqi);
      if (existingCWQI >= input.cwqi) {
        console.log(`[8.8.4-C.5][RTB_SKIP] Keeping existing ${normalizedSymbol}/${input.strategy} with CWQI ${existingCWQI.toFixed(4)} >= new ${input.cwqi.toFixed(4)}`);
        return existingSignal;
      }
      
      // New signal is better - expire the old one
      await this.expireSignal(existingSignal.id, 'Replaced by higher-CWQI SQE signal');
    }

    // Insert new signal with pre-computed metrics from SQE
    // Directive 8.8.4-A3.R1: Store with normalized pair key
    const insertData: InsertRtbSignal = {
      mode: input.mode,
      signalId: input.signalId,
      symbol: normalizedSymbol,
      strategy: input.strategy as any,
      entryPrice: input.entryPrice.toString(),
      stopPrice: input.stopPrice.toString(),
      targetPrice: input.targetPrice?.toString(),
      quantity: input.quantity?.toString(),
      notional: input.notional?.toString(),
      confidence: input.ngc.toString(), // Use NGC as confidence
      riskScore: input.riskScore.toString(),
      expectedReturn: input.expectedReturn?.toString() || '0',
      cwqi: input.cwqi.toString(),
      ngc: input.ngc.toString(), // Directive 8.8.4-C.14.A
      currentPrice: input.currentPrice?.toString(), // Directive 8.8.4-C.14.A
      volume24h: input.volume24h?.toString(), // Directive 8.8.4-C.14.A
      status: 'queued',
      queuedAt: now,
      expiresAt,
      blockReason: 'SQE_QUALIFIED', // Mark as SQE-qualified, not capacity-blocked
      metadata: input.metadata as any,
    };

    // Phase 8.8.4-C.13.B: Use upsert to prevent duplicate key errors
    const signal = await storage.upsertRtbSignal(insertData);

    // Record SLAL QUEUED event
    signalLifecycleAudit.recordQueued(
      input.signalId,
      input.mode,
      normalizedSymbol,
      input.strategy,
      {
        cwqi: input.cwqi,
        ngc: input.ngc,
        profitRate: input.profitRate,
        blockReason: 'SQE_QUALIFIED',
        expiresAt: expiresAt.toISOString(),
      }
    );

    // Get current pool size for warm-up tracking
    const poolSize = await this.getPoolSize(input.mode);

    console.log(`[8.8.4-C.5][RTB_INSERT] ${normalizedSymbol}/${input.strategy}: CWQI=${input.cwqi.toFixed(4)}, NGC=${input.ngc.toFixed(4)}, poolSize=${poolSize}`);
    
    // Phase 8.8.4-C.12: Check if 100-signal threshold reached for TCL activation
    tclWatchdog.checkSignalThreshold(input.mode, poolSize);
    
    return signal;
  }

  /**
   * Phase 8.8.4-C.5: Get the current pool size for a mode
   * @returns Number of queued signals
   */
  async getPoolSize(mode: TradingMode): Promise<number> {
    const signals = await storage.getRtbSignals({
      mode,
      status: 'queued',
    });
    return signals.length;
  }

  /**
   * Phase 8.8.4-C.5 + C.6: Check if TCL (Trading Capacity Limit) is active
   * TCL activates when:
   * - Pool has accumulated ≥100 signals (normal activation), OR
   * - 5 minutes have passed since engine start (failsafe activation)
   * 
   * @param mode - Trading mode to check
   * @returns true if TCL is active
   */
  async isTCLActive(mode: TradingMode): Promise<boolean> {
    const poolSize = await this.getPoolSize(mode);
    
    // Normal activation: ≥100 signals
    if (poolSize >= TCL_WARMUP_THRESHOLD) {
      console.log(`[8.8.4-C.5][TCL_ACTIVATE] mode=${mode}, poolSize=${poolSize} >= ${TCL_WARMUP_THRESHOLD}, TCL is active`);
      return true;
    }
    
    // Phase 8.8.4-C.6: Check 5-minute failsafe
    const engineStartTime = this.engineStartTimes.get(mode);
    if (engineStartTime) {
      const elapsedMs = Date.now() - engineStartTime;
      if (elapsedMs >= TCL_FAILSAFE_MS) {
        // Failsafe triggered
        if (!this.tclFailsafeTriggered.get(mode)) {
          this.tclFailsafeTriggered.set(mode, true);
          console.log(`[8.8.4-C.6][TCL_FALLBACK_TRIGGER] mode=${mode}, elapsed=${(elapsedMs/1000).toFixed(0)}s >= 300s, activating TCL via failsafe`);
        }
        console.log(`[8.8.4-C.6][TCL_FALLBACK_ACTIVATE] mode=${mode}, poolSize=${poolSize}, TCL active via 5-minute failsafe`);
        return true;
      } else {
        const remainingMs = TCL_FAILSAFE_MS - elapsedMs;
        console.log(`[8.8.4-C.5][TCL_WARMUP] mode=${mode}, poolSize=${poolSize}/${TCL_WARMUP_THRESHOLD}, failsafe in ${(remainingMs/1000).toFixed(0)}s`);
      }
    } else {
      console.log(`[8.8.4-C.5][TCL_WARMUP] mode=${mode}, poolSize=${poolSize}/${TCL_WARMUP_THRESHOLD}, TCL not yet active (no engine start time)`);
    }
    
    return false;
  }

  /**
   * Phase 8.8.4-C.5 + C.6: Get TCL warm-up status
   * @returns Object with pool size, threshold, active status, and failsafe info
   */
  async getTCLStatus(mode: TradingMode): Promise<{
    poolSize: number;
    threshold: number;
    isActive: boolean;
    progressPercent: number;
    failsafeEnabled: boolean;
    failsafeTriggered: boolean;
    failsafeRemainingMs: number | null;
  }> {
    const poolSize = await this.getPoolSize(mode);
    const engineStartTime = this.engineStartTimes.get(mode);
    const failsafeTriggered = this.tclFailsafeTriggered.get(mode) || false;
    
    let failsafeRemainingMs: number | null = null;
    let isActiveViaFailsafe = false;
    
    if (engineStartTime) {
      const elapsedMs = Date.now() - engineStartTime;
      if (elapsedMs >= TCL_FAILSAFE_MS) {
        isActiveViaFailsafe = true;
        failsafeRemainingMs = 0;
      } else {
        failsafeRemainingMs = TCL_FAILSAFE_MS - elapsedMs;
      }
    }
    
    const isActiveViaThreshold = poolSize >= TCL_WARMUP_THRESHOLD;
    const isActive = isActiveViaThreshold || isActiveViaFailsafe;
    const progressPercent = Math.min(100, (poolSize / TCL_WARMUP_THRESHOLD) * 100);
    
    return {
      poolSize,
      threshold: TCL_WARMUP_THRESHOLD,
      isActive,
      progressPercent: Math.round(progressPercent * 10) / 10,
      failsafeEnabled: engineStartTime !== undefined,
      failsafeTriggered,
      failsafeRemainingMs,
    };
  }
}

export const readyToBuyService = new ReadyToBuyService();
