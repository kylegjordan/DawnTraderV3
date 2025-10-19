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
    
    // Phase 27.4.2: Broadcast to frontend via WebSocket (user-scoped)
    await contextBridge.broadcast({
      type: 'trading_state_changed',
      payload: {
        mode: newMode,
        active: false, // Will be updated by setEngineActive
        timestamp: new Date().toISOString()
      },
      userId, // CRITICAL: Scope to specific user to prevent cross-user leakage
      mode: newMode
    });
    
    console.log(`[TradingStateSync] Trading mode changed for user ${userId}: ${previousMode} → ${newMode} (by: ${changedBy})`);
    
    return context;
  }

  /**
   * Update engine active state
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
    
    // Phase 27.4.2: Broadcast engine state change to frontend (user-scoped)
    const context = await storage.getSystemContext(userId);
    await contextBridge.broadcast({
      type: 'trading_state_changed',
      payload: {
        mode: context?.tradingMode || 'paper',
        active: isActive,
        timestamp: new Date().toISOString()
      },
      userId, // CRITICAL: Scope to specific user to prevent cross-user leakage
      mode: context?.tradingMode || 'paper'
    });
    
    console.log(`[TradingStateSync] Engine state for user ${userId}: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
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
    
    // Phase 27.4.2: Broadcast emergency stop to frontend (user-scoped)
    await contextBridge.broadcast({
      type: 'trading_state_changed',
      payload: {
        mode: 'paper',
        active: false,
        emergency: true,
        reason,
        timestamp: new Date().toISOString()
      },
      userId, // CRITICAL: Scope to specific user to prevent cross-user leakage
      mode: 'paper'
    });
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
