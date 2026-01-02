/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 10.0.E
 * ══════════════════════════════════════════════════════════════════════════════
 * Retraining Freeze Controller - ML Model Stabilization
 * 
 * Purpose: Prevents "Model Shock" when fee constants change (e.g., from 0.26% to 0.50%).
 * Pauses predictive model retraining for one epoch after activation.
 * 
 * Features:
 * - Epoch-based freeze window (default: 1 epoch = 1 hour)
 * - Automatic activation on friction constant changes
 * - Status monitoring for ML clients
 * - Event emission for monitoring dashboards
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { SYSTEM_GUARDS } from '../config/system-guards.js';

interface FreezeState {
  isActive: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  reason: string | null;
  epochDurationMs: number;
  lastKnownFriction: number;
  freezeCount: number;
}

interface FreezeEvent {
  timestamp: string;
  type: 'freeze_activated' | 'freeze_expired' | 'retraining_blocked';
  reason: string;
  duration?: number;
}

const DEFAULT_EPOCH_MS = 60 * 60 * 1000;

class RetrainingFreezeController extends EventEmitter {
  private state: FreezeState;
  private eventLog: FreezeEvent[] = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(epochDurationMs: number = DEFAULT_EPOCH_MS) {
    super();
    
    this.state = {
      isActive: false,
      activatedAt: null,
      expiresAt: null,
      reason: null,
      epochDurationMs,
      lastKnownFriction: SYSTEM_GUARDS.BASE_FEE_SLIPPAGE,
      freezeCount: 0
    };

    console.log(`[10.0.E][FREEZE] Retraining Freeze Controller initialized (epoch=${epochDurationMs / 60000}min, friction=${(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE * 100).toFixed(1)}%)`);
    
    this.checkInterval = setInterval(() => this.checkExpiry(), 60000);
    
    this.activatePhase10Freeze();
  }

  /**
   * Directive 10.0.E: Activate freeze on Phase 10 deployment
   * One epoch pause for friction correction stabilization
   */
  private activatePhase10Freeze(): void {
    this.activateFreeze('Phase 10.0 friction correction stabilization (0.26% → 0.50%)');
  }

  activateFreeze(reason: string): void {
    if (this.state.isActive) {
      console.log(`[10.0.E][FREEZE] Already active, extending: ${reason}`);
      const now = Date.now();
      this.state.expiresAt = new Date(now + this.state.epochDurationMs).toISOString();
      return;
    }

    const now = Date.now();
    this.state.isActive = true;
    this.state.activatedAt = new Date(now).toISOString();
    this.state.expiresAt = new Date(now + this.state.epochDurationMs).toISOString();
    this.state.reason = reason;
    this.state.freezeCount++;

    const event: FreezeEvent = {
      timestamp: new Date(now).toISOString(),
      type: 'freeze_activated',
      reason,
      duration: this.state.epochDurationMs
    };
    this.eventLog.push(event);
    
    console.log(`[10.0.E][FREEZE] ACTIVATED: ${reason} (expires: ${this.state.expiresAt})`);
    this.emit('freeze_activated', event);
  }

  /**
   * Check if retraining is allowed
   * Returns true if allowed, false if blocked by freeze
   */
  isRetrainingAllowed(): boolean {
    if (!this.state.isActive) {
      return true;
    }

    const event: FreezeEvent = {
      timestamp: new Date().toISOString(),
      type: 'retraining_blocked',
      reason: this.state.reason || 'Freeze active'
    };
    this.eventLog.push(event);
    
    console.log(`[10.0.E][FREEZE] Retraining BLOCKED: ${this.state.reason}`);
    this.emit('retraining_blocked', event);
    
    return false;
  }

  /**
   * Wrapper for ML retraining functions
   * Returns early if freeze is active
   */
  guardRetraining<T>(retrainFn: () => T, fallbackValue: T): T {
    if (!this.isRetrainingAllowed()) {
      return fallbackValue;
    }
    return retrainFn();
  }

  private checkExpiry(): void {
    if (!this.state.isActive || !this.state.expiresAt) {
      return;
    }

    const now = Date.now();
    const expiry = new Date(this.state.expiresAt).getTime();

    if (now >= expiry) {
      const event: FreezeEvent = {
        timestamp: new Date(now).toISOString(),
        type: 'freeze_expired',
        reason: this.state.reason || 'Epoch completed'
      };
      this.eventLog.push(event);

      console.log(`[10.0.E][FREEZE] EXPIRED: Retraining allowed (was frozen for: ${this.state.reason})`);
      
      this.state.isActive = false;
      this.state.activatedAt = null;
      this.state.expiresAt = null;
      this.state.reason = null;

      this.emit('freeze_expired', event);
    }
  }

  getStatus(): {
    isActive: boolean;
    activatedAt: string | null;
    expiresAt: string | null;
    reason: string | null;
    remainingMs: number;
    freezeCount: number;
    currentFriction: number;
  } {
    const remainingMs = this.state.isActive && this.state.expiresAt
      ? Math.max(0, new Date(this.state.expiresAt).getTime() - Date.now())
      : 0;

    return {
      isActive: this.state.isActive,
      activatedAt: this.state.activatedAt,
      expiresAt: this.state.expiresAt,
      reason: this.state.reason,
      remainingMs,
      freezeCount: this.state.freezeCount,
      currentFriction: SYSTEM_GUARDS.BASE_FEE_SLIPPAGE
    };
  }

  getEventLog(limit: number = 20): FreezeEvent[] {
    return this.eventLog.slice(-limit);
  }

  manualDeactivate(): void {
    if (!this.state.isActive) {
      return;
    }

    console.log(`[10.0.E][FREEZE] Manual deactivation`);
    
    this.state.isActive = false;
    this.state.activatedAt = null;
    this.state.expiresAt = null;
    this.state.reason = null;

    this.emit('freeze_deactivated', { timestamp: new Date().toISOString() });
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[10.0.E][FREEZE] Shutdown complete');
  }
}

let freezeInstance: RetrainingFreezeController | null = null;

export function getRetrainingFreezeController(): RetrainingFreezeController {
  if (!freezeInstance) {
    freezeInstance = new RetrainingFreezeController();
  }
  return freezeInstance;
}

export function initRetrainingFreezeController(epochDurationMs?: number): RetrainingFreezeController {
  if (!freezeInstance) {
    freezeInstance = new RetrainingFreezeController(epochDurationMs);
  }
  return freezeInstance;
}

export { RetrainingFreezeController };
