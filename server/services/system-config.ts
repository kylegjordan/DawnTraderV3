import { db } from '../db';
import { systemConfig } from '@shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Phase 31.H: System Configuration Service
 * 
 * Manages global system flags including passive learning mode.
 * Uses singleton pattern - only one system_config row exists.
 */
export class SystemConfigService {
  private static instance: SystemConfigService;
  private configCache: {
    passiveLearning: boolean;
  } | null = null;

  private constructor() {
    console.log('[31.H][SystemConfig] Service initialized');
  }

  static getInstance(): SystemConfigService {
    if (!SystemConfigService.instance) {
      SystemConfigService.instance = new SystemConfigService();
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
        const [created] = await db.insert(systemConfig).values({
          systemFlags: { passiveLearning: false },
        }).returning();
        
        this.configCache = {
          passiveLearning: false,
        };
        
        console.log('[31.H][SystemConfig] Initialized default configuration');
        return this.configCache;
      }
      
      this.configCache = {
        passiveLearning: config.systemFlags?.passiveLearning ?? false,
      };
      
      return this.configCache;
    } catch (error: any) {
      console.error('[31.H][SystemConfig] Error fetching config:', error);
      return { passiveLearning: false };
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
