/**
 * One-Time Data Duplication Script: LIVE → PAPER
 * 
 * Duplicates all LIVE mode configuration data to PAPER mode for:
 * - Goals (user_goals_live → user_goals_paper)
 * - Guardrails (mode='live' → mode='paper')
 * - Screeners (mode='live' → mode='paper')  
 * - Strategies (mode='live' → mode='paper')
 * - Purpose (mode='live' → mode='paper')
 * 
 * Only duplicates if PAPER data doesn't already exist for each category.
 * 
 * Usage: tsx server/scripts/duplicate-live-to-paper.ts
 */

import { db } from '../db';
import {
  userGoalsLive,
  userGoalsPaper,
  guardrails,
  screenerFilters,
  strategySettings,
} from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

interface DuplicationStats {
  goals: { duplicated: number; skipped: number };
  guardrails: { duplicated: number; skipped: number };
  screeners: { duplicated: number; skipped: number };
  strategies: { duplicated: number; skipped: number };
  purpose: { duplicated: number; skipped: number };
}

async function duplicateLiveToPaper(): Promise<void> {
  console.log('🔄 Starting LIVE → PAPER data duplication...\n');
  
  const stats: DuplicationStats = {
    goals: { duplicated: 0, skipped: 0 },
    guardrails: { duplicated: 0, skipped: 0 },
    screeners: { duplicated: 0, skipped: 0 },
    strategies: { duplicated: 0, skipped: 0 },
  };

  try {
    // 1. Duplicate Goals (user_goals_live → user_goals_paper)
    console.log('📊 Duplicating Goals...');
    const liveGoals = await db.select().from(userGoalsLive);
    
    for (const liveGoal of liveGoals) {
      const paperExists = await db.select()
        .from(userGoalsPaper)
        .where(and(
          eq(userGoalsPaper.userId, liveGoal.userId),
          eq(userGoalsPaper.metricName, liveGoal.metricName)
        ))
        .limit(1);
      
      if (paperExists.length === 0) {
        await db.insert(userGoalsPaper).values({
          userId: liveGoal.userId,
          metricName: liveGoal.metricName,
          goalValue: liveGoal.goalValue,
          actualValue: liveGoal.actualValue,
          percentAchieved: liveGoal.percentAchieved,
          aiValidationNotes: liveGoal.aiValidationNotes,
        });
        stats.goals.duplicated++;
        console.log(`  ✅ Duplicated goal: ${liveGoal.metricName} for user ${liveGoal.userId}`);
      } else {
        stats.goals.skipped++;
      }
    }

    // 2. Duplicate Guardrails (mode='live' → mode='paper')
    console.log('\n🛡️  Duplicating Guardrails...');
    const liveGuardrails = await db.select()
      .from(guardrails)
      .where(eq(guardrails.mode, 'live'));
    
    for (const liveGuardrail of liveGuardrails) {
      const paperExists = await db.select()
        .from(guardrails)
        .where(and(
          eq(guardrails.userId, liveGuardrail.userId),
          eq(guardrails.mode, 'paper')
        ))
        .limit(1);
      
      if (paperExists.length === 0) {
        await db.insert(guardrails).values({
          userId: liveGuardrail.userId,
          mode: 'paper',
          maxDailyLoss: liveGuardrail.maxDailyLoss,
          maxDrawdown: liveGuardrail.maxDrawdown,
          maxPositionSize: liveGuardrail.maxPositionSize,
          maxOpenPositions: liveGuardrail.maxOpenPositions,
          riskPerTrade: liveGuardrail.riskPerTrade,
          aiCanAdjust: liveGuardrail.aiCanAdjust,
        });
        stats.guardrails.duplicated++;
        console.log(`  ✅ Duplicated guardrails for user ${liveGuardrail.userId}`);
      } else {
        stats.guardrails.skipped++;
      }
    }

    // 3. Duplicate Screeners (mode='live' → mode='paper')
    console.log('\n🔍 Duplicating Screeners...');
    const liveScreeners = await db.select()
      .from(screenerFilters)
      .where(eq(screenerFilters.mode, 'live'));
    
    for (const liveScreener of liveScreeners) {
      const paperExists = await db.select()
        .from(screenerFilters)
        .where(and(
          eq(screenerFilters.userId, liveScreener.userId),
          eq(screenerFilters.mode, 'paper')
        ))
        .limit(1);
      
      if (paperExists.length === 0) {
        await db.insert(screenerFilters).values({
          userId: liveScreener.userId,
          mode: 'paper',
          minVolume: liveScreener.minVolume,
          minPrice: liveScreener.minPrice,
          maxPrice: liveScreener.maxPrice,
          minMarketCap: liveScreener.minMarketCap,
          maxBidAskSpread: liveScreener.maxBidAskSpread,
          rsiMin: liveScreener.rsiMin,
          rsiMax: liveScreener.rsiMax,
          volatilityMin: liveScreener.volatilityMin,
          volatilityMax: liveScreener.volatilityMax,
          excludeStablecoins: liveScreener.excludeStablecoins,
          minLiquidity: liveScreener.minLiquidity,
          allowRegulatedOnly: liveScreener.allowRegulatedOnly,
        });
        stats.screeners.duplicated++;
        console.log(`  ✅ Duplicated screeners for user ${liveScreener.userId}`);
      } else {
        stats.screeners.skipped++;
      }
    }

    // 4. Duplicate Strategies (mode='live' → mode='paper')
    console.log('\n⚙️  Duplicating Strategies...');
    const liveStrategies = await db.select()
      .from(strategySettings)
      .where(eq(strategySettings.mode, 'live'));
    
    for (const liveStrategy of liveStrategies) {
      const paperExists = await db.select()
        .from(strategySettings)
        .where(and(
          eq(strategySettings.userId, liveStrategy.userId),
          eq(strategySettings.mode, 'paper'),
          eq(strategySettings.strategy, liveStrategy.strategy)
        ))
        .limit(1);
      
      if (paperExists.length === 0) {
        await db.insert(strategySettings).values({
          userId: liveStrategy.userId,
          mode: 'paper',
          strategy: liveStrategy.strategy,
          enabled: liveStrategy.enabled,
          params: liveStrategy.params,
          version: liveStrategy.version,
        });
        stats.strategies.duplicated++;
        console.log(`  ✅ Duplicated strategy ${liveStrategy.strategy} for user ${liveStrategy.userId}`);
      } else {
        stats.strategies.skipped++;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📋 DUPLICATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Goals:       ${stats.goals.duplicated} duplicated, ${stats.goals.skipped} skipped`);
    console.log(`Guardrails:  ${stats.guardrails.duplicated} duplicated, ${stats.guardrails.skipped} skipped`);
    console.log(`Screeners:   ${stats.screeners.duplicated} duplicated, ${stats.screeners.skipped} skipped`);
    console.log(`Strategies:  ${stats.strategies.duplicated} duplicated, ${stats.strategies.skipped} skipped`);
    console.log('='.repeat(70));
    
    const totalDuplicated = 
      stats.goals.duplicated + 
      stats.guardrails.duplicated + 
      stats.screeners.duplicated + 
      stats.strategies.duplicated;
    
    console.log(`\n✅ Successfully duplicated ${totalDuplicated} records from LIVE to PAPER mode!`);
    
  } catch (error) {
    console.error('\n❌ Error during duplication:', error);
    throw error;
  }
}

// Run the script
duplicateLiveToPaper()
  .then(() => {
    console.log('\n🎉 Duplication complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Duplication failed:', error);
    process.exit(1);
  });
