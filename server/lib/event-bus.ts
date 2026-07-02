import { EventEmitter } from 'events';

/**
 * Global Event Bus for inter-service communication
 * Directive 8.8.4-A3.R7: Enhanced event handling with queue reliability
 * 
 * Used for event-driven architecture across services:
 * - Introspection events (bias detection, confidence drift)
 * - Mitigation events (bias corrections applied)
 * - System events (health checks, status changes)
 * - TCL events (Phase 8.8.4-C.12: event-driven TCL activation)
 * - Directive A3.R7 events: SlotOpened, RTBThresholdMet, FailsafeTrigger
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
  /**
   * B79.0n.EXECUTION (2026-05-27, CHUNK A): asset class of the closed trade.
   * Optional in v1 per Langston Step 2 ACK + same C-7 doctrine as
   * PromotionEvent above — additive field is safe for all 3 current listeners
   * (active-execution-engine self-handler L184-188 mode-filter only,
   * c13-validation-service L103-107 collection only, c14-validation-service
   * L123-127 collection only); none use exhaustive switch or
   * `keyof TradeClosedEvent` enumeration.
   *
   * Populated from position.assetClass at the emit site (active-execution-engine
   * L1545 — read from the canonical SSOT, not re-resolved from symbol).
   * Same-symbol-across-classes is structurally possible post-B79.0n.RTB;
   * consumers that need to disambiguate read this field; consumers that don't
   * are unaffected.
   */
  assetClass?: string;
}

export interface PromotionEvent {
  mode: TradingMode;
  symbol: string;
  strategy: string;
  signalId: string;
  tradeId: string;
  timestamp: string;
  /**
   * B79.0n.RTB (2026-05-27, R-8 mitigation): asset class of the promoted
   * signal. Optional in v1 per Langston Step 2 ACK C-7 — additive field is
   * safe for all 3 current consumers (ready_to_buy_service:369 destructure,
   * c13-validation-service collection, c14-validation-service collection);
   * none use exhaustive switch or `keyof PromotionEvent` enumeration.
   *
   * Same-symbol-across-classes is structurally possible now. Consumers that
   * need to disambiguate read this field; consumers that don't are unaffected.
   */
  assetClass?: string;
}

export interface SlotOpenedEvent {
  mode: TradingMode;
  symbol: string;
  strategy: string;
  tradeId: string;
  pnl: number;
  timestamp: string;
  slotsAvailable: number;
}

export interface RTBThresholdMetEvent {
  mode: TradingMode;
  poolSize: number;
  threshold: number;
  timestamp: string;
}

export interface FailsafeTriggerEvent {
  mode: TradingMode;
  elapsedSeconds: number;
  timestamp: string;
}

type QueuedEvent = {
  type: string;
  payload: any;
  timestamp: number;
};

