import { ParsedIntent, validateCommandSafety, generateConfirmationMessage } from './intent-parser';
import { storage } from '../storage';
import { TradingEngine } from './trading-engine';

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
  private tradingEngines: Map<string, TradingEngine>;

  constructor(tradingEngines: Map<string, TradingEngine>) {
    this.tradingEngines = tradingEngines;
  }

  async routeCommand(intent: ParsedIntent, userId: string): Promise<CommandResult> {
    // Validate command safety first
    const settings = await storage.getTradingSettings(userId);
    const safety = validateCommandSafety(intent, settings);

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

    // Pause trading
    if (action === 'pause' && entity === 'trading') {
      const engine = this.tradingEngines.get(userId);
      if (engine) {
        await engine.stop();
        return {
          success: true,
          message: 'Trading paused successfully',
          warnings,
        };
      }
      return {
        success: false,
        message: 'No active trading engine found',
      };
    }

    // Resume trading
    if (action === 'resume' && entity === 'trading') {
      const engine = this.tradingEngines.get(userId);
      if (engine) {
        await engine.start();
        return {
          success: true,
          message: 'Trading resumed successfully',
          warnings,
        };
      }
      return {
        success: false,
        message: 'No trading engine found',
      };
    }

    // Close position
    if (action === 'close' && entity === 'position') {
      const pair = parameters.pairs?.[0];
      if (!pair) {
        return {
          success: false,
          message: 'No pair specified for position close',
        };
      }

      // Find the trade
      const trades = await storage.getActiveTrades(userId);
      const trade = trades.find(t => t.symbol === pair);

      if (!trade) {
        return {
          success: false,
          message: `No active position found for ${pair}`,
        };
      }

      const engine = this.tradingEngines.get(userId);
      if (engine) {
        await engine.closeTrade(trade.id, 'user_command');
        return {
          success: true,
          message: `Position closed for ${pair}`,
          warnings,
        };
      }

      return {
        success: false,
        message: 'Trading engine not available',
      };
    }

    // Switch mode
    if (action === 'switch' && entity === 'mode') {
      const mode = parameters.mode as 'live' | 'paper';
      const settings = await storage.getTradingSettings(userId);
      
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
        const settings = await storage.getTradingSettings(userId);
        if (settings && settings.portfolioValue) {
          const portfolioValue = parseFloat(settings.portfolioValue);
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

    // Trading status
    if (entity === 'trading') {
      const engine = this.tradingEngines.get(userId);
      const isRunning = engine ? engine.isEngineRunning() : false;
      
      return {
        success: true,
        message: 'Trading status retrieved',
        data: {
          isRunning,
          engineExists: !!engine,
        },
      };
    }

    // Active positions
    if (entity === 'positions') {
      const trades = await storage.getActiveTrades(userId);
      
      return {
        success: true,
        message: `Found ${trades.length} active position${trades.length === 1 ? '' : 's'}`,
        data: { trades },
      };
    }

    // Performance
    if (entity === 'performance') {
      const trades = await storage.getTrades(userId, {});
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
      const settings = await storage.getTradingSettings(userId);
      
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

    // Explain trade reasoning
    if (action === 'explain' && entity === 'trade') {
      const trades = await storage.getTrades(userId);
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
