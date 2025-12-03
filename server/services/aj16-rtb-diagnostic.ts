/**
 * Phase 8.8.3-AJ16: RTB Cooling Diagnostic Service
 * 
 * Provides comprehensive logging and snapshot capabilities to diagnose
 * why RTB signals dry up after ~10 minutes of trading.
 * 
 * Key diagnostic areas:
 * - Strategy signal generation
 * - Cooldown (internal + guardrail)
 * - Active position exclusions
 * - Indicator validity
 * - RTB flow tracking
 */

interface StrategySignalLog {
  cycleId: string;
  pair: string;
  strategy: string;
  timestamp: Date;
  signalEmitted: boolean;
  price?: number;
  cooldownOk?: boolean;
  riskOk?: boolean;
  signalValue?: number;
  reason?: string;
  indicators?: Record<string, any>;
}

interface CooldownCheckLog {
  cycleId: string;
  symbol: string;
  timestamp: Date;
  internalCooldown: boolean;
  guardrailCooldown: boolean;
  cooldownRemaining?: number;
  lastTradeTime?: Date;
}

interface PositionExclusionLog {
  cycleId: string;
  symbol: string;
  timestamp: Date;
  reason: string;
  existingPositionId?: string;
}

interface IndicatorStatusLog {
  cycleId: string;
  pair: string;
  timestamp: Date;
  rsi?: number;
  atr?: number;
  vwap?: number;
  ma50?: number;
  ma200?: number;
  sma?: number;
  currentPrice?: number;
  volume24h?: number;
  dataAge?: number;
  isValid: boolean;
  invalidReason?: string;
}

interface RTBEventLog {
  cycleId: string;
  pair: string;
  timestamp: Date;
  eventType: 'BECAME_RTB' | 'RTB_REJECT';
  strategy?: string;
  confidence?: number;
  reason?: string;
}

interface CycleSnapshot {
  cycleId: string;
  timestamp: Date;
  mode: 'live' | 'paper';
  activeFilteredPairs: number;
  pairsProducingSignals: number;
  pairsFailingCooldown: number;
  pairsFailingStrategy: number;
  pairsFailingGuardrails: number;
  pairsBecomingRTB: number;
  pairsWithActivePositions: number;
  openPositionsCount: number;
  strategyBreakdown: Record<string, { signals: number; noSignals: number }>;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

class AJ16RTBDiagnosticService {
  private static instance: AJ16RTBDiagnosticService;
  private currentCycleId: string = '';
  private cycleCounter: number = 0;
  
  private strategyLogs: StrategySignalLog[] = [];
  private cooldownLogs: CooldownCheckLog[] = [];
  private positionExclusionLogs: PositionExclusionLog[] = [];
  private indicatorLogs: IndicatorStatusLog[] = [];
  private rtbEventLogs: RTBEventLog[] = [];
  private snapshots: CycleSnapshot[] = [];
  
  private snapshotIntervalMs = 5 * 60 * 1000;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private lastSnapshotTime: Date = new Date(0);
  
  private cycleCounts = {
    signals: 0,
    noSignals: 0,
    cooldownBlocks: 0,
    positionExclusions: 0,
    guardrailBlocks: 0,
    rtbGenerated: 0,
    rtbRejected: 0,
  };
  
  private strategyStats: Record<string, { signals: number; noSignals: number }> = {};
  private failureReasons: Map<string, number> = new Map();
  
  private constructor() {
    this.initializeStrategyStats();
  }
  
  static getInstance(): AJ16RTBDiagnosticService {
    if (!AJ16RTBDiagnosticService.instance) {
      AJ16RTBDiagnosticService.instance = new AJ16RTBDiagnosticService();
    }
    return AJ16RTBDiagnosticService.instance;
  }
  
  private initializeStrategyStats(): void {
    const strategies = [
      'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout',
      'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap', 'dhma'
    ];
    for (const s of strategies) {
      this.strategyStats[s] = { signals: 0, noSignals: 0 };
    }
  }
  
