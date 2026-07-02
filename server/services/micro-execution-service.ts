import { storage } from '../storage';
import { contextBridge } from './context-bridge';
import type { ActiveExecutionEngine } from './active-execution-engine';

/**
 * Phase 27.F.14.MICRO: Micro-Execution Service
 * 
 * Lightweight high-frequency loop that re-checks Ready-to-Buy pairs every few seconds
 * using cached WebSocket prices. Triggers execution when price delta ≥ threshold.
 * 
 * Features:
 * - Configurable interval (5-15s, default 8s)
 * - Price delta trigger (0.20-0.60%, default 0.30%)
 * - Per-symbol cooldown (15s minimum between checks)
 * - Max 5 executions per minute (safety limit)
 * - 3-second price stability window
 * - Paper mode only by default
 */

interface PriceSnapshot {
  symbol: string;
  price: number;
  timestamp: number;
}

interface SymbolCooldown {
  symbol: string;
  lastCheckTime: number;
  lastEvaluationTime: number;
}

export class MicroExecutionService {
  private mode: 'live' | 'paper';
  private isRunning: boolean = false;
  private microLoopInterval: NodeJS.Timeout | null = null;
  private paperEngine: ActiveExecutionEngine | null = null;
  
  // Configuration (loaded from guardrails)
  private intervalMs: number = 8000; // Default 8 seconds
  private priceDeltaTrigger: number = 0.30; // Default 0.30%
  
  // Price tracking
  private priceSnapshots: Map<string, PriceSnapshot> = new Map();
  private lastPrices: Map<string, number> = new Map();
  
  // Safety tracking
  private symbolCooldowns: Map<string, SymbolCooldown> = new Map();
  private executionHistory: number[] = []; // Timestamps of recent executions
  private readonly COOLDOWN_MS = 15000; // 15 seconds per-symbol cooldown
  private readonly MAX_EXECUTIONS_PER_MINUTE = 5;
  private readonly STABILITY_WINDOW_MS = 3000; // 3 second stability window
  
  constructor(mode: 'live' | 'paper') {
    this.mode = mode;
  }
  
  /**
   * Link to the main paper execution engine
   */
  setPaperEngine(engine: ActiveExecutionEngine): void {
    this.paperEngine = engine;
  }
  
  /**
   * Start the micro-execution loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[MicroLoop:${this.mode}] Already running`);
      return;
    }
    
    // Only run in paper mode by default
    if (this.mode === 'live') {
      console.log(`[MicroLoop:${this.mode}] Disabled in live mode (safety)`);
      return;
    }
    
    // Load configuration from guardrails
    await this.loadConfiguration();
    
    this.isRunning = true;
    console.log(`[MicroLoop] Started with interval=${this.intervalMs} ms, deltaTrigger=${this.priceDeltaTrigger} %`);
    
    // Broadcast micro-loop start
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'micro_loop_started',
        message: `Micro-execution loop started (interval: ${this.intervalMs}ms, delta: ${this.priceDeltaTrigger}%)`,
        timestamp: new Date().toISOString()
      }
    });
    
    // Start micro-loop interval
    this.microLoopInterval = setInterval(async () => {
      await this.microCheck();
    }, this.intervalMs);
    
    // Run initial check
    await this.microCheck();
  }
  
  /**
   * Stop the micro-execution loop
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.microLoopInterval) {
      clearInterval(this.microLoopInterval);
      this.microLoopInterval = null;
    }
    
    console.log(`[MicroLoop:${this.mode}] Stopped`);
  }
  
  /**
   * Load configuration from guardrails_v2 table
   * [9.7] Migrated to guardrails_v2 – legacy dollar fields removed
   * Note: microLoopInterval and priceDeltaTrigger are micro-execution specific
   * and use hardcoded defaults since they are not in guardrails_v2
   */
  private async loadConfiguration(): Promise<void> {
    try {
      // [9.7] Use guardrails_v2 for any mode-level configuration
      const guardrails = await storage.getGuardrailsV2({ mode: this.mode });
      
      if (guardrails) {
        // [9.7] Use hardcoded defaults for micro-execution specific settings
        // These are not stored in guardrails_v2, using sensible defaults
        this.intervalMs = 8 * 1000; // 8 seconds default
        this.priceDeltaTrigger = 0.30; // 0.30% default
        
        console.log(`[MicroLoop:${this.mode}][9.7] Config loaded: interval=${this.intervalMs}ms, delta=${this.priceDeltaTrigger}%`);
      }
    } catch (error) {
      console.error(`[MicroLoop:${this.mode}] Failed to load configuration:`, error);
      // Use defaults
    }
  }
  
  /**
   * Update price snapshot from WebSocket feed
   */
  updatePrice(symbol: string, price: number): void {
    const now = Date.now();
    
    // Store current snapshot
    this.priceSnapshots.set(symbol, {
      symbol,
      price,
      timestamp: now
    });
  }
  
