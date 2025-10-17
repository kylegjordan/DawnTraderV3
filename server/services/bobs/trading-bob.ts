/**
 * Phase 8.9.1: Trading Bob - Market, Portfolio & Risk Analysis
 * 
 * Provides trading-domain cognition for market analysis, risk coherence,
 * and actionable trading insights for the Autonomy Layer
 */

import { db } from '../../db';
import { marketDataService } from '../market-data';
import { portfolioAggregator } from '../portfolio-aggregator';
import { storage } from '../../storage';
import { autonomyAuditLog } from '@shared/schema';
import { nanoid } from 'nanoid';

export interface TradingContext {
  marketSentiment: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  portfolioHealth: {
    totalEquity: number;
    totalPL: number;
    sharpeRatio: number;
    volatility: number;
  };
  riskMetrics: {
    exposurePercent: number;
    openTrades: number;
    drawdown: number;
  };
  activeStrategies: number;
  topPerformingStrategy?: string;
}

export interface TradingAnalysis {
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  confidence: number;
  findings: string[];
  recommendations: string[];
  insights: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  metrics: Record<string, any>;
}

export interface RiskCoherence {
  aligned: boolean;
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
}

class TradingBob {
  /**
   * Get current trading context from market, portfolio, and risk data
   */
  async getContext(userId: string, mode: 'live' | 'paper'): Promise<TradingContext> {
    try {
      // Get market context
      const marketContext = await storage.getLatestMarketContext();
      const marketSentiment = (marketContext?.regime || 'unknown') as 'bullish' | 'bearish' | 'neutral' | 'unknown';

      // Get strategy settings to count active strategies
      const strategySettings = await storage.getStrategySettings(userId, mode);
      const activeStrategies = strategySettings.filter(s => s.enabled).length;

      // Get portfolio metrics
      const settings = await storage.getTradingSettings(userId);
      let portfolioHealth = {
        totalEquity: 0,
        totalPL: 0,
        sharpeRatio: 0,
        volatility: 0,
      };

      try {
        // Try to get aggregated portfolio data
        const allTrades = mode === 'live' 
          ? await storage.getTrades(userId, { limit: 1000 })
          : await storage.getAllPaperTrades(userId);
        
        const globalContextId = 'default';
        const portfolioState = await storage.getPortfolioState({ globalContextId, mode });
        const balance = portfolioState ? parseFloat(portfolioState.balance) : 0;
        
        const closedTrades = allTrades.filter((t: any) => t.status === 'closed');
        const totalPL = closedTrades.reduce((sum: number, t: any) => 
          sum + parseFloat(t.realizedPL || '0'), 0
        );

        portfolioHealth = {
          totalEquity: balance + totalPL,
          totalPL,
          sharpeRatio: 0, // Will be calculated by aggregator if needed
          volatility: 0,
        };
      } catch (error) {
        console.error('[TradingBob] Error fetching portfolio health:', error);
      }

      // Get risk metrics
      const openTrades = mode === 'live'
        ? await storage.getActiveTrades(userId)
        : await storage.getActivePaperTrades(userId);
      
      const maxExposure = parseFloat(settings?.maxExposurePercent || '25');
      const currentExposure = openTrades.length > 0 
        ? (openTrades.length * parseFloat(settings?.riskPerTrade || '150') / portfolioHealth.totalEquity) * 100
        : 0;

      const riskMetrics = {
        exposurePercent: currentExposure,
        openTrades: openTrades.length,
        drawdown: portfolioHealth.totalPL < 0 ? Math.abs(portfolioHealth.totalPL) : 0,
      };

      // Find top performing strategy
      let topPerformingStrategy: string | undefined;
      if (closedTrades.length > 0) {
        const strategyPL = new Map<string, number>();
        closedTrades.forEach((t: any) => {
          const strategy = t.strategy || 'unknown';
          const pl = parseFloat(t.realizedPL || '0');
          strategyPL.set(strategy, (strategyPL.get(strategy) || 0) + pl);
        });
        
        let maxPL = -Infinity;
        strategyPL.forEach((pl, strategy) => {
          if (pl > maxPL) {
            maxPL = pl;
            topPerformingStrategy = strategy;
          }
        });
      }

      return {
        marketSentiment,
        portfolioHealth,
        riskMetrics,
        activeStrategies,
        topPerformingStrategy,
      };
    } catch (error) {
      console.error('[TradingBob] Error getting context:', error);
      return {
        marketSentiment: 'unknown',
        portfolioHealth: {
          totalEquity: 0,
          totalPL: 0,
          sharpeRatio: 0,
          volatility: 0,
        },
        riskMetrics: {
          exposurePercent: 0,
          openTrades: 0,
          drawdown: 0,
        },
        activeStrategies: 0,
      };
    }
  }