  startCycle(mode: 'live' | 'paper'): string {
    this.cycleCounter++;
    this.currentCycleId = `${mode}_cycle_${this.cycleCounter}_${Date.now()}`;
    
    this.cycleCounts = {
      signals: 0,
      noSignals: 0,
      cooldownBlocks: 0,
      positionExclusions: 0,
      guardrailBlocks: 0,
      rtbGenerated: 0,
      rtbRejected: 0,
    };
    
    return this.currentCycleId;
  }
  
  getCycleId(): string {
    return this.currentCycleId;
  }
  
  logStrategySignal(data: Omit<StrategySignalLog, 'timestamp'>): void {
    const log: StrategySignalLog = {
      ...data,
      timestamp: new Date(),
    };
    
    this.strategyLogs.push(log);
    if (this.strategyLogs.length > 1000) {
      this.strategyLogs = this.strategyLogs.slice(-500);
    }
    
    if (this.strategyStats[data.strategy]) {
      if (data.signalEmitted) {
        this.strategyStats[data.strategy].signals++;
        this.cycleCounts.signals++;
      } else {
        this.strategyStats[data.strategy].noSignals++;
        this.cycleCounts.noSignals++;
      }
    }
    
    if (data.signalEmitted) {
      console.log(`[AJ16][STRATEGY_SIGNAL] pair=${data.pair} | strategy=${data.strategy} | price=${data.price?.toFixed(6) || 'N/A'} | cooldownOk=${data.cooldownOk} | riskOk=${data.riskOk} | signalValue=${data.signalValue?.toFixed(2) || 'N/A'} | reason="${data.reason || 'met all criteria'}" | cycleId=${data.cycleId}`);
    } else {
      console.log(`[AJ16][STRATEGY_NO_SIGNAL] pair=${data.pair} | strategy=${data.strategy} | reason="${data.reason || 'failed criteria'}" | indicators=${JSON.stringify(data.indicators || {})} | cycleId=${data.cycleId}`);
    }
    
    if (!data.signalEmitted && data.reason) {
      this.incrementFailureReason(data.reason);
    }
  }
  
  logCooldownCheck(data: Omit<CooldownCheckLog, 'timestamp'>): void {
    const log: CooldownCheckLog = {
      ...data,
      timestamp: new Date(),
    };
    
    this.cooldownLogs.push(log);
    if (this.cooldownLogs.length > 500) {
      this.cooldownLogs = this.cooldownLogs.slice(-250);
    }
    
    if (data.internalCooldown || data.guardrailCooldown) {
      this.cycleCounts.cooldownBlocks++;
    }
    
    console.log(`[AJ16][COOLDOWN_CHECK] symbol=${data.symbol} | internalCooldown=${data.internalCooldown} | guardrailCooldown=${data.guardrailCooldown} | cooldownRemaining=${data.cooldownRemaining || 0}sec | cycleId=${data.cycleId}`);
  }
  
  logPositionExclusion(data: Omit<PositionExclusionLog, 'timestamp'>): void {
    const log: PositionExclusionLog = {
      ...data,
      timestamp: new Date(),
    };
    
    this.positionExclusionLogs.push(log);
    if (this.positionExclusionLogs.length > 500) {
      this.positionExclusionLogs = this.positionExclusionLogs.slice(-250);
    }
    
    this.cycleCounts.positionExclusions++;
    
    console.log(`[AJ16][ACTIVE_POSITION_EXCLUDE] symbol=${data.symbol} | reason="${data.reason}" | existingPositionId=${data.existingPositionId || 'N/A'} | cycleId=${data.cycleId}`);
    
    this.incrementFailureReason('active_position_exists');
  }
  
