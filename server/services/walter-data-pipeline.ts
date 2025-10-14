/**
 * Walter Data Pipeline Service - Phase 7.1
 * 
 * Ensures Walter reads live data from the same endpoints powering the dashboard.
 * All requests include mode parameter and Bearer token authentication.
 */

import { storage } from '../storage';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface DashboardData {
  systemHealth: any;
  goalsSummary: any;
  tradingActivity: any;
  tradingResults: any;
  tradingAverages: any;
}

export class WalterDataPipeline {
  /**
   * Generate JWT token for internal API requests
   */
  private generateToken(userId: string, username: string): string {
    return jwt.sign(
      { id: userId, username },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  /**
   * Fetch data from internal endpoints with auth
   */
  private async fetchWithAuth(endpoint: string, token: string): Promise<any> {
    const baseUrl = process.env.API_URL || 'http://localhost:5000';
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get comprehensive dashboard data for current mode
   * This ensures Walter sees exactly what the user sees
   */
  async getDashboardData(userId: string, mode: 'live' | 'paper' = 'paper'): Promise<DashboardData> {
    try {
      // Get user info for token
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate auth token for internal requests
      const token = this.generateToken(userId, user.username);

      // Fetch all dashboard data in parallel with mode parameter
      const [systemHealth, goalsSummary, tradingActivity, tradingResults, tradingAverages] = await Promise.all([
        this.fetchWithAuth('/api/system/health', token),
        this.fetchWithAuth(`/api/goals/summary?mode=${mode}`, token),
        this.fetchWithAuth(`/api/trading/activity?mode=${mode}&period=1d`, token),
        this.fetchWithAuth(`/api/trading/results?mode=${mode}&period=1d`, token),
        this.fetchWithAuth(`/api/trading/averages?mode=${mode}&period=1d`, token)
      ]);

      console.log(`[WalterDataPipeline] Fetched dashboard data for ${mode} mode`);

      return {
        systemHealth,
        goalsSummary,
        tradingActivity,
        tradingResults,
        tradingAverages
      };
    } catch (error) {
      console.error('[WalterDataPipeline] Error fetching dashboard data:', error);
      // Return empty data on error
      return {
        systemHealth: null,
        goalsSummary: null,
        tradingActivity: null,
        tradingResults: null,
        tradingAverages: null
      };
    }
  }

  /**
   * Format dashboard data into natural language context for Walter
   */
  formatDashboardContext(data: DashboardData, mode: 'live' | 'paper'): string {
    const { systemHealth, goalsSummary, tradingActivity, tradingResults, tradingAverages } = data;

    const parts: string[] = [];

    // Current mode
    parts.push(`CURRENT TRADING MODE: ${mode.toUpperCase()}`);

    // System health
    if (systemHealth) {
      parts.push(`\nSYSTEM STATUS:`);
      parts.push(`- Backend: ${systemHealth.backend}`);
      parts.push(`- Database: ${systemHealth.database}`);
      if (systemHealth.paperTrading?.isRunning) {
        parts.push(`- Paper Trading: ACTIVE (Session: ${systemHealth.paperTrading.sessionId})`);
      } else {
        parts.push(`- Paper Trading: INACTIVE`);
      }
    }

    // Goals summary
    if (goalsSummary) {
      parts.push(`\nGOALS STATUS (${mode.toUpperCase()} MODE):`);
      if (goalsSummary.hasGoals) {
        goalsSummary.goals.forEach((goal: any) => {
          const achieved = goal.percentAchieved !== null ? `${goal.percentAchieved.toFixed(1)}%` : 'N/A';
          parts.push(`- ${goal.metric}: Goal $${goal.goal?.toFixed(2) || '0'}, Actual $${goal.actual.toFixed(2)} (${achieved} achieved)`);
        });
      } else {
        parts.push(`- No goals set for ${mode} mode`);
      }
    }

    // Trading activity
    if (tradingActivity) {
      parts.push(`\nTRADING ACTIVITY (Today, ${mode.toUpperCase()} MODE):`);
      parts.push(`- Total Trades: ${tradingActivity.numberOfTrades || 0}`);
      parts.push(`- Win Rate: ${tradingActivity.winRate?.toFixed(1) || '0'}%`);
      parts.push(`- Volume Traded: $${tradingActivity.volumeTraded?.toLocaleString() || '0'}`);
      parts.push(`- Fees Paid: $${tradingActivity.totalFeesPaid?.toFixed(2) || '0.00'}`);
    }

    // Trading results
    if (tradingResults) {
      parts.push(`\nTRADING RESULTS (Today, ${mode.toUpperCase()} MODE):`);
      const pnlSign = tradingResults.totalPnL >= 0 ? '+' : '';
      parts.push(`- Total P&L: ${pnlSign}$${tradingResults.totalPnL?.toFixed(2) || '0.00'}`);
      parts.push(`- Profit Factor: ${tradingResults.profitFactor?.toFixed(2) || '0.00'}`);
      parts.push(`- Max Drawdown: ${tradingResults.maxDrawdown?.toFixed(2) || '0'}%`);
      parts.push(`- Avg Return: ${tradingResults.avgReturnPercent?.toFixed(2) || '0'}%`);
    }

    // Trading averages
    if (tradingAverages) {
      parts.push(`\nTRADING AVERAGES (Today, ${mode.toUpperCase()} MODE):`);
      const adeSign = tradingAverages.avgDailyEarnings >= 0 ? '+' : '';
      parts.push(`- Avg Daily Earnings: ${adeSign}$${tradingAverages.avgDailyEarnings?.toFixed(2) || '0.00'}`);
      parts.push(`- Avg Trades/Day: ${tradingAverages.avgTradesPerDay?.toFixed(1) || '0'}`);
      parts.push(`- Avg Earnings/Trade: $${tradingAverages.avgEarningsPerTrade?.toFixed(2) || '0.00'}`);
    }

    return parts.join('\n');
  }
}

export const walterDataPipeline = new WalterDataPipeline();
