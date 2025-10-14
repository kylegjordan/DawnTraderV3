/**
 * System Health Service
 * Provides system health information to AI assistants (Walter & Bob)
 * This allows them to check system status without HTTP/auth overhead
 */

import { storage } from '../storage';

export interface SystemHealthStatus {
  backend: string;
  paperTrading: {
    isRunning: boolean;
    sessionId: string | null;
    startedBy: string | null;
    startTime: Date | null;
    type: '48hr' | 'manual' | null;
  };
  database: string;
  goals: {
    live: { count: number; hasGoals: boolean };
    paper: { count: number; hasGoals: boolean };
  };
  frontendConnected: boolean;
  lastSync: string;
  isHealthy: boolean;
}

export class SystemHealthService {
  /**
   * Get comprehensive system health status for AI analysis
   * This is used by Walter & Bob for diagnostics and alerts
   */
  async getHealthStatus(userId: string): Promise<SystemHealthStatus> {
    const healthData: SystemHealthStatus = {
      backend: 'OK',
      paperTrading: {
        isRunning: false,
        sessionId: null,
        startedBy: null,
        startTime: null,
        type: null,
      },
      database: 'OK',
      goals: {
        live: { count: 0, hasGoals: false },
        paper: { count: 0, hasGoals: false },
      },
      frontendConnected: true,
      lastSync: new Date().toISOString(),
      isHealthy: true,
    };

    // Check paper trading status
    try {
      const globalSession = (global as any).getGlobalSession?.() as any;
      if (globalSession) {
        healthData.paperTrading = {
          isRunning: globalSession.isRunning || false,
          sessionId: globalSession.sessionId || null,
          startedBy: globalSession.startedBy || null,
          startTime: globalSession.startTime || null,
          type: globalSession.type || null,
        };
      }
    } catch (error) {
      console.error('[SystemHealth] Error getting paper trading status:', error);
      healthData.isHealthy = false;
    }

    // Check database connectivity
    try {
      await storage.getUser(userId);
      healthData.database = 'OK';
    } catch (error) {
      console.error('[SystemHealth] Database check failed:', error);
      healthData.database = 'ERROR';
      healthData.isHealthy = false;
    }

    // Check goals for both modes
    try {
      const liveGoals = await storage.getGoalsSummary(userId, 'live');
      const paperGoals = await storage.getGoalsSummary(userId, 'paper');
      healthData.goals = {
        live: { count: liveGoals.length, hasGoals: liveGoals.length > 0 },
        paper: { count: paperGoals.length, hasGoals: paperGoals.length > 0 },
      };
    } catch (error) {
      console.error('[SystemHealth] Error getting goals:', error);
      healthData.isHealthy = false;
    }

    return healthData;
  }

  /**
   * Generate natural language alert message based on health status
   * Used by Walter to communicate health issues to users
   */
  generateHealthAlert(health: SystemHealthStatus): string | null {
    const issues: string[] = [];

    if (health.database === 'ERROR') {
      issues.push('The database connection is not working properly.');
    }

    if (!health.paperTrading.isRunning && health.backend === 'OK') {
      // This is normal, not an issue
    }

    if (health.paperTrading.isRunning && !health.paperTrading.sessionId) {
      issues.push('Paper trading is running but the session information is incomplete.');
    }

    if (!health.frontendConnected) {
      issues.push('The frontend appears to be disconnected from the backend.');
    }

    if (health.goals.live.count === 0 && health.goals.paper.count === 0) {
      issues.push('You haven\'t set any trading goals yet. Consider setting some goals to track your progress.');
    }

    if (issues.length === 0) {
      return null; // No issues, system is healthy
    }

    return `I've detected some system issues: ${issues.join(' ')}`;
  }
}

export const systemHealthService = new SystemHealthService();
