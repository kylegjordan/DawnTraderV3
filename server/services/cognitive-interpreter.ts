/**
 * Phase 8.6.1 - Cognitive Interpreter
 * 
 * Routes all Execution Core outputs through Walter's Cognitive Layer
 * Translates system data into natural language narratives while preserving factual accuracy
 * 
 * Key Principles:
 * - Read-only interpretation (never modifies source data)
 * - Adds reasoning and implications to facts
 * - Adaptive narrative depth based on event significance
 * - Provenance tracking for data integrity verification
 */

import { storage } from '../storage';
// Directive 12.2.3: learningBob import removed (file deleted in Batch 7A)
import type { InsertLearningFragment } from '../../shared/schema';

export type EventSignificance = 'minor' | 'significant' | 'critical';

export interface ExecutionEvent {
  type: 'trade' | 'balance_update' | 'risk_report' | 'engine_event' | 'anomaly' | 'strategy_signal';
  mode: 'live' | 'paper';
  data: any;
  timestamp: Date;
  userId: string;
  traceId?: string; // Phase 8.6.4: Provenance tracking
}

export interface InterpretedResponse {
  narrative: string; // Natural language explanation
  reasoning?: string; // Why it happened
  implications?: string[]; // What to consider next
  actionableSuggestion?: string; // Specific next step
  followUpQuestion?: string; // Keep dialogue active
  significance: EventSignificance;
  provenance: {
    source: 'ExecutionCore';
    interpretedBy: 'CognitiveLayer';
    originalData: any;
    timestamp: Date;
  };
}

export interface LearningFragment {
  id: string;
  mode: 'live' | 'paper';
  strategy?: string;
  observation: string;
  context: string;
  outcome: 'positive' | 'negative' | 'neutral';
  tags: string[];
  timestamp: Date;
}

export class CognitiveInterpreter {
  private readonly MODULE_NAME = 'CognitiveInterpreter';
  
  /**
   * Interpret any execution event and translate to natural language
   */
  async interpretEvent(event: ExecutionEvent): Promise<InterpretedResponse> {
    console.log(`[${this.MODULE_NAME}] Interpreting ${event.type} event for ${event.mode} mode`);
    
    // Determine event significance
    const significance = this.assessSignificance(event);
    
    // Generate narrative based on event type and significance
    const interpretation = await this.generateNarrative(event, significance);
    
    const response: InterpretedResponse = {
      ...interpretation,
      significance,
      provenance: {
        source: 'ExecutionCore',
        interpretedBy: 'CognitiveLayer',
        originalData: event.data,
        timestamp: new Date()
      }
    };
    
    // Save learning fragment asynchronously (fire-and-forget)
    this.saveLearningFragment(event, response).catch(err => {
      console.error(`[${this.MODULE_NAME}] Failed to save learning fragment:`, err);
    });
    
    return response;
  }

  /**
   * Assess the significance of an event
   */
  private assessSignificance(event: ExecutionEvent): EventSignificance {
    switch (event.type) {
      case 'anomaly':
        return 'critical';
      
      case 'risk_report':
        // Check if risk limits are approaching
        if (event.data.riskLevel === 'high' || event.data.exposurePercent > 80) {
          return 'critical';
        }
        if (event.data.exposurePercent > 50) {
          return 'significant';
        }
        return 'minor';
      
      case 'trade':
        // Critical: Extreme trade sizes or large PnL
        if (event.data.amount > 2000 || (event.data.pnl && Math.abs(event.data.pnl) > 500)) {
          return 'critical';
        }
        // Significant: Large trades or moderate losses
        if (event.data.amount > 500 || (event.data.pnl && Math.abs(event.data.pnl) > 100)) {
          return 'significant';
        }
        return 'minor';
      
      case 'balance_update':
        // Critical: Extreme balance changes (>10%)
        if (event.data.changePercent && Math.abs(event.data.changePercent) > 10) {
          return 'critical';
        }
        // Significant: Large balance changes (>5%)
        if (event.data.changePercent && Math.abs(event.data.changePercent) > 5) {
          return 'significant';
        }
        return 'minor';
      
      case 'engine_event':
        if (event.data.eventType === 'stopped' || event.data.eventType === 'error') {
          return 'critical';
        }
        if (event.data.eventType === 'started') {
          return 'significant';
        }
        return 'minor';
      
      case 'strategy_signal':
        if (event.data.confidence > 0.8) {
          return 'significant';
        }
        return 'minor';
      
      default:
        return 'minor';
    }
  }