  logIndicatorStatus(data: Omit<IndicatorStatusLog, 'timestamp'>): void {
    const log: IndicatorStatusLog = {
      ...data,
      timestamp: new Date(),
    };
    
    this.indicatorLogs.push(log);
    if (this.indicatorLogs.length > 500) {
      this.indicatorLogs = this.indicatorLogs.slice(-250);
    }
    
    const indicatorStr = [
      data.rsi !== undefined ? `rsi=${data.rsi.toFixed(1)}` : null,
      data.atr !== undefined ? `atr=${data.atr.toFixed(4)}` : null,
      data.vwap !== undefined ? `vwap=${data.vwap.toFixed(2)}` : null,
      data.sma !== undefined ? `sma=${data.sma.toFixed(2)}` : null,
      data.currentPrice !== undefined ? `price=${data.currentPrice.toFixed(6)}` : null,
      data.volume24h !== undefined ? `vol24h=${data.volume24h.toFixed(0)}` : null,
      data.dataAge !== undefined ? `dataAge=${data.dataAge.toFixed(2)}s` : null,
    ].filter(Boolean).join(' | ');
    
    console.log(`[AJ16][INDICATOR_STATUS] pair=${data.pair} | ${indicatorStr} | valid=${data.isValid} | cycleId=${data.cycleId}`);
    
    if (!data.isValid && data.invalidReason) {
      this.incrementFailureReason(`indicator_${data.invalidReason}`);
    }
  }
  
  logRTBEvent(data: Omit<RTBEventLog, 'timestamp'>): void {
    const log: RTBEventLog = {
      ...data,
      timestamp: new Date(),
    };
    
    this.rtbEventLogs.push(log);
    if (this.rtbEventLogs.length > 500) {
      this.rtbEventLogs = this.rtbEventLogs.slice(-250);
    }
    
    if (data.eventType === 'BECAME_RTB') {
      this.cycleCounts.rtbGenerated++;
      console.log(`[AJ16][BECAME_RTB] pair=${data.pair} | strategy=${data.strategy} | confidence=${data.confidence} | reason="${data.reason || 'Met all criteria'}" | cycleId=${data.cycleId}`);
    } else {
      this.cycleCounts.rtbRejected++;
      console.log(`[AJ16][RTB_REJECT] pair=${data.pair} | reason="${data.reason}" | cycleId=${data.cycleId}`);
      if (data.reason) {
        this.incrementFailureReason(data.reason);
      }
    }
  }
  
  logGuardrailBlock(cycleId: string, symbol: string, blockCode: string, reason: string): void {
    this.cycleCounts.guardrailBlocks++;
    console.log(`[AJ16][GUARDRAIL_BLOCK] symbol=${symbol} | code=${blockCode} | reason="${reason}" | cycleId=${cycleId}`);
    this.incrementFailureReason(`guardrail_${blockCode}`);
  }
  
  private incrementFailureReason(reason: string): void {
    const current = this.failureReasons.get(reason) || 0;
    this.failureReasons.set(reason, current + 1);
  }
  
  captureSnapshot(mode: 'live' | 'paper', data: {
    activeFilteredPairs: number;
    openPositionsCount: number;
    pairsWithActivePositions?: number;
  }): void {
    const now = new Date();
    
    if (now.getTime() - this.lastSnapshotTime.getTime() < this.snapshotIntervalMs) {
      return;
    }
    
    const topFailures = Array.from(this.failureReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));
    
