/**
 * Phase 27.4: Trading State Synchronization & Fail-Safe Recovery
 * 
 * Ensures trading mode (live/paper) is persisted, synchronized across all system
 * components via cluster bus, and recoverable on startup/failure.
 */

import { storage } from '../storage.js';
import { clusterBus } from './cluster-bus.js';
import { contextBridge } from './context-bridge.js';
import type { SystemContext } from '@shared/schema';

export type TradingMode = 'live' | 'paper';

export interface TradingStateChangeEvent {
  userId: string;
  previousMode: TradingMode;
  newMode: TradingMode;
  changedBy: string;
  changeReason: string;
  timestamp: Date;
}

export class TradingStateSync {
  private currentMode: Map<string, TradingMode> = new Map();
  private initialized = false;

  constructor() {
    // Listen for cluster bus events to synchronize state across services
    this.setupClusterBusListeners();
    
    // Phase 27.F.2: Start reconciliation guard (checks every 15 seconds)
    this.startReconciliationGuard();
  }

  /**
   * Initialize the service and recover previous trading state from database
   */
  async initialize(userId: string): Promise<void> {
    try {
      const context = await storage.getSystemContext(userId);
      
      if (context) {
        this.currentMode.set(userId, context.tradingMode);
        console.log(`[TradingStateSync] Recovered trading mode for user ${userId}: ${context.tradingMode}`);
        
        // Emit recovery event
        clusterBus.emit('trading_state_recovered', {
          userId,
          mode: context.tradingMode,
          lastChange: context.lastModeChange,
          timestamp: new Date()
        });
      } else {
        // Initialize with default paper mode
        await this.setTradingMode(userId, 'paper', 'system', 'Initial setup');
        console.log(`[TradingStateSync] Initialized user ${userId} with default paper mode`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error(`[TradingStateSync] Error initializing for user ${userId}:`, error);
      // Fail-safe: default to paper mode
      this.currentMode.set(userId, 'paper');
    }
  }

  /**
   * Get current trading mode for a user
   */
  getTradingMode(userId: string): TradingMode {
    return this.currentMode.get(userId) || 'paper';
  }

  /**
   * Set trading mode with persistence and cluster synchronization
   */
  async setTradingMode(
    userId: string,
    newMode: TradingMode,
    changedBy: string,
    changeReason: string
  ): Promise<SystemContext> {
    const previousMode = this.getTradingMode(userId);
    
    // Update in-memory state
    this.currentMode.set(userId, newMode);
    
    // Persist to database
    const context = await storage.upsertSystemContext({
      userId,
      tradingMode: newMode,
      lastModeChange: new Date(),
      changedBy,
      changeReason,
      lastSafeState: {
        mode: previousMode,
        timestamp: new Date().toISOString()
      }
    });
    
    // Broadcast change event via cluster bus
    const changeEvent: TradingStateChangeEvent = {
      userId,
      previousMode,
      newMode,
      changedBy,
      changeReason,
      timestamp: new Date()
    };
    
    clusterBus.emit('trading_mode_changed', changeEvent);
    
    // Phase 27.F.3: Broadcast complete state snapshot via broadcastUserUpdate
    await this.broadcastUserUpdate(userId);
    
    console.log(`[SYNC][Phase-27.F.3] Trading mode changed for user ${userId}: ${previousMode} → ${newMode} (by: ${changedBy})`);
    
    return context;
  }

  /**
   * Phase 27.F.3: Update engine active state with full state broadcast
   */
  async setEngineActive(userId: string, isActive: boolean): Promise<void> {
    await storage.updateSystemContext(userId, {
      isEngineActive: isActive,
      updatedAt: new Date()
    });
    
    clusterBus.emit('engine_state_changed', {
      userId,
      isActive,
      timestamp: new Date()
    });
    
    // Phase 27.F.3: Broadcast complete state snapshot via broadcastUserUpdate
    await this.broadcastUserUpdate(userId);
    
    console.log(`[SYNC][Phase-27.F.3] Engine state updated for user ${userId}: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
  }

  /**
   * Get engine active state
   */
  async isEngineActive(userId: string): Promise<boolean> {
    const context = await storage.getSystemContext(userId);
    return context?.isEngineActive || false;
  }

  /**
   * Emergency stop - force paper mode and disable engine
   */
  async emergencyStop(userId: string, reason: string): Promise<void> {
    console.warn(`[TradingStateSync] EMERGENCY STOP triggered for user ${userId}: ${reason}`);
    
    const previousMode = this.getTradingMode(userId);
    
    // Force paper mode
    this.currentMode.set(userId, 'paper');
    
    // Persist emergency state
    await storage.upsertSystemContext({
      userId,
      tradingMode: 'paper',
      isEngineActive: false,
      lastModeChange: new Date(),
      changedBy: 'system',
      changeReason: `EMERGENCY STOP: ${reason}`,
      lastSafeState: {
        mode: previousMode,
        timestamp: new Date().toISOString(),
        emergencyStop: true
      }
    });
    
    // Broadcast emergency event
    clusterBus.emit('emergency_stop', {
      userId,
      previousMode,
      reason,
      timestamp: new Date()
    });
    
    // Phase 27.F.3: Broadcast complete state snapshot via broadcastUserUpdate
    await this.broadcastUserUpdate(userId);
  }

  /**
   * Restore to last safe state
   */
  async restoreLastSafeState(userId: string): Promise<SystemContext | undefined> {
    const context = await storage.getSystemContext(userId);
    
    if (!context || !context.lastSafeState) {
      console.warn(`[TradingStateSync] No safe state to restore for user ${userId}`);
      return undefined;
    }
    
    const lastSafeState = context.lastSafeState as any;
    const safeMode = lastSafeState.mode || 'paper';
    
    console.log(`[TradingStateSync] Restoring user ${userId} to last safe state: ${safeMode}`);
    
    return await this.setTradingMode(userId, safeMode, 'system', 'Restored from safe state');
  }

  /**
   * Setup cluster bus listeners for state synchronization
   */
  private setupClusterBusListeners(): void {
    // Listen for kill-switch activation
    clusterBus.on('kill_switch_activated', async (data: any) => {
      if (data.userId) {
        await this.emergencyStop(data.userId, 'Kill switch activated');
      }
    });
    
    // Listen for external mode changes (e.g., from other services)
    clusterBus.on('request_mode_change', async (data: any) => {
      const { userId, mode, changedBy, reason } = data;
      if (userId && mode) {
        await this.setTradingMode(userId, mode, changedBy || 'system', reason || 'External request');
      }
    });
  }

  /**
   * Phase 27.F.3: Broadcast complete trading state snapshot to user
   * Phase 27.F.12: Extended to include both isEngineActivePaper and isEngineActiveLive
   * Called after any start/stop/mode change action
   */
  async broadcastUserUpdate(userId: string): Promise<void> {
    try {
      const context = await storage.getSystemContext(userId);
      
      if (!context) {
        console.warn(`[TradingSync] No context found for user ${userId}, skipping broadcast`);
        return;
      }
      
      // Phase 27.F.12: Compute mode-specific engine states
      // Check if paper sim session is active
      const paperSimSession = await storage.getActivePaperSimSession(userId);
      const isEngineActivePaper = paperSimSession !== null;
      
      // For live mode, check system_context.isEngineActive when mode is 'live'
      const isEngineActiveLive = context.tradingMode === 'live' && context.isEngineActive;
      
      // Phase 27.F.17b: Add explicit status field (RUNNING/STOPPED)
      const status = (context.tradingMode === 'paper' ? isEngineActivePaper : isEngineActiveLive) 
        ? 'RUNNING' 
        : 'STOPPED';
      
      const payload = {
        userId,
        mode: context.tradingMode,
        status, // Phase 27.F.17b: Explicit RUNNING/STOPPED status
        isEngineActive: context.isEngineActive || false,
        active: context.isEngineActive || false, // Keep both for backwards compatibility
        // Phase 27.F.12: Add mode-specific status
        isEngineActivePaper,
        isEngineActiveLive,
        tradingModeLabel: context.tradingMode.toUpperCase() + ' TRADING',
        lastModeChange: context.lastModeChange,
        changedBy: context.changedBy,
        changeReason: context.changeReason,
        timestamp: new Date().toISOString()
      };
      
      await contextBridge.broadcast({
        type: 'trading_state_changed',
        payload,
        userId, // Scope to specific user
        mode: context.tradingMode
      });
      
      console.log(`[SYNC][Phase-27.F.12] Broadcasted complete state snapshot for user ${userId}: mode=${payload.mode}, activePaper=${payload.isEngineActivePaper}, activeLive=${payload.isEngineActiveLive}`);
    } catch (error) {
      console.error(`[TradingSync] Error broadcasting update for user ${userId}:`, error);
    }
  }

  /**
   * Phase 27.F.2: Reconciliation Guard
   * Periodically checks for DB/cache mismatches and re-broadcasts state
   */
  private startReconciliationGuard(): void {
    setInterval(async () => {
      try {
        // Get all users with system context (in production, this would be scoped better)
        // For now, we'll reconcile users we have in memory
        for (const [userId, cachedMode] of this.currentMode.entries()) {
          const context = await storage.getSystemContext(userId);
          
          if (!context) {
            continue;
          }
          
          // Check for mode mismatch
          if (context.tradingMode !== cachedMode) {
            console.log(`[SYNC][Phase-27.F.3][ReconciliationGuard] Detected mode mismatch for user ${userId}: cache=${cachedMode}, db=${context.tradingMode}`);
            
            // Update cache from DB (DB is source of truth)
            this.currentMode.set(userId, context.tradingMode);
            
            // Re-broadcast to sync all clients
            await this.broadcastUserUpdate(userId);
          }
        }
      } catch (error) {
        console.error('[SYNC][Phase-27.F.3][ReconciliationGuard] Error during reconciliation:', error);
      }
    }, 15000); // Run every 15 seconds
    
    console.log('[SYNC][Phase-27.F.3][ReconciliationGuard] Started (checks every 15s)');
  }

  /**
   * Get diagnostic information
   */
  async getDiagnostics(userId: string): Promise<any> {
    const context = await storage.getSystemContext(userId);
    const currentMode = this.getTradingMode(userId);
    const isActive = await this.isEngineActive(userId);
    
    return {
      userId,
      currentMode,
      isEngineActive: isActive,
      initialized: this.initialized,
      persistedState: context ? {
        tradingMode: context.tradingMode,
        lastModeChange: context.lastModeChange,
        changedBy: context.changedBy,
        changeReason: context.changeReason,
        lastSafeState: context.lastSafeState,
        updatedAt: context.updatedAt
      } : null
    };
  }
}

// Singleton instance
export const tradingStateSync = new TradingStateSync();
