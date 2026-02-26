import OpenAI from "openai";
import { storage } from '../storage';
import { Trade, TradingSettings, AIReport, InsertAIAuditLog, InsertErrorLog } from '@shared/schema';
import { databaseQueryService } from './database-query';
import { marketDataService } from './market-data';
// Directive 12.2.3: walter-purpose and walter-memory imports removed (files deleted in Batch 6)
import { 
  estimateMessagesTokens, 
  calculateCost, 
  trimMessagesToCount, 
  trimMessagesToTokenLimit 
} from '../utils/token-counter';

import { OpenAIRateLimiter } from './openai-rate-limiter';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const rateLimiter = OpenAIRateLimiter.getInstance();

export interface SettingsChangeProposal {
  settingName: string;
  currentValue: any;
  proposedValue: any;
  reason: string;
  requiresConfirmation: boolean;
}

export interface ChatResponse {
  response: string;
  updatedContext: any;
  settingsProposal?: SettingsChangeProposal;
  auditLogId?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export class AIAnalyst {
  
  async generateDailyReport(userId: string): Promise<AIReport> {
    try {
      // Gather trading data
      // Phase 41F-L.E2E-PURGE: Mode-based queries only (no user-level settings)
      const [trades, activeTrades] = await Promise.all([
        storage.getTrades({ status: 'closed', limit: 50 }),
        storage.getActiveTrades()
      ]);
      console.log('[Phase-27.F.15.B.2] Updated service ai-analyst → mode-based only');

      const today = new Date().toISOString().split('T')[0];
      const todayTrades = trades.filter(trade => 
        trade.exitTime && trade.exitTime.toISOString().split('T')[0] === today
      );

      // Calculate metrics
      const metrics = this.calculateMetrics(todayTrades, activeTrades);
      
      // Generate AI analysis (no longer needs user-level settings)
      const analysis = await this.generateAnalysis(metrics, todayTrades, null);
      
      // Create report
      const report = await storage.createAIReport({
        userId,
        reportType: 'daily',
        period: today,
        content: analysis.content,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        metrics
      });

      return report;
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw error;
    }
  }

  async generateWeeklyReport(userId: string): Promise<AIReport> {
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      
      const trades = await storage.getTrades(userId, { status: 'closed', limit: 200 });
      const weekTrades = trades.filter(trade => 
        trade.exitTime && new Date(trade.exitTime) >= weekStart
      );

      const metrics = this.calculateWeeklyMetrics(weekTrades);
      const analysis = await this.generateWeeklyAnalysis(metrics, weekTrades);

      const weekPeriod = `${weekStart.getFullYear()}-W${this.getWeekNumber(weekStart)}`;
      
      const report = await storage.createAIReport({
        userId,
        reportType: 'weekly',
        period: weekPeriod,
        content: analysis.content,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        metrics
      });

      return report;
    } catch (error) {
      console.error('Error generating weekly report:', error);
      throw error;
    }
  }

