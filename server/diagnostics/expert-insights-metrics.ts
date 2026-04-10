/**
 * Expert Insights Metrics
 * Tracks metrics for the Weekly Expert Insights Update System
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface ExpertInsightsMetrics {
  totalInsights: number;
  insightsThisWeek: number;
  insightsLastWeek: number;
  weeklyGrowth: number;
  topicDistribution: {
    riskManagement: number;
    psychology: number;
    marketStructure: number;
    tradeExecution: number;
  };
  averageCredibilityScore: number;
  sourceCount: number;
  duplicateBlockCount: number;
  taskExecutionStats: {
    successRate: number;
    lastExecution: Date | null;
    consecutiveFailures: number;
    totalExecutions: number;
  };
}

/**
 * Get comprehensive expert insights metrics
 */
export async function getExpertInsightsMetrics(): Promise<ExpertInsightsMetrics> {
  try {
    // Total insights count
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM expert_updates WHERE is_active = true
    `);
    const totalInsights = parseInt((totalResult.rows[0] as any)?.count || '0');

    // Current week insights (Monday to now)
    const currentWeekStart = getCurrentWeekMonday();
    const currentWeekResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM expert_updates 
      WHERE week_of = ${currentWeekStart} AND is_active = true
    `);
    const insightsThisWeek = parseInt((currentWeekResult.rows[0] as any)?.count || '0');

    // Last week insights
    const lastWeekStart = getLastWeekMonday();
    const lastWeekResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM expert_updates 
      WHERE week_of = ${lastWeekStart} AND is_active = true
    `);
    const insightsLastWeek = parseInt((lastWeekResult.rows[0] as any)?.count || '0');

    // Calculate weekly growth
    const weeklyGrowth = insightsLastWeek > 0 
      ? ((insightsThisWeek - insightsLastWeek) / insightsLastWeek) * 100 
      : 0;

    // Topic distribution (based on source names)
    const topicDistribution = await getTopicDistribution();

    // Average credibility score
    const credibilityResult = await db.execute(sql`
      SELECT AVG(credibility_score) as avg_score FROM expert_updates 
      WHERE is_active = true
    `);
    const averageCredibilityScore = parseFloat((credibilityResult.rows[0] as any)?.avg_score || '0');

    // Unique source count
    const sourceResult = await db.execute(sql`
      SELECT COUNT(DISTINCT source_name) as count FROM expert_updates 
      WHERE is_active = true
    `);
    const sourceCount = parseInt((sourceResult.rows[0] as any)?.count || '0');

    // Duplicate block count (from transparency logs)
    const duplicateBlockCount = await getDuplicateBlockCount();

    // Task execution stats
    const taskExecutionStats = await getTaskExecutionStats();

    return {
      totalInsights,
      insightsThisWeek,
      insightsLastWeek,
      weeklyGrowth,
      topicDistribution,
      averageCredibilityScore,
      sourceCount,
      duplicateBlockCount,
      taskExecutionStats,
    };
  } catch (error) {
    console.error('[ExpertInsightsMetrics] Error fetching metrics:', error);
    throw error;
  }
}

/**
 * Get topic distribution from source names
 */
async function getTopicDistribution() {
  const result = await db.execute(sql`
    SELECT 
      source_name,
      COUNT(*) as count
    FROM expert_updates 
    WHERE is_active = true
    GROUP BY source_name
  `);

  const distribution = {
    riskManagement: 0,
    psychology: 0,
    marketStructure: 0,
    tradeExecution: 0
  };

  for (const row of result.rows as any[]) {
    const sourceName = row.source_name?.toLowerCase() || '';
    if (sourceName.includes('risk')) {
      distribution.riskManagement += parseInt(row.count);
    } else if (sourceName.includes('psychology') || sourceName.includes('behavioral')) {
      distribution.psychology += parseInt(row.count);
    } else if (sourceName.includes('market') || sourceName.includes('structure') || sourceName.includes('microstructure')) {
      distribution.marketStructure += parseInt(row.count);
    } else if (sourceName.includes('execution') || sourceName.includes('algorithmic')) {
      distribution.tradeExecution += parseInt(row.count);
    }
  }

  return distribution;
}

/**
 * Get duplicate block count from transparency logs
 */
async function getDuplicateBlockCount(): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM ai_transparency_log 
      WHERE task_name = 'Weekly Expert Insights Update' 
      AND notes LIKE '%duplicate%'
      AND executed_at >= NOW() - INTERVAL '30 days'
    `);
    return parseInt((result.rows[0] as any)?.count || '0');
  } catch (error) {
    return 0;
  }
}