  /**
   * Micro-check: scan Ready-to-Buy pairs for significant price changes
   */
  private async microCheck(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    try {
      // Get Ready-to-Buy pairs from watchlist
      const watchlist = await storage.getWatchlist({ mode: this.mode });
      
      if (watchlist.length === 0) {
        return;
      }
      
      const now = Date.now();
      let triggeredCount = 0;
      
      for (const pair of watchlist) {
        const symbol = pair.symbol;
        
        // Check per-symbol cooldown (post-trigger cooldown)
        if (!this.canCheckSymbol(symbol, now)) {
          continue;
        }
        
        // Get current price snapshot
        const snapshot = this.priceSnapshots.get(symbol);
        if (!snapshot) {
          // No price data yet
          continue;
        }
        
        // Phase 27.F.14.MICRO.FIX: Check stability window based on last evaluation time
        // (not snapshot age - that would reject all fresh prices!)
        const lastEval = this.symbolCooldowns.get(symbol)?.lastEvaluationTime;
        if (lastEval && (now - lastEval < this.STABILITY_WINDOW_MS)) {
          // Skip - we evaluated this symbol too recently
          continue;
        }
        
        // Update last evaluation time (we're checking it now)
        this.updateEvaluationTime(symbol, now);
        
        // Calculate price delta
        const lastPrice = this.lastPrices.get(symbol);
        if (!lastPrice) {
          // First price - store and continue
          this.lastPrices.set(symbol, snapshot.price);
          continue;
        }
        
        const priceDelta = Math.abs((snapshot.price - lastPrice) / lastPrice * 100);
        
        // Check if delta exceeds trigger threshold
        if (priceDelta >= this.priceDeltaTrigger) {
          // Check execution rate limit
          if (!this.canExecute(now)) {
            console.log(`[MicroLoop] Rate limit reached (max ${this.MAX_EXECUTIONS_PER_MINUTE}/min)`);
            break;
          }
          
          // Trigger micro-execution
          console.log(`[MicroLoop] Trigger recheck symbol=${symbol} delta=${priceDelta.toFixed(2)} %`);
          
          // Broadcast trigger event
          contextBridge.broadcast({
            type: 'trading_pipeline_event' as any,
            payload: {
              mode: this.mode,
              eventType: 'micro_trigger',
              symbol,
              priceDelta,
              currentPrice: snapshot.price,
              previousPrice: lastPrice,
              timestamp: new Date().toISOString()
            }
          });
          
          // Update cooldown
          this.updateCooldown(symbol, now);
          
          // Update last price
          this.lastPrices.set(symbol, snapshot.price);
          
          // Track execution
          this.executionHistory.push(now);
          
          // Trigger execution via paper engine (if available)
          if (this.paperEngine) {
            // The paper engine will handle the full execution flow
            // We just trigger it to check this specific symbol
            await this.triggerSymbolCheck(symbol);
          }
          
          triggeredCount++;
        }
      }
      
      // Clean up old execution history (keep last minute only)
      this.cleanExecutionHistory(now);
      
    } catch (error) {
      console.error(`[MicroLoop:${this.mode}] Micro-check error:`, error);
    }
  }
  
  /**
   * Check if symbol can be evaluated (cooldown check)
   */
  private canCheckSymbol(symbol: string, now: number): boolean {
    const cooldown = this.symbolCooldowns.get(symbol);
    
    if (!cooldown) {
      return true; // No cooldown record
    }
    
    const timeSinceLastCheck = now - cooldown.lastCheckTime;
    
    if (timeSinceLastCheck < this.COOLDOWN_MS) {
      // Still in cooldown
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if we can execute (rate limit check)
   */
  private canExecute(now: number): boolean {
    // Count executions in last minute
    const oneMinuteAgo = now - 60000;
    const recentExecutions = this.executionHistory.filter(ts => ts > oneMinuteAgo);
    
    return recentExecutions.length < this.MAX_EXECUTIONS_PER_MINUTE;
  }
  
  /**
   * Update symbol cooldown (after trigger)
   */
  private updateCooldown(symbol: string, now: number): void {
    this.symbolCooldowns.set(symbol, {
      symbol,
      lastCheckTime: now,
      lastEvaluationTime: now
    });
  }
  
  /**
   * Update last evaluation time (when checking price delta)
   * Phase 27.F.14.MICRO.FIX: Track when we last evaluated each symbol
   */
  private updateEvaluationTime(symbol: string, now: number): void {
    const existing = this.symbolCooldowns.get(symbol);
    
    if (existing) {
      // Update existing cooldown record
      this.symbolCooldowns.set(symbol, {
        ...existing,
        lastEvaluationTime: now
      });
    } else {
      // Create new cooldown record
      this.symbolCooldowns.set(symbol, {
        symbol,
        lastCheckTime: 0, // No trigger yet
        lastEvaluationTime: now
      });
    }
  }
  
  /**
   * Clean up old execution history
   */
  private cleanExecutionHistory(now: number): void {
    const oneMinuteAgo = now - 60000;
    this.executionHistory = this.executionHistory.filter(ts => ts > oneMinuteAgo);
  }
  
  /**
   * Trigger symbol check via paper engine
   * Note: This is a placeholder - the actual integration will depend on
   * how we want to expose this in ActiveExecutionEngine
   */
  private async triggerSymbolCheck(symbol: string): Promise<void> {
    // For now, just log that we would trigger a check
    // In a full implementation, we'd call a method on paperEngine
    // like: await this.paperEngine.checkSymbol(symbol);
    
    console.log(`[MicroLoop] Would trigger execution check for ${symbol}`);
    
    // TODO: Integrate with ActiveExecutionEngine.checkSymbolForSignal()
  }
  
  /**
   * Get last cycle summary for telemetry
   */
  getStatus(): any {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentExecutions = this.executionHistory.filter(ts => ts > oneMinuteAgo);
    
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      intervalMs: this.intervalMs,
      priceDeltaTrigger: this.priceDeltaTrigger,
      trackedSymbols: this.priceSnapshots.size,
      executionsLastMinute: recentExecutions.length,
      maxExecutionsPerMinute: this.MAX_EXECUTIONS_PER_MINUTE,
      cooldownMs: this.COOLDOWN_MS,
      stabilityWindowMs: this.STABILITY_WINDOW_MS
    };
  }
}
