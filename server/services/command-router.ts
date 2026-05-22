import { ParsedIntent, validateCommandSafety, generateConfirmationMessage } from './intent-parser';
import { storage } from '../storage';
import { TradingEngine } from './trading-engine';
import { buildSettingsFromGuardrails, getPortfolioBalanceV2 } from './guardrail-settings';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  confirmationId?: string;
  warnings?: string[];
  errors?: string[];
}

interface PendingConfirmation {
  id: string;
  userId: string;
  intent: ParsedIntent;
  timestamp: number;
  expiresAt: number;
}

const pendingConfirmations = new Map<string, PendingConfirmation>();
const CONFIRMATION_TIMEOUT_MS = 60000; // 1 minute

export class CommandRouter {
  private globalLiveEngine: TradingEngine;
  private globalPaperEngine: TradingEngine;

  constructor(globalLiveEngine: TradingEngine, globalPaperEngine: TradingEngine) {
    this.globalLiveEngine = globalLiveEngine;
    this.globalPaperEngine = globalPaperEngine;
  }
  
  private getEngine(mode: 'live' | 'paper'): TradingEngine {
    return mode === 'live' ? this.globalLiveEngine : this.globalPaperEngine;
  }

  async routeCommand(intent: ParsedIntent, userId: string): Promise<CommandResult> {
    // Validate command safety first
    // B-NEW-43 chunk 3 (2026-05-22): Phase 41F-L purged user-level getTradingSettings;
    // validateCommandSafety's currentSettings param is optional — call without it.
    const safety = validateCommandSafety(intent);

    if (!safety.safe) {
      return {
        success: false,
        message: 'Command failed safety validation',
        errors: safety.errors,
        warnings: safety.warnings,
      };
    }

    // Check if confirmation is required
    if (intent.requiresConfirmation) {
      const confirmationId = `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const confirmation: PendingConfirmation = {
        id: confirmationId,
        userId,
        intent,
        timestamp: Date.now(),
        expiresAt: Date.now() + CONFIRMATION_TIMEOUT_MS,
      };

      pendingConfirmations.set(confirmationId, confirmation);

      // Clean up expired confirmations
      this.cleanupExpiredConfirmations();

      return {
        success: false,
        message: 'Confirmation required',
        requiresConfirmation: true,
        confirmationMessage: generateConfirmationMessage(intent),
        confirmationId,
        warnings: safety.warnings,
      };
    }

    // Route to appropriate handler
    return this.executeCommand(intent, userId, safety.warnings);
  }

  async confirmCommand(confirmationId: string, userId: string, confirmed: boolean): Promise<CommandResult> {
    const pending = pendingConfirmations.get(confirmationId);

    if (!pending) {
      return {
        success: false,
        message: 'Confirmation not found or expired',
      };
    }

    if (pending.userId !== userId) {
      return {
        success: false,
        message: 'Unauthorized confirmation attempt',
      };
    }

    if (Date.now() > pending.expiresAt) {
      pendingConfirmations.delete(confirmationId);
      return {
        success: false,
        message: 'Confirmation expired',
      };
    }

    pendingConfirmations.delete(confirmationId);

    if (!confirmed) {
      return {
        success: true,
        message: 'Command cancelled by user',
      };
    }

    // Execute the confirmed command
    return this.executeCommand(pending.intent, userId);
  }

  private async executeCommand(intent: ParsedIntent, userId: string, warnings?: string[]): Promise<CommandResult> {
    try {
      switch (intent.type) {
        case 'action':
          return this.handleAction(intent, userId, warnings);
        case 'configuration':
          return this.handleConfiguration(intent, userId, warnings);
        case 'status':
          return this.handleStatus(intent, userId);
        case 'analysis':
          return this.handleAnalysis(intent, userId);
        default:
          return {
            success: false,
            message: 'Unknown command type',
          };
      }
    } catch (error) {
      console.error('[CommandRouter] Error executing command:', error);
      return {
        success: false,
        message: `Error executing command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async handleAction(intent: ParsedIntent, userId: string, warnings?: string[]): Promise<CommandResult> {
    const { action, entity, parameters } = intent;
    
    // Phase 27.F.15.B.3: Determine active mode by checking which engine is running
    const [liveContext, paperContext] = await Promise.all([
      storage.getSystemContext('live'),
      storage.getSystemContext('paper')
    ]);
    
    let currentMode: 'live' | 'paper' | null = null;
    if (liveContext?.isEngineActive) currentMode = 'live';
    else if (paperContext?.isEngineActive) currentMode = 'paper';

    // Pause trading - requires active engine
    if (action === 'pause' && entity === 'trading') {
      if (!currentMode) {
        return {
          success: false,
          message: 'No trading engine is currently active',
          warnings,
        };
      }
      const engine = this.getEngine(currentMode);
      await engine.stop();
      return {
        success: true,
        message: `Trading paused successfully (${currentMode} mode)`,
        warnings,
      };
    }

    // Resume trading - requires knowing which mode to resume
    if (action === 'resume' && entity === 'trading') {
      // Determine mode to resume: current active or last used from context
      let modeToResume: 'live' | 'paper' | null = currentMode;
      
      if (!modeToResume) {
        // Check which mode was last used (tradingMode field in system context)
        const liveMode = liveContext?.tradingMode as 'live' | 'paper' | null;
        const paperMode = paperContext?.tradingMode as 'live' | 'paper' | null;
        
        // Prefer the most recently updated context
        const liveUpdated = liveContext?.updatedAt ? new Date(liveContext.updatedAt).getTime() : 0;
        const paperUpdated = paperContext?.updatedAt ? new Date(paperContext.updatedAt).getTime() : 0;
        
        // Strict ordering: must have a clear winner
        if (liveUpdated > paperUpdated && liveMode) {
          modeToResume = liveMode;
        } else if (paperUpdated > liveUpdated && paperMode) {
          modeToResume = paperMode;
        }
        // If liveUpdated === paperUpdated or both are 0, leave modeToResume as null
      }
      
      if (!modeToResume) {
        return {
          success: false,
          message: 'Cannot determine which trading mode to resume. Please start trading explicitly via the UI.',
          warnings,
        };
      }
      
      const engine = this.getEngine(modeToResume);
      await engine.start();
      return {
        success: true,
        message: `Trading resumed successfully (${modeToResume} mode)`,
        warnings,
      };
    }

    // Close position - check both modes if no active engine
    if (action === 'close' && entity === 'position') {
      const pair = parameters.pairs?.[0];
      if (!pair) {
        return {
          success: false,
          message: 'No pair specified for position close',
        };
      }

      // Phase 27.F.15.B.3: Search for trade in active mode first, then other mode
      const modesToCheck = currentMode ? [currentMode] : ['live', 'paper'] as ('live' | 'paper')[];
      
      for (const mode of modesToCheck) {
        const trades = await storage.getActiveTrades(mode);
        const trade = trades.find(t => t.symbol === pair);
        
        if (trade) {
          const engine = this.getEngine(mode);
          await engine.closeTrade(trade.id, 'user_command');
          return {
            success: true,
            message: `Position closed for ${pair} (${mode} mode)`,
            warnings,
          };
        }
      }

      return {
        success: false,
        message: `No active position found for ${pair}`,
      };
    }

    // Switch mode
    if (action === 'switch' && entity === 'mode') {
      const mode = parameters.mode as 'live' | 'paper';
// Phase 41F-L.E2E-PURGE: DISABLED -       const settings = await storage.getTradingSettings(userId);
      
      // Note: tradingMode field may not exist in settings table yet
      // This is a future enhancement that would require schema update
      
      return {
        success: true,
        message: `Mode switching to ${mode} is noted (requires schema update)`,
        data: { mode },
        warnings: [...(warnings || []), 'Mode switching requires schema update'],
      };
    }

    return {
      success: false,
      message: `Unknown action: ${action} ${entity}`,
    };
  }

  private async handleConfiguration(intent: ParsedIntent, userId: string, warnings?: string[]): Promise<CommandResult> {
    const { action, entity, parameters } = intent;

    // Update risk settings
    if (action === 'update' && entity === 'risk') {
      const updates: any = {};

      if (parameters.risk !== undefined) {
        updates.riskPerTrade = parameters.risk.toFixed(2);
      }

      if (parameters.riskPercent !== undefined) {
        // B-NEW-43 chunk 3 (2026-05-22): Phase 41F-L purged user-level getTradingSettings;
        // portfolio value now comes from mode-level portfolio_state. CommandRouter is
        // dead code (never invoked) — see RUNNING_ISSUES #136 — migration completed to keep CI green.
        const cfgMode: 'live' | 'paper' = parameters.mode ?? 'paper';
        const portfolioValue = await getPortfolioBalanceV2(cfgMode);
        if (portfolioValue > 0) {
          const riskAmount = (portfolioValue * parameters.riskPercent) / 100;
          updates.riskPerTrade = riskAmount.toFixed(2);
        }
      }

      await storage.updateTradingSettings(userId, updates);

      return {
        success: true,
        message: `Risk updated to $${updates.riskPerTrade}`,
        data: updates,
        warnings,
      };
    }

    // Update other settings
    if (action === 'update' && parameters.settingName) {
      const updates: any = {
        [parameters.settingName]: parameters.settingValue,
      };

      await storage.updateTradingSettings(userId, updates);

      return {
        success: true,
        message: `${parameters.settingName} updated to ${parameters.settingValue}`,
        data: updates,
        warnings,
      };
    }

    // Enable/disable strategy
    if ((action === 'enable' || action === 'disable') && entity === 'strategy') {
      const strategyName = parameters.strategyName;
      if (!strategyName) {
        return {
          success: false,
          message: 'No strategy name specified',
        };
      }

      // Note: Strategy enabling/disabling would require accessing strategy configuration
      // This is handled through the UI and strategy settings, not direct settings update
      
      return {
        success: true,
        message: `Strategy ${strategyName} ${action === 'enable' ? 'enable' : 'disable'} command noted (use dashboard for strategy management)`,
        data: { strategy: strategyName, enabled: action === 'enable' },
        warnings: [...(warnings || []), 'Strategy management via commands requires additional integration'],
      };
    }

    return {
      success: false,
      message: `Unknown configuration: ${action} ${entity}`,
    };
  }

  private async handleStatus(intent: ParsedIntent, userId: string): Promise<CommandResult> {
    const { entity } = intent;
    
    // Phase 27.F.15.B.3: Determine active mode by checking which engine is running
    const [liveContext, paperContext] = await Promise.all([
      storage.getSystemContext('live'),
      storage.getSystemContext('paper')
    ]);
    
    let currentMode: 'live' | 'paper' | null = null;
    if (liveContext?.isEngineActive) currentMode = 'live';
    else if (paperContext?.isEngineActive) currentMode = 'paper';

    // Trading status - show status of both modes
    if (entity === 'trading') {
      const liveRunning = this.globalLiveEngine.isEngineRunning();
      const paperRunning = this.globalPaperEngine.isEngineRunning();
      
      return {
        success: true,
        message: 'Trading status retrieved',
        data: {
          activeMode: currentMode || 'none',
          live: { isRunning: liveRunning },
          paper: { isRunning: paperRunning },
        },
      };
    }

    // Active positions - check active mode or default to paper
    if (entity === 'positions') {
      const modeToCheck = currentMode || 'paper';
      const trades = await storage.getActiveTrades(modeToCheck);
      
      return {
        success: true,
        message: `Found ${trades.length} active position${trades.length === 1 ? '' : 's'} (${modeToCheck} mode)`,
        data: { trades, mode: modeToCheck },
      };
    }

    // Performance - check active mode or default to paper
    if (entity === 'performance') {
      const modeToCheck = currentMode || 'paper';
      // Phase 27.F.15.B.3: Global mode-based query
      const trades = await storage.getTrades(modeToCheck, {});
      console.log('[Phase-27.F.15.B.3] Updated service command-router → mode-based');
      const closedTrades = trades.filter(t => t.status === 'closed');
      const totalProfit = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const winningTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0).length;
      const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;
      
      return {
        success: true,
        message: 'Performance data retrieved',
        data: {
          totalTrades: closedTrades.length,
          totalProfit: totalProfit.toFixed(2),
          winRate: winRate.toFixed(1),
          winningTrades,
        },
      };
    }

    // Settings
    if (entity === 'settings') {
      // B-NEW-43 chunk 3 (2026-05-22): Phase 41F-L purged user-level getTradingSettings;
      // settings now derive from mode-level guardrails_v2. CommandRouter is dead code
      // (never invoked) — see RUNNING_ISSUES #136 — migration completed to keep CI green.
      const statusMode: 'live' | 'paper' = intent.parameters.mode ?? 'paper';
      const settings = await buildSettingsFromGuardrails(statusMode);
      return {
        success: true,
        message: 'Current settings retrieved',
        data: settings,
      };
    }

    return {
      success: false,
      message: `Unknown status query: ${entity}`,
    };
  }

  private async handleAnalysis(intent: ParsedIntent, userId: string): Promise<CommandResult> {
    const { action, entity, parameters } = intent;
    
    // Phase 27.F.15.B.3: Determine active mode by checking which engine is running
    const [liveContext, paperContext] = await Promise.all([
      storage.getSystemContext('live'),
      storage.getSystemContext('paper')
    ]);
    
    let currentMode: 'live' | 'paper' | null = null;
    if (liveContext?.isEngineActive) currentMode = 'live';
    else if (paperContext?.isEngineActive) currentMode = 'paper';

    // Explain trade reasoning - default to paper if no active mode
    if (action === 'explain' && entity === 'trade') {
      const modeToCheck = currentMode || 'paper';
      // Phase 27.F.15.B.3: Global mode-based query
      const trades = await storage.getTrades(modeToCheck);
      const lastTrade = trades[0]; // Most recent

      if (!lastTrade) {
        return {
          success: false,
          message: 'No trades found',
        };
      }

      return {
        success: true,
        message: 'Trade reasoning retrieved',
        data: {
          trade: lastTrade,
          reasoning: 'Trade reasoning available in trade metadata',
        },
      };
    }

    // Analyze pair
    if (action === 'analyze' && entity === 'pair') {
      const pair = parameters.pairs?.[0];
      if (!pair) {
        return {
          success: false,
          message: 'No pair specified',
        };
      }

      // This would trigger market analysis
      return {
        success: true,
        message: `Analysis requested for ${pair}`,
        data: { pair, analysisRequested: true },
      };
    }

    // Analyze market
    if (action === 'analyze' && entity === 'market') {
      return {
        success: true,
        message: 'Market analysis requested',
        data: { marketAnalysisRequested: true },
      };
    }

    return {
      success: false,
      message: `Unknown analysis request: ${action} ${entity}`,
    };
  }

  private cleanupExpiredConfirmations() {
    const now = Date.now();
    for (const [id, confirmation] of pendingConfirmations.entries()) {
      if (now > confirmation.expiresAt) {
        pendingConfirmations.delete(id);
      }
    }
  }
}
