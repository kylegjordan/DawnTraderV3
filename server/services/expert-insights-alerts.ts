/**
 * Expert Insights Alert Service
 * Monitors expert insights system and creates alerts for issues
 */

import { storage } from '../storage';
import { AlertsService } from './alerts-service';
import { checkExpertInsightsHealth } from '../diagnostics/expert-insights-metrics';

export class ExpertInsightsAlertsService {
  /**
   * Check expert insights system health and create alerts if needed
   */
  static async checkAndAlert(userId: string, mode: 'live' | 'paper' = 'paper') {
    try {
      const health = await checkExpertInsightsHealth();

      // Create alert if there are critical issues
      if (health.status === 'critical') {
        await AlertsService.createAlert({
          userId,
          mode,
          alertType: 'expert_insights_critical',
          severity: 'critical',
          message: `Expert Insights System Critical: ${health.issues.join(', ')}`,
          metadata: {
            status: health.status,
            issues: health.issues,
            metrics: health.metrics
          }
        });
        console.error('[ExpertInsightsAlerts] CRITICAL:', health.issues);
      } 
      // Create warning alert for warning status
      else if (health.status === 'warning') {
        await AlertsService.createAlert({
          userId,
          mode,
          alertType: 'expert_insights_warning',
          severity: 'warning',
          message: `Expert Insights System Warning: ${health.issues.join(', ')}`,
          metadata: {
            status: health.status,
            issues: health.issues,
            metrics: health.metrics
          }
        });
        console.warn('[ExpertInsightsAlerts] WARNING:', health.issues);
      }
      // Create info alert for healthy status with metrics
      else {
        await AlertsService.createAlert({
          userId,
          mode,
          alertType: 'expert_insights_healthy',
          severity: 'info',
          message: `Expert Insights System: ${health.metrics.totalInsights} total insights, ${health.metrics.insightsThisWeek} this week`,
          metadata: {
            status: health.status,
            metrics: health.metrics
          }
        });
      }

      return health;
    } catch (error) {
      console.error('[ExpertInsightsAlerts] Error checking health:', error);
      
      // Create critical alert for health check failure
      await AlertsService.createAlert({
        userId,
        mode,
        alertType: 'expert_insights_error',
        severity: 'critical',
        message: 'Expert Insights System: Health check failed',
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      
      throw error;
    }
  }

  /**
   * Alert for task execution failure
   */
  static async alertTaskFailure(userId: string, error: Error, mode: 'live' | 'paper' = 'paper') {
    await AlertsService.createAlert({
      userId,
      mode,
      alertType: 'expert_insights_task_failed',
      severity: 'critical',
      message: `Weekly Expert Insights Update task failed: ${error.message}`,
      metadata: {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    });
    console.error('[ExpertInsightsAlerts] Task execution failed:', error);
  }

  /**
   * Alert for low credibility insights
   */
  static async alertLowCredibility(
    userId: string,
    insightText: string,
    credibilityScore: number,
    mode: 'live' | 'paper' = 'paper'
  ) {
    if (credibilityScore < 3) {
      await AlertsService.createAlert({
        userId,
        mode,
        alertType: 'expert_insights_low_credibility',
        severity: 'warning',
        message: `Low credibility expert insight detected (score: ${credibilityScore}/5)`,
        metadata: {
          insight: insightText.substring(0, 100), // First 100 chars
          credibilityScore
        }
      });
    }
  }

  /**
   * Alert for duplicate prevention (info level)
   */
  static async alertDuplicatePrevented(
    userId: string,
    insightText: string,
    weekOf: string,
    mode: 'live' | 'paper' = 'paper'
  ) {
    await AlertsService.createAlert({
      userId,
      mode,
      alertType: 'expert_insights_duplicate_prevented',
      severity: 'info',
      message: `Duplicate expert insight prevented for week ${weekOf}`,
      metadata: {
        insight: insightText.substring(0, 100),
        weekOf
      }
    });
  }

  /**
   * Alert for successful weekly update
   */
  static async alertSuccessfulUpdate(
    userId: string,
    insightCount: number,
    weekOf: string,
    mode: 'live' | 'paper' = 'paper'
  ) {
    await AlertsService.createAlert({
      userId,
      mode,
      alertType: 'expert_insights_updated',
      severity: 'info',
      message: `Weekly Expert Insights Updated: ${insightCount} new insights added for week ${weekOf}`,
      metadata: {
        insightCount,
        weekOf,
        timestamp: new Date().toISOString()
      }
    });
    console.log(`[ExpertInsightsAlerts] Weekly update successful: ${insightCount} insights`);
  }

  /**
   * Alert for topic imbalance
   */
  static async alertTopicImbalance(
    userId: string,
    topicDistribution: Record<string, number>,
    mode: 'live' | 'paper' = 'paper'
  ) {
    const total = Object.values(topicDistribution).reduce((a, b) => a + b, 0);
    const minExpected = total * 0.15; // 15% minimum
    
    const underrepresented = Object.entries(topicDistribution)
      .filter(([_, count]) => count < minExpected)
      .map(([topic, _]) => topic);

    if (underrepresented.length > 0) {
      await AlertsService.createAlert({
        userId,
        mode,
        alertType: 'expert_insights_topic_imbalance',
        severity: 'warning',
        message: `Expert Insights topic imbalance detected: ${underrepresented.join(', ')} underrepresented`,
        metadata: {
          topicDistribution,
          underrepresented,
          total
        }
      });
    }
  }
}
