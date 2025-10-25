import { storage } from '../storage.js';
import { PaperMetricsService } from './paper-metrics.js';
import OpenAI from "openai";
import { estimateMessagesTokens, calculateCost } from '../utils/token-counter.js';
import { OpenAIRateLimiter } from './openai-rate-limiter.js';

const rateLimiter = OpenAIRateLimiter.getInstance();

interface PaperBriefContent {
  headline: string;
  summary: string;
  narrative: string;
  metrics: {
    pnl_pct: number;
    win_rate: number;
    drawdown: number;
    exposure: number;
    num_trades: number;
    realized_pl: number;
    unrealized_pl: number;
  };
  trades: {
    top_winners: Array<{ symbol: string; pnl: number; pnl_pct: number }>;
    top_losers: Array<{ symbol: string; pnl: number; pnl_pct: number }>;
    closed: Array<{ symbol: string; pnl: number; time: string }>;
    open: Array<{ symbol: string; entry: number; current_pnl: number }>;
  };
  learnings: Array<{ insight: string; actionable: boolean }>;
  systemHealth: {
    status: 'operational' | 'degraded' | 'issues';
    issues: string[];
  };
}

/**
 * PaperDailyBriefService - Manages daily briefings for paper trading
 * Complete data isolation from live trading
 * Mirrors live DailyBriefService structure with paper-specific data sources
 */
export class PaperDailyBriefService {
  private updateIntervalId: NodeJS.Timeout | null = null;
  private finalizationTimeoutId: NodeJS.Timeout | null = null;
  private creationTimeoutId: NodeJS.Timeout | null = null;

  constructor() {}

  async startPaperBriefScheduler(): Promise<void> {
    console.log('[PaperDailyBrief] Starting scheduler...');
    
    // Create today's brief if it doesn't exist
    await this.ensureTodaysBriefExists();
    
    // Schedule updates every 30 minutes
    this.scheduleUpdates();
    
    // Schedule daily brief creation at 00:01 UTC
    this.scheduleDailyCreation();
    
    // Schedule end-of-day finalization
    this.scheduleFinalization();
    
    console.log('[PaperDailyBrief] Scheduler started successfully');
  }

  async stopPaperBriefScheduler(): Promise<void> {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    if (this.finalizationTimeoutId) {
      clearTimeout(this.finalizationTimeoutId);
      this.finalizationTimeoutId = null;
    }
    if (this.creationTimeoutId) {
      clearTimeout(this.creationTimeoutId);
      this.creationTimeoutId = null;
    }
    console.log('[PaperDailyBrief] Scheduler stopped');
  }

  private async ensureTodaysBriefExists(): Promise<void> {
    const users = await storage.getAllUsers();
    const today = this.getTodayDateString();
    
    for (const user of users) {
      const existing = await storage.getPaperDailyBrief(user.id, today);
      
      if (!existing) {
        console.log(`[PaperDailyBrief] Creating brief for ${user.id} on ${today}`);
        await storage.createPaperDailyBrief({
          userId: user.id,
          date: today,
          status: 'in_progress',
          headline: '[PAPER] Initializing...',
          summary: 'Gathering simulated trading data...',
          narrative: '',
          metrics: null,
          trades: null,
          learnings: null,
          systemHealth: { status: 'operational', issues: [] }
        });
        
        // Generate initial content
        await this.updatePaperBrief(user.id);
      }
    }
  }