    const snapshot: CycleSnapshot = {
      cycleId: this.currentCycleId,
      timestamp: now,
      mode,
      activeFilteredPairs: data.activeFilteredPairs,
      pairsProducingSignals: this.cycleCounts.signals,
      pairsFailingCooldown: this.cycleCounts.cooldownBlocks,
      pairsFailingStrategy: this.cycleCounts.noSignals,
      pairsFailingGuardrails: this.cycleCounts.guardrailBlocks,
      pairsBecomingRTB: this.cycleCounts.rtbGenerated,
      pairsWithActivePositions: data.pairsWithActivePositions || this.cycleCounts.positionExclusions,
      openPositionsCount: data.openPositionsCount,
      strategyBreakdown: { ...this.strategyStats },
      topFailureReasons: topFailures,
    };
    
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-50);
    }
    
    this.lastSnapshotTime = now;
    
    console.log(`[AJ16][SNAPSHOT] timestamp=${now.toISOString()} | mode=${mode} | activePairs=${data.activeFilteredPairs} | signals=${this.cycleCounts.signals} | noSignals=${this.cycleCounts.noSignals} | cooldownBlocks=${this.cycleCounts.cooldownBlocks} | positionExclusions=${this.cycleCounts.positionExclusions} | guardrailBlocks=${this.cycleCounts.guardrailBlocks} | RTB=${this.cycleCounts.rtbGenerated} | openPositions=${data.openPositionsCount}`);
    console.log(`[AJ16][SNAPSHOT_STRATEGY_BREAKDOWN]`, JSON.stringify(this.strategyStats));
    console.log(`[AJ16][SNAPSHOT_TOP_FAILURES]`, JSON.stringify(topFailures));
  }
  
  forceSnapshot(mode: 'live' | 'paper', data: {
    activeFilteredPairs: number;
    openPositionsCount: number;
    pairsWithActivePositions?: number;
  }): void {
    this.lastSnapshotTime = new Date(0);
    this.captureSnapshot(mode, data);
  }
  
  getRecentSnapshots(limit: number = 20): CycleSnapshot[] {
    return this.snapshots.slice(-limit);
  }
  
  getStrategyStats(): Record<string, { signals: number; noSignals: number }> {
    return { ...this.strategyStats };
  }
  
  getTopFailureReasons(limit: number = 10): Array<{ reason: string; count: number }> {
    return Array.from(this.failureReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([reason, count]) => ({ reason, count }));
  }
  
  getCycleSummary(): typeof this.cycleCounts {
    return { ...this.cycleCounts };
  }
  
  generateDiagnosticReport(): string {
    const now = new Date();
    const recentSnapshots = this.getRecentSnapshots(20);
    const strategyStats = this.getStrategyStats();
    const topFailures = this.getTopFailureReasons(15);
    
    let report = `# Phase 8.8.3-AJ16: RTB Cooling Diagnostic Report\n\n`;
    report += `**Generated:** ${now.toISOString()}\n\n`;
    report += `---\n\n`;
    
    report += `## 1. Strategy Signal Production\n\n`;
    report += `| Strategy | Signals Generated | No Signal | Signal Rate |\n`;
    report += `|----------|-------------------|-----------|-------------|\n`;
    
    for (const [strategy, stats] of Object.entries(strategyStats)) {
      const total = stats.signals + stats.noSignals;
      const rate = total > 0 ? ((stats.signals / total) * 100).toFixed(1) : '0.0';
      report += `| ${strategy} | ${stats.signals} | ${stats.noSignals} | ${rate}% |\n`;
    }
    
    report += `\n## 2. Top Failure Reasons\n\n`;
    report += `| Reason | Count |\n`;
    report += `|--------|-------|\n`;
    
    for (const { reason, count } of topFailures) {
      report += `| ${reason} | ${count} |\n`;
    }
    
    report += `\n## 3. Cooldown Analysis\n\n`;
    const cooldownBlocks = this.cooldownLogs.filter(l => l.internalCooldown || l.guardrailCooldown).length;
    const totalCooldownChecks = this.cooldownLogs.length;
    report += `- Total cooldown checks: ${totalCooldownChecks}\n`;
    report += `- Blocked by cooldown: ${cooldownBlocks}\n`;
    report += `- Block rate: ${totalCooldownChecks > 0 ? ((cooldownBlocks / totalCooldownChecks) * 100).toFixed(1) : 0}%\n\n`;
    
    report += `## 4. Active Position Exclusions\n\n`;
    report += `- Total position exclusions: ${this.positionExclusionLogs.length}\n`;
    report += `- This prevents signals from being generated for symbols with existing positions.\n\n`;
    
    report += `## 5. Indicator Health\n\n`;
    const invalidIndicators = this.indicatorLogs.filter(l => !l.isValid).length;
    const totalIndicatorChecks = this.indicatorLogs.length;
    report += `- Total indicator checks: ${totalIndicatorChecks}\n`;
    report += `- Invalid indicators: ${invalidIndicators}\n`;
    report += `- Health rate: ${totalIndicatorChecks > 0 ? (((totalIndicatorChecks - invalidIndicators) / totalIndicatorChecks) * 100).toFixed(1) : 100}%\n\n`;
    
    report += `## 6. RTB Flow Summary\n\n`;
    report += `- Pairs becoming RTB: ${this.cycleCounts.rtbGenerated}\n`;
    report += `- RTB rejections: ${this.cycleCounts.rtbRejected}\n\n`;
    
    report += `## 7. Recent Snapshots (5-minute intervals)\n\n`;
    report += `| Timestamp | Active Pairs | Signals | Cooldown Blocks | Position Excludes | RTB Generated | Open Positions |\n`;
    report += `|-----------|--------------|---------|-----------------|-------------------|---------------|----------------|\n`;
    
    for (const snapshot of recentSnapshots.slice(-10)) {
      report += `| ${snapshot.timestamp.toISOString()} | ${snapshot.activeFilteredPairs} | ${snapshot.pairsProducingSignals} | ${snapshot.pairsFailingCooldown} | ${snapshot.pairsWithActivePositions} | ${snapshot.pairsBecomingRTB} | ${snapshot.openPositionsCount} |\n`;
    }
    
    report += `\n## 8. Diagnosis Summary\n\n`;
    
    const diagnosis: string[] = [];
    
    const signalRate = (this.cycleCounts.signals / (this.cycleCounts.signals + this.cycleCounts.noSignals || 1)) * 100;
    if (signalRate < 5) {
      diagnosis.push('**Strategy Misfires**: Signal generation rate is very low (<5%). Strategies may be too restrictive or market conditions are unfavorable.');
    }
    
    if (this.cycleCounts.positionExclusions > this.cycleCounts.signals) {
      diagnosis.push('**Position Exclusion Choking**: More symbols excluded due to open positions than signals generated. Consider allowing sequential trades per symbol in future phases.');
    }
    
    if (this.cycleCounts.cooldownBlocks > this.cycleCounts.signals) {
      diagnosis.push('**Cooldown Suppression**: Cooldowns are blocking more signals than are being generated. Review cooldown settings.');
    }
    
    if (invalidIndicators > totalIndicatorChecks * 0.1) {
      diagnosis.push('**Data Quality Issues**: >10% of indicator checks returned invalid data. Check market data feeds.');
    }
    
    if (this.cycleCounts.guardrailBlocks > 0) {
      diagnosis.push(`**Guardrail Blocks**: ${this.cycleCounts.guardrailBlocks} signals blocked by guardrails. Check kill switch, exposure limits, and position sizing.`);
    }
    
    if (diagnosis.length === 0) {
      diagnosis.push('No obvious issues detected. RTB drying up may be due to normal market conditions.');
    }
    
    for (const d of diagnosis) {
      report += `- ${d}\n`;
    }
    
    report += `\n---\n\n`;
    report += `*Report generated by AJ16 RTB Diagnostic Service*\n`;
    
    return report;
  }
  
  resetStats(): void {
    this.strategyLogs = [];
    this.cooldownLogs = [];
    this.positionExclusionLogs = [];
    this.indicatorLogs = [];
    this.rtbEventLogs = [];
    this.initializeStrategyStats();
    this.failureReasons.clear();
    this.cycleCounts = {
      signals: 0,
      noSignals: 0,
      cooldownBlocks: 0,
      positionExclusions: 0,
      guardrailBlocks: 0,
      rtbGenerated: 0,
      rtbRejected: 0,
    };
  }
}

export const aj16Diagnostic = AJ16RTBDiagnosticService.getInstance();
export type { StrategySignalLog, CooldownCheckLog, PositionExclusionLog, IndicatorStatusLog, RTBEventLog, CycleSnapshot };
