/**
 * Directive 11.0A — Trade Criteria Limiter (TCL)
 * 
 * Event-based promotion controller. Reacts to trade slot availability
 * and RTB queue events to promote highest-ranked signals.
 * 
 * RESPONSIBILITIES (ALLOWED):
 * - Trigger on 2-minute failsafe timer (onFailsafeTimer)
 * - Trigger on 15-signal RTB accumulation (onReadyToBuyQueueFull)
 * - Monitor open trade slots
 * - Promote highest-ranked RTB signals when capacity available
 * 
 * NOT ALLOWED (owned by SQE):
 * - Exposure/correlation/cooldown checks (SQE responsibility)
 * - Position sizing (Phase 11.3 will implement)
 * - Exit logic (TEC responsibility)
 * - Volatility adjustments
 * 
 * The TCL is a pure event-driven promoter that reacts to queue and
 * slot events, promoting the top-ranked signals to active trades.
 */

import { storage } from '../storage.js';
import type { TradingMode } from '../services/guardrail-policy.js';

export interface TCLConfig {
  maxOpenPositions: number;
  rtbQueueThreshold: number;
  failsafeTimerMs: number;
}

const DEFAULT_CONFIG: TCLConfig = {
  maxOpenPositions: 10,
  rtbQueueThreshold: 15,
  failsafeTimerMs: 2 * 60 * 1000
};

export interface PromotionResult {
  promoted: number;
  skipped: number;
  reason?: string;
}

export class CriteriaLimiter {
  private config: TCLConfig;
  private failsafeTimers: Map<TradingMode, NodeJS.Timeout> = new Map();
  private lastPromotionTime: Map<TradingMode, number> = new Map();

  constructor(config: Partial<TCLConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getOpenSlots(mode: TradingMode): Promise<number> {
    try {
      const positions = mode === 'paper' 
        ? await storage.getPaperSimOpenPositions(mode)
        : await storage.getActiveTrades(mode);
      
      const guardrails = await storage.getGuardrailsV2({ mode });
      const maxPositions = guardrails?.maxOpenPositions ?? this.config.maxOpenPositions;

      return Math.max(0, maxPositions - positions.length);
    } catch (err) {
      console.warn('[TCL] Error checking open slots:', err);
      return 0;
    }
  }

  async onFailsafeTimer(mode: TradingMode): Promise<PromotionResult> {
    console.log(`[TCL][FAILSAFE] 2-minute failsafe triggered for ${mode} mode`);
    return this.promoteTopSignals(mode, 'failsafe_timer');
  }

  async onReadyToBuyQueueFull(mode: TradingMode): Promise<PromotionResult> {
    console.log(`[TCL][RTB_FULL] RTB queue threshold (${this.config.rtbQueueThreshold}) reached for ${mode} mode`);
    return this.promoteTopSignals(mode, 'rtb_queue_full');
  }

  async promoteTopSignals(mode: TradingMode, trigger: string): Promise<PromotionResult> {
    const openSlots = await this.getOpenSlots(mode);
    
    if (openSlots <= 0) {
      console.log(`[TCL][SKIP] No open slots available for ${mode} mode`);
      return { promoted: 0, skipped: 0, reason: 'no_open_slots' };
    }

    const rtbSignals = await storage.getRtbSignals({ mode, status: 'queued' });
    
    if (rtbSignals.length === 0) {
      console.log(`[TCL][SKIP] No RTB signals available for ${mode} mode`);
      return { promoted: 0, skipped: 0, reason: 'no_rtb_signals' };
    }

    const sortedSignals = rtbSignals.sort((a, b) => {
      const cwqiA = parseFloat(a.cwqi || '0');
      const cwqiB = parseFloat(b.cwqi || '0');
      return cwqiB - cwqiA;
    });

    const eligibleSignals = sortedSignals.slice(0, openSlots);

    let promotedCount = 0;
    for (const signal of eligibleSignals) {
      try {
        await storage.updateRtbSignal(signal.id, {
          status: 'promoted',
          promotedAt: new Date()
        });
        
        console.log(`[TCL][PROMOTED] ${signal.symbol} (CWQI: ${signal.cwqi}) via ${trigger}`);
        promotedCount++;
      } catch (err) {
        console.error(`[TCL][ERROR] Failed to promote ${signal.symbol}:`, err);
      }
    }

    this.lastPromotionTime.set(mode, Date.now());
    this.resetFailsafeTimer(mode);

    console.log(`[TCL][COMPLETE] Promoted ${promotedCount}/${eligibleSignals.length} signals for ${mode} mode`);
    
    return {
      promoted: promotedCount,
      skipped: eligibleSignals.length - promotedCount
    };
  }

  startFailsafeTimer(mode: TradingMode): void {
    this.stopFailsafeTimer(mode);
    
    const timer = setTimeout(() => {
      this.onFailsafeTimer(mode).catch(err => {
        console.error(`[TCL][FAILSAFE_ERROR] ${mode}:`, err);
      });
    }, this.config.failsafeTimerMs);

    this.failsafeTimers.set(mode, timer);
    console.log(`[TCL][TIMER] Started ${this.config.failsafeTimerMs}ms failsafe timer for ${mode} mode`);
  }

  stopFailsafeTimer(mode: TradingMode): void {
    const timer = this.failsafeTimers.get(mode);
    if (timer) {
      clearTimeout(timer);
      this.failsafeTimers.delete(mode);
    }
  }

  resetFailsafeTimer(mode: TradingMode): void {
    this.startFailsafeTimer(mode);
  }

  async checkRtbThreshold(mode: TradingMode): Promise<boolean> {
    const rtbSignals = await storage.getRtbSignals({ mode, status: 'queued' });
    
    if (rtbSignals.length >= this.config.rtbQueueThreshold) {
      await this.onReadyToBuyQueueFull(mode);
      return true;
    }
    
    return false;
  }

  updateConfig(newConfig: Partial<TCLConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): TCLConfig {
    return { ...this.config };
  }

  getLastPromotionTime(mode: TradingMode): number | undefined {
    return this.lastPromotionTime.get(mode);
  }
}

export const criteriaLimiter = new CriteriaLimiter();
