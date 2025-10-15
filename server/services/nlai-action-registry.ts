import type { AuthenticatedRequest } from '../routes';

export interface ActionIntent {
  verb: string;
  object: string;
  modifiers?: string[];
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
        try {
          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/paper-sim/start`, {
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
              message: `Failed to start paper trading simulation: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const data = await response.json();
          return {
            success: true,
            message: 'Paper trading simulation started successfully. Monitoring live market data and executing trades in simulation mode.',
            data,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error starting paper trading simulation: ${error.message}`,
            error: error.message,
          };
        }
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
        try {
          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/paper-sim/stop`, {
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
              message: `Failed to stop paper trading simulation: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const data = await response.json();
          return {
            success: true,
            message: 'Paper trading simulation stopped successfully. Final report generated.',
            data,
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Error stopping paper trading simulation: ${error.message}`,
            error: error.message,
          };
        }
      },
      description: 'Stop paper trading simulation',
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
          const response = await fetch(`${baseUrl}/api/system/health-metrics`, {
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
          const { overallStatus, cpu, memory, cache, schedulers } = healthData;

          let statusMessage = `System Health: ${overallStatus}\n`;
          statusMessage += `CPU: ${cpu.usagePercent.toFixed(1)}% | Memory: ${memory.usagePercent.toFixed(1)}%\n`;
          statusMessage += `Cache Hit Rate: ${cache.hitRate}% | `;
          statusMessage += `Schedulers: ${schedulers.cortexSync.status === 'active' && schedulers.analytics.status === 'active' ? 'Running' : 'Issues Detected'}`;

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
          const baseUrl = process.env.API_URL || 'http://localhost:5000';
          const response = await fetch(`${baseUrl}/api/paper-sim/status`, {
            method: 'GET',
            headers: {
              'x-user-id': userId,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            return {
              success: false,
              message: `Failed to check simulation status: ${error.error || 'Unknown error'}`,
              error: error.error,
            };
          }

          const statusData = await response.json();
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

    console.log(`[NLAI-Registry] Executing action: ${actionId} for user: ${userId}`);
    return await action.handler(userId, intent);
  }

  matchIntent(message: string): { actionId: string; intent: ActionIntent } | null {
    for (const [actionId, action] of this.actions.entries()) {
      for (const pattern of action.patterns) {
        if (pattern.test(message)) {
          const match = message.match(pattern);
          const modifiers = message.toLowerCase().split(/\s+/).filter(word => 
            ['daily', 'weekly', 'monthly', 'phase', 'dry-run', 'simulation'].includes(word)
          );

          const intent: ActionIntent = {
            verb: this.extractVerb(message),
            object: this.extractObject(message, action.category),
            modifiers: modifiers.length > 0 ? modifiers : undefined,
          };

          console.log(`[NLAI-Registry] Matched action: ${actionId} with intent:`, intent);
          return { actionId, intent };
        }
      }
    }

    return null;
  }

  private extractVerb(message: string): string {
    const verbs = ['start', 'stop', 'check', 'generate', 'create', 'show', 'get', 'display', 'activate', 'deactivate'];
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
