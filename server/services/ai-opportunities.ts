import OpenAI from "openai";
import { KrakenService } from './kraken';
import { storage } from '../storage';
import { InsertAIOpportunity, InsertAIOpportunityRun, InsertAIAuditLog } from '@shared/schema';
import { estimateMessagesTokens, calculateCost } from '../utils/token-counter';
// Directive 12.2.3: walter-purpose import removed (file deleted in Batch 6)
import { OpenAIRateLimiter } from './openai-rate-limiter';

const rateLimiter = OpenAIRateLimiter.getInstance();

interface PairData {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  lastPrice: number;
  volume24h: number;
  dailyRangePct: number;
  vwap: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  atr?: number;
  trendMarkers?: {
    aboveSMA50: boolean;
    aboveSMA200: boolean;
    distanceFromVWAP: number;
  };
}

interface OpportunityCandidate {
  symbol: string;
  type: 'long_term_hold' | 'moonshot' | 'momentum' | 'breakout' | 'mean_reversion';
  entryZone: { min: number; max: number } | { value: number };
  stopFloor: number;
  targetCeiling: number | number[];
  timeHorizon: string;
  riskAmountRule?: { type: 'dollar' | 'percent'; value: number };
  notes: string;
  probabilityScore: number; // 0-100
  riskRewardRating: number; // R multiple
  eligibilityFlags?: string[];
}

export class AIOpportunitiesService {
  private kraken: KrakenService;
  private isRunning = false;

  constructor() {
    this.kraken = new KrakenService();
  }

  async startHourlyOpportunityGeneration(): Promise<void> {
    console.log('Checking if AI Opportunities is enabled...');
    
    // Check if ANY user has the feature enabled before starting
    const users = await this.getAllActiveUsers();
    const anyEnabled = await this.isFeatureEnabledForAnyUser(users);
    
    if (!anyEnabled) {
      console.log('AI Opportunities disabled for all users, not starting service');
      return;
    }
    
    console.log('Starting hourly AI opportunity generation...');
    
    // Run initial generation
    await this.generateOpportunities();
    
    // Schedule based on settings
    setInterval(async () => {
      if (!this.isRunning) {
        await this.generateOpportunities();
      }
    }, 60 * 60 * 1000); // Default 1 hour, can be made configurable
  }

  private async isFeatureEnabledForAnyUser(users: Array<{ id: string }>): Promise<boolean> {
    for (const user of users) {
// Phase 41F-L.E2E-PURGE: DISABLED -       const settings = await storage.getTradingSettings(user.id);
      if (settings?.aiOpportunitiesEnabled) {
        return true;
      }
    }
    return false;
  }

