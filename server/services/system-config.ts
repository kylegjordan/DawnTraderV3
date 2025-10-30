import { db } from '../db';
import { systemConfig } from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Phase 31.H/32.BS: System Configuration Service
 * 
 * Manages global system flags including passive learning mode.
 * Uses singleton pattern - only one system_config row exists.
 * Phase 32.BS: Passive mode is now the default idle state.
 */
export class SystemConfigService {
  private static instance: SystemConfigService;
  private configCache: {
    passiveLearning: boolean;
  } | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    console.log('[31.H][SystemConfig] Service initialized');
  }

  /**
   * Phase 32.BS: Initialize passive mode as default
   * Ensures continuous learning even when trading is paused
   */
  private async initializePassiveMode(): Promise<void> {
    try {
      const config = await this.getConfig();
      if (!config.passiveLearning) {
        await this.updateConfig({ passiveLearning: true }, 'system');
        console.log('[32.BS][PassiveMode] Activated by default — continuous learning enabled');
      }
    } catch (error: any) {
      console.error('[32.BS][PassiveMode] Failed to initialize:', error.message);
    }
  }

  static getInstance(): SystemConfigService {
    if (!SystemConfigService.instance) {
      SystemConfigService.instance = new SystemConfigService();
      // Phase 32.BS: Initialize passive mode on first getInstance call
      // Fire and forget initialization (errors are logged internally)
      SystemConfigService.instance.initPromise = SystemConfigService.instance.initializePassiveMode();
    }
    return SystemConfigService.instance;
  }

  /**
   * Get system configuration
   * Returns cached config or fetches from database
   */
  async getConfig(): Promise<{ passiveLearning: boolean }> {
    try {
      const [config] = await db.select().from(systemConfig).limit(1);
      
      if (!config) {
        // Initialize default config if none exists
        // Phase 32.BS: Passive mode is now the default
        const [created] = await db.insert(systemConfig).values({
          systemFlags: { passiveLearning: true },
        }).returning();
        
        this.configCache = {
          passiveLearning: true,
        };
        
        console.log('[32.BS][SystemConfig] Initialized with passive learning enabled (default)');
        return this.configCache;
      }
      
      this.configCache = {
        passiveLearning: config.systemFlags?.passiveLearning ?? false,
      };
      
      return this.configCache;
    } catch (error: any) {
      console.error('[31.H][SystemConfig] Error fetching config:', error);
      // Phase 32.BS: Return passive mode as default even on error
      return { passiveLearning: true };
    }
  }

  /**
   * Update system configuration
   */
  async updateConfig(
    flags: { passiveLearning?: boolean },
    updatedBy?: string
  ): Promise<{ passiveLearning: boolean }> {
    try {
      // Get current config
      const currentConfig = await this.getConfig();
      
      // Merge with new flags
      const newFlags = {
        ...currentConfig,
        ...flags,
      };
      
      // Get existing row or create if none exists
      const [existing] = await db.select().from(systemConfig).limit(1);
      
      if (existing) {
        // Update existing row
        await db.update(systemConfig)
          .set({
            systemFlags: newFlags,
            updatedAt: sql`NOW()`,
            updatedBy,
          })
          .where(sql`true`); // Update the single row
      } else {
        // Insert new row
        await db.insert(systemConfig).values({
          systemFlags: newFlags,
          updatedBy,
        });
      }
      
      this.configCache = newFlags;
      
      // Log passive learning state changes
      if (flags.passiveLearning !== undefined) {
        const state = flags.passiveLearning ? 'ENABLED' : 'DISABLED';
        console.log(`[31.H][PassiveLearning] ${state} by ${updatedBy || 'system'}`);
        
        // Phase 32.BS: Broadcast mode change via WebSocket for cross-user sync
        try {
          const { contextBridge } = await import('./context-bridge');
          const mode = flags.passiveLearning ? 'passive' : 'active';
          await contextBridge.broadcast({
            type: 'MODE_CHANGE',
            payload: { mode, passiveLearning: flags.passiveLearning },
            userId: 'system',
            mode: 'paper'
          });
          console.log(`[32.BS][SystemSync] Mode changed → ${mode} (broadcast OK)`);
        } catch (error: any) {
          console.error('[32.BS][SystemSync] Failed to broadcast mode change:', error.message);
        }
      }
      
      return newFlags;
    } catch (error: any) {
      console.error('[31.H][SystemConfig] Error updating config:', error);
      throw error;
    }
  }

  /**
   * Check if passive learning is enabled
   * Cached for performance
   */
  isPassiveLearningEnabled(): boolean {
    return this.configCache?.passiveLearning ?? false;
  }
}

// Export singleton instance
export const systemConfigService = SystemConfigService.getInstance();