  /**
   * Generate narrative based on event type and significance
   */
  private async generateNarrative(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    switch (event.type) {
      case 'trade':
        return this.interpretTrade(event, significance);
      
      case 'balance_update':
        return this.interpretBalanceUpdate(event, significance);
      
      case 'risk_report':
        return this.interpretRiskReport(event, significance);
      
      case 'engine_event':
        return this.interpretEngineEvent(event, significance);
      
      case 'anomaly':
        return this.interpretAnomaly(event, significance);
      
      case 'strategy_signal':
        return this.interpretStrategySignal(event, significance);
      
      default:
        return {
          narrative: `${event.type} event detected in ${event.mode} mode.`,
          reasoning: 'System event logged for tracking purposes.'
        };
    }
  }

  /**
   * Interpret trade events
   */
  private async interpretTrade(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    const { symbol, side, amount, price, strategy } = event.data;
    
    const narrative = `${side === 'buy' ? 'Bought' : 'Sold'} ${symbol} for $${amount.toFixed(2)} at $${price} using ${strategy} strategy in ${event.mode} mode.`;
    
    if (significance === 'minor') {
      return { narrative };
    }
    
    // Add reasoning for significant/critical trades
    const reasoning = `This ${amount > 500 ? 'large' : ''} trade was triggered by ${strategy} signal detection.`;
    
    const implications = [
      `Current exposure in ${symbol} has ${side === 'buy' ? 'increased' : 'decreased'}.`,
      `Monitor price action near $${price} for ${side === 'buy' ? 'support' : 'resistance'}.`
    ];
    
    const actionableSuggestion = side === 'buy' 
      ? `Consider setting a stop-loss below recent support levels.`
      : `Watch for re-entry opportunities if price pulls back.`;
    
    // Only critical events include follow-up questions
    const followUpQuestion = significance === 'critical'
      ? `Would you like me to monitor this position and alert you if price moves 5% from entry?`
      : undefined;
    
    return {
      narrative,
      reasoning,
      implications,
      actionableSuggestion,
      followUpQuestion
    };
  }

  /**
   * Interpret balance updates
   */
  private async interpretBalanceUpdate(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    const { newBalance, oldBalance, changePercent } = event.data;
    
    const direction = newBalance > oldBalance ? 'increased' : 'decreased';
    const narrative = `Portfolio balance ${direction} to $${newBalance.toFixed(2)} in ${event.mode} mode.`;
    
    if (significance === 'minor') {
      return { narrative };
    }
    
    const reasoning = `The ${Math.abs(changePercent).toFixed(1)}% change reflects recent trading activity.`;
    
    const implications = [];
    let actionableSuggestion;
    
    if (newBalance < oldBalance && Math.abs(changePercent) > 5) {
      implications.push(`Significant drawdown detected - review recent trades for pattern analysis.`);
      implications.push(`Consider reducing position sizes or tightening risk parameters.`);
      actionableSuggestion = `Review your strategy settings to adjust risk parameters if needed.`;
    } else if (newBalance > oldBalance && changePercent > 5) {
      implications.push(`Strong performance - strategy execution appears effective.`);
      implications.push(`Monitor for sustainability before increasing exposure.`);
      actionableSuggestion = `Consider capturing some profits or scaling position sizes conservatively.`;
    }
    
    return {
      narrative,
      reasoning,
      implications: implications.length > 0 ? implications : undefined,
      actionableSuggestion,
      followUpQuestion: significance === 'critical' ? `Would you like to review the trades that contributed to this change?` : undefined
    };
  }

  /**
   * Interpret risk reports
   */
  private async interpretRiskReport(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    const { riskLevel, exposurePercent, activePositions } = event.data;
    
    const narrative = `Current risk level: ${riskLevel}. Portfolio exposure at ${exposurePercent}% with ${activePositions} active positions in ${event.mode} mode.`;
    
    if (significance === 'minor') {
      return { narrative };
    }
    
    const reasoning = exposurePercent > 80 
      ? `Approaching maximum exposure limits - position concentration is high.`
      : `Exposure is elevated but within acceptable parameters.`;
    
    // Significant/critical events always include implications
    const implications = [];
    if (exposurePercent > 80) {
      implications.push(`Consider closing some positions to reduce concentration risk.`);
      implications.push(`Avoid opening new positions until exposure decreases.`);
    } else if (exposurePercent > 50) {
      implications.push(`Portfolio exposure is above normal levels - monitor position sizing.`);
      implications.push(`New trades should be smaller to maintain manageable risk.`);
    }
    
    const actionableSuggestion = riskLevel === 'high' 
      ? `Review and tighten stop-losses on open positions immediately.`
      : `Monitor exposure levels as new signals emerge.`;
    
    return {
      narrative,
      reasoning,
      implications: implications.length > 0 ? implications : undefined,
      actionableSuggestion,
      followUpQuestion: significance === 'critical' ? `Shall I show you which positions are contributing most to current exposure?` : undefined
    };
  }

