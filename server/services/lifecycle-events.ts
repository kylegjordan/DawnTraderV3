/**
 * REB 2.12D Part A: Phase 8.8.1 Lifecycle Events Service
 * 
 * Implements the missing lifecycle events for the trading pipeline:
 * - signalValidated: Emitted when a signal passes all validation checks
 * - readyToTrade: Emitted when signal is approved and ready for execution
 * - paperTradeExecuted: Emitted when a paper trade is successfully executed
 * 
 * These events support:
 * 1. Audit trail and debugging
 * 2. Real-time UI updates
 * 3. Analytics and telemetry
 */

import { contextBridge } from './context-bridge.js';
import { telemetryService } from './telemetry-service.js';

export interface SignalValidatedEvent {
  mode: 'paper' | 'live';
  symbol: string;
  strategy: string;
  confidence: number;
  validationResult: 'passed' | 'failed';
  validationDetails: {
    riskCheck: boolean;
    guardrailCheck: boolean;
    liquidityCheck: boolean;
    timeframeConfirmation: boolean;
  };
  timestamp: string;
}

export interface ReadyToTradeEvent {
  mode: 'paper' | 'live';
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  quantity: number;
  riskAmount: number;
  timestamp: string;
}

export interface PaperTradeExecutedEvent {
  mode: 'paper';
  tradeId: string;
  positionId: string;
  symbol: string;
  strategy: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  quantity: number;
  stopPrice: number;
  targetPrice: number;
  slippage: number;
  fees: number;
  timestamp: string;
}

export interface LifecycleEventPayload {
  type: 'signal_validated' | 'ready_to_trade' | 'active_trade_executed';
  payload: SignalValidatedEvent | ReadyToTradeEvent | PaperTradeExecutedEvent;
}

class LifecycleEventsService {
  private eventCounts = {
    signalValidated: 0,
    readyToTrade: 0,
    paperTradeExecuted: 0,
  };

  /**
   * Emit signalValidated event when a signal passes validation checks
   * [REB2.12D][LIFECYCLE] signalValidated
   */
  emitSignalValidated(event: Omit<SignalValidatedEvent, 'timestamp'>): void {
    const fullEvent: SignalValidatedEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.eventCounts.signalValidated++;

    console.log(`[REB2.12D][LIFECYCLE] signalValidated: ${event.symbol} ${event.strategy} - ${event.validationResult}`);

    contextBridge.broadcast({
      type: 'trade_event',
      payload: {
        eventType: 'signal_validated',
        ...fullEvent,
      },
    });

    telemetryService.recordTradeMetric('signal_emit', {
      symbol: event.symbol,
      strategy: event.strategy,
    }).catch(err => console.error('[LifecycleEvents] Telemetry error:', err));
  }

  /**
   * Emit readyToTrade event when signal is approved for execution
   * [REB2.12D][LIFECYCLE] readyToTrade
   */
  emitReadyToTrade(event: Omit<ReadyToTradeEvent, 'timestamp'>): void {
    const fullEvent: ReadyToTradeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.eventCounts.readyToTrade++;

    console.log(`[REB2.12D][LIFECYCLE] readyToTrade: ${event.symbol} ${event.strategy} @ $${event.entryPrice.toFixed(2)} qty=${event.quantity.toFixed(4)}`);

    contextBridge.broadcast({
      type: 'trade_event',
      payload: {
        eventType: 'ready_to_trade',
        ...fullEvent,
      },
    });

    telemetryService.recordTradeMetric('signal_emit', {
      symbol: event.symbol,
      strategy: event.strategy,
    }).catch(err => console.error('[LifecycleEvents] Telemetry error:', err));
  }

  /**
   * Emit paperTradeExecuted event when paper trade completes
   * [REB2.12D][LIFECYCLE] paperTradeExecuted
   */
  emitPaperTradeExecuted(event: Omit<PaperTradeExecutedEvent, 'timestamp'>): void {
    const fullEvent: PaperTradeExecutedEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.eventCounts.paperTradeExecuted++;

    console.log(`[REB2.12D][LIFECYCLE] paperTradeExecuted: ${event.tradeId} ${event.symbol} ${event.side} @ $${event.entryPrice.toFixed(2)}`);

    contextBridge.broadcast({
      type: 'trade_event',
      payload: {
        eventType: 'active_trade_executed',
        ...fullEvent,
      },
    });

    telemetryService.recordTradeMetric('signal_emit', {
      symbol: event.symbol,
      strategy: event.strategy,
    }).catch(err => console.error('[LifecycleEvents] Telemetry error:', err));
  }

  /**
   * Get event counts for diagnostics
   */
  getEventCounts(): typeof this.eventCounts {
    return { ...this.eventCounts };
  }

  /**
   * Reset event counts (for testing)
   */
  resetCounts(): void {
    this.eventCounts = {
      signalValidated: 0,
      readyToTrade: 0,
      paperTradeExecuted: 0,
    };
  }
}

export const lifecycleEventsService = new LifecycleEventsService();
