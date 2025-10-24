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
   * Phase 27.F.14.D: Fixed to use mode-based system context (not userId)
   * Check both paper and live contexts to recover the actual persisted mode
   */
  async initialize(userId: string): Promise<void> {
    try {
      // Phase 27.F.14.D: Check both paper and live contexts to recover actual mode
      const [paperContext, liveContext] = await Promise.all([
        storage.getSystemContext('paper'),
        storage.getSystemContext('live')
      ]);
      
      // Determine which mode was last active based on timestamps
      let activeMode: 'paper' | 'live' = 'paper'; // default
      let activeContext = paperContext;
      
      if (liveContext && paperContext) {
        // Compare last mode change timestamps to find most recent
        const liveTimestamp = liveContext.lastModeChange?.getTime() || 0;
        const paperTimestamp = paperContext.lastModeChange?.getTime() || 0;
        if (liveTimestamp > paperTimestamp) {
          activeMode = 'live';
          activeContext = liveContext;
        }
      } else if (liveContext && !paperContext) {
        activeMode = 'live';
        activeContext = liveContext;
      }
      
      if (activeContext) {
        // Global mode architecture: all users share same mode per instance
        this.currentMode.set(userId, activeContext.tradingMode);
        console.log(`[TradingStateSync] Initialized (mode=${activeContext.tradingMode})`);
        
        // Emit recovery event
        clusterBus.emit('trading_state_recovered', {
          userId,
          mode: activeContext.tradingMode,
          lastChange: activeContext.lastModeChange,
          timestamp: new Date()
        });
      } else {
        // Initialize with default paper mode if no contexts exist
        await this.setTradingMode(userId, 'paper', 'system', 'Initial setup');
        console.log(`[TradingStateSync] Initialized (mode=paper)`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error(`[TradingStateSync] Error initializing:`, error);
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
   * Phase 27.F.14.D: Updated to use mode-based system context
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
    
    // Phase 27.F.14.D: Persist to database using mode-based context
    const context = await storage.upsertSystemContext({
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
    
    console.log(`[SYNC][Phase-27.F.3] Trading mode changed: ${previousMode} → ${newMode} (by: ${changedBy})`);
    
    return context;
  }

  /**
   * Phase 27.F.3: Update engine active state with full state broadcast
   * Phase 27.F.13.O: Refactored to use mode-based global context
   */
  async setEngineActive(userId: string, isActive: boolean, mode: 'live' | 'paper' = 'paper'): Promise<void> {
    // Phase 27.F.13.O: Update global system_context by mode
    await storage.updateSystemContext(mode, {
      isEngineActive: isActive,
      updatedAt: new Date()
    });
    
    clusterBus.emit('engine_state_changed', {
      userId,
      mode, // Phase 27.F.13.O: Include mode in event
      isActive,
      timestamp: new Date()
    });
    
    // Phase 27.F.3: Broadcast complete state snapshot via broadcastUserUpdate
    await this.broadcastUserUpdate(userId);
    
    console.log(`[SYNC][Phase-27.F.3] Engine state updated for ${mode} mode: ${isActive ? 'ACTIVE' : 'INACTIVE'} (userId: ${userId})`);
  }

  /**
   * Get engine active state
   * Phase 27.F.13.O: Refactored to use mode parameter
   */
  async isEngineActive(mode: 'live' | 'paper' = 'paper'): Promise<boolean> {
    const context = await storage.getSystemContext(mode);
    return context?.isEngineActive || false;
  }

  /**
   * Emergency stop - force paper mode and disable engine
   * Phase 27.F.14.D: Updated to use mode-based system context
   */
  async emergencyStop(userId: string, reason: string): Promise<void> {
    console.warn(`[TradingStateSync] EMERGENCY STOP triggered: ${reason}`);
    
    const previousMode = this.getTradingMode(userId);
    
    // Force paper mode
    this.currentMode.set(userId, 'paper');
    
    // Phase 27.F.14.D: Persist emergency state using mode-based context (paper mode)
    await storage.upsertSystemContext({
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
   * Phase 27.F.14.D: Updated to use mode-based system context
   */
  async restoreLastSafeState(userId: string): Promise<SystemContext | undefined> {
    // Phase 27.F.14.D: Get current mode for this user, then check that mode's context
    const currentMode = this.getTradingMode(userId);
    const context = await storage.getSystemContext(currentMode);
    
    if (!context || !context.lastSafeState) {
      console.warn(`[TradingStateSync] No safe state to restore (current mode: ${currentMode})`);
      return undefined;
    }
    
    const lastSafeState = context.lastSafeState as any;
    const safeMode = lastSafeState.mode || 'paper';
    
    console.log(`[TradingStateSync] Restoring to last safe state: ${safeMode} (from ${currentMode} context)`);
    
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
   * Phase 27.F.13.O: Refactored to use mode-based global broadcasts
   * Called after any start/stop/mode change action
   */
  async broadcastUserUpdate(userId: string): Promise<void> {
    try {
      // Phase 27.F.13.O: Get global system context for both modes
      const paperContext = await storage.getSystemContext('paper');
      const liveContext = await storage.getSystemContext('live');
      
      if (!paperContext && !liveContext) {
        console.warn(`[TradingSync] No context found for any mode, skipping broadcast`);
        return;
      }
      
      // Phase 27.F.13.O: Compute mode-specific engine states from global contexts
      const isEngineActivePaper = paperContext?.isEngineActive || false;
      const isEngineActiveLive = liveContext?.isEngineActive || false;
      
      // Determine current mode from user's last action (defaulting to paper)
      const currentMode = paperContext?.tradingMode || 'paper';
      
      // Phase 27.F.17b: Add explicit status field (RUNNING/STOPPED)
      const status = (currentMode === 'paper' ? isEngineActivePaper : isEngineActiveLive) 
        ? 'RUNNING' 
        : 'STOPPED';
      
      // Phase 27.F.13.O: Get the appropriate context and audit fields
      const context = (currentMode === 'paper' ? paperContext : liveContext);
      const isActive = (currentMode === 'paper' ? isEngineActivePaper : isEngineActiveLive);
      
      const payload = {
        userId, // Keep for audit trail
        mode: currentMode,
        status, // Phase 27.F.17b: Explicit RUNNING/STOPPED status
        isEngineActive: isActive,
        active: isActive, // Keep both for backwards compatibility
        // Phase 27.F.12: Add mode-specific status
        isEngineActivePaper,
        isEngineActiveLive,
        tradingModeLabel: currentMode.toUpperCase() + ' TRADING',
        lastModeChange: context?.lastModeChange,
        // Phase 27.F.13.O: Audit fields - show who started/stopped based on current state
        lastStartedBy: context?.lastStartedBy,
        lastStoppedBy: context?.lastStoppedBy,
        changedBy: isActive ? context?.lastStartedBy : context?.lastStoppedBy,
        changeReason: 'Engine state changed',
        timestamp: new Date().toISOString()
      };
      
      // Phase 27.F.13.O: Global mode-based broadcast (NO userId filter)
      await contextBridge.broadcast({
        type: 'trading_state_changed',
        payload,
        mode: currentMode // Mode-scoped, all clients receive
      });
      
      console.log(`[SYNC][Phase-27.F.13.O] Broadcasted global state snapshot for ${currentMode} mode: activePaper=${payload.isEngineActivePaper}, activeLive=${payload.isEngineActiveLive} (initiated by userId: ${userId})`);
    } catch (error) {
      console.error(`[TradingSync] Error broadcasting update for userId ${userId}:`, error);
    }
  }

  /**
   * Phase 27.F.2: Reconciliation Guard
   * Phase 27.F.13.O: Refactored to use mode-based global context
   * Periodically checks for DB/cache mismatches and re-broadcasts state
   */
  private startReconciliationGuard(): void {
    setInterval(async () => {
      try {
        // Phase 27.F.13.O: Check both global mode contexts
        const paperContext = await storage.getSystemContext('paper');
        const liveContext = await storage.getSystemContext('live');
        
        // Broadcast state for both modes if they exist
        if (paperContext || liveContext) {
          // Use a dummy userId for broadcast trigger (actual broadcast is global)
          const triggerUserId = 'system-reconciliation';
          await this.broadcastUserUpdate(triggerUserId);
          
          console.log(`[SYNC][Phase-27.F.13.O][ReconciliationGuard] Reconciliation broadcast sent (paper: ${paperContext?.isEngineActive || false}, live: ${liveContext?.isEngineActive || false})`);
        }
      } catch (error) {
        console.error('[SYNC][Phase-27.F.3][ReconciliationGuard] Error during reconciliation:', error);
      }
    }, 15000); // Run every 15 seconds
    
    console.log('[SYNC][Phase-27.F.13.O][ReconciliationGuard] Started (checks every 15s, global mode-based)');
  }

  /**
   * Get diagnostic information
   * Phase 27.F.14.D: Updated to use mode-based system context
   */
  async getDiagnostics(userId: string): Promise<any> {
    const currentMode = this.getTradingMode(userId);
    const context = await storage.getSystemContext(currentMode);
    const isActive = await this.isEngineActive(currentMode);
    
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