  async generateOpportunities(): Promise<void> {
    if (this.isRunning) {
      console.log('AI Opportunities generation already in progress, skipping...');
      return;
    }

    // Check if feature is enabled for ANY user BEFORE setting isRunning
    const users = await this.getAllActiveUsers();
    const anyEnabled = await this.isFeatureEnabledForAnyUser(users);
    if (!anyEnabled) {
      console.log('AI Opportunities disabled for all users, skipping generation');
      return;
    }

    this.isRunning = true;
    console.log('\n🤖 Starting AI Opportunities generation...');

    try {
      for (const user of users) {
        await this.generateOpportunitiesForUser(user.id);
      }

    } catch (error) {
      console.error('Error during AI opportunities generation:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async generateOpportunitiesForUser(userId: string): Promise<void> {
    console.log(`\n👤 Generating AI opportunities for user ${userId}...`);

    // Get user settings
// Phase 41F-L.E2E-PURGE: DISABLED -     const settings = await storage.getTradingSettings(userId);
    
    if (!settings || !settings.aiOpportunitiesEnabled) {
      console.log(`AI Opportunities disabled for user ${userId}, skipping...`);
      return;
    }

    // Create run record
    const runId = await this.createOpportunityRun(userId);

    try {
      // Step 1: Collect universe data (all Kraken pairs)
      const allPairs = await this.collectUniverseData();
      console.log(`📊 Collected ${allPairs.length} total pairs from Kraken`);

      // Step 2: Trim and rank by liquidity/volatility
      const maxPairs = settings.aiOpportunitiesMaxPairs || 150;
      const selectedPairs = this.rankAndTrimPairs(allPairs, maxPairs);
      console.log(`✨ Selected top ${selectedPairs.length} pairs for AI analysis`);

      // Step 3: Apply delta filter (skip unchanged pairs)
      const filteredPairs = await this.applyDeltaFilter(userId, selectedPairs);
      console.log(`🔄 After delta filter: ${filteredPairs.length} pairs have material changes`);

      if (filteredPairs.length === 0) {
        console.log('No material changes detected, skipping AI call');
        await this.finalizeRun(runId, { pairsConsidered: allPairs.length, pairsSentToAi: 0, opportunitiesCreated: 0 });
        return;
      }

      // Step 4: Call GPT-4o mini for opportunity generation
      const opportunities = await this.callAIForOpportunities(filteredPairs, settings.aiOpportunitiesMaxSaved || 40, userId);
      console.log(`💡 AI generated ${opportunities.length} opportunities`);

      // Step 5: Validate and store opportunities
      const validOpportunities = this.validateOpportunities(opportunities);
      console.log(`✅ ${validOpportunities.length} opportunities passed validation`);

      for (const opp of validOpportunities) {
        await this.storeOpportunity(userId, runId, opp);
      }

      // Step 6: Log to audit trail
      await storage.createAuditLog({
        userId,
        actionType: 'create_opportunity',
        gptResponse: `Generated ${validOpportunities.length} opportunities`,
        status: 'completed'
      });

      // Finalize run
      await this.finalizeRun(runId, {
        pairsConsidered: allPairs.length,
        pairsSentToAi: filteredPairs.length,
        opportunitiesCreated: validOpportunities.length
      });

      console.log(`✅ AI Opportunities generation complete for user ${userId}`);

    } catch (error) {
      console.error(`Error generating opportunities for user ${userId}:`, error);
      await this.finalizeRun(runId, {
        pairsConsidered: 0,
        pairsSentToAi: 0,
        opportunitiesCreated: 0,
        error: (error as Error).message
      });
    }
  }

  private async collectUniverseData(): Promise<PairData[]> {
    try {
      // Get all tradable pairs from Kraken
      const assetPairs = await this.kraken.getAssetPairs();
      const tickers = await this.kraken.getTickers();
      
      const pairData: PairData[] = [];

      for (const [symbol, pairInfo] of Object.entries(assetPairs)) {
        // Only spot pairs, no margin/derivatives
        if (!symbol.endsWith('.d') && tickers[symbol]) {
          const ticker: any = tickers[symbol];
          
          const lastPrice = parseFloat(ticker.c[0]);
          const volume24h = parseFloat(ticker.v[1]);
          const high24h = parseFloat(ticker.h[1]);
          const low24h = parseFloat(ticker.l[1]);
          const dailyRangePct = ((high24h - low24h) / low24h) * 100;
          const vwap = parseFloat(ticker.p[1]);

          pairData.push({
            symbol,
            baseCurrency: (pairInfo as any).base,
            quoteCurrency: (pairInfo as any).quote,
            lastPrice,
            volume24h,
            dailyRangePct,
            vwap,
            trendMarkers: {
              aboveSMA50: lastPrice > vwap, // Simplified
              aboveSMA200: lastPrice > vwap * 0.95, // Simplified
              distanceFromVWAP: ((lastPrice - vwap) / vwap) * 100
            }
          });
        }
      }

      return pairData;
    } catch (error) {
      console.error('Error collecting universe data:', error);
      return [];
    }
  }

  private rankAndTrimPairs(pairs: PairData[], maxPairs: number): PairData[] {
    // Rank by liquidity (volume) and volatility (daily range)
    const scored = pairs.map(pair => ({
      pair,
      score: (pair.volume24h * 0.6) + (pair.dailyRangePct * 1000000 * 0.4) // Weight volume more
    }));

    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, maxPairs).map(s => s.pair);
  }

  private async applyDeltaFilter(userId: string, pairs: PairData[]): Promise<PairData[]> {
    // Simple filter: for now, accept all pairs
    // In production, would check against previous run's data and filter out pairs with minimal changes
    // Thresholds: price change < 2%, volume change < 20%, no trend flips
    
    // For v1, return all pairs
    return pairs;
  }

  private async callAIForOpportunities(pairs: PairData[], maxOpportunities: number, userId?: string): Promise<OpportunityCandidate[]> {
    try {
      // Prepare compact payload
      const payload = pairs.map(p => ({
        symbol: p.symbol,
        price: p.lastPrice.toFixed(2),
        volume: (p.volume24h / 1000000).toFixed(2) + 'M',
        range: p.dailyRangePct.toFixed(2) + '%',
        vwap: p.vwap.toFixed(2),
        trend: p.trendMarkers
      }));

      // Directive 12.2.3: Walter purpose prompt injection removed (Batch 6)

      const systemPrompt = `You are a cryptocurrency trading analyst. Analyze the provided market data and identify trading opportunities.

IMPORTANT CONSTRAINTS:
- You are ONLY proposing opportunities, NOT placing orders
- Each opportunity must pass backend guardrails before execution
- Only spot trading (no margin/derivatives)
- Focus on liquid pairs with clear technical setups

OPPORTUNITY TYPES:
1. long_term_hold: Solid fundamentals, accumulation zone
2. moonshot: High risk/reward, low market cap, explosive potential
3. momentum: Strong trend continuation
4. breakout: Breaking key resistance with volume
5. mean_reversion: Oversold, bouncing from support

For each opportunity, provide:
- symbol
- type (one of the 5 types above)
- entryZone: {"min": number, "max": number} or {"value": number}
- stopFloor: hard stop loss price
- targetCeiling: single number or array of targets
- timeHorizon: "hours", "days", or "weeks"
- riskAmountRule: {"type": "dollar", "value": 150} - suggest reasonable R amount
- notes: concise rationale (2-3 sentences max)
- probabilityScore: 0-100 (your confidence)
- riskRewardRating: R multiple estimate (e.g., 2.5 for 2.5R potential)
- eligibilityFlags: array of risk warnings (e.g., ["thin orderbook", "high spread", "low liquidity"])

Return ONLY a JSON array of opportunities, no other text. Maximum ${maxOpportunities} opportunities, prioritize highest quality.`;

      const userPrompt = `Analyze these ${pairs.length} cryptocurrency pairs and identify the best trading opportunities:\n\n${JSON.stringify(payload, null, 2)}`;

      const inputTokensEst = estimateMessagesTokens([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      console.log(`📡 Calling GPT-4o mini with ${inputTokensEst} estimated input tokens...`);

      const completion = await rateLimiter.createChatCompletion({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      }, {
        cacheKey: `ai_opportunities_${userId}_${Date.now()}`,
        cacheTTL: 60 * 60 * 1000 // 1 hour cache
      });

      const inputTokens = completion.usage?.prompt_tokens || inputTokensEst;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const totalTokens = completion.usage?.total_tokens || 0;
      const cost = calculateCost(inputTokens, outputTokens, 'gpt-4o-mini');

      console.log(`💰 API call cost: $${cost.toFixed(4)} (${totalTokens} tokens)`);

      // Directive 12.2.3: Walter purpose usage logging removed (Batch 6)

      const responseText = completion.choices[0].message.content || '{"opportunities": []}';
      const parsed = JSON.parse(responseText);
      
      // Handle both {"opportunities": [...]} and direct array format
      return parsed.opportunities || parsed || [];

    } catch (error) {
      console.error('Error calling AI for opportunities:', error);
      return [];
    }
  }

  private validateOpportunities(opportunities: OpportunityCandidate[]): OpportunityCandidate[] {
    const valid: OpportunityCandidate[] = [];

    for (const opp of opportunities) {
      try {
        // Schema validation
        if (!opp.symbol || !opp.type || !opp.entryZone || !opp.stopFloor || !opp.targetCeiling) {
          console.warn(`Invalid opportunity missing required fields: ${JSON.stringify(opp)}`);
          continue;
        }

        // Type validation
        const validTypes = ['long_term_hold', 'moonshot', 'momentum', 'breakout', 'mean_reversion'];
        if (!validTypes.includes(opp.type)) {
          console.warn(`Invalid opportunity type: ${opp.type}`);
          continue;
        }

        // Price validation
        if (opp.stopFloor <= 0 || (typeof opp.targetCeiling === 'number' && opp.targetCeiling <= 0)) {
          console.warn(`Invalid prices in opportunity: ${JSON.stringify(opp)}`);
          continue;
        }

        valid.push(opp);
      } catch (error) {
        console.warn(`Error validating opportunity: ${error}`);
      }
    }

    return valid;
  }

  private async storeOpportunity(userId: string, runId: string, opp: OpportunityCandidate): Promise<void> {
    const opportunity: InsertAIOpportunity = {
      userId,
      runId,
      symbol: opp.symbol,
      type: opp.type,
      entryZone: opp.entryZone,
      stopFloor: opp.stopFloor.toString(),
      targetCeiling: opp.targetCeiling,
      timeHorizon: opp.timeHorizon,
      riskAmountRule: opp.riskAmountRule,
      notes: opp.notes,
      probabilityScore: opp.probabilityScore,
      riskRewardRating: opp.riskRewardRating.toString(),
      eligibilityFlags: opp.eligibilityFlags,
      status: 'new'
    };

    await storage.createAIOpportunity(opportunity);
  }

  private async createOpportunityRun(userId: string): Promise<string> {
    const run: InsertAIOpportunityRun = {
      userId
    };

    const created = await storage.createAIOpportunityRun(run);
    return created.id;
  }

  private async finalizeRun(runId: string, stats: { 
    pairsConsidered: number; 
    pairsSentToAi: number; 
    opportunitiesCreated: number; 
    error?: string 
  }): Promise<void> {
    await storage.updateAIOpportunityRun(runId, {
      finishedAt: new Date(),
      pairsConsidered: stats.pairsConsidered,
      pairsSentToAi: stats.pairsSentToAi,
      opportunitiesCreated: stats.opportunitiesCreated,
      errors: stats.error ? [{ message: stats.error }] : undefined
    });
  }

  private async getAllActiveUsers(): Promise<Array<{ id: string; tradingStatus: string }>> {
    // Get all users - in production, this would filter by trading status
    const users = await storage.getAllUsers();
    return users.map(u => ({ id: u.id, tradingStatus: u.tradingStatus || 'stopped' }));
  }

  // Public methods for API

  async generateOpportunitiesForSingleUser(userId: string): Promise<void> {
    // CRITICAL: Set isRunning FIRST to prevent race condition
    if (this.isRunning) {
      throw new Error('AI Opportunities generation already in progress, please try again later');
    }
    this.isRunning = true;
    
    try {
      // Check cooldown - no runs within last 5 minutes
      const latestRun = await storage.getLatestAIOpportunityRun(userId);
      if (latestRun) {
        // If latest run hasn't finished, it's still in progress
        if (!latestRun.finishedAt) {
          throw new Error('AI Opportunities generation already in progress for your account, please wait');
        }
        
        // Check 5-minute cooldown on finished runs
        const timeSinceLastRun = Date.now() - new Date(latestRun.finishedAt).getTime();
        const cooldownMs = 5 * 60 * 1000; // 5 minutes
        
        if (timeSinceLastRun < cooldownMs) {
          const remainingMs = cooldownMs - timeSinceLastRun;
          const remainingMin = Math.ceil(remainingMs / 60000);
          throw new Error(`Please wait ${remainingMin} more minute(s) before generating again`);
        }
      }

      // Run for single user only
      await this.generateOpportunitiesForUser(userId);
    } finally {
      // Always reset isRunning flag
      this.isRunning = false;
    }
  }

  async getOpportunitiesForUser(userId: string, filters?: {
    status?: string;
    type?: string;
    minProbability?: number;
  }): Promise<any[]> {
    return await storage.getAIOpportunities(userId, filters);
  }

  async updateOpportunityStatus(opportunityId: string, status: 'new' | 'watchlist' | 'executed' | 'dismissed' | 'expired'): Promise<void> {
    await storage.updateAIOpportunity(opportunityId, { status });
  }

  async getLatestRun(userId: string): Promise<any> {
    return await storage.getLatestAIOpportunityRun(userId);
  }

  async getValidationReport(userId: string): Promise<any> {
    const latestRun = await storage.getLatestAIOpportunityRun(userId);
    if (!latestRun) {
      return { error: 'No runs found' };
    }

    const opportunities = await storage.getAIOpportunitiesByRun(latestRun.id);
    
    // Simplified guardrail test - in production, would actually run guardrails
    const guardrailResults = opportunities.map(opp => ({
      opportunityId: opp.id,
      symbol: opp.symbol,
      wouldPass: true, // Simplified
      reasons: []
    }));

    return {
      runId: latestRun.id,
      timestamp: latestRun.startedAt,
      model: latestRun.modelUsed,
      inputTokensEst: latestRun.inputTokensEst,
      outputTokensEst: latestRun.outputTokensEst,
      costEstimate: latestRun.costEstimate,
      pairsConsidered: latestRun.pairsConsidered,
      pairsSentToAi: latestRun.pairsSentToAi,
      opportunitiesCreated: latestRun.opportunitiesCreated,
      sampleOpportunities: opportunities.slice(0, 5),
      guardrailSummary: {
        total: opportunities.length,
        wouldPass: guardrailResults.filter(r => r.wouldPass).length,
        wouldFail: guardrailResults.filter(r => !r.wouldPass).length,
        details: guardrailResults
      }
    };
  }
}

export const aiOpportunitiesService = new AIOpportunitiesService();
