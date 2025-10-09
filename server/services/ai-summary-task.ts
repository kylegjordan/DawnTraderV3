// server/services/ai-summary-task.ts
// Daily AI summary compilation for Daily Brief

import { storage } from '../storage';
import { ScheduledTask } from './scheduler-registry';

export class AISummaryTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'AI Summary';
  description = 'Compiles daily AI summary for Daily Brief (Paper + Live combined overview)';
  frequency = 'Daily at UTC midnight';
  intervalMs = 24 * 60 * 60 * 1000; // 24 hours

  async run(): Promise<void> {
    console.log('[AISummary] Starting AI summary task...');

    try {
      // Get all users
      const users = await storage.getAllUsers();

      for (const user of users) {
        await this.createSummaryForUser(user.id);
      }

      console.log('[AISummary] AI summary task complete');
    } catch (error) {
      console.error('[AISummary] Error during AI summary:', error);
      throw error;
    }
  }

  private async createSummaryForUser(userId: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if brief already exists for today
      const existingBrief = await storage.getDailyBrief(userId, today);
      if (existingBrief) {
        console.log(`[AISummary] Daily brief already exists for user ${userId}, skipping`);
        return;
      }

      // Get trades for today only
      const startOfDay = new Date(today + 'T00:00:00Z');
      const endOfDay = new Date(today + 'T23:59:59Z');
      
      const liveTrades = await storage.getTrades(userId, { limit: 1000 });
      const todaysLiveTrades = liveTrades.filter(t => {
        const entryTime = t.entryTime ? new Date(t.entryTime) : null;
        return entryTime && entryTime >= startOfDay && entryTime <= endOfDay;
      });

      const paperTrades = await storage.getAllPaperTrades(userId);
      const todaysPaperTrades = paperTrades.filter(t => {
        const entryTime = t.entryTime ? new Date(t.entryTime) : null;
        return entryTime && entryTime >= startOfDay && entryTime <= endOfDay;
      });

      // Calculate basic metrics for today's trades
      const liveMetrics = this.calculateMetrics(todaysLiveTrades);
      const paperMetrics = this.calculateMetrics(todaysPaperTrades);

      // Create combined summary
      const summary = `Live: ${liveMetrics.totalTrades} trades, ${liveMetrics.winRate.toFixed(1)}% win rate. Paper: ${paperMetrics.totalTrades} trades, ${paperMetrics.winRate.toFixed(1)}% win rate.`;

      // Create daily brief with combined metrics
      await storage.createDailyBrief({
        userId,
        date: today,
        summary,
        status: 'final',
        metrics: {
          live: {
            num_trades: liveMetrics.totalTrades,
            realized_pl: liveMetrics.totalPnL,
            win_rate: liveMetrics.winRate
          },
          paper: {
            num_trades: paperMetrics.totalTrades,
            realized_pl: paperMetrics.totalPnL,
            win_rate: paperMetrics.winRate
          }
        }
      });

      console.log(`[AISummary] Created daily brief for user ${userId}`);
    } catch (error) {
      console.error(`[AISummary] Error creating summary for user ${userId}:`, error);
    }
  }

  private calculateMetrics(trades: any[]): { totalTrades: number; winRate: number; totalPnL: number } {
    const closedTrades = trades.filter(t => t.status === 'closed');
    const totalTrades = closedTrades.length;
    
    if (totalTrades === 0) {
      return { totalTrades: 0, winRate: 0, totalPnL: 0 };
    }

    const winningTrades = closedTrades.filter(t => 
      t.exitPrice && t.entryPrice && t.exitPrice > t.entryPrice
    );
    
    const winRate = (winningTrades.length / totalTrades) * 100;
    
    const totalPnL = closedTrades.reduce((sum, t) => {
      if (!t.exitPrice || !t.entryPrice) return sum;
      const pnl = (t.exitPrice - t.entryPrice) * (t.quantity || 0);
      return sum + pnl;
    }, 0);

    return { totalTrades, winRate, totalPnL };
  }
}

export const aiSummaryTask = new AISummaryTask();
