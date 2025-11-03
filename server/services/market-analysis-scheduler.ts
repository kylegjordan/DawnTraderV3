// server/services/market-analysis-scheduler.ts
// Scheduler for automated market analysis runs

import { runAiMarketAnalysis } from './ai-market-analyzer';
import { adjustSignalWeightsByRegime } from './signal-weight-optimizer';
import { storage } from '../storage';

export class MarketAnalysisScheduler {
  private dailyIntervalId: NodeJS.Timeout | null = null;
  private hourlyIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  async startDailyAnalysisScheduler(): Promise<void> {
    console.log('[MarketAnalysisScheduler] Starting daily scheduler...');
    
    // Run initial analysis
    await this.runDailyAnalysis();
    
    // Schedule daily runs at 2 AM UTC
    this.scheduleDailyAnalysis();
    
    console.log('[MarketAnalysisScheduler] Daily scheduler started successfully');
  }

  async startHourlyAnalysisScheduler(): Promise<void> {
    console.log('[MarketAnalysisScheduler] Starting hourly scheduler...');
    
    // Run initial analysis
    await this.runHourlyAnalysis();
    
    // Schedule hourly runs
    this.hourlyIntervalId = setInterval(async () => {
      if (!this.isRunning) {
        await this.runHourlyAnalysis();
      }
    }, 60 * 60 * 1000); // 1 hour
    
    console.log('[MarketAnalysisScheduler] Hourly scheduler started successfully');
  }

  private scheduleDailyAnalysis(): void {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(2, 0, 0, 0); // 2 AM UTC
    
    // If we've already passed 2 AM today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    
    const timeUntilRun = nextRun.getTime() - now.getTime();
    
    setTimeout(() => {
      this.runDailyAnalysis();
      
      // Set up recurring daily runs
      this.dailyIntervalId = setInterval(() => {
        this.runDailyAnalysis();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, timeUntilRun);
    
    console.log(`[MarketAnalysisScheduler] Next daily analysis scheduled for ${nextRun.toISOString()}`);
  }

  private async runDailyAnalysis(): Promise<void> {
    if (this.isRunning) {
      console.log('[MarketAnalysisScheduler] Analysis already in progress, skipping...');
      return;
    }

    // Check if feature is enabled for any user
    const users = await storage.getAllUsers();
    let anyEnabled = false;
    for (const user of users) {
// Phase 41F-L.E2E-PURGE: DISABLED -       const settings = await storage.getTradingSettings(user.id);
      if (settings?.aiOpportunitiesEnabled) {
        anyEnabled = true;
        break;
      }
    }
    
    if (!anyEnabled) {
      console.log('[MarketAnalysisScheduler] AI features disabled for all users, skipping analysis');
      return;
    }

    this.isRunning = true;
    console.log('\n📊 Starting daily market analysis...');

    try {
      // Run analysis for both live and paper modes
      for (const mode of ['live', 'paper'] as const) {
        console.log(`[MarketAnalysisScheduler] Running ${mode} mode analysis...`);
        
        try {
          // The analyzer already stores the analysis and returns it
          const analysis = await runAiMarketAnalysis(mode);

          console.log(`[MarketAnalysisScheduler] ${mode} mode analysis complete: ${analysis.regime} (${analysis.confidence}% confidence)`);

          // Apply regime-based signal weight adjustments (confidence is 0-100)
          if (analysis.confidence && analysis.confidence >= 60) {
            await adjustSignalWeightsByRegime(analysis.regime, mode);
          } else {
            console.log(`[MarketAnalysisScheduler] Skipping regime adjustments for ${mode} (confidence too low: ${analysis.confidence || 0}%)`);
          }
        } catch (error) {
          console.error(`[MarketAnalysisScheduler] Error analyzing ${mode} mode:`, error);
        }
      }
      
      console.log('✅ Daily market analysis complete\n');
    } catch (error) {
      console.error('[MarketAnalysisScheduler] Error during daily analysis:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async runHourlyAnalysis(): Promise<void> {
    if (this.isRunning) {
      console.log('[MarketAnalysisScheduler] Analysis already in progress, skipping...');
      return;
    }

    // Check if feature is enabled for any user
    const users = await storage.getAllUsers();
    let anyEnabled = false;
    for (const user of users) {
// Phase 41F-L.E2E-PURGE: DISABLED -       const settings = await storage.getTradingSettings(user.id);
      if (settings?.aiOpportunitiesEnabled) {
        anyEnabled = true;
        break;
      }
    }
    
    if (!anyEnabled) {
      console.log('[MarketAnalysisScheduler] AI features disabled for all users, skipping analysis');
      return;
    }

    this.isRunning = true;
    console.log('\n📊 Starting hourly market analysis...');

    try {
      // Hourly analysis only for live mode (paper mode runs daily only)
      const mode = 'live';
      console.log(`[MarketAnalysisScheduler] Running ${mode} mode analysis...`);
      
      // The analyzer already stores the analysis and returns it
      const analysis = await runAiMarketAnalysis(mode);

      console.log(`[MarketAnalysisScheduler] ${mode} mode analysis complete: ${analysis.regime} (${analysis.confidence}% confidence)`);

      // Apply regime-based signal weight adjustments (confidence is 0-100)
      if (analysis.confidence && analysis.confidence >= 60) {
        await adjustSignalWeightsByRegime(analysis.regime, mode);
      } else {
        console.log(`[MarketAnalysisScheduler] Skipping regime adjustments (confidence too low: ${analysis.confidence || 0}%)`);
      }
      
      console.log('✅ Hourly market analysis complete\n');
    } catch (error) {
      console.error('[MarketAnalysisScheduler] Error during hourly analysis:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async stopSchedulers(): Promise<void> {
    if (this.dailyIntervalId) {
      clearInterval(this.dailyIntervalId);
      this.dailyIntervalId = null;
    }
    if (this.hourlyIntervalId) {
      clearInterval(this.hourlyIntervalId);
      this.hourlyIntervalId = null;
    }
    console.log('[MarketAnalysisScheduler] Schedulers stopped');
  }
}

export const marketAnalysisScheduler = new MarketAnalysisScheduler();
