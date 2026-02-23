import { storage } from '../storage';
import OpenAI from "openai";
import { estimateMessagesTokens, calculateCost } from '../utils/token-counter';
import { OpenAIRateLimiter } from './openai-rate-limiter';

const rateLimiter = OpenAIRateLimiter.getInstance();

// Portfolio metrics helper (storage-based)
async function getPortfolioMetricsStub(mode: 'live' | 'paper' = 'paper') {
  const activeTrades = await storage.getActiveTrades(mode);
  const closedTrades = await storage.getTrades(mode, { status: 'closed' });
  
  let currentExposure = 0;
  for (const trade of activeTrades) {
    currentExposure += parseFloat(trade.quantity) * parseFloat(trade.entryPrice);
  }
  
  const realizedPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
  const totalValue = 50000 + realizedPL; // Simplified starting balance assumption
  
  return {
    totalValue,
    unrealizedPL: 0,
    realizedPL,
    currentExposure,
    openTradesCount: activeTrades.length,
    cash: totalValue - currentExposure,
    crypto: currentExposure,
    cashPercent: totalValue > 0 ? ((totalValue - currentExposure) / totalValue) * 100 : 100,
    cryptoPercent: totalValue > 0 ? (currentExposure / totalValue) * 100 : 0
  };
}

// Win rate calculation helper (storage-based)
async function getWinRateStub(mode: 'live' | 'paper' = 'paper', days: number = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  
  const closedTrades = await storage.getTrades(mode, { status: 'closed' });
  const recentTrades = closedTrades.filter(t => 
    t.exitTime && new Date(t.exitTime) >= fromDate
  );
  
  const wins = recentTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
  const losses = recentTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);
  
  const totalWins = wins.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0));
  
  return {
    winRate: recentTrades.length > 0 ? (wins.length / recentTrades.length) * 100 : 0,
    totalTrades: recentTrades.length,
    wins: wins.length,
    losses: losses.length,
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0
  };
}

interface DailyBriefContent {
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

export class DailyBriefService {
  private updateIntervalId: NodeJS.Timeout | null = null;
  private finalizationTimeoutId: NodeJS.Timeout | null = null;
  private creationTimeoutId: NodeJS.Timeout | null = null;

  constructor() {
  }

  async startDailyBriefScheduler(): Promise<void> {
    console.log('[DailyBrief] Starting scheduler...');
    
    // Create today's brief if it doesn't exist
    await this.ensureTodaysBriefExists();
    
    // Schedule updates every 30 minutes
    this.scheduleUpdates();
    
    // Schedule daily brief creation at 00:01 UTC
    this.scheduleDailyCreation();
    
    // Schedule end-of-day finalization
    this.scheduleFinalization();
    
    console.log('[DailyBrief] Scheduler started successfully');
  }

  private async ensureTodaysBriefExists(): Promise<void> {
    const users = await storage.getAllUsers();
    const today = this.getTodayDateString();
    
    for (const user of users) {
      const existing = await storage.getDailyBrief(user.id, today);
      
      if (!existing) {
        console.log(`[DailyBrief] Creating brief for ${user.id} on ${today}`);
        await storage.createDailyBrief({
          userId: user.id,
          date: today,
          status: 'in_progress',
          headline: 'Initializing...',
          summary: 'Gathering trading data...',
          narrative: '',
          metrics: null,
          trades: null,
          learnings: null,
          systemHealth: { status: 'operational', issues: [] }
        });
        
        // Generate initial content
        await this.updateDailyBrief(user.id);
      }
    }
  }

