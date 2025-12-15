import { EventEmitter } from 'events';

/**
 * Global Event Bus for inter-service communication
 * 
 * Used for event-driven architecture across services:
 * - Introspection events (bias detection, confidence drift)
 * - Mitigation events (bias corrections applied)
 * - System events (health checks, status changes)
 * - TCL events (Phase 8.8.4-C.12: event-driven TCL activation)
 */

export type TradingMode = 'paper' | 'live';

export interface TCLActivatedEvent {
  mode: TradingMode;
  reason: '5min' | '100signals';
  timestamp: string;
  poolSize: number;
}

export interface TradeClosedEvent {
  mode: TradingMode;
  symbol: string;
  strategy: string;
  tradeId: string;
  pnl: number;
  timestamp: string;
}

export interface PromotionEvent {
  mode: TradingMode;
  symbol: string;
  strategy: string;
  signalId: string;
  tradeId: string;
  cwqi: number;
  timestamp: string;
}

class EventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to prevent warnings for many subscribers
    this.setMaxListeners(50);
  }

  /**
   * Emit an introspection event (bias detected, drift observed, etc.)
   */
  emitIntrospectionEvent(event: {
    type: string;
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  }): void {
    this.emit('introspection_event', event);
  }

  /**
   * Emit a mitigation event (correction applied, weights adjusted, etc.)
   */
  emitMitigationEvent(event: {
    type: string;
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  }): void {
    this.emit('mitigation_event', event);
  }

  /**
   * Phase 8.8.4-C.12: Emit TCL_ACTIVATED event
   * Triggered when TCL transitions to ACTIVE state (after 5 min or 100 signals)
   */
  emitTCLActivated(event: TCLActivatedEvent): void {
    console.log(`[8.8.4-C.12][TCL_EVENT] type=TCL_ACTIVATED reason=${event.reason} mode=${event.mode} poolSize=${event.poolSize}`);
    this.emit('TCL_ACTIVATED', event);
  }

  /**
   * Phase 8.8.4-C.12: Emit TRADE_CLOSED event
   * Triggered when a trade is closed, signaling capacity freed up
   */
  emitTradeClosed(event: TradeClosedEvent): void {
    console.log(`[8.8.4-C.12][TRADE_CLOSED] symbol=${event.symbol} strategy=${event.strategy} PnL=${event.pnl.toFixed(2)} mode=${event.mode}`);
    this.emit('TRADE_CLOSED', event);
  }

  /**
   * Phase 8.8.4-C.12: Emit PROMOTION event
   * Triggered when a signal is promoted from RTB queue to active trade
   */
  emitPromotion(event: PromotionEvent): void {
    console.log(`[8.8.4-C.12][PROMOTION] symbol=${event.symbol} strategy=${event.strategy} cwqi=${event.cwqi.toFixed(4)} tradeId=${event.tradeId} mode=${event.mode}`);
    this.emit('PROMOTION', event);
  }

  /**
   * Phase 8.8.4-C.12: Subscribe to TCL_ACTIVATED events
   */
  onTCLActivated(handler: (event: TCLActivatedEvent) => void): void {
    this.on('TCL_ACTIVATED', handler);
  }

  /**
   * Phase 8.8.4-C.12: Subscribe to TRADE_CLOSED events
   */
  onTradeClosed(handler: (event: TradeClosedEvent) => void): void {
    this.on('TRADE_CLOSED', handler);
  }

  /**
   * Phase 8.8.4-C.12: Subscribe to PROMOTION events
   */
  onPromotion(handler: (event: PromotionEvent) => void): void {
    this.on('PROMOTION', handler);
  }

  /**
   * Phase 8.8.4-C.12: Remove TCL event listeners for a specific handler
   */
  offTCLActivated(handler: (event: TCLActivatedEvent) => void): void {
    this.off('TCL_ACTIVATED', handler);
  }

  offTradeClosed(handler: (event: TradeClosedEvent) => void): void {
    this.off('TRADE_CLOSED', handler);
  }

  offPromotion(handler: (event: PromotionEvent) => void): void {
    this.off('PROMOTION', handler);
  }
}

// Export singleton instance
export const eventBus = new EventBus();
