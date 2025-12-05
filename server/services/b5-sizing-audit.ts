/**
 * Phase 8.8.3-B5: Full Signal Creation & Sizing Pipeline Audit
 * 
 * OBSERVATIONAL ONLY - Does NOT modify any trading behavior
 * 
 * This service provides comprehensive audit trail for:
 * - Signal creation by all 9 strategies
 * - Sizing layer calls (or skips)
 * - processSignal() field inspection
 * - Guardrail checks with sizing-relevant data
 */

export interface B5SignalCreatedEntry {
  type: 'SIGNAL_CREATED';
  strategy: string;
  symbol: string;
  entryPrice: number;
  strategyQty: number | null;
  strategyNotional: number | null;
  hasEstimatedValue: boolean;
  hasPreComputedNotional: boolean;
  timestamp: string;
}

export interface B5SizingCalledEntry {
  type: 'SIZING_CALLED';
  strategy: string;
  symbol: string;
  entryPrice: number;
  rawNotional: number | null;
  sizedQuantity: number;
  sizedNotional: number;
  riskPct: number;
  maxPositionUsd: number;
  bufferFactor: number;
  timestamp: string;
}

export interface B5SizingSkippedEntry {
  type: 'SIZING_SKIPPED';
  strategy: string;
  symbol: string;
  reason: string;
  timestamp: string;
}

export interface B5SignalReceivedEntry {
  type: 'SIGNAL_RECEIVED_BY_ENGINE';
  strategy: string;
  symbol: string;
  entryPrice: number;
  quantity: number | null;
  estimatedValue: number | null;
  fieldsPresent: string[];
  timestamp: string;
}

export interface B5GuardrailCheckEntry {
  type: 'GUARDRAIL_CHECK';
  guardrailType: string;
  strategy: string;
  symbol: string;
  entryPrice: number;
  incomingQuantity: number | null;
  incomingEstimatedValue: number | null;
  computedMaxPositionUsd: number | null;
  computedTotalExposureUsd: number | null;
  decision: 'allowed' | 'blocked';
  reason: string | null;
  timestamp: string;
}

export type B5AuditEntry = 
  | B5SignalCreatedEntry 
  | B5SizingCalledEntry 
  | B5SizingSkippedEntry
  | B5SignalReceivedEntry
  | B5GuardrailCheckEntry;

interface B5StrategySummary {
  signalsCreated: number;
  sizingCalled: number;
  sizingSkipped: number;
  guardrailsChecked: number;
  guardrailsBlocked: number;
  avgRawNotional: number;
  avgSizedNotional: number;
  rawNotionalSum: number;
  sizedNotionalSum: number;
}

interface B5Summary {
  sessionStart: string;
  totalEntries: number;
  byType: {
    SIGNAL_CREATED: number;
    SIZING_CALLED: number;
    SIZING_SKIPPED: number;
    SIGNAL_RECEIVED_BY_ENGINE: number;
    GUARDRAIL_CHECK: number;
  };
  byStrategy: Record<string, B5StrategySummary>;
  signalsWithoutSizing: number;
  signalsReachingGuardrailsUnsized: number;
  guardrailBlocksByReason: Record<string, number>;
}

class B5SizingAuditService {
  private static instance: B5SizingAuditService;
  private buffer: B5AuditEntry[] = [];
  private readonly maxBufferSize = 10000;
  private sessionStart: string;
  private isEnabled: boolean = true;

  private constructor() {
    this.sessionStart = new Date().toISOString();
    console.log(`[B5] Sizing Audit Service initialized at ${this.sessionStart}`);
  }

  public static getInstance(): B5SizingAuditService {
    if (!B5SizingAuditService.instance) {
      B5SizingAuditService.instance = new B5SizingAuditService();
    }
    return B5SizingAuditService.instance;
  }

  public enable(): void {
    this.isEnabled = true;
    console.log('[B5] Sizing Audit ENABLED');
  }

  public disable(): void {
    this.isEnabled = false;
    console.log('[B5] Sizing Audit DISABLED');
  }

  public isActive(): boolean {
    return this.isEnabled;
  }

