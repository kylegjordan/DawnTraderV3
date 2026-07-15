/**
 * Paper Trading Simulation Service
 * Provides idempotent function calls for starting/stopping paper trading simulation
 * Uses database as single source of truth for session state
 * Integrated with ClusterBus for event coordination
 */

import { nanoid } from 'nanoid';
import { storage } from '../storage.js';
import type { InsertActiveEngineSession } from '../../shared/schema.js';
import { tradingStateSync } from './trading-state-sync.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import { activeOperationQueue } from '../utils/operation-queue.js';
import { reset24hWindow, resetHourlyScanHistory } from './fx5-24h-window.js';
import { b4Diagnostics } from './b4-diagnostics.js';
import { i1TradeLifecycleDiagnostics } from './i1-trade-lifecycle-diagnostics.js';
import { livePricingAdapter } from './live-pricing-adapter.js';
import { rtbMetricsService } from './rtb-metrics-service.js';
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { c5FinancialDiagnostics } from './c5-financial-diagnostics.js';

console.log('[41E-S][LIVE-CODE] active-engine-service.ts loaded');
console.log('[8.8.3-I3][LOADED] Trade status consistency module integrated');
console.log('[41F][QUEUE] Paper operation queue integrated');

export interface ActiveEngineResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  requiresConfirmation?: boolean; // Phase 27.F.14.D-POST: Indicates balance confirmation needed
  currentBalance?: number; // Phase 27.F.14.D-POST: Current balance for confirmation prompt
}

// Phase 41E-S / P19-B4b D5: Auto-clear orphaned managers (manager exists but no DB session).
// The stale busy-flag / operation-lock branches that used to live here were REMOVED — that
// mechanism was vestigial (superseded by activeOperationQueue since Phase 41F; verified never
// acquired anywhere, only defensively cleared). See 1-system-manual/DELETED_COMPONENTS_LOG.md.
async function clearStaleBusyFlag() {
  // Phase 41E-S: Clear orphaned managers (manager exists but no DB session)
  const hasManager = !!getGlobalActiveEngineManager();
  if (hasManager) {
    const { db } = await import('../db.js');
    const { activeEngineSessions } = await import('../../shared/schema.js');
    const { eq } = await import('drizzle-orm');
    
    const activeSessions = await db
      .select()
      .from(activeEngineSessions)
      .where(eq(activeEngineSessions.status, 'running'))
      .limit(1);
    
    const hasDbSession = activeSessions.length > 0;
    
    if (!hasDbSession) {
      console.log(`[SAFEGUARD] Detected orphaned manager - clearing...`);
      clearGlobalActiveEngineManager();
    }
  }
}

/**
 * Phase 27.F.14.D-POST: Check if portfolio balance confirmation is required
 * Returns true if balance hasn't been confirmed in the last 24 hours
 */
export async function checkBalanceConfirmationRequired(mode: 'live' | 'paper' = 'paper'): Promise<{ required: boolean; currentBalance: number | null }> {
  try {
    // Get system context to check last confirmation time
    const context = await storage.getSystemContext(mode);
    const balanceLastConfirmed = context?.balanceLastConfirmed;
    
    // Phase 41F-L.E2E-FIX: Don't inject $800 fallback, return null if missing
    const portfolioState = await storage.getPortfolioState({ mode });
    const currentBalance = portfolioState ? parseFloat(portfolioState.balance) : null;
    
    // Check if confirmation is missing or stale (>24 hours old)
    if (!balanceLastConfirmed) {
      console.log(`[ActiveEngine] Portfolio balance confirmation required (mode=${mode}, never confirmed)`);
      return { required: true, currentBalance };
    }
    
    const hoursSinceConfirmation = (Date.now() - balanceLastConfirmed.getTime()) / (1000 * 60 * 60);
    if (hoursSinceConfirmation > 24) {
      console.log(`[ActiveEngine] Portfolio balance confirmation required (mode=${mode}, last confirmed ${hoursSinceConfirmation.toFixed(1)}h ago)`);
      return { required: true, currentBalance };
    }
    
    console.log(`[ActiveEngine] Balance confirmation recent (${hoursSinceConfirmation.toFixed(1)}h ago), proceeding with start`);
    return { required: false, currentBalance };
  } catch (error) {
    console.error('[ActiveEngine] Error checking balance confirmation:', error);
    // Phase 41F-L.E2E-FIX: Return null instead of $800 fallback
    return { required: true, currentBalance: null };
  }
}

// P19-B8.5 (single-writer balance, rule 18): confirmPortfolioBalance DELETED — the
// Phase-27-era balance-confirmation system was retired by B8.2 (41D removed the gate),
// this function had ZERO callers (grep-verified 2026-07-15), and it was one of the
// enumerated non-anchor writers of portfolio_state.balance. executeReanchor is the
// sole writer. See DELETED_COMPONENTS_LOG.md.

/**
 * Phase 32.D-Fix.6 Fix #3: Async watchlist population
 * Populates watchlist in background without blocking engine startup
 * Uses batch upsert with ON CONFLICT DO NOTHING to eliminate duplicate key errors
 */