class EventBus extends EventEmitter {
  private eventQueue: QueuedEvent[] = [];
  private isProcessing = false;
  private queueInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);
    this.startQueueProcessor();
  }

  private startQueueProcessor(): void {
    if (this.queueInterval) return;
    
    this.queueInterval = setInterval(async () => {
      if (this.eventQueue.length > 0 && !this.isProcessing) {
        this.isProcessing = true;
        const next = this.eventQueue.shift();
        if (next) {
          try {
            this.emit(next.type, next.payload);
          } catch (error) {
            console.error(`[A3.R7][EVENT_BUS] Error processing queued event ${next.type}:`, error);
          }
        }
        this.isProcessing = false;
      }
    }, 200);
    
    console.log('[A3.R7][EVENT_BUS] Event queue processor started');
  }

  private queueEvent(type: string, payload: any): void {
    this.eventQueue.push({ type, payload, timestamp: Date.now() });
  }

  emitIntrospectionEvent(event: {
    type: string;
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  }): void {
    this.emit('introspection_event', event);
  }

  emitMitigationEvent(event: {
    type: string;
    userId?: string;
    timestamp?: string;
    [key: string]: any;
  }): void {
    this.emit('mitigation_event', event);
  }

  /**
   * Directive 8.8.4-A3.R8: Log TCL trace event to persistent file
   */
  private logTclTrace(eventType: string, payload: any): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'logs');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.split('T')[0].replace(/-/g, '');
      const logEntry = {
        timestamp,
        eventType,
        ...payload
      };
      
      const logPath = path.join(logDir, `tcl_event_trace_${dateStr}.log`);
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Silent fail - diagnostic logging should not break event processing
    }
  }

  emitTCLActivated(event: TCLActivatedEvent): void {
    console.log(`[A3.R7][TCL_EVENT] type=TCL_ACTIVATED reason=${event.reason} mode=${event.mode} poolSize=${event.poolSize}`);
    this.logTclTrace('TCL_ACTIVATED', event);
    this.emit('TCL_ACTIVATED', event);
  }

  emitTradeClosed(event: TradeClosedEvent): void {
    console.log(`[A3.R7][TRADE_CLOSED] symbol=${event.symbol} strategy=${event.strategy} PnL=${event.pnl.toFixed(2)} mode=${event.mode}`);
    this.logTclTrace('TRADE_CLOSED', event);
    this.emit('TRADE_CLOSED', event);
  }

  emitPromotion(event: PromotionEvent): void {
    console.log(`[A3.R7][PROMOTION] symbol=${event.symbol} strategy=${event.strategy} tradeId=${event.tradeId} mode=${event.mode}`);
    this.logTclTrace('PROMOTION', event);
    this.emit('PROMOTION', event);
  }

  emitSlotOpened(event: SlotOpenedEvent): void {
    console.log(`[TCL][Event] SlotOpened received – promoting new trade (symbol=${event.symbol} slots=${event.slotsAvailable})`);
    this.logTclTrace('SlotOpened', event);
    this.queueEvent('SlotOpened', event);
  }

  emitRTBThresholdMet(event: RTBThresholdMetEvent): void {
    console.log(`[TCL][Event] RTBThresholdMet received – ${event.poolSize} signals active`);
    this.logTclTrace('RTBThresholdMet', event);
    this.emit('RTBThresholdMet', event);
  }

  emitFailsafeTrigger(event: FailsafeTriggerEvent): void {
    console.log(`[TCL][Event] FailsafeTrigger triggered after ${event.elapsedSeconds}s idle`);
    this.logTclTrace('FailsafeTrigger', event);
    this.emit('FailsafeTrigger', event);
  }

  onTCLActivated(handler: (event: TCLActivatedEvent) => void): void {
    this.on('TCL_ACTIVATED', handler);
  }

  onTradeClosed(handler: (event: TradeClosedEvent) => void): void {
    this.on('TRADE_CLOSED', handler);
  }

  onPromotion(handler: (event: PromotionEvent) => void): void {
    this.on('PROMOTION', handler);
  }

  onSlotOpened(handler: (event: SlotOpenedEvent) => void): void {
    this.on('SlotOpened', handler);
  }

  onRTBThresholdMet(handler: (event: RTBThresholdMetEvent) => void): void {
    this.on('RTBThresholdMet', handler);
  }

  onFailsafeTrigger(handler: (event: FailsafeTriggerEvent) => void): void {
    this.on('FailsafeTrigger', handler);
  }

  offTCLActivated(handler: (event: TCLActivatedEvent) => void): void {
    this.off('TCL_ACTIVATED', handler);
  }

  offTradeClosed(handler: (event: TradeClosedEvent) => void): void {
    this.off('TRADE_CLOSED', handler);
  }

  offPromotion(handler: (event: PromotionEvent) => void): void {
    this.off('PROMOTION', handler);
  }

  offSlotOpened(handler: (event: SlotOpenedEvent) => void): void {
    this.off('SlotOpened', handler);
  }

  getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.eventQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

export const eventBus = new EventBus();