  private addEntry(entry: B5AuditEntry): void {
    if (!this.isEnabled) return;
    
    this.buffer.push(entry);
    
    // Ring buffer behavior - remove oldest when at capacity
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  // Part 1: Log signal creation
  public logSignalCreated(params: {
    strategy: string;
    symbol: string;
    entryPrice: number;
    strategyQty?: number | null;
    strategyNotional?: number | null;
    hasEstimatedValue?: boolean;
    hasPreComputedNotional?: boolean;
  }): void {
    const entry: B5SignalCreatedEntry = {
      type: 'SIGNAL_CREATED',
      strategy: params.strategy,
      symbol: params.symbol,
      entryPrice: params.entryPrice,
      strategyQty: params.strategyQty ?? null,
      strategyNotional: params.strategyNotional ?? null,
      hasEstimatedValue: params.hasEstimatedValue ?? false,
      hasPreComputedNotional: params.hasPreComputedNotional ?? false,
      timestamp: new Date().toISOString(),
    };
    
    this.addEntry(entry);
    
    console.log(`[B5.SIGNAL_CREATED] strategy=${params.strategy} symbol=${params.symbol} ` +
      `entry_price=${params.entryPrice} strategy_qty=${params.strategyQty ?? 'null'} ` +
      `strategy_notional=${params.strategyNotional ?? 'null'} ` +
      `has_estimatedValue=${params.hasEstimatedValue ?? false} ` +
      `has_preComputedNotional=${params.hasPreComputedNotional ?? false}`);
  }

  // Part 2: Log sizing called
  public logSizingCalled(params: {
    strategy: string;
    symbol: string;
    entryPrice: number;
    rawNotional: number | null;
    sizedQuantity: number;
    sizedNotional: number;
    riskPct: number;
    maxPositionUsd: number;
    bufferFactor: number;
  }): void {
    const entry: B5SizingCalledEntry = {
      type: 'SIZING_CALLED',
      strategy: params.strategy,
      symbol: params.symbol,
      entryPrice: params.entryPrice,
      rawNotional: params.rawNotional,
      sizedQuantity: params.sizedQuantity,
      sizedNotional: params.sizedNotional,
      riskPct: params.riskPct,
      maxPositionUsd: params.maxPositionUsd,
      bufferFactor: params.bufferFactor,
      timestamp: new Date().toISOString(),
    };
    
    this.addEntry(entry);
    
    console.log(`[B5.SIZING_CALLED] strategy=${params.strategy} symbol=${params.symbol} ` +
      `entry_price=${params.entryPrice} raw_notional=${params.rawNotional ?? 'null'} ` +
      `sized_quantity=${params.sizedQuantity} sized_notional=${params.sizedNotional} ` +
      `risk_pct=${params.riskPct} max_position_usd=${params.maxPositionUsd} ` +
      `buffer_factor=${params.bufferFactor}`);
  }

  // Part 2: Log sizing skipped
  public logSizingSkipped(params: {
    strategy: string;
    symbol: string;
    reason: string;
  }): void {
    const entry: B5SizingSkippedEntry = {
      type: 'SIZING_SKIPPED',
      strategy: params.strategy,
      symbol: params.symbol,
      reason: params.reason,
      timestamp: new Date().toISOString(),
    };
    
    this.addEntry(entry);
    
    console.log(`[B5.SIZING_SKIPPED] strategy=${params.strategy} symbol=${params.symbol} ` +
      `reason="${params.reason}"`);
  }

  // Part 3: Log signal received by engine
  public logSignalReceivedByEngine(params: {
    strategy: string;
    symbol: string;
    entryPrice: number;
    quantity?: number | null;
    estimatedValue?: number | null;
    fieldsPresent: string[];
  }): void {
    const entry: B5SignalReceivedEntry = {
      type: 'SIGNAL_RECEIVED_BY_ENGINE',
      strategy: params.strategy,
      symbol: params.symbol,
      entryPrice: params.entryPrice,
      quantity: params.quantity ?? null,
      estimatedValue: params.estimatedValue ?? null,
      fieldsPresent: params.fieldsPresent,
      timestamp: new Date().toISOString(),
    };
    
    this.addEntry(entry);
    
    console.log(`[B5.SIGNAL_RECEIVED_BY_ENGINE] strategy=${params.strategy} symbol=${params.symbol} ` +
      `entry_price=${params.entryPrice} quantity=${params.quantity ?? 'null'} ` +
      `estimatedValue=${params.estimatedValue ?? 'null'} ` +
      `fields_present=[${params.fieldsPresent.join(',')}]`);
  }

  // Part 4: Log guardrail check
  public logGuardrailCheck(params: {
    guardrailType: string;
    strategy: string;
    symbol: string;
    entryPrice: number;
    incomingQuantity?: number | null;
    incomingEstimatedValue?: number | null;
    computedMaxPositionUsd?: number | null;
    computedTotalExposureUsd?: number | null;
    decision: 'allowed' | 'blocked';
    reason?: string | null;
  }): void {
    const entry: B5GuardrailCheckEntry = {
      type: 'GUARDRAIL_CHECK',
      guardrailType: params.guardrailType,
      strategy: params.strategy,
      symbol: params.symbol,
      entryPrice: params.entryPrice,
      incomingQuantity: params.incomingQuantity ?? null,
      incomingEstimatedValue: params.incomingEstimatedValue ?? null,
      computedMaxPositionUsd: params.computedMaxPositionUsd ?? null,
      computedTotalExposureUsd: params.computedTotalExposureUsd ?? null,
      decision: params.decision,
      reason: params.reason ?? null,
      timestamp: new Date().toISOString(),
    };
    
    this.addEntry(entry);
    
    console.log(`[B5.GUARDRAIL_CHECK] type=${params.guardrailType} strategy=${params.strategy} ` +
      `symbol=${params.symbol} entry_price=${params.entryPrice} ` +
      `incoming_quantity=${params.incomingQuantity ?? 'null'} ` +
      `incoming_estimatedValue=${params.incomingEstimatedValue ?? 'null'} ` +
      `computed_max_position_usd=${params.computedMaxPositionUsd ?? 'null'} ` +
      `computed_total_exposure_usd=${params.computedTotalExposureUsd ?? 'null'} ` +
      `decision=${params.decision} reason=${params.reason ?? 'none'}`);
  }

  // Get raw log entries
  public getLog(limit: number = 2000): B5AuditEntry[] {
    const entries = this.buffer.slice(-limit);
    return entries;
  }

  // Get summary
  public getSummary(): B5Summary {
    const summary: B5Summary = {
      sessionStart: this.sessionStart,
      totalEntries: this.buffer.length,
      byType: {
        SIGNAL_CREATED: 0,
        SIZING_CALLED: 0,
        SIZING_SKIPPED: 0,
        SIGNAL_RECEIVED_BY_ENGINE: 0,
        GUARDRAIL_CHECK: 0,
      },
      byStrategy: {},
      signalsWithoutSizing: 0,
      signalsReachingGuardrailsUnsized: 0,
      guardrailBlocksByReason: {},
    };

    // Track which signals got sized
    const signalsWithSizing = new Set<string>();
    const signalsCreated = new Set<string>();

    for (const entry of this.buffer) {
      summary.byType[entry.type]++;

      // Get or create strategy summary
      const strategyName = entry.type === 'GUARDRAIL_CHECK' 
        ? (entry as B5GuardrailCheckEntry).strategy 
        : (entry as any).strategy;
      
      if (strategyName && !summary.byStrategy[strategyName]) {
        summary.byStrategy[strategyName] = {
          signalsCreated: 0,
          sizingCalled: 0,
          sizingSkipped: 0,
          guardrailsChecked: 0,
          guardrailsBlocked: 0,
          avgRawNotional: 0,
          avgSizedNotional: 0,
          rawNotionalSum: 0,
          sizedNotionalSum: 0,
        };
      }

      const stratSum = strategyName ? summary.byStrategy[strategyName] : null;

      switch (entry.type) {
        case 'SIGNAL_CREATED': {
          const e = entry as B5SignalCreatedEntry;
          if (stratSum) {
            stratSum.signalsCreated++;
            if (e.strategyNotional) {
              stratSum.rawNotionalSum += e.strategyNotional;
            }
          }
          signalsCreated.add(`${e.symbol}:${e.strategy}:${e.timestamp.slice(0, 16)}`);
          break;
        }
        case 'SIZING_CALLED': {
          const e = entry as B5SizingCalledEntry;
          if (stratSum) {
            stratSum.sizingCalled++;
            stratSum.sizedNotionalSum += e.sizedNotional;
          }
          signalsWithSizing.add(`${e.symbol}:${e.strategy}:${e.timestamp.slice(0, 16)}`);
          break;
        }
        case 'SIZING_SKIPPED': {
          const e = entry as B5SizingSkippedEntry;
          if (stratSum) {
            stratSum.sizingSkipped++;
          }
          break;
        }
        case 'GUARDRAIL_CHECK': {
          const e = entry as B5GuardrailCheckEntry;
          if (stratSum) {
            stratSum.guardrailsChecked++;
            if (e.decision === 'blocked') {
              stratSum.guardrailsBlocked++;
            }
          }
          if (e.decision === 'blocked' && e.reason) {
            summary.guardrailBlocksByReason[e.reason] = 
              (summary.guardrailBlocksByReason[e.reason] || 0) + 1;
          }
          // Check if this guardrail saw unsized values (huge estimatedValue)
          if (e.incomingEstimatedValue && e.incomingEstimatedValue > 50000) {
            summary.signalsReachingGuardrailsUnsized++;
          }
          break;
        }
      }
    }

    // Calculate averages for each strategy
    for (const [stratName, strat] of Object.entries(summary.byStrategy)) {
      if (strat.signalsCreated > 0) {
        strat.avgRawNotional = strat.rawNotionalSum / strat.signalsCreated;
      }
      if (strat.sizingCalled > 0) {
        strat.avgSizedNotional = strat.sizedNotionalSum / strat.sizingCalled;
      }
    }

    // Count signals without sizing (created but never sized)
    for (const signalKey of signalsCreated) {
      if (!signalsWithSizing.has(signalKey)) {
        summary.signalsWithoutSizing++;
      }
    }

    return summary;
  }

  // Export to JSON
  public exportToJSON(): string {
    return JSON.stringify({
      summary: this.getSummary(),
      entries: this.buffer,
    }, null, 2);
  }

  // Export to CSV
  public exportToCSV(): string {
    const headers = [
      'timestamp',
      'type',
      'strategy',
      'symbol',
      'entryPrice',
      'quantity',
      'estimatedValue',
      'sizedNotional',
      'maxPositionUsd',
      'decision',
      'reason',
    ].join(',');

    const rows = this.buffer.map(entry => {
      const base = [
        entry.timestamp,
        entry.type,
        (entry as any).strategy || '',
        (entry as any).symbol || '',
        (entry as any).entryPrice || '',
      ];

      switch (entry.type) {
        case 'SIGNAL_CREATED': {
          const e = entry as B5SignalCreatedEntry;
          return [...base, e.strategyQty || '', e.strategyNotional || '', '', '', '', ''].join(',');
        }
        case 'SIZING_CALLED': {
          const e = entry as B5SizingCalledEntry;
          return [...base, e.sizedQuantity, '', e.sizedNotional, e.maxPositionUsd, '', ''].join(',');
        }
        case 'SIZING_SKIPPED': {
          const e = entry as B5SizingSkippedEntry;
          return [...base, '', '', '', '', '', e.reason].join(',');
        }
        case 'SIGNAL_RECEIVED_BY_ENGINE': {
          const e = entry as B5SignalReceivedEntry;
          return [...base, e.quantity || '', e.estimatedValue || '', '', '', '', ''].join(',');
        }
        case 'GUARDRAIL_CHECK': {
          const e = entry as B5GuardrailCheckEntry;
          return [...base, e.incomingQuantity || '', e.incomingEstimatedValue || '', '', 
            e.computedMaxPositionUsd || '', e.decision, e.reason || ''].join(',');
        }
        default:
          return base.join(',');
      }
    });

    return [headers, ...rows].join('\n');
  }

  // Reset buffer
  public reset(): void {
    this.buffer = [];
    this.sessionStart = new Date().toISOString();
    console.log(`[B5] Buffer reset at ${this.sessionStart}`);
  }

  // Get stats
  public getStats(): { sessionStart: string; entryCount: number; isEnabled: boolean } {
    return {
      sessionStart: this.sessionStart,
      entryCount: this.buffer.length,
      isEnabled: this.isEnabled,
    };
  }
}

export const b5SizingAudit = B5SizingAuditService.getInstance();
export default b5SizingAudit;