  private scheduleUpdates(): void {
    // Update every 30 minutes
    this.updateIntervalId = setInterval(async () => {
      try {
        const users = await storage.getAllUsers();
        for (const user of users) {
          await this.updateDailyBrief(user.id);
        }
      } catch (error) {
        console.error('[DailyBrief] Update error:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    console.log('[DailyBrief] Updates scheduled every 30 minutes');
  }

  private scheduleDailyCreation(): void {
    // Calculate time until 00:01 UTC
    const now = new Date();
    const nextCreation = new Date(now);
    nextCreation.setUTCHours(0, 1, 0, 0);
    
    if (nextCreation <= now) {
      // If it's already past 00:01 today, schedule for tomorrow
      nextCreation.setUTCDate(nextCreation.getUTCDate() + 1);
    }
    
    const msUntilCreation = nextCreation.getTime() - now.getTime();
    
    this.creationTimeoutId = setTimeout(async () => {
      console.log('[DailyBrief] Creating briefs for new day...');
      await this.ensureTodaysBriefExists();
      // Schedule next day's creation
      this.scheduleDailyCreation();
    }, msUntilCreation);
    
    console.log(`[DailyBrief] Daily creation scheduled for ${nextCreation.toISOString()}`);
  }

  private scheduleFinalization(): void {
    // Calculate time until 23:59 UTC
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 0, 0);
    
    if (endOfDay <= now) {
      // If it's already past 23:59, schedule for tomorrow
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    }
    
    const msUntilFinalization = endOfDay.getTime() - now.getTime();
    
    this.finalizationTimeoutId = setTimeout(async () => {
      await this.finalizeAllBriefs();
      // Schedule next day
      this.scheduleFinalization();
    }, msUntilFinalization);
    
    console.log(`[DailyBrief] Finalization scheduled for ${endOfDay.toISOString()}`);
  }

  async updateDailyBrief(userId: string): Promise<void> {
    const today = this.getTodayDateString();
    const brief = await storage.getDailyBrief(userId, today);
    
    if (!brief || brief.status === 'final') {
      return; // Don't update finalized briefs
    }

    console.log(`[DailyBrief] Updating brief for ${userId} on ${today}`);
    
    try {
      const content = await this.generateBriefContent(userId);
      
      await storage.updateDailyBrief(brief.id, {
        headline: content.headline,
        summary: content.summary,
        narrative: content.narrative,
        metrics: content.metrics as any,
        trades: content.trades as any,
        learnings: content.learnings as any,
        systemHealth: content.systemHealth as any,
      });
      
      console.log(`[DailyBrief] Updated successfully for ${userId}`);
    } catch (error) {
      console.error(`[DailyBrief] Error updating for ${userId}:`, error);
    }
  }

  private async generateBriefContent(userId: string): Promise<DailyBriefContent> {
    const today = this.getTodayDateString();
    const todayStart = new Date(today + 'T00:00:00Z');
    
    // Get today's trades
    const allTrades = await storage.getTrades('paper', { status: 'closed' });
    const todayTrades = allTrades.filter(trade => 
      trade.exitTime && new Date(trade.exitTime) >= todayStart
    );
    
    const openTrades = await storage.getActiveTrades('paper');
    console.log('[Phase-27.F.15.B.2] Updated service daily-brief → mode-based only');
    
    // Get metrics from helper functions
    const portfolioMetrics = await getPortfolioMetricsStub('paper');
    const winRateData = await getWinRateStub('paper', 1); // Today only
    
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
    
    // Generate narrative using GPT-4o
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
        exposure: (portfolioMetrics.currentExposure / portfolioMetrics.totalValue) * 100,
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
    // Get user's trading mode to fetch the appropriate market analysis
    const user = await storage.getUser(userId);
    const mode = user?.tradingMode || 'paper';
    
    // Get latest market analysis for context
    const marketAnalysis = await storage.getLatestAiMarketAnalysis(mode);
    
    const systemPrompt = `You are a professional trading analyst creating a daily trading briefing. Your goal is to tell the story of the trading day in a clear, factual, and insightful way.

Focus on:
1. What happened today (trades, outcomes, market conditions)
2. Why it happened (strategy execution, market context)
3. What was learned (genuine insights, no filler)
4. What to watch for tomorrow

Write in a professional but conversational tone. Be honest about losses and wins. Provide actionable insights.`;

    const marketContextSection = marketAnalysis ? `
**Market Context (AI Analysis):**
- Regime: ${marketAnalysis.regime} (${marketAnalysis.confidence}% confidence)
- Summary: ${marketAnalysis.summary}
${marketAnalysis.recommendations && Array.isArray(marketAnalysis.recommendations) 
  ? `- Recommendations: ${marketAnalysis.recommendations.slice(0, 3).join('; ')}`
  : ''}
` : '';

    const userPrompt = `Generate a daily trading brief for ${new Date().toLocaleDateString()}:
${marketContextSection}
**Trading Activity:**
- Closed trades: ${data.todayTrades.length}
- Open positions: ${data.openTrades.length}
- Win rate today: ${data.winRateData.winRate.toFixed(1)}%
- Total P/L: $${data.portfolioMetrics.realizedPL.toFixed(2)}

**Top Winners:**
${data.topWinners.map((t: any) => `- ${t.symbol}: $${t.pnl.toFixed(2)} (${t.pnl_pct.toFixed(2)}%)`).join('\n') || 'None'}

**Top Losers:**
${data.topLosers.map((t: any) => `- ${t.symbol}: $${t.pnl.toFixed(2)} (${t.pnl_pct.toFixed(2)}%)`).join('\n') || 'None'}

**Portfolio:**
- Total value: $${data.portfolioMetrics.totalValue.toFixed(2)}
- Exposure: ${((data.portfolioMetrics.currentExposure / data.portfolioMetrics.totalValue) * 100).toFixed(1)}%

Provide:
1. A compelling headline (max 100 chars)
2. A one-sentence summary
3. A narrative story (3-5 paragraphs) - incorporate the market context to explain trading outcomes
4. 2-3 key learnings (genuine insights only)

Return JSON:
{
  "headline": "string",
  "summary": "string",
  "story": "string",
  "learnings": [
    {"insight": "string", "actionable": boolean}
  ]
}`;

    const todayDate = new Date().toISOString().split('T')[0];
    const response = await rateLimiter.createChatCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    }, {
      cacheKey: `daily_brief_${userId}_${todayDate}`,
      cacheTTL: 30 * 60 * 1000 // 30 minutes
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    
    console.log(`[DailyBrief] AI narrative generated (${response.usage?.total_tokens || 0} tokens)`);
    
    return {
      headline: parsed.headline || 'Daily Trading Summary',
      summary: parsed.summary || 'Trading activity summary',
      story: parsed.story || 'No narrative available',
      learnings: parsed.learnings || []
    };
  }

  private async finalizeAllBriefs(): Promise<void> {
    console.log('[DailyBrief] Finalizing all briefs for the day...');
    
    const users = await storage.getAllUsers();
    const today = this.getTodayDateString();
    
    for (const user of users) {
      const brief = await storage.getDailyBrief(user.id, today);
      
      if (brief && brief.status === 'in_progress') {
        // Final update before finalization
        await this.updateDailyBrief(user.id);
        
        // Finalize
        await storage.finalizeDailyBrief(brief.id);
        console.log(`[DailyBrief] Finalized brief for ${user.id}`);
        
        // TODO: Send email if configured
      }
    }
    
    console.log('[DailyBrief] All briefs finalized. Next day\'s briefs will be created at 00:01 UTC.');
  }

  private getTodayDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  stopScheduler(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    if (this.creationTimeoutId) {
      clearTimeout(this.creationTimeoutId);
      this.creationTimeoutId = null;
    }
    if (this.finalizationTimeoutId) {
      clearTimeout(this.finalizationTimeoutId);
      this.finalizationTimeoutId = null;
    }
    console.log('[DailyBrief] Scheduler stopped');
  }
}

export const dailyBriefService = new DailyBriefService();