  /**
   * Analyze market data and trends
   */
  async analyzeMarketData(userId: string, mode: 'live' | 'paper', query?: string): Promise<TradingAnalysis> {
    const context = await this.getContext(userId, mode);
    const findings: string[] = [];
    const recommendations: string[] = [];
    const insights: string[] = [];
    let sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' = context.marketSentiment === 'unknown' ? 'neutral' : context.marketSentiment;
    let confidence = 0.5;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';

    // Market sentiment analysis
    if (context.marketSentiment === 'bullish') {
      findings.push('Market regime identified as BULLISH - favorable for long positions');
      recommendations.push('Consider increasing allocation to momentum strategies');
      confidence = 0.75;
    } else if (context.marketSentiment === 'bearish') {
      findings.push('Market regime identified as BEARISH - caution advised');
      recommendations.push('Reduce position sizes and tighten stop-losses');
      confidence = 0.7;
      riskLevel = 'high';
    } else if (context.marketSentiment === 'neutral') {
      findings.push('Market regime NEUTRAL - mixed signals detected');
      recommendations.push('Focus on range-trading and mean-reversion strategies');
      confidence = 0.6;
    } else {
      findings.push('Market regime UNKNOWN - insufficient data for analysis');
      recommendations.push('Wait for clearer market signals before increasing exposure');
      confidence = 0.4;
      riskLevel = 'high';
    }

    // Portfolio performance analysis
    if (context.portfolioHealth.totalPL > 0) {
      insights.push(`Portfolio profitable: +$${context.portfolioHealth.totalPL.toFixed(2)}`);
      if (context.portfolioHealth.totalPL > 100) {
        findings.push('Strong portfolio performance - strategies are working well');
      }
    } else if (context.portfolioHealth.totalPL < -50) {
      insights.push(`Portfolio in drawdown: -$${Math.abs(context.portfolioHealth.totalPL).toFixed(2)}`);
      findings.push('Significant portfolio losses detected');
      recommendations.push('Review and potentially disable underperforming strategies');
      riskLevel = 'high';
    }

    // Strategy analysis
    if (context.activeStrategies === 0) {
      findings.push('No active strategies - system idle');
      recommendations.push('Enable at least 2-3 strategies for diversification');
      riskLevel = 'medium';
    } else if (context.activeStrategies < 3) {
      findings.push(`Limited diversification: only ${context.activeStrategies} active ${context.activeStrategies === 1 ? 'strategy' : 'strategies'}`);
      recommendations.push('Consider enabling additional strategies for better risk distribution');
    } else {
      insights.push(`Good diversification: ${context.activeStrategies} strategies active`);
    }

    // Top performer insight
    if (context.topPerformingStrategy) {
      insights.push(`Top performer: ${context.topPerformingStrategy}`);
    }

    // Risk metrics analysis
    if (context.riskMetrics.exposurePercent > 50) {
      findings.push(`High market exposure: ${context.riskMetrics.exposurePercent.toFixed(1)}%`);
      recommendations.push('Consider reducing position sizes to lower exposure');
      riskLevel = 'high';
    } else if (context.riskMetrics.exposurePercent > 25) {
      insights.push(`Moderate exposure: ${context.riskMetrics.exposurePercent.toFixed(1)}%`);
    }

    if (context.riskMetrics.openTrades > 5) {
      findings.push(`High concurrent trades: ${context.riskMetrics.openTrades} open positions`);
      recommendations.push('Monitor open trades closely, consider reducing new entries');
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    // Query-specific analysis
    if (query) {
      const lowerQuery = query.toLowerCase();
      if (lowerQuery.includes('risk') || lowerQuery.includes('exposure')) {
        insights.push(`Current risk exposure: ${context.riskMetrics.exposurePercent.toFixed(1)}%`);
        insights.push(`Open positions: ${context.riskMetrics.openTrades}`);
      }
      if (lowerQuery.includes('performance') || lowerQuery.includes('profit')) {
        insights.push(`Total P/L: ${context.portfolioHealth.totalPL >= 0 ? '+' : ''}$${context.portfolioHealth.totalPL.toFixed(2)}`);
      }
      if (lowerQuery.includes('strategy') || lowerQuery.includes('strategies')) {
        insights.push(`Active strategies: ${context.activeStrategies}`);
        if (context.topPerformingStrategy) {
          insights.push(`Best strategy: ${context.topPerformingStrategy}`);
        }
      }
    }

    // Default findings if none found
    if (findings.length === 0) {
      findings.push('Trading system operational - no critical issues detected');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring market conditions and portfolio performance');
    }

    return {
      sentiment,
      confidence,
      findings,
      recommendations,
      insights,
      riskLevel,
      metrics: {
        marketSentiment: context.marketSentiment,
        portfolioEquity: context.portfolioHealth.totalEquity,
        portfolioPL: context.portfolioHealth.totalPL,
        activeStrategies: context.activeStrategies,
        riskExposure: context.riskMetrics.exposurePercent,
        openTrades: context.riskMetrics.openTrades,
      },
    };
  }

  /**
   * Evaluate risk coherence between market perception and trading decisions
   */
  async evaluateRiskCoherence(userId: string, mode: 'live' | 'paper'): Promise<RiskCoherence> {
    const context = await this.getContext(userId, mode);
    const issues: string[] = [];
    const recommendations: string[] = [];
    let aligned = true;
    let score = 100;

    // Check 1: Market-Risk alignment
    if (context.marketSentiment === 'bearish' && context.riskMetrics.exposurePercent > 25) {
      aligned = false;
      score -= 30;
      issues.push('High exposure during bearish market - misalignment detected');
      recommendations.push('Reduce market exposure to 15-20% during bearish conditions');
    }

    // Check 2: Portfolio health vs risk taking
    if (context.portfolioHealth.totalPL < -50 && context.riskMetrics.openTrades > 3) {
      aligned = false;
      score -= 25;
      issues.push('Continuing aggressive trading despite portfolio drawdown');
      recommendations.push('Pause new trades and review strategy effectiveness');
    }

    // Check 3: Diversification coherence
    if (context.activeStrategies < 2 && context.riskMetrics.openTrades > 2) {
      aligned = false;
      score -= 20;
      issues.push('Insufficient strategy diversification for current trade volume');
      recommendations.push('Enable additional strategies or reduce trade frequency');
    }

    // Check 4: Unknown market conditions
    if (context.marketSentiment === 'unknown' && context.riskMetrics.openTrades > 0) {
      score -= 15;
      issues.push('Trading during uncertain market conditions');
      recommendations.push('Wait for clearer market signals before entering new positions');
    }

    // Check 5: Over-concentration
    if (context.riskMetrics.exposurePercent > 40) {
      aligned = false;
      score -= 30;
      issues.push('Excessive market exposure - risk concentration too high');
      recommendations.push('Immediately reduce position sizes to stay under 25% exposure');
    }

    // Positive findings
    if (issues.length === 0) {
      recommendations.push('Risk management aligned with market conditions - maintain current approach');
    }

    return {
      aligned,
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }

  /**
   * Generate actionable trading insights
   */
  async generateTradingInsights(userId: string, mode: 'live' | 'paper'): Promise<string[]> {
    const context = await this.getContext(userId, mode);
    const insights: string[] = [];

    // Market-based insights
    if (context.marketSentiment === 'bullish') {
      insights.push('📈 Bullish regime: Favor momentum and breakout strategies');
      insights.push('⚡ Consider trailing stops to capture extended moves');
    } else if (context.marketSentiment === 'bearish') {
      insights.push('📉 Bearish regime: Tighten risk controls and reduce position sizes');
      insights.push('🛡️ Focus on capital preservation over aggressive gains');
    } else if (context.marketSentiment === 'neutral') {
      insights.push('↔️ Neutral regime: Range-trading and mean-reversion preferred');
      insights.push('🎯 Target quick profits with tighter stop-losses');
    }

    // Portfolio insights
    if (context.portfolioHealth.totalEquity > 0) {
      const returnPercent = (context.portfolioHealth.totalPL / context.portfolioHealth.totalEquity) * 100;
      if (returnPercent > 10) {
        insights.push(`✨ Strong performance: ${returnPercent.toFixed(1)}% return`);
      } else if (returnPercent < -5) {
        insights.push(`⚠️ Drawdown alert: ${returnPercent.toFixed(1)}% below entry`);
      }
    }

    // Strategy insights
    if (context.topPerformingStrategy) {
      insights.push(`🏆 Top strategy: ${context.topPerformingStrategy} - consider higher allocation`);
    }

    if (context.activeStrategies >= 5) {
      insights.push(`✅ Well-diversified: ${context.activeStrategies} strategies active`);
    }

    // Risk insights
    if (context.riskMetrics.exposurePercent < 10) {
      insights.push('💤 Low exposure: Consider increasing position sizes if market conditions favor');
    } else if (context.riskMetrics.exposurePercent > 30) {
      insights.push(`⚠️ High exposure at ${context.riskMetrics.exposurePercent.toFixed(1)}% - monitor closely`);
    }

    return insights;
  }

  /**
   * Run full trading domain analysis
   */
  async runAnalysis(userId: string, mode: 'live' | 'paper', query?: string): Promise<TradingAnalysis> {
    console.log(`[TradingBob] Running analysis for user ${userId} (${mode})`);
    const analysis = await this.analyzeMarketData(userId, mode, query);
    
    // Log to autonomy audit for tracking
    try {
      await db.insert(autonomyAuditLog).values({
        runId: `tradingbob_${nanoid(10)}`,
        action: 'market_analysis',
        triggeredBy: 'domain_reasoning',
        domain: 'trading',
        findings: JSON.stringify({
          sentiment: analysis.sentiment,
          riskLevel: analysis.riskLevel,
          findings: analysis.findings,
          recommendations: analysis.recommendations,
        }),
      });
    } catch (error) {
      console.error('[TradingBob] Error logging to audit:', error);
    }

    return analysis;
  }

  /**
   * Return findings in natural language format
   */
  async returnFindings(analysis: TradingAnalysis): Promise<string> {
    const sentimentEmoji = {
      bullish: '📈',
      bearish: '📉',
      neutral: '↔️',
      mixed: '🔄',
    };

    const riskEmoji = {
      low: '✅',
      medium: '⚠️',
      high: '🚨',
      critical: '🔥',
    };

    let output = `${sentimentEmoji[analysis.sentiment]} **Market Sentiment: ${analysis.sentiment.toUpperCase()}** (${(analysis.confidence * 100).toFixed(0)}% confidence)\n`;
    output += `${riskEmoji[analysis.riskLevel]} **Risk Level: ${analysis.riskLevel.toUpperCase()}**\n\n`;
    
    if (analysis.findings.length > 0) {
      output += '**Findings:**\n';
      analysis.findings.forEach(finding => {
        output += `- ${finding}\n`;
      });
    }

    if (analysis.insights.length > 0) {
      output += '\n**Insights:**\n';
      analysis.insights.forEach(insight => {
        output += `- ${insight}\n`;
      });
    }

    if (analysis.recommendations.length > 0) {
      output += '\n**Recommendations:**\n';
      analysis.recommendations.forEach(rec => {
        output += `- ${rec}\n`;
      });
    }

    output += '\n**Metrics:**\n';
    output += `- Portfolio P/L: ${analysis.metrics.portfolioPL >= 0 ? '+' : ''}$${analysis.metrics.portfolioPL.toFixed(2)}\n`;
    output += `- Active Strategies: ${analysis.metrics.activeStrategies}\n`;
    output += `- Risk Exposure: ${analysis.metrics.riskExposure.toFixed(1)}%\n`;
    output += `- Open Trades: ${analysis.metrics.openTrades}\n`;

    return output;
  }
}

export const tradingBob = new TradingBob();
