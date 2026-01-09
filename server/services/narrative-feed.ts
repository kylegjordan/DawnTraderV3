/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4A — Narrative Feed Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides a timestamped narrative of trading events and adaptive actions.
 * 
 * Trigger Events (M16 Governance: No reconfirmation events):
 * - Trade Opened
 * - DSE Resize
 * - Trailing Exit Update
 * - Trade Closed
 * - Manual Override
 * 
 * Retention (M12 Governance):
 * - 7 days in memory for UI
 * - Older records archived to telemetry_narrative
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

export type NarrativeEventType = 
  | 'TRADE_OPENED'
  | 'DSE_RESIZE'
  | 'TRAILING_EXIT_UPDATE'
  | 'TRADE_CLOSED'
  | 'MANUAL_OVERRIDE';

export interface NarrativeEvent {
  id: string;
  timestamp: Date;
  type: NarrativeEventType;
  symbol: string;
  message: string;
  details?: Record<string, any>;
}

export interface TradeOpenedPayload {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  strategy: string;
  regime: string;
  positionSize?: number;
}

export interface DSEResizePayload {
  symbol: string;
  resizePct: number;
  reason: string;
  friction?: number;
}

export interface TrailingExitPayload {
  symbol: string;
  newStopPrice: number;
  previousStopPrice?: number;
}

export interface TradeClosedPayload {
  symbol: string;
  exitPrice: number;
  pnlPct: number;
  holdDurationMs?: number;
}

export interface ManualOverridePayload {
  symbol: string;
  action: string;
  reason?: string;
}

type NarrativePayload = TradeOpenedPayload | DSEResizePayload | TrailingExitPayload | TradeClosedPayload | ManualOverridePayload;

const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_IN_MEMORY = 1000;

const narrativeLog: NarrativeEvent[] = [];
let eventCounter = 0;

function generateEventId(): string {
  eventCounter++;
  return `NE-${Date.now()}-${eventCounter}`;
}

function generateNarrativeMessage(type: NarrativeEventType, payload: NarrativePayload): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toISOString().split('T')[0];
  
  switch (type) {
    case 'TRADE_OPENED': {
      const p = payload as TradeOpenedPayload;
      return `[${dateStr} ${timeStr}] ${p.symbol} opened ${p.side} @ ${p.entryPrice.toFixed(2)} (${p.strategy}, ${p.regime})`;
    }
    case 'DSE_RESIZE': {
      const p = payload as DSEResizePayload;
      const sign = p.resizePct > 0 ? '+' : '';
      return `[${dateStr} ${timeStr}] DSE resized position ${sign}${(p.resizePct * 100).toFixed(0)}%${p.friction ? ` due to friction ${p.friction}` : ''} - ${p.reason}`;
    }
    case 'TRAILING_EXIT_UPDATE': {
      const p = payload as TrailingExitPayload;
      return `[${dateStr} ${timeStr}] Trailing Exit ratcheted stop @ ${p.newStopPrice.toFixed(2)}`;
    }
    case 'TRADE_CLOSED': {
      const p = payload as TradeClosedPayload;
      const sign = p.pnlPct >= 0 ? '+' : '';
      return `[${dateStr} ${timeStr}] Trade closed @ ${p.exitPrice.toFixed(2)} (${sign}${(p.pnlPct * 100).toFixed(2)}% net)`;
    }
    case 'MANUAL_OVERRIDE': {
      const p = payload as ManualOverridePayload;
      return `[${dateStr} ${timeStr}] Manual override: ${p.action}${p.reason ? ` - ${p.reason}` : ''}`;
    }
    default:
      return `[${dateStr} ${timeStr}] Unknown event`;
  }
}

export function appendNarrativeEvent(
  type: NarrativeEventType,
  symbol: string,
  payload: NarrativePayload
): NarrativeEvent {
  const event: NarrativeEvent = {
    id: generateEventId(),
    timestamp: new Date(),
    type,
    symbol,
    message: generateNarrativeMessage(type, payload),
    details: payload as Record<string, any>,
  };
  
  narrativeLog.push(event);
  
  if (narrativeLog.length > MAX_IN_MEMORY) {
    narrativeLog.shift();
  }
  
  console.log(`[11.4A][Narrative] ${event.message}`);
  
  return event;
}

export function getNarrativeEvents(options?: {
  limit?: number;
  offset?: number;
  symbol?: string;
  type?: NarrativeEventType;
  since?: Date;
}): NarrativeEvent[] {
  let filtered = [...narrativeLog];
  
  const cutoff = new Date(Date.now() - RETENTION_MS);
  filtered = filtered.filter(e => e.timestamp >= cutoff);
  
  if (options?.symbol) {
    filtered = filtered.filter(e => e.symbol === options.symbol);
  }
  
  if (options?.type) {
    filtered = filtered.filter(e => e.type === options.type);
  }
  
  if (options?.since) {
    filtered = filtered.filter(e => e.timestamp >= options.since);
  }
  
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  
  return filtered.slice(offset, offset + limit);
}

export function getRecentNarrativeEvents(limit: number = 20): NarrativeEvent[] {
  return getNarrativeEvents({ limit });
}

export function clearNarrativeLog(): void {
  narrativeLog.length = 0;
  console.log('[11.4A][Narrative] Log cleared');
}

export function getNarrativeStats(): {
  totalEvents: number;
  oldestEvent: Date | null;
  newestEvent: Date | null;
  byType: Record<NarrativeEventType, number>;
} {
  const byType: Record<NarrativeEventType, number> = {
    TRADE_OPENED: 0,
    DSE_RESIZE: 0,
    TRAILING_EXIT_UPDATE: 0,
    TRADE_CLOSED: 0,
    MANUAL_OVERRIDE: 0,
  };
  
  for (const event of narrativeLog) {
    byType[event.type]++;
  }
  
  return {
    totalEvents: narrativeLog.length,
    oldestEvent: narrativeLog.length > 0 ? narrativeLog[0].timestamp : null,
    newestEvent: narrativeLog.length > 0 ? narrativeLog[narrativeLog.length - 1].timestamp : null,
    byType,
  };
}
