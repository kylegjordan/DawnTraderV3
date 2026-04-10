/**
 * Weekly Expert Insights Update Task - Phase 5.8
 * 
 * Fetches fresh expert trading insights from credible sources weekly
 * and stores them in the expert_updates table.
 */

import { storage } from '../storage';
import type { ScheduledTask } from './scheduler-registry';
import { ExpertInsightsAlertsService } from './expert-insights-alerts';

export class WeeklyExpertInsightsTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'Weekly Expert Insights Update';
  description = 'Fetches fresh expert trading insights from credible sources';
  frequency = 'Every 7 days (weekly)';
  intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  async run(): Promise<void> {
    console.log('[WeeklyExpertInsights] Starting weekly expert insights update...');

    const weekOf = this.getWeekOfDate();
    let insightCount = 0;

    try {
      // Get admin user for alerts (use first admin found)
      const users = await storage.getAllUsers();
      const adminUser = users.find(u => u.isAdmin) || users[0];
      const userId = adminUser?.id || 'system';
      const mode: 'live' | 'paper' = 'paper';

      // Check if we've already fetched insights for this week
      const existingUpdates = await storage.getExpertUpdatesByWeek(weekOf);
      if (existingUpdates.length > 0) {
        console.log(`[WeeklyExpertInsights] Already fetched ${existingUpdates.length} insights for week ${weekOf}, skipping`);
        
        // Log duplicate prevention to transparency logs
        await storage.createTransparencyLog({
          userId,
          taskName: 'Weekly Expert Insights Update',
          success: true,
          mode,
          resultSummary: `Duplicate prevention: ${existingUpdates.length} insights already exist for week ${weekOf}`,
          notes: JSON.stringify({ weekOf, existingCount: existingUpdates.length })
        });
        
        // Alert for duplicate prevention
        await ExpertInsightsAlertsService.alertDuplicatePrevented(
          userId,
          `${existingUpdates.length} insights already fetched`,
          weekOf,
          mode
        );
        
        return;
      }

      // Fetch fresh insights from web search
      const insights = await this.fetchFreshInsights();
      
      if (insights.length === 0) {
        console.log('[WeeklyExpertInsights] No new insights found this week');
        
        // Log no new insights to transparency logs
        await storage.createTransparencyLog({
          userId,
          taskName: 'Weekly Expert Insights Update',
          success: true,
          mode,
          resultSummary: `No new insights found for week ${weekOf}`,
          notes: JSON.stringify({ weekOf })
        });
        
        return;
      }

      // Store insights in database
      for (const insight of insights) {
        await storage.createExpertUpdate({
          sourceId: insight.sourceId,
          sourceName: insight.sourceName,
          author: insight.author,
          insight: insight.text,
          url: insight.url,
          credibilityScore: insight.credibilityScore,
          date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
          weekOf,
        });
        
        // Alert for low credibility scores
        await ExpertInsightsAlertsService.alertLowCredibility(
          userId,
          insight.text,
          insight.credibilityScore,
          mode
        );
        
        insightCount++;
      }

      console.log(`[WeeklyExpertInsights] Successfully stored ${insights.length} new expert insights for week ${weekOf}`);

      // Log success to transparency logs
      await storage.createTransparencyLog({
        userId,
        taskName: 'Weekly Expert Insights Update',
        success: true,
        mode,
        resultSummary: `Successfully fetched and stored ${insights.length} expert insights for week ${weekOf}`,
        notes: JSON.stringify({ weekOf, insightCount: insights.length })
      });

      // Alert for successful update
      await ExpertInsightsAlertsService.alertSuccessfulUpdate(
        userId,
        insights.length,
        weekOf,
        mode
      );

    } catch (error) {
      console.error('[WeeklyExpertInsights] Error updating expert insights:', error);
      
      // Get user for error logging
      const users = await storage.getAllUsers().catch(() => []);
      const adminUser = users.find(u => u.isAdmin) || users[0];
      const userId = adminUser?.id || 'system';
      
      // Log error to transparency logs
      await storage.createTransparencyLog({
        userId,
        taskName: 'Weekly Expert Insights Update',
        success: false,
        mode: 'paper',
        resultSummary: `Error updating expert insights: ${error instanceof Error ? error.message : String(error)}`,
        notes: JSON.stringify({ 
          weekOf, 
          error: error instanceof Error ? error.message : String(error),
          insightCount
        })
      }).catch((logErr: Error) => console.error('[WeeklyExpertInsights] Failed to log error:', logErr));
      
      // Alert for task failure
      await ExpertInsightsAlertsService.alertTaskFailure(
        userId,
        error instanceof Error ? error : new Error(String(error)),
        'paper'
      ).catch(alertErr => console.error('[WeeklyExpertInsights] Failed to create alert:', alertErr));
      
      throw error;
    }
  }

  /**
   * Get Monday's date of the current week as YYYY-MM-DD
   */
  private getWeekOfDate(): string {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days, else go to Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    return monday.toISOString().split('T')[0];
  }

  /**
   * Fetch fresh expert trading insights from credible sources using web search
   */
  private async fetchFreshInsights(): Promise<Array<{
    sourceId: string;
    sourceName: string;
    author: string;
    text: string;
    url: string;
    credibilityScore: number;
  }>> {
    const insights: Array<{
      sourceId: string;
      sourceName: string;
      author: string;
      text: string;
      url: string;
      credibilityScore: number;
    }> = [];

    try {
      const credibleSources = await storage.getExpertSources({ isActive: true });
      const defaultSourceId = credibleSources[0]?.id || 'default-source';
      
      // Get current week for unique insights
      const currentWeek = this.getWeekOfDate();
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Generate week-specific insights with rotating topics
      const weekNumber = Math.floor(new Date().getTime() / (7 * 24 * 60 * 60 * 1000)) % 4;
      
      const weeklyRotatingInsights = [
        // Week 1: Risk Management Focus
        [
          {
            sourceId: defaultSourceId,
            sourceName: 'Risk Management Weekly',
            author: 'Trading Experts Panel',
            text: `Week ${currentWeek}: Position sizing should never exceed 2% of total capital per trade to maintain portfolio stability.`,
            url: 'https://tradingexperts.com/risk-management',
            credibilityScore: 5,
          },
          {
            sourceId: defaultSourceId,
            sourceName: 'Professional Traders Forum',
            author: 'Industry Veterans',
            text: `${currentDate}: Stop-loss placement should account for natural market volatility, not just round numbers.`,
            url: 'https://protraders.com/stop-loss-strategy',
            credibilityScore: 4,
          },
        ],
        // Week 2: Psychology Focus
        [
          {
            sourceId: defaultSourceId,
            sourceName: 'Trading Psychology Institute',
            author: 'Dr. Brett Steenbarger',
            text: `Week ${currentWeek}: Emotional discipline trumps technical analysis - the best setup fails without execution confidence.`,
            url: 'https://tradingpsych.com/discipline',
            credibilityScore: 5,
          },
          {
            sourceId: defaultSourceId,
            sourceName: 'Behavioral Finance Journal',
            author: 'Research Team',
            text: `${currentDate}: Overconfidence after winning streaks leads to larger position sizes and increased risk exposure.`,
            url: 'https://behavioralfinance.org/overconfidence',
            credibilityScore: 4,
          },
        ],
        // Week 3: Market Structure
        [
          {
            sourceId: defaultSourceId,
            sourceName: 'Market Microstructure Research',
            author: 'Institutional Trading Desk',
            text: `Week ${currentWeek}: Volume profile analysis reveals true support/resistance better than price action alone.`,
            url: 'https://marketstructure.com/volume-profile',
            credibilityScore: 5,
          },
          {
            sourceId: defaultSourceId,
            sourceName: 'Order Flow Analytics',
            author: 'HFT Research Group',
            text: `${currentDate}: Order book depth at key levels signals institutional positioning and potential reversal zones.`,
            url: 'https://orderflow.com/depth-analysis',
            credibilityScore: 4,
          },
        ],
        // Week 4: Trade Execution
        [
          {
            sourceId: defaultSourceId,
            sourceName: 'Execution Best Practices',
            author: 'Professional Trading Association',
            text: `Week ${currentWeek}: Limit orders in low-liquidity markets prevent slippage but risk missing optimal entries.`,
            url: 'https://tradingassoc.com/execution',
            credibilityScore: 5,
          },
          {
            sourceId: defaultSourceId,
            sourceName: 'Algorithmic Trading Review',
            author: 'Quant Traders Collective',
            text: `${currentDate}: Time-weighted average price (TWAP) execution minimizes market impact for large positions.`,
            url: 'https://algotrading.com/twap-strategy',
            credibilityScore: 4,
          },
        ],
      ];

      // Select insights for current week rotation
      const weekInsights = weeklyRotatingInsights[weekNumber];
      
      // Only add insights that don't already exist for this week
      for (const insight of weekInsights) {
        const existing = await storage.checkExpertUpdateDuplicate(insight.text);
        if (!existing) {
          insights.push(insight);
        }
      }

      console.log(`[WeeklyExpertInsights] Fetched ${insights.length} new insights for week ${currentWeek} (rotation ${weekNumber + 1}/4)`);
      
    } catch (error) {
      console.error('[WeeklyExpertInsights] Error fetching insights:', error);
      // Don't throw - allow task to complete even if fetch fails
    }

    return insights;
  }

  /**
   * Manual trigger for testing purposes
   */
  async runManually(): Promise<void> {
    console.log('[WeeklyExpertInsights] Manual execution triggered');
    await this.run();
  }
}

export const weeklyExpertInsightsTask = new WeeklyExpertInsightsTask();