  private scheduleUpdates(): void {
    // Update every 30 minutes
    this.updateIntervalId = setInterval(async () => {
      try {
        const users = await storage.getAllUsers();
        for (const user of users) {
          await this.updatePaperBrief(user.id);
        }
      } catch (error) {
        console.error('[PaperDailyBrief] Update error:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    console.log('[PaperDailyBrief] Updates scheduled every 30 minutes');
  }

  private scheduleDailyCreation(): void {
    // Calculate time until 00:01 UTC
    const now = new Date();
    const nextCreation = new Date(now);
    nextCreation.setUTCHours(0, 1, 0, 0);
    
    if (nextCreation <= now) {
      nextCreation.setUTCDate(nextCreation.getUTCDate() + 1);
    }
    
    const msUntilCreation = nextCreation.getTime() - now.getTime();
    
    this.creationTimeoutId = setTimeout(async () => {
      console.log('[PaperDailyBrief] Creating briefs for new day...');
      await this.ensureTodaysBriefExists();
      this.scheduleDailyCreation();
    }, msUntilCreation);
    
    console.log(`[PaperDailyBrief] Daily creation scheduled for ${nextCreation.toISOString()}`);
  }

  private scheduleFinalization(): void {
    // Calculate time until 23:59 UTC
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 0, 0);
    
    if (endOfDay <= now) {
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    }
    
    const msUntilFinalization = endOfDay.getTime() - now.getTime();
    
    this.finalizationTimeoutId = setTimeout(async () => {
      await this.finalizeAllBriefs();
      this.scheduleFinalization();
    }, msUntilFinalization);
    
    console.log(`[PaperDailyBrief] Finalization scheduled for ${endOfDay.toISOString()}`);
  }

  async updatePaperBrief(userId: string): Promise<void> {
    const today = this.getTodayDateString();
    const brief = await storage.getPaperDailyBrief(userId, today);
    
    if (!brief || brief.status === 'final') {
      return; // Don't update finalized briefs
    }

    console.log(`[PaperDailyBrief] Updating brief for ${userId} on ${today}`);
    
    try {
      const content = await this.generateBriefContent(userId);
      
      await storage.updatePaperDailyBrief(brief.id, {
        headline: content.headline,
        summary: content.summary,
        narrative: content.narrative,
        metrics: content.metrics as any,
        trades: content.trades as any,
        learnings: content.learnings as any,
        systemHealth: content.systemHealth as any,
      });
      
      console.log(`[PaperDailyBrief] Updated successfully for ${userId}`);
    } catch (error) {
      console.error(`[PaperDailyBrief] Error updating for ${userId}:`, error);
    }
  }

  private async generateBriefContent(userId: string): Promise<PaperBriefContent> {
    const today = this.getTodayDateString();
    const todayStart = new Date(today + 'T00:00:00Z');
    
    const metricsService = new PaperMetricsService(userId);
    
    // Get today's paper trades
    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    const todayTrades = closedTrades.filter(trade => 
      trade.exitTime && new Date(trade.exitTime) >= todayStart
    );
    
    const openTrades = await storage.getOpenPaperTrades();
    
    // Get metrics from paper metrics service
    const portfolioMetrics = await metricsService.getPortfolioMetrics();
    const winRateData = await metricsService.getWinRate(1); // Today only
    
    // Calculate top winners/losers
    const sortedByPL = [...todayTrades].sort((a, b) => 
      parseFloat(b.realizedPL || '0') - parseFloat(a.realizedPL || '0')
    );
    
    const topWinners = sortedByPL
      .filter(t => parseFloat(t.realizedPL || '0') > 0)
      .slice(0, 3)
      .map(t => ({
        symbol: t.symbol,
        pnl: parseFloat(t.realizedPL || '0'),
        pnl_pct: parseFloat(t.realizedPLPercent || '0')
      }));
    
    const topLosers = sortedByPL
      .filter(t => parseFloat(t.realizedPL || '0') < 0)
      .slice(-3)
      .reverse()
      .map(t => ({
        symbol: t.symbol,
        pnl: parseFloat(t.realizedPL || '0'),
        pnl_pct: parseFloat(t.realizedPLPercent || '0')
      }));
    
    // Generate narrative using GPT-4o (with paper trading context)
    const narrative = await this.generateNarrative(userId, {
      todayTrades,
      openTrades,
      portfolioMetrics,
      winRateData,
      topWinners,
      topLosers
    });
    
    return {
      headline: narrative.headline,
      summary: narrative.summary,
      narrative: narrative.story,
      metrics: {
        pnl_pct: ((portfolioMetrics.totalValue - 50000) / 50000) * 100,
        win_rate: winRateData.winRate,
        drawdown: 0, // Calculate from portfolio history
        exposure: portfolioMetrics.totalValue > 0 
          ? (portfolioMetrics.currentExposure / portfolioMetrics.totalValue) * 100 
          : 0,
        num_trades: todayTrades.length,
        realized_pl: portfolioMetrics.realizedPL,
        unrealized_pl: portfolioMetrics.unrealizedPL
      },
      trades: {
        top_winners: topWinners,
        top_losers: topLosers,
        closed: todayTrades.map(t => ({
          symbol: t.symbol,
          pnl: parseFloat(t.realizedPL || '0'),
          time: t.exitTime?.toISOString() || ''
        })),
        open: openTrades.map(t => ({
          symbol: t.symbol,
          entry: parseFloat(t.entryPrice),
          current_pnl: 0 // Calculate based on current price
        }))
      },
      learnings: narrative.learnings,
      systemHealth: {
        status: 'operational',
        issues: []
      }
    };
  }

  private async generateNarrative(userId: string, data: any): Promise<{
    headline: string;
    summary: string;
    story: string;
    learnings: Array<{ insight: string; actionable: boolean }>;
  }> {
    const systemPrompt = `You are a professional trading analyst creating a daily trading briefing for PAPER TRADING (simulated trades, no real money). Your goal is to tell the story of the trading day in a clear, factual, and insightful way.

Focus on:
1. What happened today (simulated trades, outcomes, strategy performance)
2. Why it happened (strategy execution, signal quality)
3. What was learned (genuine insights for strategy improvement)
4. What to watch for in future paper trades

Write in a professional but conversational tone. Be honest about losses and wins. Provide actionable insights. 
IMPORTANT: Make it clear this is paper trading (simulated) by using phrases like "simulated trades", "paper trading session", "practice performance".`;

    const userPrompt = `Generate a daily PAPER TRADING brief for ${new Date().toLocaleDateString()}:

**Simulated Trading Activity:**
- Closed paper trades: ${data.todayTrades.length}
- Open simulated positions: ${data.openTrades.length}
- Win rate today: ${data.winRateData.winRate.toFixed(1)}%
- Total simulated P/L: $${data.portfolioMetrics.realizedPL.toFixed(2)}

**Top Simulated Winners:**
${data.topWinners.map((t: any) => `- ${t.symbol}: $${t.pnl.toFixed(2)} (${t.pnl_pct.toFixed(2)}%)`).join('\n') || 'None'}

**Top Simulated Losers:**
${data.topLosers.map((t: any) => `- ${t.symbol}: $${t.pnl.toFixed(2)} (${t.pnl_pct.toFixed(2)}%)`).join('\n') || 'None'}

**Paper Portfolio:**
- Total simulated value: $${data.portfolioMetrics.totalValue.toFixed(2)}
- Simulated exposure: ${data.portfolioMetrics.totalValue > 0 ? ((data.portfolioMetrics.currentExposure / data.portfolioMetrics.totalValue) * 100).toFixed(1) : 0}%
- Open simulated positions: ${data.openTrades.length}

Respond with JSON containing:
{
  "headline": "Engaging headline about today's paper trading (max 80 chars)",
  "summary": "2-3 sentence summary of the day's simulated activity",
  "story": "Detailed narrative (300-500 words) telling the story of today's paper trading",
  "learnings": [
    { "insight": "Specific insight from today", "actionable": true/false },
    ...3-5 insights total
  ]
}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt }
    ];

    const estimatedTokens = estimateMessagesTokens(messages);
    console.log(`[PaperDailyBrief] GPT-4o request: ~${estimatedTokens} tokens`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const usage = completion.usage;
    if (usage) {
      const cost = calculateCost(usage.prompt_tokens, usage.completion_tokens, "gpt-4o");
      console.log(`[PaperDailyBrief] GPT-4o usage: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = $${cost.toFixed(4)}`);
    }

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return {
      headline: result.headline || '[PAPER] Daily Brief',
      summary: result.summary || 'Simulated trading summary',
      story: result.story || '',
      learnings: result.learnings || []
    };
  }

  private async finalizeAllBriefs(): Promise<void> {
    const users = await storage.getAllUsers();
    const today = this.getTodayDateString();
    
    for (const user of users) {
      try {
        const brief = await storage.getPaperDailyBrief(user.id, today);
        if (brief && brief.status !== 'final') {
          // Final update before finalization
          await this.updatePaperBrief(user.id);
          
          // Mark as final
          await storage.finalizePaperDailyBrief(brief.id);
          console.log(`[PaperDailyBrief] Finalized brief for ${user.id} on ${today}`);
        }
      } catch (error) {
        console.error(`[PaperDailyBrief] Error finalizing for ${user.id}:`, error);
      }
    }
  }

  async getTodayBrief(userId: string) {
    const today = this.getTodayDateString();
    return await storage.getPaperDailyBrief(userId, today);
  }

  async getAllBriefs(userId: string, filters?: { status?: string; limit?: number }) {
    return await storage.getPaperDailyBriefs(userId, filters);
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }
}
