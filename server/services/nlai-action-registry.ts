import type { AuthenticatedRequest } from '../routes';
import { startPaperSimulation, stopPaperSimulation, getPaperSimulationStatus } from './paper-sim-service';
import { startLiveTrading, stopLiveTrading, checkLiveTradingStatus } from './live-trading-service';
import { 
  updateGuardrails, 
  updateGoals, 
  getGuardrails,
  getScreeners
} from './config-update-service';
import { storage } from '../storage';

export interface ActionIntent {
  verb: string;
  object: string;
  modifiers?: string[];
  originalMessage?: string; // Full message for value extraction
  extractedValue?: string; // Extracted numeric value or parameter
}

export interface ActionDefinition {
  id: string;
  patterns: RegExp[];
  category: 'simulation' | 'system' | 'report' | 'analysis';
  handler: (userId: string, intent: ActionIntent) => Promise<ActionResult>;
  description: string;
  requiredAuth: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export class NLAIActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();

  constructor() {
    this.registerDefaultActions();
  }

  private registerDefaultActions(): void {
    this.register({
      id: 'start_paper_simulation',
      patterns: [
        /(?:please\s+)?(?:start|begin|run|initiate|launch)(?:\s+the)?(?:\s+paper[\s-]?(?:trad(?:e|ing)|sim(?:ulation)?))/i,
        /(?:please\s+)?(?:start|begin)(?:\s+phase\s+[\d.]+)?(?:\s+dry[\s-]?run)?(?:\s+sim(?:ulation)?)/i,
        /(?:please\s+)?(?:activate|enable)(?:\s+paper[\s-]?mode)/i,
      ],
      category: 'simulation',
      handler: async (userId: string, intent: ActionIntent) => {
        return await startPaperSimulation(userId);
      },
      description: 'Start paper trading simulation',
      requiredAuth: true,
    });

    this.register({
      id: 'stop_paper_simulation',
      patterns: [
        /(?:please\s+)?(?:stop|end|halt|terminate|kill)(?:\s+the)?(?:\s+paper[\s-]?(?:trad(?:e|ing)|sim(?:ulation)?))/i,
        /(?:please\s+)?(?:stop|end)(?:\s+phase\s+[\d.]+)?(?:\s+dry[\s-]?run)?(?:\s+sim(?:ulation)?)/i,
        /(?:please\s+)?(?:deactivate|disable)(?:\s+paper[\s-]?mode)/i,
      ],
      category: 'simulation',
      handler: async (userId: string, intent: ActionIntent) => {
        return await stopPaperSimulation(userId);
      },
      description: 'Stop paper trading simulation',
      requiredAuth: true,
    });

    // Live Trading Actions
    this.register({
      id: 'start_live_trading',
      patterns: [
        /(?:please\s+)?(?:start|begin|run|initiate|launch|activate|enable)(?:\s+the)?(?:\s+live[\s-]?(?:trad(?:e|ing)|mode))/i,
        /(?:please\s+)?(?:go\s+)?live(?:\s+with)?(?:\s+trading)?/i,
        /(?:please\s+)?(?:switch|change)(?:\s+to)?(?:\s+live[\s-]?mode)/i,
      ],
      category: 'simulation',
      handler: async (userId: string, intent: ActionIntent) => {
        return await startLiveTrading(userId);
      },
      description: 'Start live trading mode (requires approval)',
      requiredAuth: true,
    });

    this.register({
      id: 'stop_live_trading',
      patterns: [
        /(?:please\s+)?(?:stop|end|halt|terminate|kill|deactivate|disable)(?:\s+the)?(?:\s+live[\s-]?(?:trad(?:e|ing)|mode))/i,
        /(?:please\s+)?(?:exit|leave)(?:\s+live)?(?:\s+mode|trading)?/i,
      ],
      category: 'simulation',
      handler: async (userId: string, intent: ActionIntent) => {
        return await stopLiveTrading(userId);
      },
      description: 'Stop live trading mode',
      requiredAuth: true,
    });

    this.register({
      id: 'check_live_trading_status',
      patterns: [
        /(?:please\s+)?(?:check|show|display|get|what's)(?:\s+the)?(?:\s+live)?(?:\s+(?:trading|mode))?(?:\s+status)/i,
        /(?:is|are)(?:\s+we)?(?:\s+in)?(?:\s+live[\s-]?(?:mode|trading))/i,
        /(?:am\s+i\s+)?(?:trading\s+)?live/i,
      ],
      category: 'simulation',
      handler: async (userId: string, intent: ActionIntent) => {
        return await checkLiveTradingStatus(userId);
      },
      description: 'Check live trading status',
      requiredAuth: true,
    });

    this.register({
      id: 'check_system_health',
      patterns: [
        /(?:please\s+)?(?:check|show|display|get|what's)(?:\s+the)?(?:\s+system)?(?:\s+health|status)/i,
        /(?:please\s+)?(?:how|what)(?:'s|\s+is)(?:\s+the)?(?:\s+system)(?:\s+health|status|doing)/i,
        /(?:please\s+)?(?:system|health)(?:\s+check|report|status)/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/system/health`, {
            method: 'GET',
            headers: {
              'x-user-id': userId,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            return {
              success: false,
              message: `Failed to retrieve system health: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const healthData = await response.json();
          
          let statusMessage = `System Health: ${healthData.backend}\n`;
          statusMessage += `Paper Trading: ${healthData.paperTrading?.isRunning ? 'Active' : 'Inactive'}`;
          if (healthData.orchestrator) {
            statusMessage += `\nAI Orchestrator: ${healthData.orchestrator.status}`;
          }

          return {
            success: true,
            message: statusMessage,
            data: healthData,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error checking system health: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Check system health and status',
      requiredAuth: true,
    });

    this.register({
      id: 'generate_report',
      patterns: [
        /(?:please\s+)?(?:generate|create|make|compile|build)(?:\s+a)?(?:\s+report|summary)/i,
        /(?:please\s+)?(?:generate|create)(?:\s+a)?(?:\s+(?:daily|weekly|monthly))?(?:\s+report)/i,
        /(?:please\s+)?(?:show|give|provide)(?:\s+me)?(?:\s+a)?(?:\s+report|summary)/i,
      ],
      category: 'report',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const reportType = intent.modifiers?.includes('weekly') ? 'weekly' 
            : intent.modifiers?.includes('monthly') ? 'monthly' 
            : 'daily';

          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/ai/generate-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId,
            },
            body: JSON.stringify({ reportType }),
          });

          if (!response.ok) {
            const error = await response.json();
            return {
              success: false,
              message: `Failed to generate report: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const data = await response.json();
          return {
            success: true,
            message: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report generated successfully. Check the Reports tab to view details.`,
            data,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error generating report: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Generate trading report (daily/weekly/monthly)',
      requiredAuth: true,
    });

    this.register({
      id: 'check_simulation_status',
      patterns: [
        /(?:please\s+)?(?:check|show|display|get|what's)(?:\s+the)?(?:\s+(?:paper|simulation))?(?:\s+status)/i,
        /(?:is|are)(?:\s+the)?(?:\s+paper)?(?:\s+(?:simulation|trading))?(?:\s+running|active)/i,
      ],
      category: 'simulation',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const statusData = await getPaperSimulationStatus(userId);
          const isRunning = statusData.isRunning;
          
          return {
            success: true,
            message: isRunning 
              ? 'Paper trading simulation is currently ACTIVE and monitoring markets.' 
              : 'Paper trading simulation is currently INACTIVE.',
            data: statusData,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error checking simulation status: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Check paper trading simulation status',
      requiredAuth: true,
    });

    // Phase 8.5 Addendum H: Context Refresh Actions
    this.register({
      id: 'refresh_context',
      patterns: [
        /(?:please\s+)?(?:refresh|update|reload)(?:\s+(?:your|the|my))?(?:\s+(?:data|context|values|information|stats))/i,
        /(?:please\s+)?(?:get|fetch)(?:\s+(?:fresh|latest|new|updated))?(?:\s+(?:data|context|values))/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/context/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            return {
              success: false,
              message: `Failed to refresh context: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const data = await response.json();
          return {
            success: true,
            message: `✅ Context refreshed successfully! All my data is now up-to-date with the latest portfolio, strategies, and system state.`,
            data,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error refreshing context: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Refresh Walter context with latest data',
      requiredAuth: true,
    });

    this.register({
      id: 'check_system_truth',
      patterns: [
        /(?:please\s+)?(?:check|verify|validate)(?:\s+(?:system|data))?(?:\s+(?:truth|consistency|alignment|sync))/i,
        /(?:are|is)(?:\s+(?:all|the|my))?(?:\s+(?:data|systems?|values?|contexts?))?(?:\s+(?:in\s+)?sync(?:ed|hronized)?)/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/system/truth-check`, {
            method: 'GET',
            headers: {
              'x-user-id': userId,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            return {
              success: false,
              message: `Failed to run truth check: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const data = await response.json();
          const aligned = data.isAligned;
          const discrepancies = data.discrepanciesCount;
          
          let message = aligned 
            ? '✅ All systems aligned! Backend, Cortex, and Walter are perfectly synchronized.'
            : `⚠️ Found ${discrepancies} discrepancy(ies) between system layers. I can refresh my context to fix this.`;

          return {
            success: true,
            message,
            data,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error checking system truth: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Check system truth and data alignment',
      requiredAuth: true,
    });

    // Config Update Actions
    this.register({
      id: 'update_risk_per_trade',
      patterns: [
        /(?:please\s+)?(?:set|change|update|adjust|modify)(?:\s+(?:the|my))?(?:\s+risk(?:\s+per\s+trade)?)\s+to\s+([\d.]+)\s*%?/i,
        /(?:please\s+)?(?:make|put)(?:\s+the)?(?:\s+risk(?:\s+per\s+trade)?)\s+([\d.]+)\s*%?/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          // Extract percentage from intent (captured by regex)
          const riskPercent = intent.extractedValue ? parseFloat(intent.extractedValue) : null;

          if (!riskPercent || riskPercent <= 0 || riskPercent > 100) {
            return {
              success: false,
              message: 'Please provide a valid risk percentage between 0.1 and 100.',
              error: 'Invalid risk percentage',
            };
          }

          // For now, default to paper mode (could be extracted from context)
          const mode = 'paper';
          
          const result = await updateGuardrails(userId, mode, {
            riskPerTrade: riskPercent.toString(),
          });

          if (result.success) {
            return {
              success: true,
              message: `✅ Risk per trade adjusted to ${riskPercent}% for ${mode} mode. Updated at ${result.timestamp}.`,
              data: result.data,
            };
          } else {
            return {
              success: false,
              message: `I attempted to change risk per trade but the database did not confirm the update: ${result.error}`,
              error: result.error,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            message: `I attempted to change risk per trade but encountered an error: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Update risk per trade percentage',
      requiredAuth: true,
    });

    this.register({
      id: 'update_max_drawdown',
      patterns: [
        /(?:please\s+)?(?:set|change|update|adjust|modify|tighten|loosen)(?:\s+(?:the|my))?(?:\s+max(?:imum)?(?:\s+draw\s*down)?)\s+to\s+([\d.]+)\s*%?/i,
        /(?:please\s+)?(?:make|put)(?:\s+the)?(?:\s+max(?:imum)?(?:\s+draw\s*down)?)\s+([\d.]+)\s*%?/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const drawdownPercent = intent.extractedValue ? parseFloat(intent.extractedValue) : null;

          if (!drawdownPercent || drawdownPercent <= 0 || drawdownPercent > 100) {
            return {
              success: false,
              message: 'Please provide a valid drawdown percentage between 0.1 and 100.',
              error: 'Invalid drawdown percentage',
            };
          }

          const mode = 'paper';
          
          const result = await updateGuardrails(userId, mode, {
            maxDrawdown: drawdownPercent.toString(),
          });

          if (result.success) {
            return {
              success: true,
              message: `✅ Maximum drawdown adjusted to ${drawdownPercent}% for ${mode} mode. Updated at ${result.timestamp}.`,
              data: result.data,
            };
          } else {
            return {
              success: false,
              message: `I attempted to change max drawdown but the database did not confirm the update: ${result.error}`,
              error: result.error,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            message: `I attempted to change max drawdown but encountered an error: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Update maximum drawdown percentage',
      requiredAuth: true,
    });

    this.register({
      id: 'update_max_daily_loss',
      patterns: [
        /(?:please\s+)?(?:set|change|update|adjust|modify)(?:\s+(?:the|my))?(?:\s+max(?:imum)?(?:\s+daily)?(?:\s+loss)?)\s+to\s+\$?([\d,]+(?:\.\d{2})?)/i,
        /(?:please\s+)?(?:make|put)(?:\s+the)?(?:\s+max(?:imum)?(?:\s+daily)?(?:\s+loss)?)\s+\$?([\d,]+(?:\.\d{2})?)/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const lossAmount = intent.extractedValue ? parseFloat(intent.extractedValue.replace(/,/g, '')) : null;

          if (!lossAmount || lossAmount <= 0) {
            return {
              success: false,
              message: 'Please provide a valid loss amount greater than 0.',
              error: 'Invalid loss amount',
            };
          }

          const mode = 'paper';
          
          const result = await updateGuardrails(userId, mode, {
            maxDailyLoss: lossAmount.toFixed(2),
          });

          if (result.success) {
            return {
              success: true,
              message: `✅ Maximum daily loss adjusted to $${lossAmount.toFixed(2)} for ${mode} mode. Updated at ${result.timestamp}.`,
              data: result.data,
            };
          } else {
            return {
              success: false,
              message: `I attempted to change max daily loss but the database did not confirm the update: ${result.error}`,
              error: result.error,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            message: `I attempted to change max daily loss but encountered an error: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Update maximum daily loss amount',
      requiredAuth: true,
    });

    this.register({
      id: 'update_trading_goal',
      patterns: [
        /(?:please\s+)?(?:set|change|update|adjust|modify)(?:\s+(?:my|the))?(?:\s+(?:daily|weekly|monthly))?(?:\s+(?:profit|return|win\s*rate|target))\s+(?:goal|target)\s+to\s+([\d.]+)\s*%?/i,
        /(?:please\s+)?(?:make|put)(?:\s+my)?(?:\s+(?:daily|weekly|monthly))?(?:\s+goal)\s+([\d.]+)\s*%?/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const goalValue = intent.extractedValue ? parseFloat(intent.extractedValue) : null;

          if (!goalValue || goalValue <= 0) {
            return {
              success: false,
              message: 'Please provide a valid goal value greater than 0.',
              error: 'Invalid goal value',
            };
          }

          // Determine metric name from original message
          const message = (intent.originalMessage || '').toLowerCase();
          let metricName = 'Daily Return %';
          if (message.includes('weekly')) metricName = 'Weekly Return %';
          if (message.includes('monthly')) metricName = 'Monthly Return %';
          if (message.includes('win rate') || message.includes('winrate')) metricName = 'Win Rate %';

          const mode = 'paper';
          
          const result = await updateGoals(userId, mode, [{
            metricName,
            goalValue: goalValue.toString(),
            actualValue: '0',
            percentAchieved: '0',
            aiValidationNotes: 'Updated via Walter NLAI',
          }]);

          if (result.success) {
            return {
              success: true,
              message: `✅ ${metricName} goal set to ${goalValue}% for ${mode} mode. Updated at ${result.timestamp}.`,
              data: result.data,
            };
          } else {
            return {
              success: false,
              message: `I attempted to change the goal but the database did not confirm the update: ${result.error}`,
              error: result.error,
            };
          }
        } catch (error: any) {
          return {
            success: false,
            message: `I attempted to change the goal but encountered an error: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Update trading goal (profit, return, win rate)',
      requiredAuth: true,
    });

    // Watchlist Actions
    this.register({
      id: 'set_default_watchlist',
      patterns: [
        /(?:please\s+)?(?:set|create|load|use)(?:\s+(?:a|the))?(?:\s+default)?(?:\s+watchlist)/i,
        /(?:please\s+)?(?:initialize|setup)(?:\s+(?:the|my))?(?:\s+watchlist)/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const mode = 'paper';
          
          // Default watchlist with high-volume, liquid pairs
          const defaultPairs = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'ADAUSD', 'MATICUSD'];
          
          let addedCount = 0;
          let skippedCount = 0;
          const errors: string[] = [];
          
          for (const symbol of defaultPairs) {
            try {
              // Check if pair already exists
              const existing = await storage.getWatchlist({ userId, mode });
              const alreadyExists = existing.some(p => p.symbol === symbol);
              
              if (alreadyExists) {
                skippedCount++;
                continue;
              }
              
              // Add to watchlist
              const [baseCurrency, quoteCurrency] = symbol.includes('USD') 
                ? [symbol.replace('USD', ''), 'USD']
                : [symbol.substring(0, 3), symbol.substring(3)];
              
              await storage.addWatchlistPair({
                userId,
                mode,
                symbol,
                baseCurrency,
                quoteCurrency,
              });
              
              addedCount++;
            } catch (error: any) {
              errors.push(`${symbol}: ${error.message}`);
            }
          }
          
          const totalAttempted = defaultPairs.length;
          const successMessage = addedCount > 0 
            ? `✅ Added ${addedCount} pair(s) to watchlist.` 
            : '';
          const skippedMessage = skippedCount > 0 
            ? ` ${skippedCount} already existed.` 
            : '';
          const errorMessage = errors.length > 0 
            ? ` Failed: ${errors.join(', ')}` 
            : '';
          
          return {
            success: addedCount > 0 || skippedCount === totalAttempted,
            message: `Default watchlist loaded for ${mode} mode. ${successMessage}${skippedMessage}${errorMessage}`,
            data: { added: addedCount, skipped: skippedCount, errors },
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error setting default watchlist: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Set default watchlist with popular crypto pairs',
      requiredAuth: true,
    });

    this.register({
      id: 'add_to_watchlist',
      patterns: [
        /(?:please\s+)?(?:add|include|put)(?:\s+)?([A-Z]{3,10}(?:USD|USDT|BTC|ETH)?)(?:\s+(?:to|in|on))?(?:\s+(?:the|my))?(?:\s+watchlist)/i,
        /(?:please\s+)?(?:watchlist|watch)(?:\s+)?([A-Z]{3,10}(?:USD|USDT|BTC|ETH)?)/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const symbol = intent.extractedValue?.toUpperCase();
          
          if (!symbol) {
            return {
              success: false,
              message: 'Please specify a symbol to add (e.g., "add BTCUSD to watchlist").',
              error: 'Missing symbol',
            };
          }
          
          const mode = 'paper';
          
          // Check if pair already exists
          const existing = await storage.getWatchlist({ userId, mode });
          const alreadyExists = existing.some(p => p.symbol === symbol);
          
          if (alreadyExists) {
            return {
              success: false,
              message: `${symbol} is already in your ${mode} mode watchlist.`,
              error: 'Already exists',
            };
          }
          
          // Parse symbol to extract base and quote currencies
          const [baseCurrency, quoteCurrency] = symbol.includes('USD') 
            ? [symbol.replace('USD', ''), 'USD']
            : [symbol.substring(0, 3), symbol.substring(3)];
          
          // Add to watchlist
          const pair = await storage.addWatchlistPair({
            userId,
            mode,
            symbol,
            baseCurrency,
            quoteCurrency,
          });
          
          return {
            success: true,
            message: `✅ Added ${symbol} to ${mode} mode watchlist.`,
            data: pair,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error adding to watchlist: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Add a symbol to watchlist',
      requiredAuth: true,
    });

    this.register({
      id: 'get_watchlist',
      patterns: [
        /(?:please\s+)?(?:show|display|get|list|view)(?:\s+(?:me|the|my))?(?:\s+watchlist)/i,
        /(?:what(?:'s|\s+is))?(?:\s+(?:on|in))?(?:\s+(?:the|my))?(?:\s+watchlist)/i,
      ],
      category: 'system',
      handler: async (userId: string, intent: ActionIntent) => {
        try {
          const mode = 'paper';
          
          const watchlist = await storage.getWatchlist({ userId, mode });
          
          if (!Array.isArray(watchlist) || watchlist.length === 0) {
            return {
              success: true,
              message: `Your ${mode} mode watchlist is empty. You can add pairs using "add BTCUSD to watchlist".`,
              data: { pairs: [] },
            };
          }
          
          const symbols = watchlist.map((p: any) => p.symbol).join(', ');
          return {
            success: true,
            message: `Your ${mode} mode watchlist contains ${watchlist.length} pair(s): ${symbols}`,
            data: { pairs: watchlist },
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error retrieving watchlist: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Get current watchlist',
      requiredAuth: true,
    });
  }

  register(action: ActionDefinition): void {
    this.actions.set(action.id, action);
    console.log(`[NLAI-Registry] Registered action: ${action.id} (${action.category})`);
  }

  async execute(actionId: string, userId: string, intent: ActionIntent): Promise<ActionResult> {
    const action = this.actions.get(actionId);
    
    if (!action) {
      return {
        success: false,
        message: `Action not found: ${actionId}`,
        error: 'Action not registered',
      };
    }

    // Phase 27.F.16.D: NLAI action routing guard
    // Force paper-sim service when paper keywords are detected (hard override)
    const paperKeywords = /\b(paper|simulation|simulated|practice|test|demo)\b/i;
    const originalMessage = intent.originalMessage || '';
    const hasPaperContext = paperKeywords.test(originalMessage);
    
    // If message contains paper keywords but action is live trading, force to paper
    if (hasPaperContext && (actionId === 'start_live_trading' || actionId === 'stop_live_trading')) {
      console.log('[INTENT] guard_applied=paper_forced (blocking live-api route)');
      console.log(`[NLAI-Registry] 🔒 GUARD: Forcing paper simulation (detected paper keywords in: "${originalMessage.substring(0, 50)}...")`);
      
      // Force to paper simulation action instead
      const paperActionId = actionId === 'start_live_trading' ? 'start_paper_simulation' : 'stop_paper_simulation';
      const paperAction = this.actions.get(paperActionId);
      
      if (paperAction) {
        console.log(`[NLAI-Registry] ↪️  Redirecting ${actionId} → ${paperActionId}`);
        return await paperAction.handler(userId, intent);
      }
    }

    console.log(`[NLAI-Registry] Executing action: ${actionId} for user: ${userId}`);
    return await action.handler(userId, intent);
  }

  matchIntent(message: string): { actionId: string; intent: ActionIntent } | null {
    console.log(`[NLAI-Registry] Attempting to match message: "${message}"`);
    console.log(`[NLAI-Registry] Total registered actions: ${this.actions.size}`);
    
    for (const [actionId, action] of this.actions.entries()) {
      for (const pattern of action.patterns) {
        const match = message.match(pattern);
        if (match) {
          const modifiers = message.toLowerCase().split(/\s+/).filter(word => 
            ['daily', 'weekly', 'monthly', 'phase', 'dry-run', 'simulation'].includes(word)
          );

          // Extract numeric value from capture group (if present)
          const extractedValue = match[1] || undefined;

          const intent: ActionIntent = {
            verb: this.extractVerb(message),
            object: this.extractObject(message, action.category),
            modifiers: modifiers.length > 0 ? modifiers : undefined,
            originalMessage: message,
            extractedValue,
          };

          console.log(`[NLAI-Registry] ✅ Matched action: ${actionId} with intent:`, intent);
          return { actionId, intent };
        }
      }
    }

    console.log(`[NLAI-Registry] ❌ No action matched for message: "${message}"`);
    return null;
  }

  private extractVerb(message: string): string {
    const verbs = ['start', 'stop', 'check', 'generate', 'create', 'show', 'get', 'display', 'activate', 'deactivate', 'refresh', 'update', 'reload', 'verify', 'validate'];
    const words = message.toLowerCase().split(/\s+/);
    
    for (const word of words) {
      if (verbs.includes(word)) {
        return word;
      }
    }
    
    return 'unknown';
  }

  private extractObject(message: string, category: string): string {
    const msg = message.toLowerCase();
    
    if (category === 'simulation') {
      if (msg.includes('paper') || msg.includes('simulation')) return 'paper_simulation';
    } else if (category === 'system') {
      if (msg.includes('health') || msg.includes('status')) return 'system_health';
      if (msg.includes('context') || msg.includes('data') || msg.includes('refresh')) return 'context';
      if (msg.includes('truth') || msg.includes('sync') || msg.includes('alignment')) return 'system_truth';
    } else if (category === 'report') {
      if (msg.includes('report') || msg.includes('summary')) return 'report';
    }
    
    return 'unknown';
  }

  getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }
}

export const nlaiActionRegistry = new NLAIActionRegistry();