async function populateWatchlistAsync(userId: string, mode: 'paper' | 'live' = 'paper'): Promise<void> {
  const startTime = Date.now();
  console.log('[32.D-Fix.6] Starting background watchlist population...');
  
  try {
    // Check watchlist and add screener-filtered pairs if empty
    const watchlist = await storage.getWatchlist({ mode });
    if (watchlist && watchlist.length > 0) {
      console.log(`[32.D-Fix.6] Watchlist contains ${watchlist.length} pairs - skipping auto-add`);
      return;
    }
    
    console.log('[32.D-Fix.6] Empty watchlist detected - querying screener for eligible pairs');
    
    // Phase 41F-L.E2E-PURGE: Get mode-level settings
    // B79.0n.STORAGE (2026-05-21 + Langston Step 4 reclassification): empty-watchlist
    // auto-populate is a runtime crypto-trading routing path (feeds
    // krakenService.getEligiblePairs + seeds active-engine watchlist). Use explicit
    // crypto_spot per (a) crypto-intentional category, NOT the canonical-baseline helper.
    const filters = await storage.getScreenerFilters({ mode, assetClass: 'crypto_spot', filterPath: 'active_quant' });
    
    if (!filters) {
      console.log('[32.D-Fix.6] No filters found - skipping watchlist population');
      return;
    }
    
    // [9.6.3] Import helper from guardrail-settings instead of deprecated risk-manager
    const { buildSettingsFromGuardrails } = await import('./guardrail-settings.js');
    const tradingSettings = await buildSettingsFromGuardrails(mode) || {} as any;
    
    // Initialize KrakenService
    const krakenService = new KrakenService();
    
    // Query eligible pairs with safe defaults for nullable fields
    const eligiblePairs = await krakenService.getEligiblePairs({
      minVolume: filters.minVolume ?? '1000000',
      minDailyRange: tradingSettings.minDailyRange ?? '0.02',
      minPrice: filters.minPrice ?? '0.01',
      maxPrice: filters.maxPrice || undefined,
      maxBidAskSpread: filters.maxBidAskSpread ?? '0.05',
      excludeStablecoins: filters.excludeStablecoins ?? true,
      allowedTradingPairs: [],
      blacklistedSymbols: tradingSettings.blacklistedSymbols || [],
      whitelistedSymbols: tradingSettings.whitelistedSymbols || [],
      minHistoryDays: tradingSettings.minDataHistoryDays ?? 30,
      rsiMin: filters.rsiMin || undefined,
      rsiMax: filters.rsiMax || undefined,
      volatilityMin: filters.volatilityMin || undefined,
      volatilityMax: filters.volatilityMax || undefined,
    });
    
    if (eligiblePairs.length === 0) {
      console.log('[32.D-Fix.6] No eligible pairs found matching current screener filters');
      return;
    }
    
    // Cap at 10 pairs maximum
    const MAX_AUTO_PAIRS = 10;
    const pairsToAdd = eligiblePairs.slice(0, MAX_AUTO_PAIRS);
    
    console.log(`[32.D-Fix.6] Found ${eligiblePairs.length} eligible pairs, adding top ${pairsToAdd.length} to watchlist`);
    
    // Batch insert with ON CONFLICT DO NOTHING to avoid duplicate key errors
    for (const pair of pairsToAdd) {
      try {
        await storage.addWatchlistPair({
          mode,
          symbol: pair.symbol,
          baseCurrency: pair.baseCurrency,
          quoteCurrency: pair.quoteCurrency,
        });
        console.log(`[32.D-Fix.6] Added ${pair.symbol} (Vol: $${(pair.volume24h/1000000).toFixed(1)}M)`);
      } catch (error) {
        // Silently skip duplicates - not an error
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[32.D-Fix.6] Watchlist populated in ${elapsed}ms (background)`);
    
    // Phase 33.B: Broadcast background job completion
    const { contextBridge } = await import('./context-bridge.js');
    await contextBridge.broadcast({
      type: 'background_jobs_complete',
      payload: {
        job: 'watchlist_refresh',
        durationMs: elapsed,
        timestamp: new Date().toISOString(),
      },
      mode,
    });
    console.log(`[Phase-33.B] Broadcasted background_jobs_complete for watchlist (${elapsed}ms)`);
  } catch (error) {
    console.error('[32.D-Fix.6] Background watchlist population failed:', error);
  }
}

// P19-B4b D5 (S1 isolation): the active portfolio manager is now keyed BY MODE.
// Pre-fix this was a single global slot shared by paper + live — the WORST split-brain leak,
// because the manager owns the per-instance heat ceilings (MAX_OPEN_POSITIONS /
// MAX_PORTFOLIO_EXPOSURE_PERCENT / MAX_DRAWDOWN). With one slot, whichever mode registered
// last owned those ceilings for BOTH modes. Now each mode has its own manager.
// The accessors default to 'paper' so every existing paper-only caller is behavior-identical;
// live wiring (Phase 21) passes mode='live'.
// (The vestigial globalActiveEngineOperationLock / globalActiveEngineBusyFlag globals were removed —
//  superseded by activeOperationQueue since Phase 41F. See DELETED_COMPONENTS_LOG.md.)
type ActiveEngineMode = 'live' | 'paper';
declare global {
  var globalActivePortfolioManagers: Map<ActiveEngineMode, any> | undefined;
}

function _activeEngineManagers(): Map<ActiveEngineMode, any> {
  if (!global.globalActivePortfolioManagers) {
    global.globalActivePortfolioManagers = new Map();
  }
  return global.globalActivePortfolioManagers;
}

/**
 * Phase 27.F.9 / P19-B4b D5: Synchronized per-mode Manager API.
 * Provides atomic access to the active ActiveEngine manager for a given mode (default 'paper').
 */
export function getGlobalActiveEngineManager(mode: ActiveEngineMode = 'paper'): any {
  return _activeEngineManagers().get(mode) || null;
}

export function setGlobalActiveEngineManager(manager: any, mode: ActiveEngineMode = 'paper'): void {
  _activeEngineManagers().set(mode, manager);
  console.log(`[ActiveEngineService] Manager registered globally (mode=${mode})`);
}

export function clearGlobalActiveEngineManager(mode: ActiveEngineMode = 'paper'): void {
  _activeEngineManagers().delete(mode);
  console.log(`[ActiveEngineService] Manager cleared from global scope (mode=${mode})`);
}

/**
 * Phase 8.8.3-B7.A: Get engine instance by mode for direct reset
 * Used by ActiveSessionResetService when no manager is available
 */
export function getEngineByMode(mode: 'paper' | 'live'): any | null {
  const manager = getGlobalActiveEngineManager();
  if (manager && typeof manager.getEngine === 'function') {
    return manager.getEngine();
  }
  // Try to get engine from global scope if manager doesn't expose it
  if (mode === 'paper' && (global as any).globalPaperEngine) {
    return (global as any).globalPaperEngine;
  }
  return null;
}

/**
 * Phase 8.8.3-B7.A: Get orchestrator instance by mode for direct reset
 * Used by ActiveSessionResetService when no manager is available
 */
export function getOrchestratorByMode(mode: 'paper' | 'live'): any | null {
  const manager = getGlobalActiveEngineManager();
  if (manager && typeof manager.getOrchestrator === 'function') {
    return manager.getOrchestrator();
  }
  // Try to get orchestrator from global scope if manager doesn't expose it
  if (mode === 'paper' && (global as any).globalPaperOrchestrator) {
    return (global as any).globalPaperOrchestrator;
  }
  return null;
}

/**
 * Phase 8.8.3-I3: Reconcile incomplete trades on stop
 * 
 * After force-closing all open positions, this function ensures data consistency by:
 * 1. Finding all trades with closed_at = NULL (incomplete trades)
 * 2. For each incomplete trade:
 *    - If a matching open position exists → leave as open (active trade)
 *    - If NO matching open position exists → close it with close_reason='engine_stop_cleanup'
 * 
 * This eliminates "Open – Not Closed Yet" entries in Trade History after a stop.
 * 
 * @param mode Trading mode ('paper' or 'live')
 * @param sessionId Current session ID for logging
 */
async function reconcileIncompleteTrades(mode: 'paper' | 'live', sessionId: string): Promise<{
  reconciled: number;
  stillOpen: number;
  errors: number;
}> {
  console.log(`[8.8.3-I3][STOP_FLOW] Reconciling incomplete trades for session=${sessionId}, mode=${mode}`);
  
  let reconciled = 0;
  let stillOpen = 0;
  let errors = 0;
  
  try {
    // Get all trades for this mode (including unclosed ones)
    const allTrades = await storage.getClosedTrades(mode, { limit: 1000 });
    
    // Filter to only trades where closed_at is NULL
    const incompleteTrades = allTrades.filter(t => t.closedAt === null);
    
    if (incompleteTrades.length === 0) {
      console.log(`[8.8.3-I3][STOP_FLOW] No incomplete trades found - reconciliation complete`);
      return { reconciled: 0, stillOpen: 0, errors: 0 };
    }
    
    console.log(`[8.8.3-I3][STOP_FLOW] Found ${incompleteTrades.length} incomplete trades to check`);
    
    // Get remaining open positions (should be 0 after force-close, but check to be safe)
    const openPositions = await storage.getActiveOpenPositions(mode);
    const openPositionSymbols = new Set(openPositions.map(p => p.symbol));
    
    for (const trade of incompleteTrades) {
      try {
        // Check if a matching open position still exists
        const hasOpenPosition = openPositionSymbols.has(trade.symbol);
        
        if (hasOpenPosition) {
          // Trade has a matching open position - it's legitimately open
          console.log(`[8.8.3-I3][STOP_FLOW] Trade ${trade.id} for ${trade.symbol} has matching open position - leaving as open`);
          stillOpen++;
          continue;
        }
        
        // No matching open position - this trade should be closed
        console.log(`[8.8.3-I3][STOP_FLOW] Closing stale trade ${trade.id} for ${trade.symbol} (no matching open position)`);
        
        // Try to get exit price from live pricing, fallback to entry price
        let exitPrice = parseFloat(trade.entryPrice);
        try {
          const priceResult = await livePricingAdapter.getPrice(trade.symbol);
          if (priceResult && priceResult.price && priceResult.source !== 'no_reliable_price') {
            exitPrice = priceResult.price;
          }
        } catch (priceErr) {
          // Use entry price as fallback
        }
        
        // Calculate P&L
        const entryPrice = parseFloat(trade.entryPrice);
        const quantity = parseFloat(trade.quantity);
        const pnl = (exitPrice - entryPrice) * quantity;
        const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
        
        // Update trade with close info
        await storage.updateClosedTrade(mode, trade.id, {
          closedAt: new Date(),
          exitPrice: exitPrice.toString(),
          pnl: pnl.toString(),
          pnlPercent: pnlPercent.toString(),
          closeReason: 'engine_stop_cleanup'
        });
        
        // Emit trade lifecycle event for diagnostics
        const strategy = trade.strategyName || 'unknown';
        i1TradeLifecycleDiagnostics.logClose(
          trade.id,
          trade.symbol,
          strategy,
          'engine_stop_cleanup',
          exitPrice,
          pnl,
          'cleanup'
        );
        
        console.log(`[8.8.3-I3][STOP_FLOW] Cleanup closed trade ${trade.id}: ${trade.symbol} exit=$${exitPrice.toFixed(4)} pnl=$${pnl.toFixed(2)}`);
        reconciled++;
        
      } catch (tradeErr) {
        console.error(`[8.8.3-I3][STOP_FLOW] Error reconciling trade ${trade.id}:`, tradeErr);
        errors++;
      }
    }
    
    console.log(`[8.8.3-I3][STOP_FLOW] Reconciliation complete: reconciled=${reconciled}, stillOpen=${stillOpen}, errors=${errors}`);
    
  } catch (err) {
    console.error(`[8.8.3-I3][STOP_FLOW] Error in reconcileIncompleteTrades:`, err);
    errors++;
  }
  
  return { reconciled, stillOpen, errors };
}

/**
 * Start paper trading simulation (IDEMPOTENT)
 * - Checks database for existing running session
 * - If running session exists, returns success with existing session info
 * - If no running session, creates new session and starts portfolio manager
 * - Emits cluster bus event on new session start
 */
export async function startActiveEngine(
  userId: string,
  options?: {
    startingBalance?: number;
    runForMs?: number;
    startedBy?: string;
    metadata?: any;
    skipAutoWatchlist?: boolean; // Phase 27.F.13.I: Skip slow Kraken API calls during startup
  }
): Promise<ActiveEngineResult> {
  const t0 = Date.now();
  console.log(`[41F][QUEUE] startActiveEngine called (userId: ${userId}, balance: ${options?.startingBalance})`);
  
  // Phase 41F: Use operation queue instead of busy flag and operation lock
  try {
    const queueResult = await activeOperationQueue.enqueue(
    async () => {
      try {
        console.log(`[41D-DEBUG-5] Checking DB for existing session (t+${Date.now()-t0}ms)`);
        // Phase 27.F.9 + Phase 3D: Mode-based session lookup
        const mode = 'paper';
        const existingSession = await storage.getRunningEngineSession(mode);
        console.log(`[41D-DEBUG-6] DB check complete - exists: ${!!existingSession} (t+${Date.now()-t0}ms)`);
        
        const existingManager = getGlobalActiveEngineManager();
        console.log(`[41D-DEBUG-7] Manager check complete - exists: ${!!existingManager} (t+${Date.now()-t0}ms)`);

        
        if (existingSession && existingManager) {
          // Phase 8.8.3-B9.FIX-WS-START: Check if manager is actually running
          // Previously this early-return prevented WebSocket from starting
          console.log('[DEBUG-B9][EARLY_RETURN_CHECK]', {
            existingSession: !!existingSession,
            existingManager: !!existingManager,
            managerIsRunning: existingManager?.getIsRunning?.() ?? 'unknown',
            sessionId: existingSession.sessionId,
          });
          
          // If manager exists but is not running, we need to start it
          if (!existingManager.getIsRunning || !existingManager.getIsRunning()) {
            console.log('[DEBUG-B9][MANAGER_NOT_RUNNING] Manager exists but not running - starting it now');
            await existingManager.start('api');
            
            // Phase 8.8.3-I6-FIX: Set trading mode to 'paper' for correct WebSocket broadcasts
            livePricingAdapter.setTradingMode('paper');
            console.log('[8.8.3-I6-FIX] LivePricingAdapter trading mode set to paper (manager restart)');
            
            return {
              success: true,
              message: 'Paper trading simulation started (manager was idle)',
              data: {
                sessionId: existingSession.sessionId,
                startedAt: existingSession.startedAt,
                status: existingSession.status,
                mode: existingSession.mode,
                isIdempotentReuse: true,
                wasRestarted: true,
              },
              shouldBroadcast: true,
            };
          }
          
          // Manager is truly running - return idempotent success
          console.log(`[ActiveEngineService] Paper trading already running (session: ${existingSession.sessionId})`);
          
          // Phase 8.8.3-I6-FIX: Ensure trading mode is correct (idempotent safety)
          livePricingAdapter.setTradingMode('paper');
          
          return {
            success: true,
            message: 'Paper trading simulation already running',
            data: {
              sessionId: existingSession.sessionId,
              startedAt: existingSession.startedAt,
              status: existingSession.status,
              mode: existingSession.mode,
              isIdempotentReuse: true,
            },
            shouldBroadcast: false, // Phase 41F-B: No broadcast needed for idempotent reuse
          };
        }
        
        if (existingSession && !existingManager) {
          // Reconcile: DB session exists but manager was lost (e.g., server restart)
          console.log('[ActiveEngineService] Reconciling manager from database session');
          const { ActivePortfolioManager } = await import('./active-portfolio-manager.js');
          // Phase 27.F.13.O + Phase 3D: Use mode instead of userId
          const manager = new ActivePortfolioManager(mode, userId);
          setGlobalActiveEngineManager(manager);
          await manager.start('api');
          
          // Phase 8.8.3-I6-FIX: Set trading mode to 'paper' for correct WebSocket broadcasts
          livePricingAdapter.setTradingMode('paper');
          console.log('[8.8.3-I6-FIX] LivePricingAdapter trading mode set to paper (reconcile)');
          
          return {
            success: true,
            message: 'Paper trading simulation already running (manager reconciled)',
            data: {
              sessionId: existingSession.sessionId,
              startedAt: existingSession.startedAt,
              status: existingSession.status,
              mode: existingSession.mode,
              isIdempotentReuse: true,
              wasReconciled: true,
            },
            shouldBroadcast: true, // Phase 41F-B: Broadcast reconciliation
          };
        }
        
        if (!existingSession && existingManager) {
          // Orphaned manager exists without DB session - clear it
          console.warn('[ActiveEngineService] Orphaned manager detected without DB session - clearing');
          clearGlobalActiveEngineManager();
        }

        // No existing session - create new one atomically
        const sessionId = `paper_${nanoid(10)}`;
        const startedAt = new Date();
        
        // Calculate end time if runForMs is specified
        const endsAt = options?.runForMs 
          ? new Date(startedAt.getTime() + options.runForMs) 
          : null;

        // Phase 27.F.9: Create session in database FIRST (source of truth)
        // Note: Single-tenant system - userId not stored in activeEngineSessions table
        // Require startingBalance to be provided (no fallback defaults)
        if (!options?.startingBalance) {
          throw new Error('startingBalance is required to start paper trading');
        }
        
        const sessionData: InsertActiveEngineSession = {
          sessionId,
          mode: 'paper',
          status: 'running',
          startingBalance: options.startingBalance.toString(),
          runForMs: options?.runForMs || null,
          endsAt: endsAt || null,
          startedBy: options?.startedBy || 'manual',
          metadata: options?.metadata || null,
        };

        console.log('[ENGINE_DB_CHECKPOINT_1] Creating paper sim session in database...');
        const dbSession = await storage.createActiveEngineSession(sessionData);
        console.log(`[ENGINE_DB_CHECKPOINT_2] Session created in database: ${sessionId}`);
        
        // [B4] Reset diagnostic session for clean data capture (after DB session created)
        b4Diagnostics.resetSession();
        console.log('[B4] Diagnostic session reset for new simulation');

        // P19-B8.5 (single-writer balance): the REB 2.8.11 previous-balance cache-for-rollback
        // was DELETED with the write it protected — the engine start no longer writes
        // portfolio_state at all (executeReanchor is the sole writer), so there is nothing
        // to roll back.

        // Phase 41F-B: Move broadcast-triggering calls OUTSIDE queue job
        // State updates will be done, but broadcasts happen after queue completes (mode already declared above)
        console.log('[ENGINE_CHECKPOINT_4] Queued job - skipping broadcasts (will fire after queue completion)');
        
        // Phase 32.D-Fix.6 Fix #3: Populate watchlist asynchronously in background
        if (!options?.skipAutoWatchlist) {
          console.log('[32.D-Fix.6] Starting watchlist population in background...');
          populateWatchlistAsync(userId, mode).catch(error => {
            console.error('[32.D-Fix.6] Background watchlist population failed:', error);
          });
        } else {
          console.log('[ENGINE_CHECKPOINT_3] Auto-watchlist SKIPPED (fast startup mode)');
        }

        // Phase 27.F.9: Create and register manager atomically (both local and global)
        // Phase 27.F.13.O: Use mode-based constructor
        console.log('[ENGINE_CHECKPOINT_8] Importing ActivePortfolioManager...');
        const { ActivePortfolioManager } = await import('./active-portfolio-manager.js');
        console.log('[ENGINE_CHECKPOINT_9] Creating manager instance...');
        const manager = new ActivePortfolioManager(mode, userId);
        
        console.log('[ENGINE_CHECKPOINT_10] Registering manager globally...');
        setGlobalActiveEngineManager(manager);
        console.log('[ENGINE_CHECKPOINT_11] Manager registered, starting manager...');
        
        // Phase 41C-FIX: Start manager synchronously with proper error handling
        // Previous async approach caused UI to show ACTIVE while engine failed silently
        try {
          await manager.start('api');
          console.log('[ENGINE_CHECKPOINT_12] Manager started successfully');
          
          // Phase 8.8.3-I6-FIX: Set trading mode to 'paper' for correct WebSocket broadcasts
          livePricingAdapter.setTradingMode('paper');
          console.log('[8.8.3-I6-FIX] LivePricingAdapter trading mode set to paper');
          
          // Phase 8.8.3-I3: Start periodic invariant check for RTB metrics
          rtbMetricsService.startInvariantCheck();
          
          // Phase 8.8.3-I4 B4: Start periodic price tick health logging
          krakenWebSocketAdapter.startPriceTickHealthLogging(async () => {
            try {
              const positions = await storage.getActiveOpenPositions('paper');
              return positions.map(p => p.symbol);
            } catch {
              return [];
            }
          });
          
          // ── P19-B8.5 (SINGLE-WRITER BALANCE — Kyle structural directive 2026-07-15,
          // Langston-endorsed; supersedes both the REB 2.8.11 write AND the morning's
          // ANCHOR_GUARD override) ──────────────────────────────────────────────────────
          // portfolio_state.balance is the WORKING COPY of the anchor ledger, and it is
          // now writable by executeReanchor ONLY (one writer, period — Kyle: "make the
          // ledger use ONLY the correct numbers and feed"). The engine start therefore
          // WRITES NOTHING here: it READS the ledger and VERIFIES the session row agrees,
          // fixing the SESSION (never the state) on divergence. The $800 incident becomes
          // structurally impossible — there is no session→state write path left to abuse;
          // the guard decayed from override-machinery into this assertion. The old
          // write-failure rollback framework (stop manager / restore previousBalance /
          // fail session) is deleted with the write it existed to protect.
          // 9.8.D retained: a session without a startingBalance is still a hard fault.
          if (!sessionData.startingBalance) {
            throw new Error('[9.8.D] CRITICAL: startingBalance is missing from session data - cannot verify against the anchor ledger');
          }
          const startBalance = parseFloat(sessionData.startingBalance);
          try {
            const { getRatioStampInputs } = await import('./portfolio-anchor-service.js');
            const anchorInputs = await getRatioStampInputs(mode as 'paper' | 'live');
            if (anchorInputs && Math.abs(startBalance - anchorInputs.anchorBalance) > 0.005) {
              console.error(
                `[P19-B8.5][ANCHOR_ASSERT] session startingBalance $${startBalance} diverges from the anchor-ledger truth ` +
                `$${anchorInputs.anchorBalance} (anchorVersion=${anchorInputs.anchorVersion}, mode=${mode}, ` +
                `sessionId=${sessionData.sessionId}, startedBy=${sessionData.startedBy ?? 'unknown'}) — ` +
                `re-aligning the SESSION row to the ledger (portfolio_state is single-writer and was not touched). ` +
                `Whatever supplied $${startBalance} is the bug; trace its route from this sessionId.`
              );
              try {
                // updateActiveEngineSession keys by the row UUID (dbSession.id), not the paper_x sessionId.
                await storage.updateActiveEngineSession(dbSession.id, { startingBalance: anchorInputs.anchorBalance.toString() } as any);
              } catch (sessFixErr: any) {
                console.error('[P19-B8.5][ANCHOR_ASSERT] session-row re-align failed (ledger remains authoritative regardless):', sessFixErr?.message ?? sessFixErr);
              }
            } else if (anchorInputs) {
              console.log(`[P19-B8.5][ANCHOR_ASSERT] session $${startBalance} == ledger $${anchorInputs.anchorBalance} (anchorVersion=${anchorInputs.anchorVersion}) — coherent, nothing written`);
            }
          } catch (assertErr: any) {
            // Assertion failure must never block an engine start — loud, not fatal.
            console.error('[P19-B8.5][ANCHOR_ASSERT] assertion evaluation failed (start proceeds; ledger remains authoritative):', assertErr?.message ?? assertErr);
          }
        } catch (managerError: any) {
          console.error('[ENGINE_ERROR] Manager start failed:', managerError);
          // Rollback on manager start failure
          clearGlobalActiveEngineManager();
          // Find the session we just created and mark it as failed
          const failedSession = await storage.getActiveEngineSessionBySessionId(sessionId);
          if (failedSession) {
            await storage.updateActiveEngineSession(failedSession.id, { status: 'failed' });
          }
          throw new Error(`Failed to start trading engine: ${managerError.message}`);
        }
        
        // Register global session for status tracking
        if (typeof (global as any).registerSimulationSession === 'function') {
          (global as any).registerSimulationSession({
            sessionId,
            startedBy: options?.startedBy || 'manual',
            startTime: startedAt,
            isRunning: true,
            type: 'paper'
          });
          console.log('[ActiveEngineService] Global session registered');
        }
        
        // Emit cluster bus event for distributed awareness
        try {
          const { clusterBus } = await import('./cluster-bus.js');
          clusterBus.emit('active_engine_started', {
            sessionId,
            userId,
            startedAt: startedAt.toISOString(),
            startedBy: options?.startedBy || 'manual',
            mode: 'paper',
          });
        } catch (busError) {
          console.warn('[ActiveEngineService] Failed to emit cluster bus event:', busError);
          // Non-blocking error - simulation still works
        }

        // Emit start acknowledgment log (backward compatibility)
        console.log(`[TradeEngine] start_ack { runId: "${sessionId}", mode: "paper", t: "${startedAt.toISOString()}" }`);
        
        // Phase 8.8.3-C5-1: Balance Reconciliation at session start
        await c5FinancialDiagnostics.logBalanceReconciliation('paper', 'session_start');
        
        return {
          success: true,
          message: 'Paper trading simulation started successfully. Monitoring live market data and executing trades in simulation mode.',
          data: {
            sessionId: dbSession.sessionId,
            startedAt: dbSession.startedAt,
            status: dbSession.status,
            mode: dbSession.mode,
            startingBalance: dbSession.startingBalance,
          },
          shouldBroadcast: true, // Phase 41F-B: Trigger broadcasts after queue completion
        };
      } catch (error: any) {
        // Phase 41C-FIX: Complete rollback - clean up manager AND database session
        clearGlobalActiveEngineManager();
        
        // Roll back database session if it was created
        try {
          const mode = 'paper';
          const existingSession = await storage.getRunningEngineSession(mode);
          if (existingSession) {
            console.log(`[ActiveEngineService] Rolling back database session: ${existingSession.sessionId}`);
            await storage.updateActiveEngineSession(existingSession.id, { status: 'failed' });
          }
        } catch (rollbackError) {
          console.error('[ActiveEngineService] Failed to rollback database session:', rollbackError);
        }
        
        console.error('[ActiveEngineService] Error during start, rollback complete:', error);
        throw error;
      }
    },
    {
      userId,
      mode: 'paper',
      action: 'start',
    }
  );
    
    // Phase 41F-B-2: Fire state sync & broadcasts OUTSIDE queue job (non-blocking)
    if (queueResult.shouldBroadcast) {
      console.log('[41F-B][BROADCAST] Firing engine state sync and broadcasts (async, non-blocking)');
      const mode = 'paper';
      
      // Update trading state (triggers internal broadcasts) - don't block HTTP response
      tradingStateSync.setEngineActive(userId, true, mode)
        .then(() => tradingStateSync.setTradingMode(userId, 'paper', userId, 'Paper simulation started'))
        .then(() => {
          console.log('[41F-B][BROADCAST] Engine state sync completed successfully');
        })
        .catch(err => {
          console.error('[41F-B][BROADCAST] Error in state sync/broadcast:', err);
        });
    }
    
    return queueResult;
  } catch (error: any) {
    console.error('[41F][QUEUE] startActiveEngine queue error:', error);
    return {
      success: false,
      message: `Error starting paper trading simulation: ${error.message}`,
      error: error.message || 'Failed to start paper trading simulation',
    };
  }
}

/**
 * Stop paper trading simulation (IDEMPOTENT)
 * - Checks database for running session
 * - If no running session, returns success (already stopped)
 * - If running session exists, stops manager and updates database
 * - Emits cluster bus event on successful stop
 */
export async function stopActiveEngine(userId: string): Promise<ActiveEngineResult> {
  console.log(`[41F][QUEUE] stopActiveEngine called (userId: ${userId})`);
  
  // Phase 41F: Use operation queue instead of busy flag and operation lock
  try {
    const queueResult = await activeOperationQueue.enqueue(
    async () => {
      try {
        // Phase 3D: Mode-based session lookup
        const mode = 'paper';
        const existingSession = await storage.getRunningEngineSession(mode);
        
        if (!existingSession) {
          // IDEMPOTENT: No running session, return success
          console.log('[ActiveEngineService] Paper trading already stopped or not started');
          
          // Phase 27.F.9: Clean up orphaned in-memory manager if exists
          const orphanedManager = getGlobalActiveEngineManager();
          if (orphanedManager) {
            console.log('[ActiveEngineService] Cleaning up orphaned manager');
            try {
              await orphanedManager.stop();
            } catch (cleanupError) {
              console.warn('[ActiveEngineService] Error cleaning up manager:', cleanupError);
            }
            clearGlobalActiveEngineManager();
          }
          
          return {
            success: true,
            message: 'Paper trading simulation already stopped',
            data: { isIdempotentReuse: true },
            shouldBroadcast: false, // Phase 41F-B: No broadcast needed for idempotent reuse
          };
        }

        // Phase 27.F.9: Stop portfolio manager and clear both references
        const currentManager = getGlobalActiveEngineManager();
        const t0 = Date.now();
        
        if (currentManager) {
          // Phase 8.8.3-I2: CORRECTED STOP SEQUENCE
          // 1. Set stop-in-progress flag FIRST to block new trades via ENGINE_STOPPING check
          console.log('[8.8.3-I2][STOP_FLOW][1_BEGIN] Hard stop sequence initiated');
          console.log('[8.8.3-I2][STOP_FLOW][2_SETTING_STOP_FLAG] ENGINE_STOPPING flag set');
          currentManager.markStopInProgress();
          
          try {
            // 2. Stop execution engine FIRST (stops signals and execution loop)
            // This prevents any new trades from being processed while we close positions
            console.log('[8.8.3-I2][STOP_FLOW][3_STOPPING_EXECUTION_ENGINE]');
            await currentManager.stop();
            console.log('[8.8.3-I2][STOP_FLOW][4_EXECUTION_ENGINE_STOPPED]');
            
            // 3. Force-close all open positions AFTER engine is stopped
            // This ensures no race condition - engine is dead, now clean up positions
            console.log('[8.8.3-I2][STOP_FLOW][5_FORCE_CLOSE_START] Closing all open positions...');
            try {
              const closeResult = await currentManager.forceCloseAllOpenPositionsOnStop();
              console.log('[8.8.3-I2][STOP_FLOW][6_FORCE_CLOSE_RESULT]', {
                closedCount: closeResult.closedCount,
                failedCount: closeResult.failedCount,
                skippedCount: closeResult.skippedCount,
                details: closeResult.details.map((d: { positionId: string; symbol: string; status: string; reason?: string }) => `${d.symbol}:${d.status}${d.reason ? ':' + d.reason : ''}`),
              });
              
              // Log each position closure for verification
              for (const detail of closeResult.details) {
                console.log(`[8.8.3-I2][STOP_FLOW][POSITION_CLOSED] ${detail.symbol} (${detail.positionId}): ${detail.status}${detail.reason ? ' - ' + detail.reason : ''}`);
              }
            } catch (closeErr) {
              console.error('[8.8.3-I2][STOP_FLOW][FORCE_CLOSE_ERROR]', closeErr);
              // Non-blocking: continue with stop even if force-close fails
            }
            
            // 4. DB verification after force-close - ensure no open positions remain
            console.log('[8.8.3-I2][STOP_FLOW][7_DB_VERIFICATION]');
            try {
              const remainingOpen = await storage.getActiveOpenPositions('paper');
              if (remainingOpen.length > 0) {
                console.error('[8.8.3-I2][STOP_FLOW][CRITICAL] OPEN POSITIONS REMAIN AFTER FORCE-CLOSE!', {
                  count: remainingOpen.length,
                  ids: remainingOpen.map(p => p.id),
                  symbols: remainingOpen.map(p => p.symbol),
                });
                
                // Attempt cleanup: mark remaining positions as closed in DB
                for (const orphan of remainingOpen) {
                  console.log(`[8.8.3-I2][STOP_FLOW][CLEANUP] Force-removing orphan position: ${orphan.symbol} (${orphan.id})`);
                  try {
                    await storage.deleteActiveOpenPosition('paper', orphan.id);
                    console.log(`[8.8.3-I2][STOP_FLOW][CLEANUP_SUCCESS] Removed orphan: ${orphan.id}`);
                  } catch (cleanupErr) {
                    console.error(`[8.8.3-I2][STOP_FLOW][CLEANUP_FAILED] Could not remove orphan: ${orphan.id}`, cleanupErr);
                  }
                }
              } else {
                console.log('[8.8.3-I2][STOP_FLOW][8_DB_VERIFICATION_PASSED] All positions successfully closed');
              }
            } catch (verifyErr) {
              console.error('[8.8.3-I2][STOP_FLOW][DB_VERIFICATION_ERROR]', verifyErr);
            }
            
            // Phase 8.8.3-I3: Reconcile incomplete trades (close stale trades without open positions)
            console.log('[8.8.3-I3][STOP_FLOW][RECONCILE_START] Checking for stale trades...');
            try {
              const reconcileResult = await reconcileIncompleteTrades('paper', existingSession.sessionId);
              console.log('[8.8.3-I3][STOP_FLOW][RECONCILE_RESULT]', reconcileResult);
            } catch (reconcileErr) {
              console.error('[8.8.3-I3][STOP_FLOW][RECONCILE_ERROR]', reconcileErr);
              // Non-blocking: continue with stop even if reconciliation fails
            }
            
            clearGlobalActiveEngineManager();
            console.log(`[8.8.3-I2][STOP_FLOW][9_COMPLETE] Manager shutdown completed in ${Date.now() - t0}ms`);
          } finally {
            // 5. Always clear the stop flag in finally block
            currentManager.clearStopInProgress();
            console.log('[8.8.3-I2][STOP_FLOW][10_STOP_FLAG_CLEARED] ENGINE_STOPPING flag cleared');
            
            // Phase 8.8.3-I3: Stop periodic invariant check for RTB metrics
            rtbMetricsService.stopInvariantCheck();
            
            // Phase 8.8.3-I4 B4: Stop periodic price tick health logging
            krakenWebSocketAdapter.stopPriceTickHealthLogging();
            
            console.log('[8.8.3-I2][STOP_FLOW][END] Hard stop sequence complete');
          }
        } else {
          console.warn('[ActiveEngineService] No active manager found, updating database only');
        }
        
        // Deregister global session
        if (typeof (global as any).deregisterSimulationSession === 'function') {
          (global as any).deregisterSimulationSession();
          console.log('[ActiveEngineService] Global session deregistered');
        }

        // Calculate final metrics
        const stoppedAt = new Date();
        const runDuration = stoppedAt.getTime() - new Date(existingSession.startedAt).getTime();

        // Update session in database (end DB session)
        const t1 = Date.now();
        console.log('[41E-S][TIMING] Starting DB session update...');
        await storage.updateActiveEngineSession(existingSession.id, {
          status: 'stopped',
          stoppedAt: stoppedAt,
          runForMs: runDuration,
        });
        console.log(`[41E-S][TIMING] DB session update completed in ${Date.now() - t1}ms`);

        // REB 2.8.5C: Reset 24h window and hourly scan history on ACTIVE → STOPPED
        console.log('[REB 2.8.5C] Resetting FX5 24h window and hourly scan history for paper mode');
        reset24hWindow('paper');
        resetHourlyScanHistory('paper');

        console.log(`[ActiveEngineService] Stopped session: ${existingSession.sessionId}, duration: ${runDuration}ms`);
        console.log('[ActiveEngineService] Manager cleared (service + global), DB session ended');
        console.log('[41F-B] Critical teardown complete, preparing HTTP response...');

        // Emit cluster bus event for distributed awareness
        try {
          const { clusterBus } = await import('./cluster-bus.js');
          clusterBus.emit('active_engine_stopped', {
            sessionId: existingSession.sessionId,
            userId,
            stoppedAt: stoppedAt.toISOString(),
            runDurationMs: runDuration,
            mode: 'paper',
          });
        } catch (busError) {
          console.warn('[ActiveEngineService] Failed to emit cluster bus event:', busError);
          // Non-blocking error
        }

        // Emit stop acknowledgment log (backward compatibility)
        console.log(`[TradeEngine] stop_ack { mode: "paper", t: "${stoppedAt.toISOString()}" }`);
        
        // Phase 8.8.3-C5-1: Balance Reconciliation at session stop/reset
        await c5FinancialDiagnostics.logBalanceReconciliation('paper', 'stop_reset');
        
        return {
          success: true,
          message: 'Paper trading simulation stopped successfully. Final report generated.',
          data: {
            sessionId: existingSession.sessionId,
            stoppedAt,
            runDurationMs: runDuration,
          },
          shouldBroadcast: true, // Phase 41F-B: Trigger broadcasts after queue completion
        };
      } catch (error: any) {
        console.error('[ActiveEngineService] Error during stop:', error);
        throw error;
      }
    },
    {
      userId,
      mode: 'paper',
      action: 'stop',
    }
  );
    
    // Phase 41F-B-2: Fire state sync & broadcasts OUTSIDE queue job (non-blocking)
    if (queueResult.shouldBroadcast) {
      console.log('[41F-B][BROADCAST] Firing engine stop state sync and broadcasts (async, non-blocking)');
      const mode = 'paper';
      const t2 = Date.now();
      
      // Update trading state (triggers internal broadcasts) - don't block HTTP response
      tradingStateSync.setEngineActive(userId, false, mode)
        .then(async () => {
          console.log(`[41F-B][BROADCAST] State sync completed in ${Date.now() - t2}ms`);
          
          // Verify system_context status in background
          const t3 = Date.now();
          const stoppedContext = await storage.getSystemContext(mode);
          console.log(`[41F-B][BROADCAST] Context verification completed in ${Date.now() - t3}ms`);
          
          if (stoppedContext && !stoppedContext.isEngineActive) {
            console.log('[41F-B][BROADCAST] ✅ Verified system_context.isEngineActive = false');
          } else {
            console.warn('[41F-B][BROADCAST] ⚠️ Failed to verify engine inactive state');
          }
        })
        .catch(err => {
          console.error('[41F-B][BROADCAST] Error in state sync/broadcast:', err);
        });
    }
    
    return queueResult;
  } catch (error: any) {
    console.error('[41F][QUEUE] stopActiveEngine queue error:', error);
    return {
      success: false,
      message: `Error stopping paper trading simulation: ${error.message}`,
      error: error.message || 'Failed to stop paper trading simulation',
    };
  }
}

/**
 * Get paper trading simulation status with state reconciliation
 * - Queries database for authoritative session state
 * - Reconciles with in-memory manager state
 * - Returns unified status with diagnostics
 */
export async function getActiveEngineStatus(userId: string): Promise<any> {
  try {
    // Phase 3D: Get session from database using mode (single source of truth)
    const mode = 'paper';
    const dbSession = await storage.getRunningEngineSession(mode);
    
    // Get in-memory manager state (check for both null and undefined)
    const hasManager = !!getGlobalActiveEngineManager('paper');
    
    // State reconciliation diagnostics
    const isConsistent = (dbSession !== undefined) === hasManager;
    
    if (!isConsistent) {
      console.warn('[ActiveEngineService] State desync detected:', {
        hasDbSession: !!dbSession,
        hasManager,
        sessionId: dbSession?.sessionId || null,
      });
    }

    return {
      isRunning: !!dbSession || hasManager,
      sessionInfo: dbSession ? {
        sessionId: dbSession.sessionId,
        startTime: dbSession.startedAt,
        mode: dbSession.mode,
        status: dbSession.status,
        startedBy: dbSession.startedBy,
        startingBalance: dbSession.startingBalance,
        runForMs: dbSession.runForMs,
        endsAt: dbSession.endsAt,
      } : null,
      diagnostics: {
        hasDbSession: !!dbSession,
        hasManager,
        isConsistent,
        reconciliationNeeded: !isConsistent,
      },
    };
  } catch (error: any) {
    console.error('[ActiveEngineService] Error getting status:', error);
    return {
      isRunning: false,
      sessionInfo: null,
      error: error.message,
    };
  }
}

/**
 * Phase 27.F.8: Reset ActiveEngine service state
 * Clears all in-memory state to ensure clean startup
 * Call this on server boot to prevent ghost managers from persisting across restarts
 */
export function resetActiveEngineService(): void {
  console.log('[ActiveEngineService] Resetting service state...');
  
  // Clear in-memory manager (per-mode). P19-B4b D5: routed through the accessor; the vestigial
  // operation-lock clear was removed (mechanism deleted — see DELETED_COMPONENTS_LOG.md).
  const orphanedManager = getGlobalActiveEngineManager('paper');
  if (orphanedManager) {
    console.log('[ActiveEngineService] Clearing orphaned manager from previous session');
    try {
      // Attempt graceful stop if manager has stop method
      if (typeof orphanedManager.stop === 'function') {
        orphanedManager.stop().catch((err: any) => {
          console.warn('[ActiveEngineService] Error during manager cleanup:', err);
        });
      }
    } catch (error) {
      console.warn('[ActiveEngineService] Failed to stop orphaned manager:', error);
    }
    clearGlobalActiveEngineManager('paper');
  }

  console.log('[ActiveEngineService] ✅ Reset complete - clean state confirmed');
  console.log('[ActiveEngineService] Initialized - no active sessions');
  console.log('[ActiveEngineService] State: { hasManager: false, hasDbSession: false }');
}

/**
 * R9.3.HF-4.FIX: Resume active engines after server restart
 * Checks trading state and restarts engines that should be running
 * This ensures Central Clock subscribers (TCL watchdog, FX5 scanner, Stage3 emitter) are rehydrated
 */
export async function resumeActiveEngines(): Promise<void> {
  console.log('[R9.3.HF-4.FIX] Checking for engines that should be resumed...');
  
  try {
    // Check if paper engine should be running
    const paperContext = await storage.getSystemContext('paper');
    const isPaperActive = paperContext?.isEngineActive === true;
    
    console.log(`[R9.3.HF-4.FIX] Paper engine state: isEngineActive=${isPaperActive}`);
    
    if (isPaperActive) {
      console.log('[R9.3.HF-4.FIX] Paper engine should be running - resuming...');
      
      // Check if there's an existing session in the database
      const existingSession = await storage.getRunningEngineSession('paper');
      
      if (existingSession) {
        console.log(`[R9.3.HF-4.FIX] Found active session: ${existingSession.sessionId}`);

        // P19-B8.2 (OBJ-2, resume-hardening seam 1 of 2): the resume REFUSES —
        // loudly, with zero writes — when the session row's balance OR the
        // persisted portfolio balance is absent/NULL/unparseable. The engine
        // must never wake up believing an invented number (the deleted schema
        // defaults were exactly that vector). The app layer owns this invariant;
        // the schema NOT NULL constraint is only the backstop.
        const sessionBalance = Number.parseFloat(String(existingSession.startingBalance ?? ''));
        const { getAnchorState } = await import('./portfolio-anchor-service.js');
        const anchorState = await getAnchorState('paper');
        if (!Number.isFinite(sessionBalance) || sessionBalance <= 0 || !anchorState || !(anchorState.balance > 0)) {
          const detail =
            `session.startingBalance=${existingSession.startingBalance ?? 'ABSENT'}, ` +
            `portfolio_state=${anchorState ? `$${anchorState.balance}` : 'NO ROW'}`;
          console.error(`[B8.2][RESUME-REFUSED] Paper resume refused — no trustworthy balance (${detail}). isEngineActive reset to false; start a new session.`);
          await storage.updateSystemContext('paper', { isEngineActive: false });
          try {
            const { addAlert } = await import('./system-alerts.js');
            await addAlert({
              triggers_at: new Date(),
              title: 'Paper engine resume REFUSED — no trustworthy balance',
              body: `The restart found a running paper session but could not establish a real balance (${detail}). The engine did NOT start and nothing was written. Start a new session (Kraken-mirror) or investigate the session row.`,
              severity: 'warning',
              category: 'breakage',
              metadata: { sessionId: existingSession.sessionId },
              dedupe_key: 'b8-2-resume-refused-paper',
            });
          } catch (alertErr: any) {
            console.error(`[B8.2][RESUME-REFUSED] alert write failed: ${alertErr?.message}`);
          }
          return;
        }

        // Import and start the manager
        const { ActivePortfolioManager } = await import('./active-portfolio-manager.js');
        const manager = new ActivePortfolioManager('paper', existingSession.startedBy || 'system-resume');
        setGlobalActiveEngineManager(manager);
        await manager.start('internal');
        
        // Set trading mode for live pricing
        livePricingAdapter.setTradingMode('paper');
        
        // Broadcast state change
        const { clusterBus } = await import('./cluster-bus.js');
        clusterBus.emit('trading_state_changed', {
          type: 'trading_state_changed',
          payload: {
            mode: 'paper',
            status: 'RUNNING',
            isEngineActive: true,
            isEngineActivePaper: true,
            changeReason: 'Engine resumed after server restart',
            timestamp: new Date().toISOString(),
          },
          mode: 'paper',
          timestamp: new Date().toISOString(),
        });
        
        console.log('[R9.3.HF-4.FIX] ✅ Paper engine resumed successfully');
      } else {
        console.log('[R9.3.HF-4.FIX] No active session found - resetting isEngineActive to false');
        await storage.updateSystemContext('paper', { isEngineActive: false });
      }
    } else {
      console.log('[R9.3.HF-4.FIX] Paper engine is not active - no resume needed');
    }
    
    // Check live engine too (for completeness, though usually handled separately)
    const liveContext = await storage.getSystemContext('live');
    const isLiveActive = liveContext?.isEngineActive === true;
    
    if (isLiveActive) {
      console.log('[R9.3.HF-4.FIX] Live engine marked active but not resuming (requires explicit start)');
      // Live engine requires explicit user action to start for safety
    }
    
    console.log('[R9.3.HF-4.FIX] Engine resume check complete');
  } catch (error) {
    console.error('[R9.3.HF-4.FIX] ❌ Error resuming engines:', error);
    // Don't throw - allow server to continue starting
  }
}
