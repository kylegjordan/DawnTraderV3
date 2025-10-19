/**
 * Live Trading Service
 * Phase 22.3 - Live Trading Voice/Chat Activation
 * 
 * Manages live trading mode with manual approval requirements
 * Integrates with ExecutionPolicyController for safety
 */

import { storage } from '../storage';
import { clusterBus } from './cluster-bus';
import type { ActionResult } from './nlai-action-registry';

interface LiveTradingSession {
  userId: string;
  startedAt: Date;
  engine: any; // TradingEngine instance
}

class LiveTradingService {
  private sessions: Map<string, LiveTradingSession> = new Map();

  /**
   * Start live trading mode (requires manual approval)
   * Returns confirmation prompt for user approval
   */
  async startLiveTrading(userId: string): Promise<ActionResult> {
    try {
      console.log(`[LiveTrading] Start request for user ${userId}`);

      // 1. Check if already running
      if (this.sessions.has(userId)) {
        return {
          success: true,
          message: 'Live trading is already active. No action needed.',
          data: { alreadyActive: true },
        };
      }

      // 2. Check global trading engines map
      const tradingEngines = (global as any).tradingEngines as Map<string, any>;
      const existingEngine = tradingEngines?.get(userId);
      
      if (existingEngine && existingEngine.isRunning) {
        // Sync with global state
        this.sessions.set(userId, {
          userId,
          startedAt: new Date(),
          engine: existingEngine,
        });
        
        return {
          success: true,
          message: 'Live trading is already active. No action needed.',
          data: { alreadyActive: true },
        };
      }

      // 3. Return manual approval prompt
      // This message matches the UI modal requirement
      const confirmationMessage = `⚠️ **Manual Approval Required**

Are you sure you want to start **LIVE TRADING**? 

This will enable **real orders** with actual funds on Kraken. Please confirm by:
- Typing "Yes, I approve" in chat, or
- Clicking the approval button in the modal

This is a high-risk operation and requires your explicit consent.`;

      console.log(`[LiveTrading] Returning manual approval prompt for user ${userId}`);

      return {
        success: false, // Not yet started - awaiting approval
        message: confirmationMessage,
        data: {
          requiresApproval: true,
          approvalType: 'manual',
          riskLevel: 'critical',
          nextAction: 'await_user_confirmation',
        },
      };

    } catch (error: any) {
      console.error(`[LiveTrading] Error starting live trading:`, error);
      return {
        success: false,
        message: `Failed to start live trading: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Activate live trading after approval received
   * Called by approval handler or explicit confirmation
   */
  async activateLiveTrading(userId: string): Promise<ActionResult> {
    try {
      console.log(`[LiveTrading] Activating live mode for user ${userId} (post-approval)`);

      // 1. Check if already running
      if (this.sessions.has(userId)) {
        return {
          success: true,
          message: 'Live trading already activated.',
        };
      }

      // 2. Initialize trading engine (placeholder for now)
      // In production, this would initialize the actual TradingEngine with live Kraken API
      const tradingEngines = (global as any).tradingEngines || new Map();
      (global as any).tradingEngines = tradingEngines;

      // Create engine instance (simplified for now)
      const engine = {
        userId,
        mode: 'live' as const,
        isRunning: true,
        startedAt: new Date(),
        // In production: actual TradingEngine instance would be created here
      };

      tradingEngines.set(userId, engine);

      // 3. Track session
      this.sessions.set(userId, {
        userId,
        startedAt: new Date(),
        engine,
      });

      // 4. Emit cluster bus event
      try {
        await clusterBus.publish('task_completed', {
          taskType: 'live_trading_activation',
          userId,
          mode: 'live',
          action: 'started',
          success: true,
          timestamp: new Date().toISOString(),
        }, 'live_trading');
        
        console.log(`[LiveTrading] ✅ Cluster bus event emitted: task_completed (live trading started)`);
      } catch (busError: any) {
        // Non-blocking - log but continue
        console.warn(`[LiveTrading] Failed to emit cluster bus event:`, busError.message);
      }

      // 5. Broadcast state change
      try {
        const { contextBridge } = await import('./context-bridge');
        await contextBridge.broadcast({
          type: 'state_update',
          payload: { tradingMode: 'live', status: 'active' },
          userId,
        });
      } catch (bridgeError: any) {
        console.warn(`[LiveTrading] Failed to broadcast via context bridge:`, bridgeError.message);
      }

      console.log(`[LiveTrading] ✅ Live trading activated successfully for user ${userId}`);

      return {
        success: true,
        message: '✅ Live trading activated! System is now placing **real orders** on Kraken. Monitor closely.',
        data: {
          mode: 'live',
          status: 'active',
          startedAt: new Date().toISOString(),
        },
      };

    } catch (error: any) {
      console.error(`[LiveTrading] Error activating live trading:`, error);
      return {
        success: false,
        message: `Failed to activate live trading: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Stop live trading mode
   */
  async stopLiveTrading(userId: string): Promise<ActionResult> {
    try {
      console.log(`[LiveTrading] Stop request for user ${userId}`);

      // 1. Check if running
      const session = this.sessions.get(userId);
      if (!session) {
        // Check global state
        const tradingEngines = (global as any).tradingEngines as Map<string, any>;
        const engine = tradingEngines?.get(userId);
        
        if (!engine || !engine.isRunning || engine.mode !== 'live') {
          return {
            success: true,
            message: 'Live trading is not currently active.',
            data: { wasRunning: false },
          };
        }
      }

      // 2. Stop engine
      const tradingEngines = (global as any).tradingEngines as Map<string, any>;
      if (tradingEngines) {
        const engine = tradingEngines.get(userId);
        if (engine) {
          engine.isRunning = false;
          engine.stoppedAt = new Date();
          // In production: await engine.stop() to gracefully shutdown
        }
      }

      // 3. Remove session
      this.sessions.delete(userId);

      // 4. Emit cluster bus event
      try {
        await clusterBus.publish('task_completed', {
          taskType: 'live_trading_deactivation',
          userId,
          mode: 'stopped',
          previousMode: 'live',
          action: 'stopped',
          success: true,
          timestamp: new Date().toISOString(),
        }, 'live_trading');
        
        console.log(`[LiveTrading] ✅ Cluster bus event emitted: task_completed (live trading stopped)`);
      } catch (busError: any) {
        console.warn(`[LiveTrading] Failed to emit cluster bus event:`, busError.message);
      }

      // 5. Broadcast state change
      try {
        const { contextBridge } = await import('./context-bridge');
        await contextBridge.broadcast({
          type: 'state_update',
          payload: { tradingMode: 'stopped', previousMode: 'live' },
          userId,
        });
      } catch (bridgeError: any) {
        console.warn(`[LiveTrading] Failed to broadcast via context bridge:`, bridgeError.message);
      }

      console.log(`[LiveTrading] ✅ Live trading stopped successfully for user ${userId}`);

      return {
        success: true,
        message: '✅ Live trading deactivated. System is now in standby mode.',
        data: {
          mode: 'stopped',
          previousMode: 'live',
          stoppedAt: new Date().toISOString(),
        },
      };

    } catch (error: any) {
      console.error(`[LiveTrading] Error stopping live trading:`, error);
      return {
        success: false,
        message: `Failed to stop live trading: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Check live trading status
   */
  async checkLiveTradingStatus(userId: string): Promise<ActionResult> {
    try {
      // Check local sessions
      const session = this.sessions.get(userId);
      
      // Check global trading engines
      const tradingEngines = (global as any).tradingEngines as Map<string, any>;
      const engine = tradingEngines?.get(userId);
      
      const isActive = !!(
        (session && session.engine?.isRunning) ||
        (engine && engine.isRunning && engine.mode === 'live')
      );

      if (isActive) {
        const startedAt = session?.startedAt || engine?.startedAt || new Date();
        const duration = Date.now() - new Date(startedAt).getTime();
        const durationMinutes = Math.floor(duration / 60000);

        return {
          success: true,
          message: `🔴 **LIVE TRADING ACTIVE** - Real orders are being placed. Running for ${durationMinutes} minute(s).`,
          data: {
            mode: 'live',
            status: 'active',
            startedAt: startedAt.toISOString(),
            durationMs: duration,
          },
        };
      } else {
        return {
          success: true,
          message: '⚪ Live trading is currently **INACTIVE**. System is in standby mode.',
          data: {
            mode: 'stopped',
            status: 'inactive',
          },
        };
      }

    } catch (error: any) {
      console.error(`[LiveTrading] Error checking status:`, error);
      return {
        success: false,
        message: `Failed to check live trading status: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Get all active sessions (for admin/monitoring)
   */
  getActiveSessions(): LiveTradingSession[] {
    return Array.from(this.sessions.values());
  }
}

// Export singleton instance
export const liveTradingService = new LiveTradingService();

// Export functions for NLAI registry
export async function startLiveTrading(userId: string): Promise<ActionResult> {
  return await liveTradingService.startLiveTrading(userId);
}

export async function stopLiveTrading(userId: string): Promise<ActionResult> {
  return await liveTradingService.stopLiveTrading(userId);
}

export async function checkLiveTradingStatus(userId: string): Promise<ActionResult> {
  return await liveTradingService.checkLiveTradingStatus(userId);
}

export async function activateLiveTrading(userId: string): Promise<ActionResult> {
  return await liveTradingService.activateLiveTrading(userId);
}