/**
 * Get task execution statistics
 */
async function getTaskExecutionStats() {
  try {
    // Get all executions from transparency logs
    const executionsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successes,
        MAX(executed_at) as last_execution
      FROM ai_transparency_log 
      WHERE task_name = 'Weekly Expert Insights Update'
      AND executed_at >= NOW() - INTERVAL '90 days'
    `);

    const row = executionsResult.rows[0] as any;
    const total = parseInt(row?.total || '0');
    const successes = parseInt(row?.successes || '0');
    const lastExecution = row?.last_execution ? new Date(row.last_execution) : null;

    // Calculate consecutive failures (look at last 5 executions)
    const recentResult = await db.execute(sql`
      SELECT success FROM ai_transparency_log 
      WHERE task_name = 'Weekly Expert Insights Update'
      ORDER BY executed_at DESC 
      LIMIT 5
    `);

    let consecutiveFailures = 0;
    for (const row of recentResult.rows as any[]) {
      if (row.success === false) {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    const successRate = total > 0 ? (successes / total) * 100 : 100;

    return {
      successRate,
      lastExecution,
      consecutiveFailures,
      totalExecutions: total
    };
  } catch (error) {
    return {
      successRate: 100,
      lastExecution: null,
      consecutiveFailures: 0,
      totalExecutions: 0
    };
  }
}



/**
 * Get current week Monday date (YYYY-MM-DD)
 */
function getCurrentWeekMonday(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  return monday.toISOString().split('T')[0];
}

/**
 * Get last week Monday date (YYYY-MM-DD)
 */
function getLastWeekMonday(): string {
  const currentMonday = getCurrentWeekMonday();
  const monday = new Date(currentMonday);
  monday.setDate(monday.getDate() - 7);
  return monday.toISOString().split('T')[0];
}

/**
 * Health check for expert insights system
 */
export async function checkExpertInsightsHealth(): Promise<{
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: ExpertInsightsMetrics;
}> {
  const metrics = await getExpertInsightsMetrics();
  const issues: string[] = [];
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';

  // Check for consecutive failures
  if (metrics.taskExecutionStats.consecutiveFailures >= 3) {
    status = 'critical';
    issues.push(`Expert insights task has failed ${metrics.taskExecutionStats.consecutiveFailures} times consecutively`);
  } else if (metrics.taskExecutionStats.consecutiveFailures >= 2) {
    status = 'warning';
    issues.push(`Expert insights task has failed ${metrics.taskExecutionStats.consecutiveFailures} times recently`);
  }

  // Check success rate
  if (metrics.taskExecutionStats.successRate < 80 && metrics.taskExecutionStats.totalExecutions > 5) {
    if (status !== 'critical') status = 'warning';
    issues.push(`Expert insights task success rate is low: ${metrics.taskExecutionStats.successRate.toFixed(1)}%`);
  }

  // Check credibility score
  if (metrics.averageCredibilityScore < 3.5 && metrics.totalInsights > 10) {
    if (status !== 'critical') status = 'warning';
    issues.push(`Average credibility score is low: ${metrics.averageCredibilityScore.toFixed(1)}/5`);
  }

  // Check if no insights this week (after Monday)
  const daysSinceMonday = Math.floor((Date.now() - new Date(getCurrentWeekMonday()).getTime()) / (1000 * 60 * 60 * 24));
  if (metrics.insightsThisWeek === 0 && daysSinceMonday > 1) {
    if (status !== 'critical') status = 'warning';
    issues.push('No expert insights fetched this week yet');
  }

  // Check topic balance (at least 20% per topic if total > 20)
  if (metrics.totalInsights > 20) {
    const topics = metrics.topicDistribution;
    const totalTopicInsights = Object.values(topics).reduce((a, b) => a + b, 0);
    const minExpected = totalTopicInsights * 0.15; // 15% minimum per topic

    if (topics.riskManagement < minExpected) {
      if (status !== 'critical') status = 'warning';
      issues.push('Risk Management insights underrepresented');
    }
    if (topics.psychology < minExpected) {
      if (status !== 'critical') status = 'warning';
      issues.push('Psychology insights underrepresented');
    }
    if (topics.marketStructure < minExpected) {
      if (status !== 'critical') status = 'warning';
      issues.push('Market Structure insights underrepresented');
    }
    if (topics.tradeExecution < minExpected) {
      if (status !== 'critical') status = 'warning';
      issues.push('Trade Execution insights underrepresented');
    }
  }

  return { status, issues, metrics };
}
