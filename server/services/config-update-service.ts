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
 * 
 * Phase 8.8.3-AJ10.4: Respects per-filter manualOverrideEnabled flags
 * Filters marked as manual (manualOverrideEnabled=true) are NOT overwritten
 */
export async function updateScreeners(
  userId: string,
  mode: 'live' | 'paper',
  updates: Partial<z.infer<typeof insertScreenerFiltersSchema>>
): Promise<ConfigUpdateResult> {
  try {
    console.log(`[ConfigUpdateService] Updating screener filters for user ${userId}, mode: ${mode}`, updates);
    
    // Phase 27.F.13.M: Fetch global screener filters (mode-only, no userId)
    const existing = await storage.getScreenerFilters({ mode });
    
    // AJ10.4: Check per-filter manual override flags
    // Filters with manualOverrideEnabled=true should NOT be overwritten by LATTI/auto-tuning
    const filterOverrides = (existing as any)?.filterOverrides as Record<string, { manualOverrideEnabled?: boolean }> ?? {};
    
    // Helper to check if a filter is in manual mode
    const isManualFilter = (filterName: string): boolean => {
      const override = filterOverrides[filterName];
      return override?.manualOverrideEnabled === true;
    };
    
    // AJ10.4: Protect manual overrides - only use update if filter is NOT manual
    // Includes all tunable filter parameters (numeric and boolean)
    const safeUpdates = {
      minVolume: isManualFilter('minVolume') ? existing?.minVolume : updates.minVolume,
      minPrice: isManualFilter('minPrice') ? existing?.minPrice : updates.minPrice,
      maxPrice: isManualFilter('maxPrice') ? existing?.maxPrice : updates.maxPrice,
      minMarketCap: isManualFilter('minMarketCap') ? existing?.minMarketCap : updates.minMarketCap,
      maxBidAskSpread: isManualFilter('maxBidAskSpread') ? existing?.maxBidAskSpread : updates.maxBidAskSpread,
      rsiMin: isManualFilter('rsiMin') ? existing?.rsiMin : updates.rsiMin,
      rsiMax: isManualFilter('rsiMax') ? existing?.rsiMax : updates.rsiMax,
      volatilityMin: isManualFilter('volatilityMin') ? existing?.volatilityMin : updates.volatilityMin,
      volatilityMax: isManualFilter('volatilityMax') ? existing?.volatilityMax : updates.volatilityMax,
      minLiquidity: isManualFilter('minLiquidity') ? existing?.minLiquidity : updates.minLiquidity,
      // Boolean filters - also protected when in manual mode
      excludeStablecoins: isManualFilter('excludeStablecoins') ? existing?.excludeStablecoins : updates.excludeStablecoins,
      allowRegulatedOnly: isManualFilter('allowRegulatedOnly') ? existing?.allowRegulatedOnly : updates.allowRegulatedOnly,
    };
    
    // Log if any manual filters were protected
    const protectedFilters = Object.keys(updates).filter(k => isManualFilter(k));
    if (protectedFilters.length > 0) {
      console.log(`[AJ10.4][MANUAL_PROTECTED] Skipping update for manual filters: ${protectedFilters.join(', ')}`);
    }
    
    // Merge existing data with safe updates to ensure all required fields are present
    const mergedData = {
      userId,
      mode,
      minVolume: safeUpdates.minVolume ?? existing?.minVolume ?? '500000.00',
      minPrice: safeUpdates.minPrice ?? existing?.minPrice ?? '0.001',
      maxPrice: safeUpdates.maxPrice ?? existing?.maxPrice ?? '50000.00',
      minMarketCap: safeUpdates.minMarketCap ?? existing?.minMarketCap ?? '10000000.00',
      maxBidAskSpread: safeUpdates.maxBidAskSpread ?? existing?.maxBidAskSpread ?? '2.50',
      rsiMin: safeUpdates.rsiMin ?? existing?.rsiMin ?? 20,
      rsiMax: safeUpdates.rsiMax ?? existing?.rsiMax ?? 80,
      volatilityMin: safeUpdates.volatilityMin ?? existing?.volatilityMin ?? '0.20',
      volatilityMax: safeUpdates.volatilityMax ?? existing?.volatilityMax ?? '10.00',
      excludeStablecoins: safeUpdates.excludeStablecoins ?? existing?.excludeStablecoins ?? true,
      minLiquidity: safeUpdates.minLiquidity ?? existing?.minLiquidity ?? '250000.00',
      allowRegulatedOnly: safeUpdates.allowRegulatedOnly ?? existing?.allowRegulatedOnly ?? false,
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
