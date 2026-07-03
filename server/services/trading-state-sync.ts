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
import type { AssetClass } from '@shared/asset-classes';

export type TradingMode = 'live' | 'paper';

export interface TradingStateChangeEvent {
  userId: string;
  previousMode: TradingMode;
  newMode: TradingMode;
  changedBy: string;
  changeReason: string;
  timestamp: Date;
}

// P19-B4b D5 — pure, testable helpers for the liveness invariant-check (the Phase-21 co-run
// witness). Extracted so the "split-fires-on-disagreement" and "settling-suppresses-in-flight"
// logic can be unit-tested without mocking the engine/orchestrator/vtsAudit module graph.

/** True once a flip has settled (no false-positive while a start/stop transition is in flight). */
export function isFlipSettled(now: number, flippedAt: number, settlingMs: number): boolean {
  return now - flippedAt >= settlingMs;
}

/**
 * The per-mode liveness invariant: the DB `isEngineActive(mode)` SSOT must equal engine presence
 * (and, for paper, orchestrator presence). Returns one entry per disagreement (empty = consistent).
 * `orchestratorPresent` is null when not applicable (live has no orchestrator in this slot).
 */
export function livenessSplitsForMode(
  mode: TradingMode,
  dbActive: boolean,
  enginePresent: boolean,
  orchestratorPresent: boolean | null
): Array<{ key: string; reason: string }> {
  const out: Array<{ key: string; reason: string }> = [];
  if (dbActive !== enginePresent) {
    out.push({ key: mode, reason: `db=${dbActive} vs enginePresent=${enginePresent}` });
  }
  if (mode === 'paper' && orchestratorPresent !== null && dbActive !== orchestratorPresent) {
    out.push({ key: 'paper-orchestrator', reason: `db=${dbActive} vs orchestratorPresent=${orchestratorPresent}` });
  }
  return out;
}

/**
 * P19-B6.5a — the single typed per-asset-class gate read. Fail-closed: a missing context, a missing
 * key, a non-object column, or a non-`true` value all resolve to FALSE. Pure + synchronous so the
 * active-path entry gates (which already hold a freshly-fetched SystemContext) call it with NO extra
 * DB query — never reading the raw JSONB at the call site. The async `isAssetClassActive(mode,class)`
 * method delegates to this for callers that don't already hold the context.
 */