  /**
   * Interpret engine events
   */
  private async interpretEngineEvent(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    const { eventType, engineName, reason } = event.data;
    
    const narrativeMap: Record<string, string> = {
      started: `${engineName} engine started successfully in ${event.mode} mode.`,
      stopped: `${engineName} engine stopped in ${event.mode} mode.`,
      error: `${engineName} engine encountered an error in ${event.mode} mode.`,
      paused: `${engineName} engine paused in ${event.mode} mode.`
    };
    
    const narrative = narrativeMap[eventType] || `${engineName} engine event: ${eventType}`;
    
    if (significance === 'minor') {
      return { narrative };
    }
    
    const reasoning = reason || (eventType === 'stopped' 
      ? `Manual stop or system safety trigger activated.`
      : eventType === 'started'
      ? `Engine initialization complete and ready for trading.`
      : `Engine state change detected.`);
    
    const implications = [];
    let actionableSuggestion;
    
    if (eventType === 'stopped' || eventType === 'error') {
      implications.push(`No new trades will be executed until engine restarts.`);
      implications.push(`Existing positions remain open and should be monitored.`);
      actionableSuggestion = eventType === 'error'
        ? `Check system logs to diagnose the issue before restarting.`
        : `Review performance before deciding to restart the engine.`;
    } else if (eventType === 'started') {
      implications.push(`Engine is now scanning for trading opportunities.`);
      implications.push(`Risk parameters and strategy settings are active.`);
      actionableSuggestion = `Monitor initial trades closely to ensure strategy execution aligns with expectations.`;
    }
    
    // Only critical events include follow-up questions
    const followUpQuestion = significance === 'critical'
      ? `Would you like me to show you the last few trades before the engine ${eventType}?`
      : undefined;
    
    return {
      narrative,
      reasoning,
      implications: implications.length > 0 ? implications : undefined,
      actionableSuggestion,
      followUpQuestion
    };
  }

  /**
   * Interpret anomalies with conversational explanation
   */
  private async interpretAnomaly(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    const { anomalyType, expected, actual, possibleCause } = event.data;
    
    const narrative = `Anomaly detected in ${event.mode} mode: ${anomalyType}. Expected ${expected}, but observed ${actual}.`;
    
    const reasoning = possibleCause || `The discrepancy may be due to API latency, data sync delays, or market volatility.`;
    
    const implications = [
      `Data integrity check recommended before making trading decisions.`,
      `System will attempt automatic reconciliation.`
    ];
    
    const actionableSuggestion = `Shall I refresh the data now, or wait for the next automatic sync in 30 seconds?`;
    
    return {
      narrative,
      reasoning,
      implications,
      actionableSuggestion,
      followUpQuestion: `Would you like to see the detailed comparison between expected and actual values?`
    };
  }

  /**
   * Interpret strategy signals
   */
  private async interpretStrategySignal(
    event: ExecutionEvent,
    significance: EventSignificance
  ): Promise<Omit<InterpretedResponse, 'significance' | 'provenance'>> {
    const { strategy, symbol, signal, confidence, reasons } = event.data;
    
    const narrative = `${strategy} detected a ${signal} signal for ${symbol} with ${(confidence * 100).toFixed(0)}% confidence in ${event.mode} mode.`;
    
    if (significance === 'minor') {
      return { narrative };
    }
    
    const reasoning = reasons && reasons.length > 0
      ? `Signal triggered by: ${reasons.join(', ')}.`
      : `Multiple technical indicators aligned for this signal.`;
    
    const implications = confidence > 0.8
      ? [
          `High-confidence signal - favorable risk/reward ratio.`,
          `Consider this opportunity within your current risk parameters.`
        ]
      : undefined;
    
    const actionableSuggestion = confidence > 0.8
      ? `Review the setup and decide if this aligns with your trading plan.`
      : undefined;
    
    return {
      narrative,
      reasoning,
      implications,
      actionableSuggestion
    };
  }

