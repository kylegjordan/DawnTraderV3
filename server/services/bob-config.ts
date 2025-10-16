/**
 * ConfigBob - Phase 7.4 Module #3
 * 
 * Handles configuration-level data caching across LIVE and PAPER modes
 * Ensures Walter and dashboard always have synchronized, mode-aware access
 * to Goals, Guardrails, Screeners, Strategies, and Purpose settings
 */

import { bobCore, FetchContext } from './bob-core';
import { db } from '../db';
import { userGoalsLive, userGoalsPaper, guardrails, screenerFilters, strategySettings, walterPurpose } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { provenanceLogger } from './provenance-logger'; // Phase 8.6.4: BoB deep-trace

/**
 * ConfigBob Module
 * Owns: goals, guardrails, screeners, strategies, purpose configuration data
 */
class ConfigBobModule {
  private readonly MODULE_NAME = 'ConfigBob';
  private readonly TTL_SECONDS = parseInt(process.env.BOB_CONFIG_TTL_SECONDS || '30', 10);

  constructor() {
    this.registerWithBobCore();
  }

  /**
   * Register this module's fetch functions with Bob Core
   */
  private registerWithBobCore() {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();

    fetchFunctions.set('goals', this.fetchGoals.bind(this));
    fetchFunctions.set('guardrails', this.fetchGuardrails.bind(this));
    fetchFunctions.set('screeners', this.fetchScreeners.bind(this));
    fetchFunctions.set('strategies', this.fetchStrategies.bind(this));
    fetchFunctions.set('purpose', this.fetchPurpose.bind(this));

    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  /**
   * Fetch goals summary for a specific mode
   * Mirrors /api/goals/summary endpoint
   */
  private async fetchGoals(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching goals (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for goals fetch');
      }

      // Fetch goals for the user in the specified mode (mode-specific tables)
      const userGoals = mode === 'live'
        ? await db.query.userGoalsLive.findMany({
            where: eq(userGoalsLive.userId, userId),
            orderBy: (table, { asc }) => [asc(table.metricName)]
          })
        : await db.query.userGoalsPaper.findMany({
            where: eq(userGoalsPaper.userId, userId),
            orderBy: (table, { asc }) => [asc(table.metricName)]
          });

      const formattedGoals = userGoals.map((g: any) => ({
        metric: g.metricName,
        goal: g.goalValue ? parseFloat(g.goalValue) : null,
        actual: g.actualValue ? parseFloat(g.actualValue) : 0,
        percentAchieved: g.percentAchieved ? parseFloat(g.percentAchieved) : null
      }));

      const response = {
        goals: formattedGoals,
        hasGoals: formattedGoals.length > 0
      };

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchGoals',
          sourceTable: mode === 'live' ? 'user_goals_live' : 'user_goals_paper',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: formattedGoals.length,
          metadata: { hasGoals: response.hasGoals, goalCount: formattedGoals.length }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Goals fetched in ${duration}ms`);
      
      return response;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Goals fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch guardrails settings for a specific mode
   * Mirrors /api/guardrails endpoint
   */
  private async fetchGuardrails(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching guardrails (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for guardrails fetch');
      }

      const guardrailsData = await db.query.guardrails.findFirst({
        where: and(
          eq(guardrails.userId, userId),
          eq(guardrails.mode, mode)
        )
      });

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchGuardrails',
          sourceTable: 'guardrails',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: guardrailsData ? 1 : 0,
          metadata: { hasGuardrails: !!guardrailsData }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Guardrails fetched in ${duration}ms`);
      
      return guardrailsData || null;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Guardrails fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch screener settings for a specific mode
   * Mirrors /api/screeners endpoint
   */
  private async fetchScreeners(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching screeners (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for screeners fetch');
      }

      const screenersData = await db.query.screenerFilters.findFirst({
        where: and(
          eq(screenerFilters.userId, userId),
          eq(screenerFilters.mode, mode)
        )
      });

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchScreeners',
          sourceTable: 'screener_filters',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: screenersData ? 1 : 0,
          metadata: { hasScreeners: !!screenersData }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Screeners fetched in ${duration}ms`);
      
      return screenersData || null;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Screeners fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch all strategy settings for a specific mode
   * Mirrors /api/strategies/settings/all endpoint
   */
  private async fetchStrategies(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching strategies (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for strategies fetch');
      }

      const strategiesData = await db.query.strategySettings.findMany({
        where: and(
          eq(strategySettings.userId, userId),
          eq(strategySettings.mode, mode)
        )
      });

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchStrategies',
          sourceTable: 'strategy_settings',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: strategiesData.length,
          metadata: { strategyCount: strategiesData.length }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Strategies fetched in ${duration}ms`);
      
      return strategiesData;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Strategies fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch Walter purpose settings for a specific mode
   * Mirrors /api/walter/purpose endpoint
   */
  private async fetchPurpose(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching purpose (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for purpose fetch');
      }

      const purposeData = await db.query.walterPurpose.findFirst({
        where: and(
          eq(walterPurpose.userId, userId),
          eq(walterPurpose.mode, mode)
        )
      });

      const response = {
        ok: true,
        purpose: purposeData || null
      };

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchPurpose',
          sourceTable: 'walter_purpose',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: purposeData ? 1 : 0,
          metadata: { hasPurpose: !!purposeData }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Purpose fetched in ${duration}ms`);
      
      return response;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Purpose fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Public API Methods - Used by transparent routing
   */

  /**
   * Get goals summary with caching
   */
  async getGoals(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `config:goals:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchGoals(context),
      ttl || this.TTL_SECONDS,
      context,
      ['config', 'goals', mode]
    );
  }

