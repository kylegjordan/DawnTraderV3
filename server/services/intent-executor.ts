import { db } from "../db";
import { intentAuditLog, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { nanoid } from "nanoid";

// ============================================================================
// Phase 8.7.2: Intent Execution Framework
// ============================================================================
// Provides safe execution of validated intents from AI or manual actions
// with full RBAC, state validation, audit logging, and provenance tracking

interface IntentPayload {
  action: string;
  mode?: 'live' | 'paper';
  strategy?: string;
  strategyId?: string; // Support both strategy and strategyId
  enabled?: boolean;
  params?: Record<string, any>;
  goals?: Array<any>;
  guardrails?: Record<string, any>;
  [key: string]: any;
}

interface IntentExecutionContext {
  userId: string;
  userRole: 'owner' | 'editor' | 'viewer';
  intent: IntentPayload;
  traceId?: string;
}

interface IntentExecutionResult {
  success: boolean;
  message: string;
  traceId: string;
  executionTimeMs: number;
  data?: any;
  error?: string;
}

interface StateSnapshot {
  timestamp: string;
  trading: { live: string; paper: string };
  balances: { live: number; paper: number };
  strategies: { live: number; paper: number };
  goals: { live: number; paper: number };
  guardrails: any;
  screeners: any;
}

class IntentExecutionService {
  
  // ==================== Role-Based Access Control ====================
  
  private canExecuteMutatingIntent(userRole: 'owner' | 'editor' | 'viewer'): boolean {
    return userRole === 'owner' || userRole === 'editor';
  }

  private checkPermissions(context: IntentExecutionContext): { allowed: boolean; reason?: string } {
    const { userRole, intent } = context;
    
    // List of mutating actions that require owner/editor role
    const mutatingActions = [
      'start_trading',
      'stop_trading',
      'enable_strategy',
      'disable_strategy',
      'update_strategy',
      'update_goals',
      'update_guardrails',
      'update_screeners'
    ];
    
    if (mutatingActions.includes(intent.action)) {
      if (!this.canExecuteMutatingIntent(userRole)) {
        return {
          allowed: false,
          reason: `Permission denied: ${intent.action} requires owner or editor role`
        };
      }
    }
    
    return { allowed: true };
  }

  // ==================== State Validation ====================
  
  private async getCurrentState(userId: string): Promise<StateSnapshot> {
    try {
      const { stateAwarenessService } = await import('./state-awareness');
      const snapshot = await stateAwarenessService.getStateSnapshot(userId);
      
      return {
        timestamp: snapshot.timestamp,
        trading: snapshot.trading,
        balances: snapshot.balances,
        strategies: snapshot.strategies,
        goals: snapshot.goals,
        guardrails: snapshot.guardrails,
        screeners: snapshot.screeners
      };
    } catch (error: any) {
      console.error('[IntentExecutor] Error fetching current state:', error);
      throw new Error('Failed to fetch current system state');
    }
  }

  private computeStateHash(state: StateSnapshot): string {
    const stateString = JSON.stringify(state);
    return crypto.createHash('sha256').update(stateString).digest('hex');
  }

  // ==================== Intent Routing & Execution ====================
  
  private async routeIntent(context: IntentExecutionContext, preStateHash: string): Promise<IntentExecutionResult> {
    const { intent, userId } = context;
    const startTime = Date.now();
    const traceId = context.traceId || `trace_${nanoid(10)}`;
    
    try {
      let result: any;
      
      switch (intent.action) {
        case 'start_trading':
          result = await this.executeStartTrading(userId, intent);
          break;
          
        case 'stop_trading':
          result = await this.executeStopTrading(userId, intent);
          break;
          
        case 'enable_strategy':
        case 'disable_strategy':
        case 'update_strategy':
          result = await this.executeStrategyUpdate(userId, intent);
          break;
          
        case 'update_goals':
          result = await this.executeGoalsUpdate(userId, intent);
          break;
          
        case 'update_guardrails':
          result = await this.executeGuardrailsUpdate(userId, intent);
          break;
          
        case 'execute_trade':
          result = await this.executeTradeIntent(userId, intent, traceId);
          break;
          
        default:
          throw new Error(`Unknown intent action: ${intent.action}`);
      }
      
      const executionTimeMs = Date.now() - startTime;
      
      // Phase 8.7.4: Broadcast intent execution result via Context Bridge
      try {
        const { contextBridge } = await import('./context-bridge');
        await contextBridge.broadcast({
          type: intent.action === 'execute_trade' ? 'trade_update' : 'config_update',
          payload: {
            action: intent.action,
            ...result.data
          },
          userId,
          mode: intent.mode as 'live' | 'paper' | undefined
        });
      } catch (bridgeError: any) {
        console.error('[IntentExecutor] Failed to broadcast intent result:', bridgeError.message);
      }
      
      return {
        success: true,
        message: result.message || 'Intent executed successfully',
        traceId,
        executionTimeMs,
        data: result.data
      };
      
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      
      return {
        success: false,
        message: 'Intent execution failed',
        traceId,
        executionTimeMs,
        error: error.message
      };
    }
  }

  // ==================== Specific Intent Executors ====================
  
  private async executeStartTrading(userId: string, intent: IntentPayload): Promise<any> {
    const mode = intent.mode || 'paper';
    const { storage } = await import('../storage');
    
    if (mode === 'paper') {
      // Start paper trading via ActivePortfolioManager
      // P19-B4b D5: per-mode accessor (mode='paper'). NOTE (#297): this dormant agent-intent
      // subsystem is paper-only today (and the ActivePortfolioManager(userId) call below has a
      // known wrong-arg vs the (mode, userId?) constructor); when #297 revives the live branch
      // this 'paper' default AND that call must be revisited together. Routing through the
      // accessor keeps the manager on the single per-mode store (no second raw global slot).
      const { getGlobalActiveEngineManager, setGlobalActiveEngineManager } = await import('../services/active-engine-service.js');
      const globalActivePortfolioManager = getGlobalActiveEngineManager('paper');

      if (globalActivePortfolioManager) {
        throw new Error('Paper trading simulation already running (system-wide)');
      }

      const { ActivePortfolioManager } = await import('../services/active-portfolio-manager');
      const manager = new ActivePortfolioManager(userId);

      // Set global manager and register session
      setGlobalActiveEngineManager(manager, 'paper');
      (global as any).registerSimulationSession({
        sessionId: `intent_${Date.now()}`,
        startedBy: userId,
        startTime: new Date(),
        isRunning: true,
        type: 'manual'
      });
      
      await manager.start();
      
      // Update user status
      await storage.updateUser(userId, { tradingStatus: 'active', tradingMode: mode });
      
      // Directive 12.2.3: BobCore cache invalidation removed (file deleted in Batch 7A)

      return {
        message: 'Paper trading started successfully',
        data: { mode, status: 'active' }
      };
    } else {
      // Start live trading via TradingEngine
      const tradingEngines = (global as any).tradingEngines as Map<string, any>;
      let engine = tradingEngines.get(userId);
      
      if (!engine) {
        const { TradingEngine } = await import('../services/trading-engine');
        engine = new TradingEngine(userId);
        tradingEngines.set(userId, engine);
      }
      
      await engine.start();
      await storage.updateUser(userId, { tradingStatus: 'active', tradingMode: mode });
      
      return {
        message: 'Live trading started successfully',
        data: { mode, status: 'active' }
      };
    }
  }

  private async executeStopTrading(userId: string, intent: IntentPayload): Promise<any> {
    const mode = intent.mode || 'paper';
    const { storage } = await import('../storage');
    
    if (mode === 'paper') {
      // Stop paper trading via ActivePortfolioManager
      // P19-B4b D5: per-mode accessor (mode='paper'). #297 dormant — see executeStartTrading note.
      const { getGlobalActiveEngineManager, clearGlobalActiveEngineManager } = await import('../services/active-engine-service.js');
      const globalActivePortfolioManager = getGlobalActiveEngineManager('paper');

      if (!globalActivePortfolioManager) {
        throw new Error('No paper trading simulation is running');
      }

      await globalActivePortfolioManager.stop();

      // Deregister session and clear global manager
      (global as any).deregisterSimulationSession();
      clearGlobalActiveEngineManager('paper');
      
      // Update user status
      await storage.updateUser(userId, { tradingStatus: 'stopped' });
      
      // Directive 12.2.3: BobCore cache invalidation removed (file deleted in Batch 7A)

      return {
        message: 'Paper trading stopped successfully',
        data: { mode, status: 'stopped' }
      };
    } else {
      // Stop live trading via TradingEngine
      const tradingEngines = (global as any).tradingEngines as Map<string, any>;
      const engine = tradingEngines.get(userId);
      
      if (!engine) {
        throw new Error('No live trading engine is running');
      }
      
      await engine.stop();
      await storage.updateUser(userId, { tradingStatus: 'stopped' });
      
      return {
        message: 'Live trading stopped successfully',
        data: { mode, status: 'stopped' }
      };
    }
  }

  private async executeStrategyUpdate(userId: string, intent: IntentPayload): Promise<any> {
    const { storage } = await import('../storage');
    const globalContextId = 'default';
    const mode = (intent.mode || 'paper') as 'live' | 'paper';
    
    // Support both 'strategy' and 'strategyId' field names for backward compatibility
    const strategy = (intent.strategy || intent.strategyId) as 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap';
    
    if (!strategy) {
      throw new Error('Strategy name is required for strategy update (provide strategy or strategyId)');
    }
    
    // Determine enabled status
    let enabled: boolean;
    if (intent.action === 'enable_strategy') {
      enabled = true;
    } else if (intent.action === 'disable_strategy') {
      enabled = false;
    } else {
      enabled = intent.enabled ?? true;
    }
    
    // Get current settings or create default
    let currentSettings = await storage.getStrategySettings({ globalContextId, mode, strategy });
    
    if (!currentSettings) {
      // Create new settings
      currentSettings = await storage.upsertStrategySettings({
        globalContextId,
        mode,
        strategy,
        enabled,
        params: intent.params || {}
      });
    } else {
      // Update existing settings
      currentSettings = await storage.upsertStrategySettings({
        globalContextId,
        mode,
        strategy,
        enabled,
        params: intent.params || currentSettings.params || {}
      });
    }
    
    // Invalidate caches and refresh context
    const { configChangeHandler } = await import('./config-change-handler');
    await configChangeHandler.handleConfigChange({
      userId,
      mode,
      configType: 'strategies',
      source: 'direct'
    });
    
    return {
      message: `Strategy ${strategy} ${enabled ? 'enabled' : 'disabled'} successfully in ${mode} mode`,
      data: { strategy, enabled, mode, params: currentSettings.params }
    };
  }

  private async executeGoalsUpdate(userId: string, intent: IntentPayload): Promise<any> {
    const { storage } = await import('../storage');
    const mode = (intent.mode || 'paper') as 'live' | 'paper';
    const goals = intent.goals;
    
    if (!goals || !Array.isArray(goals)) {
      throw new Error('Goals array is required for goals update');
    }
    
    const updatedGoals = [];
    
    for (const goal of goals) {
      const goalData = {
        userId,
        metricName: goal.metricName,
        goalValue: goal.goalValue,
        actualValue: goal.actualValue || '0',
        percentAchieved: goal.percentAchieved || '0',
        aiValidationNotes: goal.aiValidationNotes || null,
      };
      
      const result = mode === 'live'
        ? await storage.upsertGoalLive(goalData)
        : await storage.upsertGoalPaper(goalData);
      
      updatedGoals.push(result);
    }
    
    // Invalidate caches and refresh context
    const { configChangeHandler } = await import('./config-change-handler');
    await configChangeHandler.handleConfigChange({
      userId,
      mode,
      configType: 'goals',
      source: 'direct'
    });
    
    return {
      message: `Updated ${updatedGoals.length} goals successfully in ${mode} mode`,
      data: { goals: updatedGoals, mode }
    };
  }

  private async executeGuardrailsUpdate(userId: string, intent: IntentPayload): Promise<any> {
    const { storage } = await import('../storage');
    const mode = (intent.mode || 'paper') as 'live' | 'paper';
    const guardrails = intent.guardrails;
    
    if (!guardrails) {
      throw new Error('Guardrails data is required for guardrails update');
    }
    
    const guardrailsData = await storage.upsertGuardrails({
      mode,
      ...guardrails
    });
    
    // Invalidate caches and refresh context
    const { configChangeHandler } = await import('./config-change-handler');
    await configChangeHandler.handleConfigChange({
      userId,
      mode,
      configType: 'guardrails',
      source: 'direct'
    });
    
    return {
      message: `Guardrails updated successfully in ${mode} mode`,
      data: { guardrails: guardrailsData, mode }
    };
  }

  private async executeTradeIntent(userId: string, intent: IntentPayload, traceId: string): Promise<any> {
    const { storage } = await import('../storage');
    const mode = (intent.mode || 'paper') as 'live' | 'paper';
    const signal = intent.signal;
    
    if (!signal || !signal.symbol || !signal.strategy) {
      throw new Error('Valid trade signal is required (symbol, strategy, prices)');
    }

    console.log(`[IntentExecutor] Validating trade intent for ${signal.symbol} in ${mode} mode`);

    const { preExecutionValidator } = await import('./pre-execution-validator');
    
    const validationResult = await preExecutionValidator.validateTrade({
      userId,
      signal,
      mode,
      traceId
    });

    if (!validationResult.canExecute) {
      console.log(`[IntentExecutor] Trade validation failed: ${validationResult.blockReason}`);
      throw new Error(`Trade validation failed: ${validationResult.blockReason}`);
    }

    console.log(`[IntentExecutor] Trade validation passed (goal alignment: ${validationResult.goalAlignmentScore}%)`);

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (mode === 'live') {
      const tradingEngines = (global as any).tradingEngines;
      let engine = tradingEngines?.get(userId);
      
      if (!engine) {
        const apiKey = process.env.KRAKEN_API_KEY;
        const apiSecret = process.env.KRAKEN_API_SECRET;
        
        if (!apiKey || !apiSecret) {
          throw new Error('Kraken API credentials not configured');
        }
        
        const { TradingEngine } = await import('./trading-engine');
        engine = new TradingEngine(userId, apiKey, apiSecret);
        tradingEngines?.set(userId, engine);
      }
      
      const trade = await engine.processSignal(signal, mode);
      
      if (!trade) {
        throw new Error('Trade execution failed - signal rejected by trading engine');
      }
      
      return {
        message: `Trade executed successfully: ${signal.symbol} ${signal.strategy}`,
        data: { 
          trade,
          validation: {
            goalAlignmentScore: validationResult.goalAlignmentScore,
            slippageEstimate: validationResult.slippageEstimate,
            fees: validationResult.fees
          }
        }
      };
    } else {
      const { getGlobalActiveEngineManager: _getPaperMgr } = await import('../services/active-engine-service.js');
      const globalPaperManager = _getPaperMgr('paper'); // P19-B4b D5: per-mode accessor (#297 dormant)

      if (!globalPaperManager) {
        throw new Error('Paper trading simulation not running - start paper trading first');
      }
      
      const trade = await globalPaperManager.processSignal(signal);
      
      if (!trade) {
        throw new Error('Paper trade execution failed - signal rejected');
      }
      
      return {
        message: `Paper trade executed successfully: ${signal.symbol} ${signal.strategy}`,
        data: { 
          trade,
          validation: {
            goalAlignmentScore: validationResult.goalAlignmentScore,
            slippageEstimate: validationResult.slippageEstimate,
            fees: validationResult.fees
          }
        }
      };
    }
  }

  // ==================== Audit Logging ====================
  
  private async logIntentExecution(
    context: IntentExecutionContext,
    preStateHash: string,
    postStateHash: string,
    result: IntentExecutionResult
  ): Promise<void> {
    try {
      await db.insert(intentAuditLog).values({
        traceId: result.traceId,
        userId: context.userId,
        userRole: context.userRole,
        intentAction: context.intent.action,
        intentPayload: context.intent,
        preStateHash,
        postStateHash,
        success: result.success,
        result: result.data || null,
        executionTimeMs: result.executionTimeMs,
        errorMessage: result.error || null,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'intent_executor'
        }
      });
      
      console.log(`[IntentExecutor] ✅ Audit log saved: ${result.traceId} (${context.intent.action})`);
    } catch (error: any) {
      console.error('[IntentExecutor] ❌ Error logging intent execution:', error);
    }
  }

  // ==================== Public API ====================
  
  async execute(context: IntentExecutionContext): Promise<IntentExecutionResult> {
    const startTime = Date.now();
    const traceId = context.traceId || `trace_${nanoid(10)}`;
    context.traceId = traceId;
    
    console.log(`[IntentExecutor] 🎯 Executing intent: ${context.intent.action} [${traceId}]`);
    
    // Step 1: Check permissions
    const permissionCheck = this.checkPermissions(context);
    if (!permissionCheck.allowed) {
      const executionTimeMs = Date.now() - startTime;
      const result: IntentExecutionResult = {
        success: false,
        message: permissionCheck.reason || 'Permission denied',
        traceId,
        executionTimeMs,
        error: permissionCheck.reason
      };
      
      // Log failed attempt
      await this.logIntentExecution(context, '', '', result);
      
      console.log(`[IntentExecutor] 🚫 Permission denied: ${context.intent.action} for ${context.userRole}`);
      return result;
    }
    
    // Step 2: Get pre-execution state
    const preState = await this.getCurrentState(context.userId);
    const preStateHash = this.computeStateHash(preState);
    
    console.log(`[IntentExecutor] 📊 Pre-execution state hash: ${preStateHash.substring(0, 8)}...`);
    
    // Step 3: Execute intent
    const result = await this.routeIntent(context, preStateHash);
    
    // Step 4: Get post-execution state
    const postState = await this.getCurrentState(context.userId);
    const postStateHash = this.computeStateHash(postState);
    
    console.log(`[IntentExecutor] 📊 Post-execution state hash: ${postStateHash.substring(0, 8)}...`);
    
    // Step 5: Log to audit trail
    await this.logIntentExecution(context, preStateHash, postStateHash, result);
    
    if (result.success) {
      console.log(`[IntentExecutor] ✅ Intent executed successfully: ${context.intent.action} (${result.executionTimeMs}ms)`);
    } else {
      console.log(`[IntentExecutor] ❌ Intent execution failed: ${context.intent.action} - ${result.error}`);
    }
    
    return result;
  }

  async getAuditHistory(filters: {
    userId?: string;
    traceId?: string;
    action?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      let query = db.select().from(intentAuditLog);
      
      if (filters.userId) {
        query = query.where(eq(intentAuditLog.userId, filters.userId)) as any;
      }
      
      if (filters.traceId) {
        query = query.where(eq(intentAuditLog.traceId, filters.traceId)) as any;
      }
      
      if (filters.action) {
        query = query.where(eq(intentAuditLog.intentAction, filters.action)) as any;
      }
      
      const results = await query.orderBy(intentAuditLog.timestamp).limit(filters.limit || 50);
      
      console.log(`[IntentExecutor] 📜 Retrieved ${results.length} audit records`);
      
      return results;
    } catch (error: any) {
      console.error('[IntentExecutor] Error fetching audit history:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const intentExecutor = new IntentExecutionService();
