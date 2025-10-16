/**
 * Phase 8.6.1 - Event Broker Service
 * 
 * Central hub for routing all execution events through the Cognitive Interpreter
 * before presenting them to Walter or users. Ensures 100% conversational output.
 * 
 * Architecture:
 * - Execution Core (TradingEngine, RiskManager, etc.) → Event Broker
 * - Event Broker → Cognitive Interpreter → Natural Language Narrative
 * - Narrative → Walter/User/UI via WebSocket/Memory
 */

import { EventEmitter } from 'events';
import { cognitiveInterpreter, type ExecutionEvent, type InterpretedResponse } from './cognitive-interpreter';
import { createMemory } from './walter-memory';
import { storage } from '../storage';

export interface BrokerEventPayload {
  userId: string;
  mode: 'live' | 'paper';
  eventType: ExecutionEvent['type'];
  data: any;
  metadata?: {
    portfolioBalance?: number;
    activeStrategies?: string[];
    traceId?: string; // Phase 8.6.4: Provenance tracking
    [key: string]: any;
  };
}

class EventBroker extends EventEmitter {
  private readonly MODULE_NAME = 'EventBroker';
  
  /**
   * Route execution event through cognitive interpreter
   * Returns interpreted natural language narrative
   */
  async routeEvent(payload: BrokerEventPayload): Promise<InterpretedResponse> {
    console.log(`[${this.MODULE_NAME}] 📬 Routing ${payload.eventType} event for ${payload.mode} mode`);
    
    // Create execution event for interpreter
    const event: ExecutionEvent = {
      type: payload.eventType,
      mode: payload.mode,
      data: {
        ...payload.data,
        ...payload.metadata
      },
      timestamp: new Date(),
      userId: payload.userId,
      traceId: payload.metadata?.traceId // Phase 8.6.4: Pass traceId for provenance
    };
    
    // Route through cognitive interpreter
    const interpretation = await cognitiveInterpreter.interpretEvent(event);
    
    console.log(
      `[${this.MODULE_NAME}] ✅ Interpreted ${payload.eventType} (${interpretation.significance}) → ` +
      `"${interpretation.narrative.substring(0, 60)}..."`
    );
    
    // Store in Walter's memory for context
    await this.storeInWalterMemory(payload.userId, interpretation);
    
    // Emit interpreted event for WebSocket broadcasting
    this.emit('interpretedEvent', {
      userId: payload.userId,
      mode: payload.mode,
      interpretation,
      timestamp: new Date().toISOString()
    });
    
    return interpretation;
  }
  
  /**
   * Helper: Trade execution event
   */
  async emitTradeEvent(
    userId: string,
    mode: 'live' | 'paper',
    tradeData: {
      symbol: string;
      side: 'buy' | 'sell';
      amount: number;
      price: number;
      strategy: string;
      quantity?: number;
      stopPrice?: number;
      targetPrice?: number;
      pnl?: number;
      tradeType?: 'entry' | 'exit' | 'stop_hit' | 'target_hit';
    },
    metadata?: BrokerEventPayload['metadata']
  ): Promise<InterpretedResponse> {
    return this.routeEvent({
      userId,
      mode,
      eventType: 'trade',
      data: tradeData,
      metadata
    });
  }
  
  /**
   * Helper: Balance update event
   */
  async emitBalanceUpdate(
    userId: string,
    mode: 'live' | 'paper',
    balanceData: {
      newBalance: number;
      oldBalance: number;
      changeAmount: number;
      changePercent: number;
      reason: string;
    },
    metadata?: BrokerEventPayload['metadata']
  ): Promise<InterpretedResponse> {
    return this.routeEvent({
      userId,
      mode,
      eventType: 'balance_update',
      data: balanceData,
      metadata
    });
  }
  
  /**
   * Helper: Risk report event
   */
  async emitRiskReport(
    userId: string,
    mode: 'live' | 'paper',
    riskData: {
      riskLevel: 'low' | 'medium' | 'high';
      exposurePercent: number;
      activeTrades: number;
      dailyPL: number;
      recommendation: string;
    },
    metadata?: BrokerEventPayload['metadata']
  ): Promise<InterpretedResponse> {
    return this.routeEvent({
      userId,
      mode,
      eventType: 'risk_report',
      data: riskData,
      metadata
    });
  }
  