  /**
   * Get guardrails settings with caching
   */
  async getGuardrails(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `config:guardrails:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchGuardrails(context),
      ttl || this.TTL_SECONDS,
      context,
      ['config', 'guardrails', mode]
    );
  }

  /**
   * Get screeners settings with caching
   */
  async getScreeners(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `config:screeners:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchScreeners(context),
      ttl || this.TTL_SECONDS,
      context,
      ['config', 'screeners', mode]
    );
  }

  /**
   * Get all strategy settings with caching
   */
  async getStrategies(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `config:strategies:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchStrategies(context),
      ttl || this.TTL_SECONDS,
      context,
      ['config', 'strategies', mode]
    );
  }

  /**
   * Get Walter purpose settings with caching
   */
  async getPurpose(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `config:purpose:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchPurpose(context),
      ttl || this.TTL_SECONDS,
      context,
      ['config', 'purpose', mode]
    );
  }

  /**
   * Fetch all configuration endpoints in parallel
   * Used by Walter for faster context building
   */
  async fetchAll(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<Record<string, any>> {
    console.log(`[${this.MODULE_NAME}] 🚀 Parallel fetch: all configs (mode: ${mode})`);
    const startTime = Date.now();

    try {
      const [goalsData, guardrailsData, screenersData, strategiesData, purposeData] = await Promise.all([
        this.getGoals(userId, mode, ttl),
        this.getGuardrails(userId, mode, ttl),
        this.getScreeners(userId, mode, ttl),
        this.getStrategies(userId, mode, ttl),
        this.getPurpose(userId, mode, ttl)
      ]);

      const duration = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Parallel fetch complete in ${duration}ms`);

      return {
        goals: goalsData,
        guardrails: guardrailsData,
        screeners: screenersData,
        strategies: strategiesData,
        purpose: purposeData
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Parallel fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Prefetch all configuration data for a specific mode
   * Called on app start, Walter chat mount, or mode change
   */
  async prefetchForMode(
    userId: string,
    mode: 'live' | 'paper',
    ttl?: number
  ): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching all configs for ${mode} mode`);

    const prefetches = [
      bobCore.prefetch(
        `config:goals:${mode}:${userId}`,
        () => this.fetchGoals({ mode, userId }),
        ttl || this.TTL_SECONDS,
        { mode, userId },
        ['config', 'goals', mode]
      ),
      bobCore.prefetch(
        `config:guardrails:${mode}:${userId}`,
        () => this.fetchGuardrails({ mode, userId }),
        ttl || this.TTL_SECONDS,
        { mode, userId },
        ['config', 'guardrails', mode]
      ),
      bobCore.prefetch(
        `config:screeners:${mode}:${userId}`,
        () => this.fetchScreeners({ mode, userId }),
        ttl || this.TTL_SECONDS,
        { mode, userId },
        ['config', 'screeners', mode]
      ),
      bobCore.prefetch(
        `config:strategies:${mode}:${userId}`,
        () => this.fetchStrategies({ mode, userId }),
        ttl || this.TTL_SECONDS,
        { mode, userId },
        ['config', 'strategies', mode]
      ),
      bobCore.prefetch(
        `config:purpose:${mode}:${userId}`,
        () => this.fetchPurpose({ mode, userId }),
        ttl || this.TTL_SECONDS,
        { mode, userId },
        ['config', 'purpose', mode]
      )
    ];

    await Promise.allSettled(prefetches);
    console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
  }

  /**
   * Invalidate configuration cache for a specific mode
   * Called after configuration updates
   */
  invalidateMode(userId: string, mode: 'live' | 'paper') {
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating cache for ${mode} mode`);
    bobCore.invalidate(`config:goals:${mode}:${userId}`);
    bobCore.invalidate(`config:guardrails:${mode}:${userId}`);
    bobCore.invalidate(`config:screeners:${mode}:${userId}`);
    bobCore.invalidate(`config:strategies:${mode}:${userId}`);
    bobCore.invalidate(`config:purpose:${mode}:${userId}`);
  }

  /**
   * Invalidate a specific configuration type
   */
  invalidateConfig(
    userId: string,
    mode: 'live' | 'paper',
    configType: 'goals' | 'guardrails' | 'screeners' | 'strategies' | 'purpose'
  ) {
    const key = `config:${configType}:${mode}:${userId}`;
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating ${configType} cache for ${mode} mode`);
    bobCore.invalidate(key);
  }
}

// Export singleton instance
export const configBob = new ConfigBobModule();