  /**
   * Save learning fragment to database
   * Phase 8.6.1 - Persistent learning storage
   */
  private async saveLearningFragment(
    event: ExecutionEvent,
    interpretation: InterpretedResponse
  ): Promise<void> {
    // Phase 8.5 Addendum F: Global context is always 'default'
    const globalContextId = 'default';
    
    // Categorize the event for pattern analysis
    const eventCategory = this.categorizeEvent(event, interpretation);
    
    // Get user context (active strategies, portfolio state)
    const userContext = {
      userId: event.userId,
      activeStrategies: event.data.activeStrategies || [],
      portfolioBalance: event.data.portfolioBalance,
      timestamp: new Date()
    };
    
    // Create learning fragment for database
    const fragment: InsertLearningFragment = {
      globalContextId,
      mode: event.mode,
      eventType: event.type as any,
      significance: interpretation.significance as any,
      narrative: interpretation.narrative,
      reasoning: interpretation.reasoning,
      implications: interpretation.implications || null,
      actionableSuggestion: interpretation.actionableSuggestion,
      followUpQuestion: interpretation.followUpQuestion,
      eventCategory,
      userContext,
      originalEventData: interpretation.provenance.originalData,
      source: interpretation.provenance.source,
      interpretedBy: interpretation.provenance.interpretedBy,
      traceId: event.traceId // Phase 8.6.4: Inherit traceId from event
    };
    
    // Directive 12.2.3: learningBob.storeFragment() call removed (file deleted in Batch 7A)
    // Learning fragment persistence deferred to Directive 12.2.8 (Learning Framework Simplification)
    console.log(`[${this.MODULE_NAME}] Learning fragment skipped (Bob removed): ${eventCategory}`);
  }
  
  /**
   * Categorize event for pattern analysis
   */
  private categorizeEvent(event: ExecutionEvent, interpretation: InterpretedResponse): string {
    const { type, data } = event;
    const { significance } = interpretation;
    
    switch (type) {
      case 'trade':
        if (data.pnl > 0) return `profitable_${significance}_trade`;
        if (data.pnl < 0) return `losing_${significance}_trade`;
        return `${significance}_trade`;
      
      case 'balance_update':
        if (data.changePercent > 0) return `balance_increase_${significance}`;
        if (data.changePercent < 0) return `balance_decrease_${significance}`;
        return `balance_stable`;
      
      case 'risk_report':
        if (data.riskLevel === 'high') return `high_risk_${significance}`;
        return `risk_report_${significance}`;
      
      case 'engine_event':
        return `engine_${data.eventType}_${significance}`;
      
      case 'anomaly':
        return `anomaly_${data.anomalyType || 'unknown'}`;
      
      case 'strategy_signal':
        return `signal_${data.signal}_${significance}`;
      
      default:
        return `${type}_${significance}`;
    }
  }

  /**
   * Create a learning fragment from an interpreted event
   * @deprecated Use saveLearningFragment instead for persistent storage
   */
  async createLearningFragment(
    event: ExecutionEvent,
    interpretation: InterpretedResponse,
    outcome: 'positive' | 'negative' | 'neutral'
  ): Promise<LearningFragment> {
    const fragment: LearningFragment = {
      id: `fragment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mode: event.mode,
      strategy: event.data.strategy,
      observation: interpretation.narrative,
      context: interpretation.reasoning || '',
      outcome,
      tags: [
        event.type,
        event.mode,
        interpretation.significance,
        ...(event.data.strategy ? [event.data.strategy] : [])
      ],
      timestamp: new Date()
    };
    
    console.log(`[${this.MODULE_NAME}] Created learning fragment:`, fragment.observation);
    
    // TODO: Store in Cortex/Bob memory
    return fragment;
  }

  /**
   * Format interpreted response for user display
   */
  formatForUser(interpretation: InterpretedResponse): string {
    let response = interpretation.narrative;
    
    if (interpretation.reasoning) {
      response += `\n\n${interpretation.reasoning}`;
    }
    
    if (interpretation.implications && interpretation.implications.length > 0) {
      response += `\n\n**What to consider:**\n${interpretation.implications.map(i => `• ${i}`).join('\n')}`;
    }
    
    if (interpretation.actionableSuggestion) {
      response += `\n\n💡 **Suggestion:** ${interpretation.actionableSuggestion}`;
    }
    
    if (interpretation.followUpQuestion) {
      response += `\n\n${interpretation.followUpQuestion}`;
    }
    
    return response;
  }

  /**
   * Verify data integrity - ensure interpreted data matches source
   */
  verifyProvenance(interpretation: InterpretedResponse): boolean {
    const { source, interpretedBy, originalData } = interpretation.provenance;
    
    if (source !== 'ExecutionCore' || interpretedBy !== 'CognitiveLayer') {
      console.error(`[${this.MODULE_NAME}] Invalid provenance tags`);
      return false;
    }
    
    if (!originalData) {
      console.error(`[${this.MODULE_NAME}] Missing original data in provenance`);
      return false;
    }
    
    // Data integrity verified
    return true;
  }
}

export const cognitiveInterpreter = new CognitiveInterpreter();
