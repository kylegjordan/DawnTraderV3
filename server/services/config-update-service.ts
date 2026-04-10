/**
 * Configuration Update Service
 * Provides direct function calls for updating guardrails, goals, and screeners
 * Used by API endpoints for configuration management
 */

import { storage } from '../storage';
import { insertGuardrailsSchema } from '@shared/schema';
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
 * 
 * [9.7] DEPRECATED: This function updates the legacy guardrails table.
 * Use updateGuardrailsV2() for production code paths.
 * This method now throws an error to prevent accidental usage.
 */
export async function updateGuardrails(
  userId: string,
  mode: 'live' | 'paper',
  updates: Partial<z.infer<typeof insertGuardrailsSchema>>
): Promise<ConfigUpdateResult> {
  // [9.7] Block legacy guardrails updates
  console.error(`[ConfigUpdateService][9.7] BLOCKED: Legacy guardrails update attempted for user ${userId}, mode: ${mode}`);
  return {
    success: false,
    message: '[9.7] Legacy guardrails update blocked – use guardrails_v2 instead.',
    error: 'Deprecated: guardrails table is obsolete. Use updateGuardrailsV2() instead.',
  };
}

/**
 * [9.7] Update guardrails_v2 (modern percentage-based risk management settings)
 */
export async function updateGuardrailsV2(
  userId: string,
  mode: 'live' | 'paper',
  updates: {
    portfolioRiskPerTradePct?: string | number;
    symbolCooldownMinutes?: number;
    maxOpenPositions?: number;
    dailyLossKillSwitchPct?: string | number;
    maxPositionPercentPct?: string | number;
    maxTotalExposurePct?: string | number;
  }
): Promise<ConfigUpdateResult> {
  try {
    console.log(`[ConfigUpdateService][9.7] Updating guardrails_v2 for user ${userId}, mode: ${mode}`, updates);
    
    // Build update payload
    const updatePayload: any = { mode };
    if (updates.portfolioRiskPerTradePct !== undefined) {
      updatePayload.portfolioRiskPerTradePct = String(updates.portfolioRiskPerTradePct);
    }
    if (updates.symbolCooldownMinutes !== undefined) {
      updatePayload.symbolCooldownMinutes = updates.symbolCooldownMinutes;
    }
    if (updates.maxOpenPositions !== undefined) {
      updatePayload.maxOpenPositions = updates.maxOpenPositions;
    }
    if (updates.dailyLossKillSwitchPct !== undefined) {
      updatePayload.dailyLossKillSwitchPct = String(updates.dailyLossKillSwitchPct);
    }
    if (updates.maxPositionPercentPct !== undefined) {
      updatePayload.maxPositionPercentPct = String(updates.maxPositionPercentPct);
    }
    if (updates.maxTotalExposurePct !== undefined) {
      updatePayload.maxTotalExposurePct = String(updates.maxTotalExposurePct);
    }
    updatePayload.lastUpdatedBy = userId;
    
    // Update database
    const guardrailsData = await storage.upsertGuardrailsV2(updatePayload);
    
    console.info(`[ConfigUpdateService][9.7] User ${userId} updated guardrails_v2 for ${mode} mode`);
    
    // Invalidate caches and refresh context
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
      timestamp: guardrailsData.lastUpdated?.toISOString() || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[ConfigUpdateService][9.7] Error updating guardrails_v2:', error);
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
        aiValidationNotes: goal.aiValidationNotes || 'Updated via API',
      };
      
      const result = mode === 'live'
        ? await storage.upsertGoalLive(goalData)
        : await storage.upsertGoalPaper(goalData);
      
      console.log(`[ConfigUpdateService] Saved goal ${goal.metricName} = ${goal.goalValue} (${mode})`);
      updatedGoals.push(result);
    }
    
    // Invalidate caches and refresh context
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
 * Get current guardrails
 * [9.7] Migrated to guardrails_v2 – legacy dollar fields removed
 */
export async function getGuardrails(userId: string, mode: 'live' | 'paper') {
  try {
    // [9.7] Use guardrails_v2 instead of legacy guardrails table
    const guardrailsData = await storage.getGuardrailsV2({ mode });
    return guardrailsData;
  } catch (error: any) {
    console.error('[ConfigUpdateService][9.7] Error fetching guardrails_v2:', error);
    return null;
  }
}

/**
 * Get current goals
 */
export async function getGoals(userId: string, mode: 'live' | 'paper') {
  try {
    const goalsData = mode === 'live' 
      ? await storage.getGoalsLive()
      : await storage.getGoalsPaper();
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
    // Phase 27.F.13.M: Get global screener filters (mode-only, no userId)
    const screenerData = await storage.getScreenerFilters({ mode });
    return screenerData;
  } catch (error: any) {
    console.error('[ConfigUpdateService] Error fetching screener filters:', error);
    return null;
  }
}
