/**
 * Configuration Update Service
 * Provides direct function calls for updating guardrails, goals, and screeners
 * Used by both API endpoints and NLAI action handlers
 */

import { storage } from '../storage';
import { insertGuardrailsSchema, insertScreenerFiltersSchema } from '@shared/schema';
import type { z } from 'zod';

export interface ConfigUpdateResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  timestamp?: string;
}

/**
 * Update guardrails (risk management settings)
 */
export async function updateGuardrails(
  userId: string,
  mode: 'live' | 'paper',
  updates: Partial<z.infer<typeof insertGuardrailsSchema>>
): Promise<ConfigUpdateResult> {
  try {
    console.log(`[ConfigUpdateService] Updating guardrails for user ${userId}, mode: ${mode}`, updates);
    
    // Fetch existing guardrails to merge with updates
    const existing = await storage.getGuardrails({ userId, mode });
    
    // Merge existing data with updates to ensure all required fields are present
    const mergedData = {
      userId,
      mode,
      maxDailyLoss: updates.maxDailyLoss ?? existing?.maxDailyLoss ?? '1000.00',
      maxDrawdown: updates.maxDrawdown ?? existing?.maxDrawdown ?? '10.00',
      maxPositionSize: updates.maxPositionSize ?? existing?.maxPositionSize ?? '5000.00',
      maxOpenPositions: updates.maxOpenPositions ?? existing?.maxOpenPositions ?? 5,
      riskPerTrade: updates.riskPerTrade ?? existing?.riskPerTrade ?? '1.5',
      aiCanAdjust: updates.aiCanAdjust ?? existing?.aiCanAdjust ?? false,
    };
    
    // Validate merged data
    const validatedData = insertGuardrailsSchema.parse(mergedData);
    
    // Update database
    const guardrailsData = await storage.upsertGuardrails(validatedData);
    
    console.info(`[ConfigUpdateService] User ${userId} updated guardrails for ${mode} mode`);
    
    // Invalidate caches and refresh context for Walter AI
    const { configChangeHandler } = await import('./config-change-handler');
    await configChangeHandler.handleConfigChange({
      userId,
      mode,
      configType: 'guardrails',
      source: 'direct'
    });
    
    return {
      success: true,
      message: `Guardrails updated successfully for ${mode} mode`,
      data: guardrailsData,
      timestamp: guardrailsData.updatedAt?.toISOString() || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error updating guardrails:', error);
    return {
      success: false,
      message: `Failed to update guardrails: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Update goals (trading objectives)
 */
export async function updateGoals(
  userId: string,
  mode: 'live' | 'paper',
  goals: Array<{
    metricName: string;
    goalValue: string | number;
    actualValue?: string | number;
    percentAchieved?: string | number;
    aiValidationNotes?: string;
  }>
): Promise<ConfigUpdateResult> {
  try {
    console.log(`[ConfigUpdateService] Updating ${goals.length} goals for user ${userId}, mode: ${mode}`);
    
    const updatedGoals = [];
    
    for (const goal of goals) {
      const goalData = {
        userId,
        metricName: goal.metricName,
        goalValue: goal.goalValue?.toString(),
        actualValue: goal.actualValue?.toString() || '0',
        percentAchieved: goal.percentAchieved?.toString() || '0',
        aiValidationNotes: goal.aiValidationNotes || 'Updated via Walter NLAI',
      };
      
      const result = mode === 'live'
        ? await storage.upsertGoalLive(goalData)
        : await storage.upsertGoalPaper(goalData);
      
      console.log(`[ConfigUpdateService] Saved goal ${goal.metricName} = ${goal.goalValue} (${mode})`);
      updatedGoals.push(result);
    }
    
    // Invalidate caches and refresh context for Walter AI
    const { configChangeHandler } = await import('./config-change-handler');
    await configChangeHandler.handleConfigChange({
      userId,
      mode,
      configType: 'goals',
      source: 'direct'
    });
    
    return {
      success: true,
      message: `Updated ${updatedGoals.length} goal(s) for ${mode} mode`,
      data: updatedGoals,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error updating goals:', error);
    return {
      success: false,
      message: `Failed to update goals: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Update screener filters (market scanning criteria)
 */
export async function updateScreeners(
  userId: string,
  mode: 'live' | 'paper',
  updates: Partial<z.infer<typeof insertScreenerFiltersSchema>>
): Promise<ConfigUpdateResult> {
  try {
    console.log(`[ConfigUpdateService] Updating screener filters for user ${userId}, mode: ${mode}`, updates);
    
    // Fetch existing screener filters to merge with updates
    const existing = await storage.getScreenerFilters({ userId, mode });
    
    // Merge existing data with updates to ensure all required fields are present
    const mergedData = {
      userId,
      mode,
      minVolume: updates.minVolume ?? existing?.minVolume ?? '500000.00',
      minPrice: updates.minPrice ?? existing?.minPrice ?? '0.001',
      maxPrice: updates.maxPrice ?? existing?.maxPrice ?? '50000.00',
      minMarketCap: updates.minMarketCap ?? existing?.minMarketCap ?? '10000000.00',
      maxBidAskSpread: updates.maxBidAskSpread ?? existing?.maxBidAskSpread ?? '2.50',
      rsiMin: updates.rsiMin ?? existing?.rsiMin ?? 20,
      rsiMax: updates.rsiMax ?? existing?.rsiMax ?? 80,
      volatilityMin: updates.volatilityMin ?? existing?.volatilityMin ?? '0.20',
      volatilityMax: updates.volatilityMax ?? existing?.volatilityMax ?? '10.00',
      excludeStablecoins: updates.excludeStablecoins ?? existing?.excludeStablecoins ?? true,
      minLiquidity: updates.minLiquidity ?? existing?.minLiquidity ?? '250000.00',
      allowRegulatedOnly: updates.allowRegulatedOnly ?? existing?.allowRegulatedOnly ?? false,
    };
    
    // Validate merged data
    const validatedData = insertScreenerFiltersSchema.parse(mergedData);
    
    // Update database
    const screenerData = await storage.upsertScreenerFilters(validatedData);
    
    console.info(`[ConfigUpdateService] User ${userId} updated screener filters for ${mode} mode`);
    
    // Invalidate caches and refresh context for Walter AI
    const { configChangeHandler } = await import('./config-change-handler');
    await configChangeHandler.handleConfigChange({
      userId,
      mode,
      configType: 'screeners',
      source: 'direct'
    });
    
    return {
      success: true,
      message: `Screener filters updated successfully for ${mode} mode`,
      data: screenerData,
      timestamp: screenerData.updatedAt?.toISOString() || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error updating screener filters:', error);
    return {
      success: false,
      message: `Failed to update screener filters: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Get current guardrails
 */
export async function getGuardrails(userId: string, mode: 'live' | 'paper') {
  try {
    const guardrailsData = await storage.getGuardrails({ userId, mode });
    return guardrailsData;
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error fetching guardrails:', error);
    return null;
  }
}

/**
 * Get current goals
 */
export async function getGoals(userId: string, mode: 'live' | 'paper') {
  try {
    const goalsData = mode === 'live' 
      ? await storage.getUserGoalsLive(userId)
      : await storage.getUserGoalsPaper(userId);
    return goalsData;
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error fetching goals:', error);
    return null;
  }
}

/**
 * Get current screener filters
 */
export async function getScreeners(userId: string, mode: 'live' | 'paper') {
  try {
    const screenerData = await storage.getScreenerFilters({ userId, mode });
    return screenerData;
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error fetching screener filters:', error);
    return null;
  }
}
