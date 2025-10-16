/**
 * Config Change Handler
 * 
 * Unified handler for configuration changes that ensures:
 * 1. ConfigBob cache invalidation
 * 2. Cortex cache clearing
 * 3. ContextRefreshCoordinator triggering
 * 4. EngineSettingsBus notification (for strategies)
 * 
 * Phase 8.6.5 Addendum: Ensures Walter AI receives fresh data after config changes
 */

import { bobCore } from './bob-core';
import { cortexCore } from './cortex/cortex-core';
import { contextRefreshCoordinator } from './context-refresh-coordinator';

type ConfigType = 'strategies' | 'guardrails' | 'screeners' | 'goals' | 'purpose';
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
      // Step 1: Invalidate ConfigBob cache for this specific config type
      const { configBob } = await import('./bob-config');
      configBob.invalidateConfig(userId, mode, configType);
      console.log(`[${this.MODULE_NAME}] ✅ ConfigBob cache invalidated for ${configType}`);

      // Step 2: Clear Cortex cache for this config type
      // Cortex keys follow pattern: config:configType:mode:userId
      const cortexKey = `config:${configType}:${mode}:${userId}`;
      cortexCore.delete(cortexKey);
      console.log(`[${this.MODULE_NAME}] ✅ Cortex cache cleared for ${cortexKey}`);

      // Step 3: For global context (strategy_settings), also clear global keys
      if (configType === 'strategies' && globalContextId) {
        const globalCortexKey = `config:${configType}:${mode}:${globalContextId}`;
        cortexCore.delete(globalCortexKey);
        console.log(`[${this.MODULE_NAME}] ✅ Cortex cache cleared for global context: ${globalCortexKey}`);
      }

      // Step 4: Trigger ContextRefreshCoordinator to re-sync all layers
      // This ensures Walter AI gets fresh data
      const refreshResult = await contextRefreshCoordinator.refresh(userId, mode, source);
      console.log(`[${this.MODULE_NAME}] ✅ Context refreshed in ${refreshResult.latencyMs}ms`);

      // Step 5: If this is a strategy change, notify EngineSettingsBus
      if (configType === 'strategies') {
        const { EngineSettingsBus } = await import('./trading-engine');
        await EngineSettingsBus.publish({ userId, mode });
        console.log(`[${this.MODULE_NAME}] ✅ EngineSettingsBus notified for strategy change`);
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
    
    const { configBob } = await import('./bob-config');
    configBob.invalidateMode(userId, mode);
    
    // Clear all Cortex config keys for this mode
    const configTypes: ConfigType[] = ['strategies', 'guardrails', 'screeners', 'goals', 'purpose'];
    configTypes.forEach(type => {
      cortexCore.delete(`config:${type}:${mode}:${userId}`);
    });
    
    // Trigger full context refresh
    await contextRefreshCoordinator.refresh(userId, mode, 'direct');
    
    console.log(`[${this.MODULE_NAME}] ✅ All config invalidated for ${mode} mode`);
  }
}

export const configChangeHandler = new ConfigChangeHandler();
