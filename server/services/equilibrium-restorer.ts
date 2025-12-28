import { EventEmitter } from 'events';
import { getGASPCoordinator } from './gasp-coordinator';
import { rollbackToBaseline, applyStabilizationScaling } from '../utils/stabilization-controller';

export interface RecoveryPhase {
  name: 'cooldown' | 'stabilizing' | 'reengaging' | 'complete';
  progress: number;
  startedAt: string;
  estimatedCompletion: string | null;
}

export interface EquilibriumStatus {
  ok: boolean;
  currentPhase: RecoveryPhase | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastRecovery: string | null;
  autoPauseCount: number;
  reengagementCount: number;
}

interface RecoveryEvent {
  timestamp: string;
  type: 'auto_pause' | 'cooldown_start' | 'stabilizing' | 'reengagement' | 'complete' | 'failed';
  gsi: number;
  details: string;
}

class EquilibriumRestorer extends EventEmitter {
  private isRecovering: boolean = false;
  private currentPhase: RecoveryPhase | null = null;
  private recoveryAttempts: number = 0;
  private lastRecovery: Date | null = null;
  private autoPauseCount: number = 0;
  private reengagementCount: number = 0;
  private recoveryEvents: RecoveryEvent[] = [];
  private readonly MAX_EVENTS = 200;

  private cooldownDurationMs = 10 * 60 * 1000;
  private stabilizingDurationMs = 5 * 60 * 1000;
  private reengagementDurationMs = 5 * 60 * 1000;
  
  private phaseStarted: Date | null = null;

  constructor() {
    super();
    console.log('[L20][ER] Equilibrium Restorer initialized');
  }

  async initiateAutoPause(reason: string): Promise<void> {
    if (this.isRecovering) {
      console.log('[L20][ER] Already in recovery, skipping auto-pause');
      return;
    }
    
    console.log(`[L20][ER] Auto-pause initiated: ${reason}`);
    this.autoPauseCount++;
    
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    
    this.logEvent('auto_pause', status.gsi, reason);
    
    await this.startRecovery();
  }

  async startRecovery(): Promise<{ success: boolean; message: string }> {
    if (this.isRecovering) {
      return { success: false, message: 'Recovery already in progress' };
    }
    
    console.log('[L20][ER] Starting equilibrium recovery sequence');
    this.isRecovering = true;
    this.recoveryAttempts++;
    this.phaseStarted = new Date();
    
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    this.logEvent('cooldown_start', status.gsi, 'Recovery sequence initiated');
    
    this.currentPhase = {
      name: 'cooldown',
      progress: 0,
      startedAt: this.phaseStarted.toISOString(),
      estimatedCompletion: new Date(this.phaseStarted.getTime() + this.cooldownDurationMs).toISOString(),
    };
    
    this.emit('recoveryStarted', this.currentPhase);
    
    this.runRecoveryLoop();
    
    return { success: true, message: 'Recovery sequence started' };
  }

  private async runRecoveryLoop(): Promise<void> {
    while (this.isRecovering && this.currentPhase) {
      await this.sleep(30000);
      
      if (!this.isRecovering) break;
      
      await this.updatePhaseProgress();
    }
  }

  private async updatePhaseProgress(): Promise<void> {
    if (!this.phaseStarted || !this.currentPhase) return;
    
    const elapsed = Date.now() - this.phaseStarted.getTime();
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    
    switch (this.currentPhase.name) {
      case 'cooldown':
        this.currentPhase.progress = Math.min(1, elapsed / this.cooldownDurationMs);
        
        if (elapsed >= this.cooldownDurationMs) {
          await this.transitionTo('stabilizing');
        }
        break;
        
      case 'stabilizing':
        this.currentPhase.progress = Math.min(1, elapsed / this.stabilizingDurationMs);
        
        if (status.gsi >= 0.80) {
          await this.transitionTo('reengaging');
        } else if (elapsed >= this.stabilizingDurationMs && status.gsi < 0.70) {
          console.log('[L20][ER] Stabilization failed, restarting cooldown');
          await this.transitionTo('cooldown');
        }
        break;
        
      case 'reengaging':
        this.currentPhase.progress = Math.min(1, elapsed / this.reengagementDurationMs);
        
        if (elapsed >= this.reengagementDurationMs && status.gsi >= 0.85) {
          await this.completeRecovery();
        } else if (status.gsi < 0.70) {
          console.log('[L20][ER] Reengagement failed, returning to stabilizing');
          await this.transitionTo('stabilizing');
        }
        break;
    }
    
    this.emit('phaseProgress', this.currentPhase);
  }

