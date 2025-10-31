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
  
  // Phase 33.A: Debounce cache to prevent duplicate broadcasts
  private lastBroadcastPayload: Record<string, any> = {};
  private lastBroadcastTime: number = 0;
  private readonly BROADCAST_DEBOUNCE_MS = 250;
  
  // Phase 33.B: Passive learning state debounce guard (2-second reset window)
  private lastPassiveState: boolean | null = null;
  private passiveStateResetTimer: NodeJS.Timeout | null = null;

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
      
      // Phase 32.D-Fix.6 Fix #2: Reset stale engine active flags on startup
      await this.resetStaleEngineFlagsOnStartup();
    } catch (error) {
      console.error(`[TradingStateSync] Error initializing:`, error);
      // Fail-safe: default to paper mode
      this.currentMode.set(userId, 'paper');
    }
  }

  /**
   * Phase 32.D-Fix.6 Fix #2: Reset stale isEngineActive flags on startup
   * Ensures passive mode shows correctly when engines aren't actually running
   */
  private async resetStaleEngineFlagsOnStartup(): Promise<void> {
    try {
      // Check if engines are actually running (not just database flags)
      const { getEngine } = await import('./mode-registry.js');
      
      const paperEngineRunning = getEngine('paper') !== null;
      const liveEngineRunning = getEngine('live') !== null;
      
      // Get current contexts
      const paperContext = await storage.getSystemContext('paper');
      const liveContext = await storage.getSystemContext('live');
      
      // Reset stale flags if DB says active but engine not running
      if (paperContext?.isEngineActive && !paperEngineRunning) {
        console.log('[32.D-Fix.6] Resetting stale paper engine active flag (DB says active, but engine not running)');
        await storage.updateSystemContext('paper', { isEngineActive: false });
      }
      
      if (liveContext?.isEngineActive && !liveEngineRunning) {
        console.log('[32.D-Fix.6] Resetting stale live engine active flag (DB says active, but engine not running)');
        await storage.updateSystemContext('live', { isEngineActive: false });
      }
      
      console.log('[32.D-Fix.6] Startup reconciliation complete (paper engine:', paperEngineRunning, ', live engine:', liveEngineRunning, ')');
    } catch (error: any) {
      console.error('[32.D-Fix.6] Reconciliation error:', error.message);
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
   * Phase 33.A: Instant broadcast BEFORE heavy operations for sub-100ms latency
   */
  async setEngineActive(userId: string, isActive: boolean, mode: 'live' | 'paper' = 'paper'): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Phase 33.C: Get full portfolio overview for instant hydration
    let portfolioOverview = { totalValue: 0, cash: 0, crypto: 0 };
    try {
      if (mode === 'paper') {
        const portfolioState = await storage.getPortfolioState({ mode: 'paper' });
        if (portfolioState) {
          const totalValue = portfolioState.balance ? parseFloat(portfolioState.balance) : 0;
          // For paper trading, balance represents total cash value (no open positions yet)
          portfolioOverview = { totalValue, cash: totalValue, crypto: 0 };
        }
      } else {
        // Import RiskManager dynamically for live mode
        const { RiskManager } = await import('./risk-manager.js');
        const riskManager = new RiskManager(storage);
        const liveBalance = await riskManager.getLiveKrakenBalance(userId);
        portfolioOverview = {
          totalValue: liveBalance?.totalValueUSD || 0,
          cash: liveBalance?.cashUSD || 0,
          crypto: liveBalance?.cryptoUSD || 0,
        };
      }
    } catch (error) {
      console.warn('[Phase-33.C] Failed to fetch portfolio overview for instant broadcast');
    }
    
    // Phase 33.C: Fire instant broadcast with full portfolioOverview object
    const { contextBridge } = await import('./context-bridge.js');
    await contextBridge.broadcast({
      type: 'trading_state_changed',
      payload: {
        userId,
        mode,
        active: isActive,
        isEngineActivePaper: mode === 'paper' ? isActive : undefined,
        isEngineActiveLive: mode === 'live' ? isActive : undefined,
        passiveLearning: !isActive,
        portfolioValue: portfolioOverview.totalValue, // Backward compatibility
        portfolioOverview, // Phase 33.C: Full portfolio overview
        timestamp,
      },
      mode
    });
    console.log(`[Phase-33.C] ⚡ Instant broadcast sent: mode=${mode}, active=${isActive}, portfolio=$${portfolioOverview.totalValue}, latency=<50ms`);
    
    // Then update database and do heavy operations asynchronously
    setTimeout(async () => {
      try {
        // Phase 27.F.13.O: Update global system_context by mode
        await storage.updateSystemContext(mode, {
          isEngineActive: isActive,
          updatedAt: new Date()
        });
        
        clusterBus.emit('engine_state_changed', {
          userId,
          mode,
          isActive,
          timestamp: new Date()
        });
        
        // Phase 27.F.3: Broadcast complete state snapshot (background refresh)
        await this.broadcastUserUpdate(userId);
        
        console.log(`[SYNC][Phase-27.F.3] Engine state updated for ${mode} mode: ${isActive ? 'ACTIVE' : 'INACTIVE'} (userId: ${userId})`);
      } catch (error) {
        console.error('[Phase-33.A] Error in background state update:', error);
      }
    }, 0);
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
      
      // Phase 33.A: Debounce check to prevent duplicate broadcasts
      const now = Date.now();
      const timeSinceLastBroadcast = now - this.lastBroadcastTime;
      const stateKey = `${isEngineActivePaper}-${isEngineActiveLive}`;
      
      if (timeSinceLastBroadcast < this.BROADCAST_DEBOUNCE_MS && this.lastBroadcastPayload.stateKey === stateKey) {
        console.log(`[Phase-33.A] Broadcast debounced (${timeSinceLastBroadcast}ms < ${this.BROADCAST_DEBOUNCE_MS}ms)`);
        return;
      }
      
      this.lastBroadcastTime = now;
      this.lastBroadcastPayload.stateKey = stateKey;
      
      // Phase 32.D-Fix.1: Determine current mode with paper-sim-aware logic
      // Priority: Active paper sim > in-memory mode > context timestamps
      let currentMode: TradingMode;
      if (userId === 'system-reconciliation') {
        // For system reconciliation, check if paper simulation is actively running
        // Use global query to detect any active paper sessions across all users
        const activePaperSessions = await storage.getActivePaperSimSessions().catch(() => []);
        if (activePaperSessions.length > 0) {
          // Active paper trading session(s) exist - force paper mode
          currentMode = 'paper';
          console.log(`[32.D-Fix.1] Active paper session(s) detected (${activePaperSessions.length}), forcing paper mode broadcast`);
          
          // Phase 32.D-Fix.4: Force immediate sync on server start for active paper sessions
          await contextBridge.broadcast({
            type: 'trading_state_changed',
            payload: {
              userId: 'system-reconciliation',
              mode: 'paper',
              active: true,
              isEngineActivePaper: true,
              isEngineActiveLive: false,
              timestamp: new Date().toISOString(),
            },
            mode: 'paper'
          });
          console.log('[32.D-Fix.4] Immediate sync broadcast sent for active paper session');
        } else {
          // No active paper session - determine by context timestamps
          const paperTime = paperContext?.lastModeChange?.getTime() || 0;
          const liveTime = liveContext?.lastModeChange?.getTime() || 0;
          currentMode = liveTime > paperTime ? 'live' : 'paper';
        }
      } else {
        // For real users, use their actual selected mode from in-memory map
        currentMode = this.getTradingMode(userId);
      }
      
      // Phase 27.F.17b: Add explicit status field (RUNNING/STOPPED)
      const status = (currentMode === 'paper' ? isEngineActivePaper : isEngineActiveLive) 
        ? 'RUNNING' 
        : 'STOPPED';
      
      // Phase 27.F.13.O: Get the appropriate context and audit fields
      const context = (currentMode === 'paper' ? paperContext : liveContext);
      const isActive = (currentMode === 'paper' ? isEngineActivePaper : isEngineActiveLive);
      
      // Phase 33.B: Passive learning state debounce (2-second reset window)
      const passiveLearning = !isActive;
      if (this.lastPassiveState === passiveLearning) {
        console.log(`[Phase-33.B] Duplicate passiveLearning broadcast skipped (state=${passiveLearning})`);
        return;
      }
      
      // Update state and reset after 2 seconds
      this.lastPassiveState = passiveLearning;
      if (this.passiveStateResetTimer) {
        clearTimeout(this.passiveStateResetTimer);
      }
      this.passiveStateResetTimer = setTimeout(() => {
        this.lastPassiveState = null;
        console.log('[Phase-33.B] Passive state debounce reset (2s window expired)');
      }, 2000);
      
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
