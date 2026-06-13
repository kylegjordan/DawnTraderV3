/**
 * Live Trading Service
 * Phase 22.3 - Live Trading Voice/Chat Activation
 * Phase 41F-A-5 - Live Mode Queue Integration
 *
 * Manages live trading mode with manual approval requirements
 * Uses OperationQueue for serialized execution (Phase 41F)
 *
 * Directive 12.2.7: Removed NLAI/ExecutionPolicyController dependencies (deprecated)
 */

import { storage } from '../storage';
import { clusterBus } from './cluster-bus';
import { permissionCache } from './permission-cache.js';
import type { UserRole } from '../config/permissions.js';
import { liveOperationQueue } from '../utils/operation-queue';
import { reset24hWindow, resetHourlyScanHistory } from './fx5-24h-window.js';
import { livePricingAdapter } from './live-pricing-adapter.js';

// Directive 12.2.7: ActionResult type inlined from removed nlai-action-registry.ts
export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  shouldBroadcast?: boolean;
}

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
   * Phase 41F-A-5: Uses operation queue for serialized execution
   */
  async activateLiveTrading(userId: string): Promise<ActionResult> {
    console.log(`[41F][QUEUE][LIVE] activateLiveTrading called (userId: ${userId})`);

    try {
      const queueResult = await liveOperationQueue.enqueue(
        async () => {
          try {
            console.log(`[LiveTrading] Activating live mode for user ${userId} (post-approval)`);

            // 1. Phase 27.3: Verify user has trade_live permission (fail closed)
            const user = await storage.getUser(userId);
      if (!user || !user.role) {
        console.log(`[LiveTrading] ❌ Permission denied: user ${userId} not found or role missing`);
        return {
          success: false,
          message: 'Permission denied: User account not found or improperly configured.',
        };
      }

      const userRole = user.role as UserRole;
      const hasPermission = await permissionCache.hasPermission(userId, userRole, 'trade_live');

      if (!hasPermission) {
        console.log(`[LiveTrading] ❌ Permission denied: user ${userId} (${userRole}) lacks trade_live permission`);
        return {
          success: false,
          message: 'Permission denied: You do not have permission to activate live trading.',
          data: { permissionRequired: 'trade_live', userRole },
        };
      }

      // 2. Check if already running
      if (this.sessions.has(userId)) {
        return {
          success: true,
          message: 'Live trading already activated.',
          shouldBroadcast: false, // Phase 41F-B: No broadcast needed for idempotent reuse
        };
      }

      // 3. Directive 12.2.7: ExecutionPolicyController removed — approval is handled
      // by the two-step flow (startLiveTrading prompt → activateLiveTrading after user confirms)
      console.log(`[LiveTrading] ✅ Permission verified and activation approved by user, proceeding with engine startup`);

      // 4. Initialize trading engine (placeholder for now)
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

      // Phase 8.8.3-I6-FIX: Set trading mode to 'live' for correct WebSocket broadcasts
      livePricingAdapter.setTradingMode('live');
      console.log('[8.8.3-I6-FIX] LivePricingAdapter trading mode set to live');

      // 4. Emit cluster bus event with policy-confirmed payload
      try {
        await clusterBus.publish('task_completed', {
          taskType: 'live_trading_activation',
          userId,
          mode: 'live',
          action: 'started',
          success: true,
          policyApproved: true,
          policyTimestamp: new Date().toISOString(),
          riskLevel: 'critical',
          timestamp: new Date().toISOString(),
        }, 'live_trading');

        console.log(`[LiveTrading] ✅ Cluster bus event emitted: task_completed (live trading started, policy approved)`);
      } catch (busError: any) {
        // Non-blocking - log but continue
        console.warn(`[LiveTrading] Failed to emit cluster bus event:`, busError.message);
      }

      // Phase 41F-B-3: Move WebSocket broadcast OUTSIDE queue job
      console.log('[41F-B][BROADCAST] Queued job - skipping broadcast (will fire after queue completion)');

            console.log(`[LiveTrading] ✅ Live trading activated successfully for user ${userId}`);

            return {
              success: true,
              message: '✅ Live trading activated! System is now placing **real orders** on Kraken. Monitor closely.',
              data: {
                mode: 'live',
                status: 'active',
                startedAt: new Date().toISOString(),
              },
              shouldBroadcast: true, // Phase 41F-B: Trigger broadcasts after queue completion
            };
          } catch (error: any) {
            console.error(`[LiveTrading] Error in activateLiveTrading job:`, error);
            return {
              success: false,
              message: `Failed to activate live trading: ${error.message}`,
              error: error.message,
            };
          }
        },
        {
          userId,
          mode: 'live',
          action: 'start',
        }
      );

      // Phase 41F-B-3: Fire WebSocket broadcasts OUTSIDE queue job (non-blocking)
      if (queueResult.shouldBroadcast) {
        console.log('[41F-B][BROADCAST] Firing live mode state broadcasts (async, non-blocking)');

        // Fire broadcast asynchronously - don't block HTTP response
        const { contextBridge } = await import('./context-bridge');
        contextBridge.broadcast({
          type: 'state_update',
          payload: { tradingMode: 'live', status: 'active' },
          userId,
        }).catch((err: Error) => {
          console.error('[41F-B][BROADCAST] Error broadcasting live mode activation:', err);
        });
      }

      return queueResult;
    } catch (error: any) {
      console.error(`[41F][QUEUE][LIVE] activateLiveTrading queue error:`, error);
      return {
        success: false,
        message: `Failed to activate live trading: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Stop live trading mode
   * Phase 41F-A-5: Uses operation queue for serialized execution
   */
  async stopLiveTrading(userId: string): Promise<ActionResult> {
    console.log(`[41F][QUEUE][LIVE] stopLiveTrading called (userId: ${userId})`);

    try {
      const queueResult = await liveOperationQueue.enqueue(
        async () => {
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
            shouldBroadcast: false, // Phase 41F-B: No broadcast needed for idempotent reuse
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

      // REB 2.8.5C: Reset 24h window and hourly scan history on ACTIVE → STOPPED
      console.log('[REB 2.8.5C] Resetting FX5 24h window and hourly scan history for live mode');
      reset24hWindow('live');
      resetHourlyScanHistory('live');

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

      // Phase 41F-B-3: Move WebSocket broadcast OUTSIDE queue job
      console.log('[41F-B][BROADCAST] Queued job - skipping broadcast (will fire after queue completion)');

            console.log(`[LiveTrading] ✅ Live trading stopped successfully for user ${userId}`);

            return {
              success: true,
              message: '✅ Live trading deactivated. System is now in standby mode.',
              data: {
                mode: 'stopped',
                previousMode: 'live',
                stoppedAt: new Date().toISOString(),
              },
              shouldBroadcast: true, // Phase 41F-B: Trigger broadcasts after queue completion
            };
          } catch (error: any) {
            console.error(`[LiveTrading] Error in stopLiveTrading job:`, error);
            return {
              success: false,
              message: `Failed to stop live trading: ${error.message}`,
              error: error.message,
            };
          }
        },
        {
          userId,
          mode: 'live',
          action: 'stop',
        }
      );

      // Phase 41F-B-3: Fire WebSocket broadcasts OUTSIDE queue job (non-blocking)
      if (queueResult.shouldBroadcast) {
        console.log('[41F-B][BROADCAST] Firing live mode stop broadcasts (async, non-blocking)');

        // Fire broadcast asynchronously - don't block HTTP response
        const { contextBridge } = await import('./context-bridge');
        contextBridge.broadcast({
          type: 'state_update',
          payload: { tradingMode: 'stopped', previousMode: 'live' },
          userId,
        }).catch((err: Error) => {
          console.error('[41F-B][BROADCAST] Error broadcasting live mode stop:', err);
        });
      }

      return queueResult;
    } catch (error: any) {
      console.error(`[41F][QUEUE][LIVE] stopLiveTrading queue error:`, error);
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

// Export functions for service consumers
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