export function isAssetClassActiveInContext(
  context: SystemContext | undefined,
  assetClass: AssetClass
): boolean {
  const map = (context?.activeAssetClasses ?? {}) as Record<string, unknown>;
  return map[assetClass] === true;
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
  
  // Directive 11.7I-02: ReconciliationGuard state-diff tracking
  private lastReconciliationState: string | null = null;

  // P19-B4b D5 (liveness consolidation, H2): per-mode last-flip timestamp = settling guard,
  // so the reconciliation invariant-check does NOT false-positive on an in-flight start/stop
  // transition that straddles a reconciliation tick. Stamped in setEngineActive.
  private lastEngineFlipAt: Map<TradingMode, number> = new Map();
  private readonly LIVENESS_SETTLING_MS = 15000; // ignore divergence within 15s of a flip
  // P19-B4b D5: observable LIVENESS_SPLIT witness (B3b counter discipline). If any entry's
  // count is > 0 during a paper+live co-run dry-run, the Phase-21 flip is BLOCKED.
  private livenessSplitStats: Map<string, { count: number; lastReason: string; lastAt: number }> = new Map();

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
        // [9.6.3] Live mode - ALWAYS use Kraken valuation for consistency
        try {
          const { KrakenService } = await import('./kraken.js');
          const { priceCache } = await import('./price-cache.js');
          const krakenBalance = await new KrakenService().getAccountBalance();
          const usdBalance = parseFloat(krakenBalance.ZUSD || krakenBalance.USD || '0');
          
          // Calculate crypto value using live prices from price cache
          let cryptoUSD = 0;
          const assetMap: Record<string, string> = {
            'XXBT': 'BTC/USD', 'XBT': 'BTC/USD',
            'XETH': 'ETH/USD', 'ETH': 'ETH/USD',
            'XSOL': 'SOL/USD', 'SOL': 'SOL/USD',
            'XXRP': 'XRP/USD', 'XRP': 'XRP/USD',
          };
          for (const [asset, amount] of Object.entries(krakenBalance)) {
            if (asset === 'ZUSD' || asset === 'USD') continue;
            const amountNum = parseFloat(String(amount) || '0');
            if (amountNum <= 0) continue;
            const symbol = assetMap[asset] || `${asset.replace(/^X/, '')}/USD`;
            const livePrice = priceCache.getCachedPrice(symbol);
            if (livePrice && livePrice.price > 0) cryptoUSD += amountNum * livePrice.price;
          }
          
          portfolioOverview = { totalValue: usdBalance + cryptoUSD, cash: usdBalance, crypto: cryptoUSD };
        } catch (krakenError: any) {
          console.warn('[9.6.3] Kraken balance fetch failed:', krakenError.message);
          portfolioOverview = { totalValue: 0, cash: 0, crypto: 0 };
        }
      }
    } catch (error) {
      console.warn('[Phase-33.C] Failed to fetch portfolio overview for instant broadcast');
    }
    
    // P19-B4b D5 (liveness H1): WRITE-THEN-BROADCAST, ordered ON COMMIT.
    // Pre-fix this was an instant broadcast followed by a setTimeout(…,0) deferred DB write —
    // the broadcast beat the DB write, so the DB SSOT trailed every derived reader by a tick
    // (the root cause of the 5-reader liveness divergence). Now: stamp the settling window,
    // AWAIT the authoritative DB write, and only broadcast AFTER it commits. If the write
    // throws, nothing is broadcast (no derived reader is told a state the DB never persisted).
    this.lastEngineFlipAt.set(mode, Date.now());

    // Phase 27.F.13.O: Persist the authoritative per-mode DB SSOT FIRST (awaited).
    await storage.updateSystemContext(mode, {
      isEngineActive: isActive,
      updatedAt: new Date()
    });

    // Write committed → fan out to every derived reader.
    const { contextBridge } = await import('./context-bridge.js');
    const stateVersion = Date.now(); // REB 2.4 Stage-1f: Generate stateVersion for engine_start
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
        stateVersion, // REB 2.4 Stage-1f: Add stateVersion to engine state broadcasts
        timestamp,
      },
      mode
    });
    console.log(`[STAGE1G][ACK] engine_start broadcasted v=${stateVersion} for ${mode}`);

    clusterBus.emit('engine_state_changed', {
      userId,
      mode,
      isActive,
      timestamp: new Date()
    });

    // Re-stamp the settling window from broadcast time so the invariant-check gives downstream
    // readers (vtsModeAudit, engine teardown) the full window to converge before it asserts.
    this.lastEngineFlipAt.set(mode, Date.now());

    // Phase 27.F.3: Broadcast complete state snapshot (secondary refresh). The state is already
    // committed + broadcast above, so a failure of this secondary snapshot must NOT fail the call.
    try {
      await this.broadcastUserUpdate(userId);
    } catch (error) {
      console.error('[P19-B4b-H1] secondary snapshot broadcast failed (state already committed+broadcast):', error);
    }

    console.log(`[SYNC][P19-B4b-H1] Engine state committed-then-broadcast for ${mode}: ${isActive ? 'ACTIVE' : 'INACTIVE'} v=${stateVersion} (userId: ${userId})`);
  }

  /**
   * Get engine active state
   * Phase 27.F.13.O: Refactored to use mode parameter
   */
  async isEngineActive(mode: 'live' | 'paper' = 'paper'): Promise<boolean> {
    const context = await storage.getSystemContext(mode);
    return context?.isEngineActive || false;
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // P19-B6.5a — PER-ASSET-CLASS ACTIVE GATE (Langston Option C).
  //
  // An ADDITIONAL, fail-closed, default-OFF gate layered on top of the per-mode `isEngineActive`
  // master switch. A class is active in a mode IFF the per-mode `system_context.active_asset_classes`
  // JSONB carries `<class>: true`. A MISSING key = inactive = FAIL-CLOSED. Active-path entry points
  // (fx5-scanner crypto scan, xstock_spot/active-dispatch) gate on `isEngineActive(mode) AND
  // isAssetClassActive(mode, class)`, so B7b can activate crypto-first while xStock stays dormant
  // under the same master flag. The setter mirrors `setEngineActive`'s H1 discipline:
  // AWAIT the authoritative DB write FIRST, then broadcast.
  // ════════════════════════════════════════════════════════════════════════════════════════

  /** P19-B6.5a per-class gate-decision witness (reuses the LIVENESS_SPLIT observability discipline):
   *  counts gate ALLOW/SKIP per (mode, class) so a crypto-only run is provably xStock-silent, and a
   *  class that emits while gated-OFF is observable (recordLivenessSplit), never silent. */
  private assetClassGateStats: Map<string, { allowed: number; skipped: number; lastAt: number }> = new Map();

  /**
   * Typed accessor — is this asset class active in this mode? Fail-closed: a missing key, a non-object
   * column, or any read error all resolve to FALSE (never accidentally-active). NEVER read the raw
   * JSONB elsewhere — this is the single typed gate.
   */
  async isAssetClassActive(mode: 'live' | 'paper', assetClass: AssetClass): Promise<boolean> {
    try {
      const context = await storage.getSystemContext(mode);
      return isAssetClassActiveInContext(context, assetClass);
    } catch (err) {
      // Fail-closed: an unreadable state must never green-light a class.
      console.warn(`[P19-B6.5a][isAssetClassActive] read failed for ${mode}/${assetClass} — fail-closed OFF:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * Setter — flip a per-(mode, class) active flag. Mirrors `setEngineActive`'s P19-B4b-D5/H1 ordering:
   * AWAIT the authoritative DB write FIRST (merge into the JSONB, never clobber sibling classes), then
   * broadcast. If the write throws, nothing is broadcast (no reader is told a state the DB never holds).
   * Guarded entry point for the B6.5b dry-run + the eventual B7b flip.
   */
  async setAssetClassActive(userId: string, mode: 'live' | 'paper', assetClass: AssetClass, isActive: boolean): Promise<void> {
    // Read-merge-write so flipping one class never clobbers another's flag.
    const context = await storage.getSystemContext(mode);
    const current = { ...((context?.activeAssetClasses ?? {}) as Record<string, boolean>) };
    current[assetClass] = isActive;

    // H1: persist the authoritative DB SSOT FIRST (awaited) — only broadcast after it commits.
    await storage.updateSystemContext(mode, {
      activeAssetClasses: current as SystemContext['activeAssetClasses'],
      updatedAt: new Date(),
    });

    // Write committed → fan out a lightweight state-change so derived readers re-read.
    // (Uses the static contextBridge import at the top of the file — Langston Step-4 cleanup.)
    try {
      await contextBridge.broadcast({
        type: 'trading_state_changed',
        payload: { userId, mode, assetClassGate: { assetClass, active: isActive }, timestamp: new Date().toISOString() },
        mode,
      });
    } catch (err) {
      // State is already committed; a failed secondary broadcast must not fail the flip.
      console.error('[P19-B6.5a][setAssetClassActive] post-commit broadcast failed (state already persisted):', err instanceof Error ? err.message : err);
    }
    console.log(`[P19-B6.5a][setAssetClassActive] ${mode}/${assetClass} → ${isActive ? 'ACTIVE' : 'INACTIVE'} (committed-then-broadcast, userId: ${userId})`);
  }

  /** Witness: record a per-class gate decision at an active-path entry point (observable; for the
   *  xStock-isolation acceptance test + diagnostics). `allowed=false` = the normal dormant skip. */
  recordAssetClassGateDecision(mode: 'live' | 'paper', assetClass: AssetClass, allowed: boolean): void {
    const key = `${mode}:${assetClass}`;
    const s = this.assetClassGateStats.get(key) ?? { allowed: 0, skipped: 0, lastAt: 0 };
    if (allowed) s.allowed++; else s.skipped++;
    s.lastAt = Date.now();
    this.assetClassGateStats.set(key, s);
  }

  /** Hard witness: a class produced active output while its gate is OFF — a real isolation breach.
   *  Reuses the LIVENESS_SPLIT counter (Langston Q-D) so the breach is observable, never silent. */
  witnessAssetClassEmissionWhileInactive(mode: 'live' | 'paper', assetClass: AssetClass): void {
    this.recordLivenessSplit(`asset-class-gate:${mode}:${assetClass}`, `${assetClass} emitted active output while gate INACTIVE in ${mode}`);
  }

  /** Expose the per-class gate witness for diagnostics + the B6.5b dry-run isolation proof. */
  getAssetClassGateStats(): Record<string, { allowed: number; skipped: number; lastAt: number }> {
    return Object.fromEntries(this.assetClassGateStats);
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
      
      // Phase 32.D-Fix.1: Determine current mode with active-engine-aware logic
      // Priority: Active paper sim > in-memory mode > context timestamps
      let currentMode: TradingMode;
      if (userId === 'system-reconciliation') {
        // For system reconciliation, check if paper simulation is actively running
        // Use global query to detect any active paper sessions across all users
        const activePaperSessions = await storage.getRunningEngineSessions().catch(() => []);
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
      
      // REB 2.8.6B: passiveLearning is derived only (!isActive), NOT persisted to SystemConfig
      // This is computed in-memory and included in broadcasts for UI convenience
      console.log(
        '[REB 2.8.6B][PassiveLearning]',
        'Derived (not persisted): passiveLearning=', passiveLearning,
        'paperActive=', isEngineActivePaper,
        'liveActive=', isEngineActiveLive,
      );
      
      // Phase 34.B: Fetch portfolioOverview for reconciliation broadcasts
      let portfolioOverview = { totalValue: 0, cash: 0, crypto: 0 };
      try {
        if (currentMode === 'paper') {
          const portfolioState = await storage.getPortfolioState({ mode: 'paper' });
          if (portfolioState?.balance) {
            const balance = parseFloat(portfolioState.balance);
            // Note: portfolioState schema only has 'balance' field. 
            // Cash defaults to balance (all funds in cash when no positions open)
            // Crypto defaults to 0 (would be calculated from open positions)
            portfolioOverview = {
              totalValue: balance,
              cash: balance, // For paper mode with no positions, cash = total balance
              crypto: 0      // Would need to calculate from open positions
            };
          }
        } else {
          // Live mode - would need to fetch from Kraken, but for now use placeholder
          // In practice, this would call riskManager.getLiveKrakenBalance()
          portfolioOverview = { totalValue: 0, cash: 0, crypto: 0 };
        }
      } catch (error) {
        console.error('[34.B][RECONCILE] Failed to fetch portfolioOverview:', error);
      }
      
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
        timestamp: new Date().toISOString(),
        // Phase 34.B: Include portfolio overview in all broadcasts
        portfolioOverview,
        passiveLearning // Phase 34.B: Include passive learning state
      };
      
      // Phase 27.F.13.O: Global mode-based broadcast (NO userId filter)
      await contextBridge.broadcast({
        type: 'trading_state_changed',
        payload,
        mode: currentMode // Mode-scoped, all clients receive
      });
      
      // Phase 34.B: Log reconciliation broadcasts with portfolio data
      if (userId === 'system-reconciliation') {
        console.log(`[34.B][RECONCILE] portfolioOverview present: totalValue=$${portfolioOverview.totalValue}, cash=$${portfolioOverview.cash}, crypto=$${portfolioOverview.crypto}`);
      }
      
      console.log(`[SYNC][Phase-27.F.13.O] Broadcasted global state snapshot for ${currentMode} mode: activePaper=${payload.isEngineActivePaper}, activeLive=${payload.isEngineActiveLive} (initiated by userId: ${userId})`);
    } catch (error) {
      console.error(`[TradingSync] Error broadcasting update for userId ${userId}:`, error);
    }
  }

  /**
   * Phase 27.F.2: Reconciliation Guard
   * Phase 27.F.13.O: Refactored to use mode-based global context
   * Directive 11.7I-02: Only broadcast when state actually changes (state-diff guard)
   * Periodically checks for DB/cache mismatches and re-broadcasts state
   */
  private startReconciliationGuard(): void {
    setInterval(async () => {
      try {
        // Phase 27.F.13.O: Check both global mode contexts
        const paperContext = await storage.getSystemContext('paper');
        const liveContext = await storage.getSystemContext('live');
        
        // Directive 11.7I-02: Build state fingerprint for comparison
        const currentStateFingerprint = JSON.stringify({
          paperActive: paperContext?.isEngineActive || false,
          liveActive: liveContext?.isEngineActive || false,
          paperMode: paperContext?.tradingMode || null,
          liveMode: liveContext?.tradingMode || null
        });
        
        // Only broadcast if state actually changed
        if (currentStateFingerprint !== this.lastReconciliationState) {
          if (paperContext || liveContext) {
            // Use a dummy userId for broadcast trigger (actual broadcast is global)
            const triggerUserId = 'system-reconciliation';
            await this.broadcastUserUpdate(triggerUserId);
            
            this.lastReconciliationState = currentStateFingerprint;
            console.log(`[SYNC][11.7I-02][ReconciliationGuard] State changed - broadcast sent (paper: ${paperContext?.isEngineActive || false}, live: ${liveContext?.isEngineActive || false})`);
          }
        } else {
          // Directive 11.7I-02: Skip broadcast when state unchanged (reduces UI flashing)
          console.log('[SYNC][11.7I-02][ReconciliationGuard] State unchanged - broadcast skipped');
        }

        // P19-B4b D5 (liveness H2): per-mode divergence invariant-check (settling-guarded).
        // The witness the Phase-21 paper+live co-run gate reads — see checkLivenessInvariants.
        await this.checkLivenessInvariants(paperContext, liveContext);
      } catch (error) {
        console.error('[SYNC][Phase-27.F.3][ReconciliationGuard] Error during reconciliation:', error);
      }
    }, 30000); // Phase 35.3.B: Increased from 15s to 30s to reduce update volume

    console.log('[35.3][SYNC][11.7I-02] Reconciliation interval = 30s (with state-diff guard)');
  }

  /**
   * P19-B4b D5 — Liveness invariant-check (the Phase-21 paper+live co-run WITNESS).
   *
   * The DB `system_context.isEngineActive` per mode is the single source of truth. The other
   * derived readers (engine presence, orchestrator presence, vtsModeAudit.tradingActive) must
   * AGREE with it. Any disagreement — after a per-mode settling window that ignores in-flight
   * start/stop transitions — increments an observable LIVENESS_SPLIT counter (B3b discipline).
   * If any counter is > 0 during a paper+live co-run dry-run, the Phase-21 flip is blocked.
   */
  private async checkLivenessInvariants(
    paperContext: any,
    liveContext: any
  ): Promise<void> {
    try {
      const now = Date.now();
      const { getEngine } = await import('./mode-registry.js');
      let getOrchestratorByMode: ((m: TradingMode) => any) | null = null;
      try {
        ({ getOrchestratorByMode } = await import('./active-engine-service.js'));
      } catch { /* active-engine-service not always importable in every context */ }

      const perMode: Array<[TradingMode, any]> = [
        ['paper', paperContext],
        ['live', liveContext],
      ];
      for (const [mode, ctx] of perMode) {
        const flippedAt = this.lastEngineFlipAt.get(mode) ?? 0;
        if (!isFlipSettled(now, flippedAt, this.LIVENESS_SETTLING_MS)) continue; // in-flight — skip
        const dbActive = ctx?.isEngineActive ?? false;
        const enginePresent = getEngine(mode) !== null;
        // Orchestrator lives under the paper manager today; only meaningful for paper.
        const orchestratorPresent = (mode === 'paper' && getOrchestratorByMode)
          ? (getOrchestratorByMode('paper') !== null)
          : null;
        for (const split of livenessSplitsForMode(mode, dbActive, enginePresent, orchestratorPresent)) {
          this.recordLivenessSplit(split.key, split.reason);
        }
      }

      // vtsModeAudit collapses both modes into ONE global bool — compare to (paperDB || liveDB).
      const anyActive = (paperContext?.isEngineActive ?? false) || (liveContext?.isEngineActive ?? false);
      const flippedAny = Math.max(
        this.lastEngineFlipAt.get('paper') ?? 0,
        this.lastEngineFlipAt.get('live') ?? 0
      );
      if (now - flippedAny >= this.LIVENESS_SETTLING_MS) {
        try {
          const { vtsModeAuditService } = await import('./vts-mode-audit.js');
          const vtsActive = vtsModeAuditService.getState()?.tradingActive ?? false;
          if (vtsActive !== anyActive) {
            this.recordLivenessSplit('vts-audit', `vtsTradingActive=${vtsActive} vs anyDbActive=${anyActive}`);
          }
        } catch { /* vts-mode-audit optional */ }
      }
    } catch (error: any) {
      console.error('[P19-B4b-H2][LivenessInvariant] check error:', error?.message);
    }
  }

  private recordLivenessSplit(key: string, reason: string): void {
    const s = this.livenessSplitStats.get(key) ?? { count: 0, lastReason: '', lastAt: 0 };
    s.count += 1;
    s.lastReason = reason;
    s.lastAt = Date.now();
    this.livenessSplitStats.set(key, s);
    console.warn(`[LIVENESS_SPLIT][${key}] ${reason} (count=${s.count})`);
  }

  /** P19-B4b D5 — expose the LIVENESS_SPLIT witness for diagnostics + the Phase-21 co-run gate. */
  getLivenessSplitStats(): Record<string, { count: number; lastReason: string; lastAt: number }> {
    return Object.fromEntries(this.livenessSplitStats);
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