  /**
   * Helper: Engine event (started/stopped/error)
   */
  async emitEngineEvent(
    userId: string,
    mode: 'live' | 'paper',
    engineData: {
      eventType: 'started' | 'stopped' | 'error';
      reason?: string;
      errorMessage?: string;
    },
    metadata?: BrokerEventPayload['metadata']
  ): Promise<InterpretedResponse> {
    return this.routeEvent({
      userId,
      mode,
      eventType: 'engine_event',
      data: engineData,
      metadata
    });
  }
  
  /**
   * Helper: Strategy signal event
   */
  async emitStrategySignal(
    userId: string,
    mode: 'live' | 'paper',
    signalData: {
      strategy: string;
      signal: 'buy' | 'sell' | 'hold';
      symbol: string;
      confidence: number;
      reason: string;
    },
    metadata?: BrokerEventPayload['metadata']
  ): Promise<InterpretedResponse> {
    return this.routeEvent({
      userId,
      mode,
      eventType: 'strategy_signal',
      data: signalData,
      metadata
    });
  }
  
  /**
   * Helper: Anomaly detection event
   */
  async emitAnomaly(
    userId: string,
    mode: 'live' | 'paper',
    anomalyData: {
      anomalyType: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      affectedComponent: string;
    },
    metadata?: BrokerEventPayload['metadata']
  ): Promise<InterpretedResponse> {
    return this.routeEvent({
      userId,
      mode,
      eventType: 'anomaly',
      data: anomalyData,
      metadata
    });
  }
  
  /**
   * Store interpreted narrative in Walter's memory
   */
  private async storeInWalterMemory(
    userId: string,
    interpretation: InterpretedResponse
  ): Promise<void> {
    try {
      // Determine memory importance based on event significance
      // Map to createMemory's 1-5 scale
      const importanceMap = {
        minor: 2,
        significant: 4,
        critical: 5
      };
      
      const importance = importanceMap[interpretation.significance];
      
      // Determine memory type based on event
      const memoryType = interpretation.provenance.originalData.tradeType ? 'result' : 'observation';
      
      // Create formatted memory content
      let memoryContent = interpretation.narrative;
      
      if (interpretation.reasoning) {
        memoryContent += `\n\nReasoning: ${interpretation.reasoning}`;
      }
      
      if (interpretation.implications && interpretation.implications.length > 0) {
        memoryContent += `\n\nImplications: ${interpretation.implications.join(', ')}`;
      }
      
      if (interpretation.actionableSuggestion) {
        memoryContent += `\n\nSuggestion: ${interpretation.actionableSuggestion}`;
      }
      
      // Store in Walter's memory with proper arguments
      await createMemory(
        userId,
        memoryType,
        memoryContent,
        importance,
        {
          source: interpretation.provenance.source,
          significance: interpretation.significance,
          strategy: interpretation.provenance.originalData.strategy,
          symbol: interpretation.provenance.originalData.symbol,
          timestamp: interpretation.provenance.timestamp.toISOString()
        }
      );
      
      console.log(`[${this.MODULE_NAME}] 💾 Stored interpretation in Walter memory (importance: ${importance})`);
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Failed to store in Walter memory:`, error);
    }
  }
  
  /**
   * Format interpreted response for user display
   */
  formatForUser(interpretation: InterpretedResponse): string {
    return cognitiveInterpreter.formatForUser(interpretation);
  }
  
  /**
   * Get event statistics
   */
  getStats(): {
    totalEventsRouted: number;
    eventsByType: Record<string, number>;
    eventsBySignificance: Record<string, number>;
  } {
    // This would be tracked in a real implementation
    return {
      totalEventsRouted: 0,
      eventsByType: {},
      eventsBySignificance: {}
    };
  }
}

export const eventBroker = new EventBroker();
