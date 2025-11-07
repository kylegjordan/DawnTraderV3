import { db } from "../db";
import { configRegistry, type InsertConfigRegistry, type ConfigRegistry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/structured-logger";

export class ConfigService {
  static async getAll(): Promise<ConfigRegistry[]> {
    try {
      const results = await db.select().from(configRegistry).orderBy(configRegistry.key);
      return results;
    } catch (error) {
      logger.error("Failed to fetch all config entries", { error, phase: "6" });
      throw error;
    }
  }

  static async get(key: string): Promise<ConfigRegistry | undefined> {
    try {
      const results = await db.select().from(configRegistry).where(eq(configRegistry.key, key)).limit(1);
      return results[0];
    } catch (error) {
      logger.error("Failed to fetch config entry", { key, error, phase: "6" });
      throw error;
    }
  }

  static async update(key: string, value: any, type: string, updatedBy: string): Promise<void> {
    try {
      const existing = await this.get(key);
      
      if (existing) {
        await db.update(configRegistry)
          .set({ 
            value, 
            type, 
            updatedBy,
            updatedAt: new Date()
          })
          .where(eq(configRegistry.key, key));
        
        logger.info("Config updated", { key, updatedBy, phase: "6" });
      } else {
        await db.insert(configRegistry).values({
          key,
          value,
          type,
          updatedBy
        });
        
        logger.info("Config created", { key, updatedBy, phase: "6" });
      }
    } catch (error) {
      logger.error("Failed to update config entry", { key, error, phase: "6" });
      throw error;
    }
  }

  static async delete(key: string): Promise<void> {
    try {
      await db.delete(configRegistry).where(eq(configRegistry.key, key));
      logger.info("Config deleted", { key, phase: "6" });
    } catch (error) {
      logger.error("Failed to delete config entry", { key, error, phase: "6" });
      throw error;
    }
  }

  static async getBooleanValue(key: string, defaultValue: boolean = false): Promise<boolean> {
    const config = await this.get(key);
    if (!config) return defaultValue;
    return config.value === true || config.value === "true";
  }

  static async getNumberValue(key: string, defaultValue: number = 0): Promise<number> {
    const config = await this.get(key);
    if (!config) return defaultValue;
    return typeof config.value === 'number' ? config.value : parseFloat(config.value as string) || defaultValue;
  }

  static async getStringValue(key: string, defaultValue: string = ""): Promise<string> {
    const config = await this.get(key);
    if (!config) return defaultValue;
    return String(config.value);
  }
}