  private async transitionTo(phase: 'cooldown' | 'stabilizing' | 'reengaging'): Promise<void> {
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    
    this.logEvent(phase === 'reengaging' ? 'reengagement' : phase === 'stabilizing' ? 'stabilizing' : 'cooldown_start', 
                  status.gsi, 
                  `Transitioning to ${phase} phase`);
    
    this.phaseStarted = new Date();
    
    let duration: number;
    switch (phase) {
      case 'cooldown':
        duration = this.cooldownDurationMs;
        break;
      case 'stabilizing':
        duration = this.stabilizingDurationMs;
        await applyStabilizationScaling();
        break;
      case 'reengaging':
        duration = this.reengagementDurationMs;
        this.reengagementCount++;
        break;
    }
    
    this.currentPhase = {
      name: phase,
      progress: 0,
      startedAt: this.phaseStarted.toISOString(),
      estimatedCompletion: new Date(this.phaseStarted.getTime() + duration).toISOString(),
    };
    
    console.log(`[L20][ER] Transitioned to ${phase} phase`);
    this.emit('phaseChanged', this.currentPhase);
  }

  private async completeRecovery(): Promise<void> {
    console.log('[L20][ER] Recovery complete, returning to normal operation');
    
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    this.logEvent('complete', status.gsi, 'Recovery sequence completed successfully');
    
    await rollbackToBaseline();
    
    this.currentPhase = {
      name: 'complete',
      progress: 1,
      startedAt: new Date().toISOString(),
      estimatedCompletion: null,
    };
    
    this.isRecovering = false;
    this.lastRecovery = new Date();
    
    this.emit('recoveryComplete');
  }

  async forceComplete(): Promise<{ success: boolean; message: string }> {
    if (!this.isRecovering) {
      return { success: false, message: 'No recovery in progress' };
    }
    
    console.log('[L20][ER] Force completing recovery');
    
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    this.logEvent('complete', status.gsi, 'Recovery force completed');
    
    await rollbackToBaseline();
    
    this.isRecovering = false;
    this.currentPhase = null;
    this.lastRecovery = new Date();
    
    this.emit('recoveryForceComplete');
    
    return { success: true, message: 'Recovery force completed' };
  }

  async cancelRecovery(): Promise<{ success: boolean; message: string }> {
    if (!this.isRecovering) {
      return { success: false, message: 'No recovery in progress' };
    }
    
    console.log('[L20][ER] Cancelling recovery');
    
    const gasp = getGASPCoordinator();
    const status = gasp.getStatus();
    this.logEvent('failed', status.gsi, 'Recovery cancelled by user');
    
    this.isRecovering = false;
    this.currentPhase = null;
    
    this.emit('recoveryCancelled');
    
    return { success: true, message: 'Recovery cancelled' };
  }

  private logEvent(type: RecoveryEvent['type'], gsi: number, details: string): void {
    const event: RecoveryEvent = {
      timestamp: new Date().toISOString(),
      type,
      gsi,
      details,
    };
    
    this.recoveryEvents.push(event);
    if (this.recoveryEvents.length > this.MAX_EVENTS) {
      this.recoveryEvents.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus(): EquilibriumStatus {
    return {
      ok: true,
      currentPhase: this.currentPhase,
      isRecovering: this.isRecovering,
      recoveryAttempts: this.recoveryAttempts,
      lastRecovery: this.lastRecovery?.toISOString() || null,
      autoPauseCount: this.autoPauseCount,
      reengagementCount: this.reengagementCount,
    };
  }

  getEvents(): RecoveryEvent[] {
    return [...this.recoveryEvents];
  }

  reset(): void {
    this.isRecovering = false;
    this.currentPhase = null;
    this.recoveryAttempts = 0;
    this.autoPauseCount = 0;
    this.reengagementCount = 0;
    this.recoveryEvents = [];
    
    console.log('[L20][ER] Equilibrium Restorer reset');
    this.emit('reset');
  }
}

let restorerInstance: EquilibriumRestorer | null = null;

export function getEquilibriumRestorer(): EquilibriumRestorer {
  if (!restorerInstance) {
    restorerInstance = new EquilibriumRestorer();
  }
  return restorerInstance;
}

export function initializeEquilibriumRestorer(): EquilibriumRestorer {
  return getEquilibriumRestorer();
}