  async generateMonthlyReport(userId: string): Promise<AIReport> {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      
      const trades = await storage.getTrades(userId, { status: 'closed', limit: 500 });
      const monthTrades = trades.filter(trade => 
        trade.exitTime && new Date(trade.exitTime) >= monthStart
      );

      const metrics = this.calculateMonthlyMetrics(monthTrades);
      const analysis = await this.generateMonthlyAnalysis(metrics, monthTrades);

      const monthPeriod = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
      
      const report = await storage.createAIReport({
        userId,
        reportType: 'monthly',
        period: monthPeriod,
        content: analysis.content,
        insights: analysis.insights,
        recommendations: analysis.recommendations,
        metrics
      });

      return report;
    } catch (error) {
      console.error('Error generating monthly report:', error);
      throw error;
    }
  }

  async analyzeSymbol(symbol: string, userId: string): Promise<{
    technicalAnalysis: string;
    strategyRecommendations: string;
    riskAssessment: string;
    historicalPerformance: any;
    symbolName?: string;
    livePrice?: number;
    change24h?: number;
    volume24h?: number;
    dataSource?: string;
    timestamp?: number;
    assetType?: 'stock' | 'crypto';
  }> {
    try {
      let liveMarketData;
      let assetType: 'stock' | 'crypto' = 'crypto';
      
      const { stockService } = await import('./stocks');
      const symbolData = await stockService.getSymbolData(symbol);
      
      if (symbolData) {
        liveMarketData = {
          symbol: symbolData.symbol,
          name: symbolData.name,
          price: symbolData.currentPrice,
          change24h: symbolData.change24h || 0,
          volume24h: symbolData.volume24h,
          source: symbolData.source.toLowerCase(),
          timestamp: new Date(symbolData.lastUpdated).getTime()
        };
        assetType = symbolData.type;
        console.log(`[AI Analyst] Live ${assetType} data for ${symbol} from ${symbolData.source}:`, liveMarketData);
      } else {
        console.warn(`[AI Analyst] No data available for ${symbol}`);
      }

      const priceData = await storage.getPriceData(symbol);
      const userTrades = await storage.getTrades(userId, { symbol, limit: 50 });
      
      // Directive 12.2.3: Walter purpose/memory prompt injection removed (Batch 6)

      const liveDataSection = liveMarketData ? `
        LIVE MARKET DATA (${liveMarketData.source}):
        - Asset Type: ${assetType.toUpperCase()}
        - Current Price: ${liveMarketData.price !== null ? `$${liveMarketData.price.toLocaleString()}` : 'N/A'}
        - 24h Change: ${liveMarketData.change24h.toFixed(2)}%
        - 24h Volume: $${liveMarketData.volume24h ? liveMarketData.volume24h.toLocaleString() : 'N/A'}
        - Data Source: ${liveMarketData.source.toUpperCase()}
        - Last Updated: ${new Date(liveMarketData.timestamp).toISOString()}
        
      ` : '';

      const assetTypeDescription = assetType === 'stock' ? 'stock' : 'cryptocurrency trading pair';
      
      const prompt = `Analyze the ${assetTypeDescription} ${symbol} with the following context:
        
        ${liveDataSection}Historical Performance:
        - User has made ${userTrades.length} trades on this symbol
        - Success rate: ${this.calculateSuccessRate(userTrades)}%
        - Average hold time: ${this.calculateAverageHoldTime(userTrades)} hours
        
        Recent Price Action:
        ${priceData.slice(-10).map(p => 
          `${p.timestamp.toISOString()}: O:${p.open} H:${p.high} L:${p.low} C:${p.close} V:${p.volume}`
        ).join('\n')}
        
        Provide analysis in these areas:
        1. Technical Analysis: Use the LIVE market data above. Include current price action, support/resistance, trend analysis
        2. Strategy Recommendations: Which of the three strategies (VWAP Pullback, ABCD Long, SMA Trend Ride) would work best with current conditions
        3. Risk Assessment: Typical volatility, slippage expectations, position sizing recommendations based on the 24h change
        4. Historical Performance: How this symbol has performed in user's past trades
        
        Respond in JSON format with the structure: {
          "technicalAnalysis": "string",
          "strategyRecommendations": "string", 
          "riskAssessment": "string",
          "historicalPerformance": "string"
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048
      });

      // Directive 12.2.3: Walter purpose usage logging removed (Batch 6)

      const analysis = JSON.parse(response.choices[0].message.content || '{}');

      return {
        ...analysis,
        symbolName: liveMarketData?.name,
        livePrice: liveMarketData?.price,
        change24h: liveMarketData?.change24h,
        volume24h: liveMarketData?.volume24h,
        dataSource: liveMarketData?.source,
        timestamp: liveMarketData?.timestamp,
        assetType
      };
    } catch (error: any) {
      console.error('Error analyzing symbol:', error);
      
      // Provide more helpful error messages based on the error type
      let errorMessage = "No results found for this symbol. ";
      
      if (error.message?.includes('API key') || error.message?.includes('FINNHUB_API_KEY')) {
        errorMessage = "API credentials are not configured. Please contact support.";
      } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        errorMessage = "Data temporarily unavailable (API delay). Please try again in a few moments.";
      } else if (error.message?.includes('404') || error.message?.includes('not found') || error.message?.includes('No quote data')) {
        errorMessage = "No results found for this symbol. Try another keyword or symbol.";
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = "Data temporarily unavailable (network error). Please try again.";
      } else if (error.message?.includes('temporarily unavailable') || error.message?.includes('API delay')) {
        errorMessage = error.message;
      } else {
        errorMessage = "Data temporarily unavailable. Please try again or search for a different symbol.";
      }
      
      return {
        technicalAnalysis: errorMessage,
        strategyRecommendations: "Unable to generate recommendations without market data.",
        riskAssessment: "Risk assessment unavailable without current price information.",
        historicalPerformance: "Historical analysis unavailable for this symbol."
      };
    }
  }

  async chatWithAssistant(
    userId: string,
    message: string,
    context?: any,
    conversationId?: string
  ): Promise<ChatResponse> {
    try {
      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await storage.getAIConversationById(conversationId);
        if (!conversation) {
          throw new Error('Conversation not found');
        }
      } else {
        // Legacy: get most recent conversation
        conversation = await storage.getAIConversation(userId);
        if (!conversation) {
          conversation = await storage.createAIConversation({
            userId,
            title: 'New Chat',
            messages: [],
            context: context || {},
            maxContextMessages: 20
          });
        }
      }

      // Get comprehensive trading data for context
      const [recentTrades, settings, activeTrades, stats, watchlist] = await Promise.all([
        databaseQueryService.getTrades(userId, { limit: 10 }),
        databaseQueryService.getRiskSettings(userId),
        databaseQueryService.getOpenTrades(userId),
        databaseQueryService.getTradeStatistics(userId),
        databaseQueryService.getWatchlist(userId)
      ]);

      // Build enhanced context message
      const contextMessage = `
        You are an AI trading assistant for a crypto day trading platform with full database access.
        
        Current Trading Context:
        - Active trades: ${activeTrades.length}
        - Trading mode: ${settings?.userId ? 'Live' : 'Paper'}
        - Risk per trade: $${settings?.riskPerTrade || '100'}
        - Watchlist pairs: ${watchlist.length}
        
        Performance Statistics:
        - Total trades: ${stats.totalTrades}
        - Win rate: ${stats.winRate.toFixed(2)}%
        - Total P/L: $${stats.totalPL.toFixed(2)}
        - Average R-multiple: ${stats.avgRMultiple.toFixed(2)}R
        
        Trading Strategies:
        1. VWAP Pullback - entering on pullbacks to VWAP with reversal confirmation
        2. ABCD Long - pattern-based entries on measured moves
        3. SMA Trend Ride - trend following entries on SMA bounces
        
        Your Capabilities:
        - Answer trading questions and provide strategy explanations
        - Analyze performance data and provide insights
        - Suggest settings changes (ALWAYS require user confirmation before applying)
        - Diagnose errors and issues
        - Generate custom reports
        
        Important: When suggesting settings changes, you MUST:
        1. Explain the current value and proposed change
        2. Provide clear reasoning
        3. Request explicit user confirmation
        4. Never apply changes without confirmation
        
        Respond naturally and conversationally. Keep responses concise but helpful.
      `;

      // Prepare conversation messages with trimming
      const maxMessages = conversation.maxContextMessages || 20;
      const conversationMessages = ((conversation.messages as any[]) || []);
      
      // Trim to max message count first
      const trimmedByCount = trimMessagesToCount(conversationMessages, maxMessages);
      
      // Build full message array
      const messages = [
        { role: "system", content: contextMessage },
        ...trimmedByCount,
        { role: "user", content: message }
      ];
      
      // Trim to token limit (4000 tokens to be safe)
      const finalMessages = trimMessagesToTokenLimit(messages, 4000);
      
      // Estimate input tokens
      const inputTokens = estimateMessagesTokens(finalMessages);

      // Cache Layer Integration (Milestone 14)
      // Only cache static informational queries (no live data dependency)
      let assistantResponse: string = '';
      let actualInputTokens: number = 0;
      let actualOutputTokens: number = 0;
      let cacheHit = false;
      
      // Detect dynamic queries that depend on live portfolio/trade data
      const lowerMessage = message.toLowerCase();
      const isDynamicQuery = lowerMessage.includes('trade') ||
                            lowerMessage.includes('position') ||
                            lowerMessage.includes('portfolio') ||
                            lowerMessage.includes('balance') ||
                            lowerMessage.includes('profit') ||
                            lowerMessage.includes('loss') ||
                            lowerMessage.includes('open') ||
                            lowerMessage.includes('active') ||
                            lowerMessage.includes('setting') ||
                            lowerMessage.includes('watchlist') ||
                            lowerMessage.includes('apply') ||
                            lowerMessage.includes('update') ||
                            lowerMessage.includes('change') ||
                            lowerMessage.includes('execute') ||
                            lowerMessage.includes('place') ||
                            lowerMessage.includes('run') ||
                            lowerMessage.includes('activate');
      
      // Only cache static informational queries (strategy explanations, documentation)
      if (!isDynamicQuery) {
        try {
          const { responseCacheService } = await import('./response-cache');
          const endpoint = `/api/conversations/${conversation.id}/message`;
          // Simplified cache key: message + conversationId only (no context hash)
          // Context hash caused false misses due to dynamic timestamps/trade stats
          const payload = { 
            message, 
            conversationId: conversation.id
          };
          const cached = await responseCacheService.get(userId, endpoint, payload);
          
          if (cached) {
            assistantResponse = cached.response || cached.content || cached;
            actualInputTokens = cached.inputTokens || 0;
            actualOutputTokens = cached.outputTokens || 0;
            cacheHit = true;
          }
        } catch (error) {
          console.error('Cache check failed:', error);
          // Continue to API call
        }
      }
      
      // Make OpenAI API call if no cache hit
      if (!cacheHit) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: finalMessages as any,
          max_completion_tokens: 1024
        });

        assistantResponse = response.choices[0].message.content || "I'm sorry, I couldn't process that request.";
        actualInputTokens = response.usage?.prompt_tokens || inputTokens;
        actualOutputTokens = response.usage?.completion_tokens || estimateMessagesTokens([{ role: "assistant", content: assistantResponse }]);
        
        // Store in cache (non-blocking, static queries only)
        if (!isDynamicQuery) {
          try {
            const { responseCacheService } = await import('./response-cache');
            const endpoint = `/api/conversations/${conversation.id}/message`;
            const payload = { 
              message, 
              conversationId: conversation.id
            };
            const responseData = { 
              response: assistantResponse, 
              inputTokens: actualInputTokens, 
              outputTokens: actualOutputTokens 
            };
            // Use shorter TTL (5 minutes) for chat responses
            await responseCacheService.set(userId, endpoint, payload, responseData, { 
              ttlSeconds: 300,
              logToTransparency: true  // Enable transparency logging for cache operations
            });
          } catch (error) {
            console.error('Cache store failed:', error);
          }
        }
      }
      
      // Calculate total tokens and cost
      const totalTokens = actualInputTokens + actualOutputTokens;
      const estimatedCost = calculateCost(actualInputTokens, actualOutputTokens, 'gpt-4o');
      
      // Log token usage and cost
      await storage.createChatLog({
        userId,
        conversationId: conversation.id,
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        totalTokens,
        estimatedCost: estimatedCost.toString(),
        model: 'gpt-4o'
      });

      // Check if response includes a settings change suggestion
      const settingsProposal = this.detectSettingsProposal(assistantResponse, settings || null);

      // Update conversation
      const updatedMessages = [
        ...conversationMessages,
        { role: "user", content: message, timestamp: new Date() },
        { role: "assistant", content: assistantResponse, timestamp: new Date() }
      ];

      const updatedContext = {
        ...(conversation.context as any || {}),
        lastInteraction: new Date(),
        pendingProposal: settingsProposal,
        ...(context || {})
      };

      await storage.updateAIConversationById(conversation.id, {
        messages: updatedMessages,
        context: updatedContext
      });

      // Auto-trigger summarization (Milestone 14)
      // Compress conversation history when >20 messages
      if (updatedMessages.length > 20) {
        try {
          const { conversationSummarizationService } = await import('./conversation-summarization');
          await conversationSummarizationService.checkAndSummarize(conversation.id);
        } catch (error) {
          console.error('Error auto-triggering summarization:', error);
          // Non-blocking: Continue even if summarization fails
        }
      }

      // Create audit log for analysis request
      await storage.createAuditLog({
        userId,
        actionType: 'analysis_request',
        gptResponse: assistantResponse,
        status: 'completed'
      });

      return {
        response: assistantResponse,
        updatedContext,
        settingsProposal,
        tokenUsage: {
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          totalTokens,
          estimatedCost
        }
      };
    } catch (error) {
      console.error('Error in AI chat:', error);
      
      // Log error for diagnosis
      await storage.createErrorLog({
        userId,
        errorType: 'ai_chat_error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        context: { message }
      });
      
      return {
        response: "I'm experiencing some difficulties right now. Please try again later.",
        updatedContext: context || {}
      };
    }
  }

  /**
   * Phase 41F-L.E2E-PURGE: DEPRECATED - User-level settings being eliminated
   * TODO: Refactor to update guardrails_v2 (mode-level) instead of trading_settings (user-level)
   * AI-driven settings changes need to target mode-level guardrails:
   * - portfolioRiskPerTradePct (risk %)
   * - maxOpenPositions (trade limits)
   * - dailyLossKillSwitchPct (kill switch threshold)
   * - symbolCooldownMinutes (cooldown period)
   */
  async applySettingsChange(
    userId: string,
    settingName: string,
    newValue: any,
    confirmation: boolean
  ): Promise<{ success: boolean; message: string; auditLogId?: string }> {
    console.warn('[DEPRECATED] applySettingsChange() - User-level settings updates disabled during migration to mode-level configuration');
    
    return {
      success: false,
      message: "Settings updates temporarily disabled during system migration. Please use the Guardrails tab to adjust risk parameters."
    };
    
    /* ORIGINAL CODE - COMMENTED OUT DURING PURGE
    if (!confirmation) {
      return {
        success: false,
        message: "Settings change cancelled by user"
      };
    }

    try {
// Phase 41F-L.E2E-PURGE: DISABLED -       const currentSettings = await storage.getTradingSettings(userId);
      if (!currentSettings) {
        return { success: false, message: "User settings not found" };
      }

      const oldValue = (currentSettings as any)[settingName];
      
      // Apply the change
      const updates: any = {};
      updates[settingName] = newValue;
      await storage.updateTradingSettings(userId, updates);

      // Create audit log
      const auditLog = await storage.createAuditLog({
        userId,
        actionType: 'update_setting',
        settingName,
        oldValue: { [settingName]: oldValue },
        newValue: { [settingName]: newValue },
        confirmationMethod: 'user_confirmed_chat',
        gptResponse: `Updated ${settingName} from ${oldValue} to ${newValue}`,
        status: 'completed'
      });

      return {
        success: true,
        message: `Successfully updated ${settingName} to ${newValue}`,
        auditLogId: auditLog.id
      };
    } catch (error) {
      console.error('Error applying settings change:', error);
      
      await storage.createErrorLog({
        userId,
        errorType: 'settings_update_error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        context: { settingName, newValue }
      });
      
      return {
        success: false,
        message: "Failed to apply settings change"
      };
    }
    */
  }

  async diagnoseError(errorId: string, userId: string): Promise<{
    diagnosis: string;
    suggestedFixes: string[];
    relatedIssues: string[];
  }> {
    try {
      const error = await databaseQueryService.getErrorLogById(errorId, userId);
      if (!error) {
        return {
          diagnosis: "Error not found",
          suggestedFixes: [],
          relatedIssues: []
        };
      }

      const prompt = `
        Diagnose this trading system error and provide actionable solutions:
        
        Error Type: ${error.errorType}
        Error Message: ${error.errorMessage}
        Context: ${JSON.stringify(error.context, null, 2)}
        Stack Trace: ${error.errorStack || 'Not available'}
        
        Provide:
        1. A clear diagnosis of what went wrong
        2. Specific suggested fixes (actionable steps)
        3. Related issues to watch for
        
        Respond in JSON format: {
          "diagnosis": "string",
          "suggestedFixes": ["fix1", "fix2"],
          "relatedIssues": ["issue1", "issue2"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Create audit log for diagnosis
      await storage.createAuditLog({
        userId,
        actionType: 'error_diagnosis',
        gptResponse: JSON.stringify(result),
        status: 'completed'
      });

      return result;
    } catch (error) {
      console.error('Error diagnosing issue:', error);
      return {
        diagnosis: "Unable to diagnose error",
        suggestedFixes: ["Check system logs", "Contact support"],
        relatedIssues: []
      };
    }
  }

  private detectSettingsProposal(response: string, settings: TradingSettings | null): SettingsChangeProposal | undefined {
    // Simple heuristic to detect if AI is suggesting a settings change
    // In production, could use structured output or function calling
    const proposalKeywords = ['suggest', 'recommend', 'change', 'update', 'adjust', 'modify'];
    const settingKeywords = ['risk', 'exposure', 'trades', 'slippage'];
    
    const hasProposal = proposalKeywords.some(kw => response.toLowerCase().includes(kw));
    const hasSetting = settingKeywords.some(kw => response.toLowerCase().includes(kw));
    
    if (hasProposal && hasSetting && settings) {
      // This is a simplified detection - in production, use GPT function calling
      return {
        settingName: 'detected_in_conversation',
        currentValue: 'see_current_settings',
        proposedValue: 'see_ai_response',
        reason: 'AI suggested an optimization',
        requiresConfirmation: true
      };
    }
    
    return undefined;
  }

  private calculateMetrics(trades: Trade[], activeTrades: Trade[]): any {
    const closedTrades = trades.filter(t => t.status === 'closed');
    const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
    const losses = closedTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);

    const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
    const totalRisk = closedTrades.reduce((sum, t) => sum + parseFloat(t.riskAmount), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    const profitFactor = losses.length > 0 ? 
      Math.abs(wins.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0)) /
      Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0)) : 0;

    return {
      totalTrades: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 100) / 100,
      totalPL: Math.round(totalPL * 100) / 100,
      averageR: totalRisk > 0 ? Math.round((totalPL / totalRisk) * 100) / 100 : 0,
      profitFactor: Math.round(profitFactor * 100) / 100,
      activeTrades: activeTrades.length,
      strategies: this.analyzeStrategies(closedTrades)
    };
  }

  private calculateWeeklyMetrics(trades: Trade[]): any {
    const metrics = this.calculateMetrics(trades, []);
    return {
      ...metrics,
      tradingDays: this.countTradingDays(trades),
      bestDay: this.getBestTradingDay(trades),
      worstDay: this.getWorstTradingDay(trades)
    };
  }

  private calculateMonthlyMetrics(trades: Trade[]): any {
    const weeklyMetrics = this.calculateWeeklyMetrics(trades);
    return {
      ...weeklyMetrics,
      monthlyGrowth: this.calculateMonthlyGrowth(trades),
      maxDrawdown: this.calculateMaxDrawdown(trades),
      sharpeRatio: this.calculateSharpeRatio(trades)
    };
  }

  private async generateAnalysis(metrics: any, trades: Trade[], settings: TradingSettings | null): Promise<{
    content: string;
    insights: any;
    recommendations: any;
  }> {
    const prompt = `
      Generate a daily trading report analysis based on these metrics:
      
      Trading Performance:
      - Total trades: ${metrics.totalTrades}
      - Win rate: ${metrics.winRate}%
      - Total P/L: $${metrics.totalPL}
      - Average R: ${metrics.averageR}
      - Profit factor: ${metrics.profitFactor}
      - Active trades: ${metrics.activeTrades}
      
      Strategy Performance:
      ${Object.entries(metrics.strategies || {}).map(([strategy, data]: [string, any]) => 
        `- ${strategy}: ${data.trades} trades, ${data.winRate}% win rate, $${data.totalPL} P/L`
      ).join('\n')}
      
      User Settings:
      - Risk per trade: $${settings?.riskPerTrade || '100'}
      - Max exposure: ${settings?.maxExposurePercent || '20'}%
      - Max open trades: ${settings?.maxOpenTrades || '3'}
      
      Generate a comprehensive analysis including:
      1. Performance summary
      2. Key insights and patterns
      3. Specific actionable recommendations
      4. Risk management observations
      
      Respond in JSON format: {
        "content": "markdown formatted report",
        "insights": ["insight1", "insight2", ...],
        "recommendations": ["rec1", "rec2", ...]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  }

  private async generateWeeklyAnalysis(metrics: any, trades: Trade[]): Promise<any> {
    // Similar to daily but with weekly perspective
    const prompt = `Generate a weekly trading analysis with focus on patterns and trends over the week...`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3072
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  }

  private async generateMonthlyAnalysis(metrics: any, trades: Trade[]): Promise<any> {
    // Monthly analysis with longer-term perspective
    const prompt = `Generate a comprehensive monthly trading analysis focusing on overall progress and strategic adjustments...`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  }

  private analyzeStrategies(trades: Trade[]): any {
    const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'];
    const analysis: any = {};

    for (const strategy of strategies) {
      const strategyTrades = trades.filter(t => t.strategy === strategy);
      const wins = strategyTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const totalPL = strategyTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);

      analysis[strategy] = {
        trades: strategyTrades.length,
        winRate: strategyTrades.length > 0 ? (wins.length / strategyTrades.length) * 100 : 0,
        totalPL: Math.round(totalPL * 100) / 100
      };
    }

    return analysis;
  }

  private calculateSuccessRate(trades: Trade[]): number {
    const closedTrades = trades.filter(t => t.status === 'closed');
    const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
    return closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
  }

  private calculateAverageHoldTime(trades: Trade[]): number {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.exitTime);
    if (closedTrades.length === 0) return 0;

    const totalHours = closedTrades.reduce((sum, trade) => {
      const entryTime = trade.entryTime ? new Date(trade.entryTime) : new Date();
      const exitTime = trade.exitTime ? new Date(trade.exitTime) : new Date();
      const hours = (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);

    return Math.round(totalHours / closedTrades.length);
  }

  private countTradingDays(trades: Trade[]): number {
    const days = new Set();
    trades.forEach(trade => {
      if (trade.entryTime) {
        days.add(trade.entryTime.toISOString().split('T')[0]);
      }
    });
    return days.size;
  }

  private getBestTradingDay(trades: Trade[]): { date: string; pl: number } {
    const dayPL: Record<string, number> = {};
    
    trades.forEach(trade => {
      if (trade.exitTime) {
        const date = trade.exitTime.toISOString().split('T')[0];
        dayPL[date] = (dayPL[date] || 0) + parseFloat(trade.realizedPL || '0');
      }
    });

    let bestDay = { date: '', pl: 0 };
    Object.entries(dayPL).forEach(([date, pl]) => {
      if (pl > bestDay.pl) {
        bestDay = { date, pl };
      }
    });

    return bestDay;
  }

  private getWorstTradingDay(trades: Trade[]): { date: string; pl: number } {
    const dayPL: Record<string, number> = {};
    
    trades.forEach(trade => {
      if (trade.exitTime) {
        const date = trade.exitTime.toISOString().split('T')[0];
        dayPL[date] = (dayPL[date] || 0) + parseFloat(trade.realizedPL || '0');
      }
    });

    let worstDay = { date: '', pl: 0 };
    Object.entries(dayPL).forEach(([date, pl]) => {
      if (pl < worstDay.pl) {
        worstDay = { date, pl };
      }
    });

    return worstDay;
  }

  private async calculateMonthlyGrowth(trades: Trade[], userId: string, mode: 'live' | 'paper' = 'paper'): Promise<number> {
    // [9.6.3] Get portfolio value from guardrail-settings (mode-level)
    const totalPL = trades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
    const { getPortfolioBalanceV2 } = await import('./guardrail-settings.js');
    const startingBalance = await getPortfolioBalanceV2(mode) || 50000;
    return Math.round((totalPL / startingBalance) * 100 * 100) / 100;
  }

  private calculateMaxDrawdown(trades: Trade[]): number {
    let runningBalance = 0;
    let peak = 0;
    let maxDrawdown = 0;

    trades.forEach(trade => {
      runningBalance += parseFloat(trade.realizedPL || '0');
      if (runningBalance > peak) {
        peak = runningBalance;
      }
      const drawdown = (peak - runningBalance) / peak * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    return Math.round(maxDrawdown * 100) / 100;
  }

  private calculateSharpeRatio(trades: Trade[]): number {
    // Simplified Sharpe ratio calculation
    const returns = trades.map(t => parseFloat(t.realizedPL || '0'));
    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    return stdDev !== 0 ? Math.round((avgReturn / stdDev) * 100) / 100 : 0;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}

export const aiAnalyst = new AIAnalyst();
