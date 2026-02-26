/**
 * Config Change Handler
 *
 * Unified handler for configuration changes that ensures:
 * 1. ContextRefreshCoordinator triggering
 * 2. EngineSettingsBus notification (for strategies)
 * 3. StateAwareness cache invalidation
 * 4. Context Bridge broadcast
 */

// Directive 12.2.3: bobCore and cortexCore imports removed (files deleted in Batch 7A)
import { contextRefreshCoordinator } from './context-refresh-coordinator';

type ConfigType = 'strategies' | 'guardrails' | 'guardrails_v2' | 'screeners' | 'goals' | 'purpose' | 'goals_preset';
type RefreshSource = 'api' | 'direct' | 'resync';

interface ConfigChangeParams {
  userId: string;
  mode: 'live' | 'paper';
  configType: ConfigType;
  source?: RefreshSource;
  globalContextId?: string;
}

class ConfigChangeHandler {
  private readonly MODULE_NAME = 'ConfigChangeHandler';

  /**
   * Handle a configuration change by invalidating caches and refreshing context
   */
  async handleConfigChange(params: ConfigChangeParams): Promise<void> {
    const { userId, mode, configType, source = 'direct', globalContextId = 'default' } = params;
    
    console.log(`[${this.MODULE_NAME}] 🔄 Handling ${configType} change for ${mode} mode (source: ${source})`);

    try {
      // Directive 12.2.3: ConfigBob cache invalidation removed (bob-config deleted in Batch 7A)
      // Directive 12.2.3: Cortex cache clearing removed (cortex-core deleted in Batch 7A)

      // Step 1: Invalidate StateAwarenessService cache for this user
      const { stateAwarenessService } = await import('./state-awareness');
      stateAwarenessService.invalidateCache(userId);
      console.log(`[${this.MODULE_NAME}] ✅ StateAwareness cache invalidated for user ${userId.substring(0, 8)}`);

      // Step 2: Trigger ContextRefreshCoordinator to re-sync
      // Phase 3: refresh now uses mode only (single-tenant)
      const refreshResult = await contextRefreshCoordinator.refresh(mode, source);
      console.log(`[${this.MODULE_NAME}] ✅ Context refreshed in ${refreshResult.latencyMs}ms`);

      // Step 3: If this is a strategy change, notify EngineSettingsBus
      // Phase 3: EngineSettingsBus now uses mode only (single-tenant)
      if (configType === 'strategies') {
        const { EngineSettingsBus } = await import('./trading-engine');
        await EngineSettingsBus.publish({ mode });
        console.log(`[${this.MODULE_NAME}] ✅ EngineSettingsBus notified for strategy change`);
      }

      // Step 4: Broadcast config update via Context Bridge
      try {
        const { contextBridge } = await import('./context-bridge');
        await contextBridge.broadcast({
          type: 'config_update',
          payload: { configType, mode },
          userId,
          mode
        });
        console.log(`[${this.MODULE_NAME}] ✅ Config update broadcasted via Context Bridge`);
      } catch (bridgeError: any) {
        console.error(`[${this.MODULE_NAME}] Failed to broadcast config update:`, bridgeError.message);
      }

      console.log(`[${this.MODULE_NAME}] ✨ Config change handled successfully for ${configType}`);
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Error handling config change:`, error);
      throw error;
    }
  }

  /**
   * Invalidate all configuration caches for a mode
   * Use this for bulk changes or mode switches
   */
  async invalidateAllConfig(userId: string, mode: 'live' | 'paper'): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating ALL config for ${mode} mode`);
    
    // Directive 12.2.3: ConfigBob + Cortex cache invalidation removed (files deleted in Batch 7A)

    // Invalidate StateAwarenessService cache for this user
    const { stateAwarenessService } = await import('./state-awareness');
    stateAwarenessService.invalidateCache(userId);
    
    // Trigger full context refresh
    // Phase 3: refresh now uses mode only (single-tenant)
    await contextRefreshCoordinator.refresh(mode, 'direct');
    
    console.log(`[${this.MODULE_NAME}] ✅ All config invalidated for ${mode} mode`);
  }
}

export const configChangeHandler = new ConfigChangeHandler();
