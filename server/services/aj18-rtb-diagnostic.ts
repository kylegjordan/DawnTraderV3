/**
 * Phase 8.8.3-AJ18: RTB Starvation Root-Cause Diagnostic Service
 * 
 * Extends AJ16 diagnostics with deeper instrumentation to determine why
 * RTB signal flow collapses after 3-5 minutes of trading.
 * 
 * Key diagnostic areas:
 * 1. MAX_POSITIONS_SKIP - Detect when max positions suppresses scanning
 * 2. POOL_STATE - Active pool stability per cycle
 * 3. CRITERIA_FAIL - Detailed strategy failure reasons (strategy.specific_reason)
 * 4. TRADE_LIFECYCLE - Track trade open/close/error events
 */

interface MaxPositionsEvent {
  cycleId: string;
  timestamp: Date;
  eventType: 'SKIP' | 'EVALUATION';
  openPositions: number;
  maxPositions: number;
  symbolsEvaluated?: number;
  rtbGenerated?: number;
  skippedReason?: string;
}

interface PoolStateLog {
  cycleId: string;
  timestamp: Date;
  activePoolSize: number;
  symbolsEvaluatedThisCycle: number;
  symbolsSkipped: number;
  skipReasons: Record<string, number>;
  rtbCandidatesProposed: number;
}

interface CriteriaFailLog {
  cycleId: string;
  timestamp: Date;
  symbol: string;
  strategy: string;
  failureReason: string;
  indicators?: Record<string, any>;
}

interface TradeLifecycleEvent {
  cycleId: string;
  timestamp: Date;
  eventType: 'OPEN' | 'CLOSE' | 'ERROR' | 'STUCK_DETECTED';
  tradeId?: string;
  symbol: string;
  strategy?: string;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  closeReason?: string;
  errorMessage?: string;
  holdingDurationMinutes?: number;
}

interface AJ18CycleSnapshot {
  cycleId: string;
  timestamp: Date;
  mode: 'live' | 'paper';
  cycleNumber: number;
  
  maxPositionsState: {
    openPositions: number;
    maxPositions: number;
    atMaxCapacity: boolean;
    skippedScanning: boolean;
  };
  
  poolState: {
    activePoolSize: number;
    symbolsEvaluated: number;
    symbolsSkipped: number;
    skipReasons: Record<string, number>;
  };
  
  signalState: {
    strategiesEvaluated: number;
    signalsGenerated: number;
    rtbCandidatesProposed: number;
    criteriaFailures: number;
  };
  
  tradeLifecycle: {
    tradesOpened: number;
    tradesClosed: number;
    tradesErrored: number;
    stuckTradesDetected: number;
  };
  
  criteriaFailureBreakdown: Record<string, number>;
}

interface AJ18SessionSummary {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes: number;
  mode: 'live' | 'paper';
  
  totalCycles: number;
  cyclesAtMaxPositions: number;
  cyclesWithSignals: number;
  cyclesWithZeroSignals: number;
  
  signalTimeline: {
    minute: number;
    signalsGenerated: number;
    rtbProposed: number;
    criteriaFailures: number;
  }[];
  
  poolStabilityOverTime: {
    minute: number;
    avgPoolSize: number;
    avgEvaluated: number;
    avgSkipped: number;
  }[];
  
  maxPositionsSuppression: {
    totalSkipEvents: number;
    cyclesWithFullEvaluation: number;
    avgSymbolsEvaluatedWhenNotAtMax: number;
  };
  
  tradeLifecycleSummary: {
    totalOpened: number;
    totalClosed: number;
    totalErrors: number;
    stuckTrades: number;
    avgHoldingMinutes: number;
  };
  
  topCriteriaFailures: { reason: string; count: number }[];
  
  diagnosis: string[];
}

class AJ18RTBDiagnosticService {
  private static instance: AJ18RTBDiagnosticService;
  
  private currentCycleId: string = '';
  private cycleCounter: number = 0;
  private sessionStartTime: Date | null = null;
  private mode: 'live' | 'paper' = 'paper';
  
  private maxPositionsEvents: MaxPositionsEvent[] = [];
  private poolStateLogs: PoolStateLog[] = [];
  private criteriaFailLogs: CriteriaFailLog[] = [];
  private tradeLifecycleEvents: TradeLifecycleEvent[] = [];
  private cycleSnapshots: AJ18CycleSnapshot[] = [];
  
  private currentCycleStats = {
    symbolsEvaluated: 0,
    symbolsSkipped: 0,
    skipReasons: {} as Record<string, number>,
    signalsGenerated: 0,
    rtbProposed: 0,
    criteriaFailures: 0,
    criteriaFailureBreakdown: {} as Record<string, number>,
    tradesOpened: 0,
    tradesClosed: 0,
    tradesErrored: 0,
    stuckTradesDetected: 0,
  };
  
  private readonly MAX_LOGS_PER_TYPE = 2000;
  
  private constructor() {}
  
  static getInstance(): AJ18RTBDiagnosticService {
    if (!AJ18RTBDiagnosticService.instance) {
      AJ18RTBDiagnosticService.instance = new AJ18RTBDiagnosticService();
    }
    return AJ18RTBDiagnosticService.instance;
  }
  
  startSession(mode: 'live' | 'paper'): void {
    this.mode = mode;
    this.sessionStartTime = new Date();
    this.cycleCounter = 0;
    this.resetLogs();
    
    console.log(`[AJ18][SESSION_START] mode=${mode} | timestamp=${this.sessionStartTime.toISOString()}`);
  }
  
  startCycle(mode: 'live' | 'paper'): string {
    this.cycleCounter++;
    this.currentCycleId = `${mode}_aj18_cycle_${this.cycleCounter}_${Date.now()}`;
    
    this.currentCycleStats = {
      symbolsEvaluated: 0,
      symbolsSkipped: 0,
      skipReasons: {},
      signalsGenerated: 0,
      rtbProposed: 0,
      criteriaFailures: 0,
      criteriaFailureBreakdown: {},
      tradesOpened: 0,
      tradesClosed: 0,
      tradesErrored: 0,
      stuckTradesDetected: 0,
    };
    
    return this.currentCycleId;
  }
  
  getCycleId(): string {
    return this.currentCycleId;
  }
  
  logMaxPositionsSkip(data: {
    cycleId: string;
    openPositions: number;
    maxPositions: number;
    reason: string;
  }): void {
    const event: MaxPositionsEvent = {
      cycleId: data.cycleId,
      timestamp: new Date(),
      eventType: 'SKIP',
      openPositions: data.openPositions,
      maxPositions: data.maxPositions,
      skippedReason: data.reason,
    };
    
    this.maxPositionsEvents.push(event);
    this.trimLogs('maxPositionsEvents');
    
    console.log(`[AJ18][MAX_POSITIONS_SKIP] openPositions=${data.openPositions} | maxPositions=${data.maxPositions} | reason="${data.reason}" | cycleId=${data.cycleId}`);
  }
  
  logMaxPositionsEvaluation(data: {
    cycleId: string;
    openPositions: number;
    maxPositions: number;
    symbolsEvaluated: number;
    rtbGenerated: number;
  }): void {
    const event: MaxPositionsEvent = {
      cycleId: data.cycleId,
      timestamp: new Date(),
      eventType: 'EVALUATION',
      openPositions: data.openPositions,
      maxPositions: data.maxPositions,
      symbolsEvaluated: data.symbolsEvaluated,
      rtbGenerated: data.rtbGenerated,
    };
    
    this.maxPositionsEvents.push(event);
    this.trimLogs('maxPositionsEvents');
    
    console.log(`[AJ18][MAX_POSITIONS_EVALUATION] symbolsEvaluated=${data.symbolsEvaluated} | rtbGenerated=${data.rtbGenerated} | openPositions=${data.openPositions}/${data.maxPositions} | cycleId=${data.cycleId}`);
  }
  
  logPoolState(data: {
    cycleId: string;
    activePoolSize: number;
    symbolsEvaluated: number;
    symbolsSkipped: number;
    skipReasons: Record<string, number>;
    rtbCandidatesProposed: number;
  }): void {
    const log: PoolStateLog = {
      cycleId: data.cycleId,
      timestamp: new Date(),
      activePoolSize: data.activePoolSize,
      symbolsEvaluatedThisCycle: data.symbolsEvaluated,
      symbolsSkipped: data.symbolsSkipped,
      skipReasons: data.skipReasons,
      rtbCandidatesProposed: data.rtbCandidatesProposed,
    };
    
    this.poolStateLogs.push(log);
    this.trimLogs('poolStateLogs');
    
    this.currentCycleStats.symbolsEvaluated = data.symbolsEvaluated;
    this.currentCycleStats.symbolsSkipped = data.symbolsSkipped;
    this.currentCycleStats.skipReasons = data.skipReasons;
    this.currentCycleStats.rtbProposed = data.rtbCandidatesProposed;
    
    const skipSummary = Object.entries(data.skipReasons)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ') || 'none';
    
    console.log(`[AJ18][POOL_STATE] activePoolSize=${data.activePoolSize} | evaluated=${data.symbolsEvaluated} | skipped=${data.symbolsSkipped} (${skipSummary}) | rtbProposed=${data.rtbCandidatesProposed} | cycleId=${data.cycleId}`);
  }
  
  logCriteriaFail(data: {
    cycleId: string;
    symbol: string;
    strategy: string;
    specificReason: string;
    indicators?: Record<string, any>;
  }): void {
    const failureKey = `${data.strategy}.${data.specificReason}`;
    
    const log: CriteriaFailLog = {
      cycleId: data.cycleId,
      timestamp: new Date(),
      symbol: data.symbol,
      strategy: data.strategy,
      failureReason: failureKey,
      indicators: data.indicators,
    };
    
    this.criteriaFailLogs.push(log);
    this.trimLogs('criteriaFailLogs');
    
    this.currentCycleStats.criteriaFailures++;
    const currentCount = this.currentCycleStats.criteriaFailureBreakdown[failureKey] || 0;
    this.currentCycleStats.criteriaFailureBreakdown[failureKey] = currentCount + 1;
    
    console.log(`[AJ18][CRITERIA_FAIL] strategy=${data.strategy} | reason=${data.specificReason} | symbol=${data.symbol} | cycleId=${data.cycleId}`);
  }
  
  logSignalGenerated(data: {
    cycleId: string;
    symbol: string;
    strategy: string;
    confidence: number;
  }): void {
    this.currentCycleStats.signalsGenerated++;
    console.log(`[AJ18][SIGNAL_GENERATED] symbol=${data.symbol} | strategy=${data.strategy} | confidence=${data.confidence.toFixed(2)} | cycleId=${data.cycleId}`);
  }
  
  logTradeLifecycle(data: {
    cycleId: string;
    eventType: 'OPEN' | 'CLOSE' | 'ERROR' | 'STUCK_DETECTED';
    tradeId?: string;
    symbol: string;
    strategy?: string;
    entryPrice?: number;
    exitPrice?: number;
    pnl?: number;
    closeReason?: string;
    errorMessage?: string;
    holdingDurationMinutes?: number;
  }): void {
    const event: TradeLifecycleEvent = {
      cycleId: data.cycleId,
      timestamp: new Date(),
      eventType: data.eventType,
      tradeId: data.tradeId,
      symbol: data.symbol,
      strategy: data.strategy,
      entryPrice: data.entryPrice,
      exitPrice: data.exitPrice,
      pnl: data.pnl,
      closeReason: data.closeReason,
      errorMessage: data.errorMessage,
      holdingDurationMinutes: data.holdingDurationMinutes,
    };
    
    this.tradeLifecycleEvents.push(event);
    this.trimLogs('tradeLifecycleEvents');
    
    switch (data.eventType) {
      case 'OPEN':
        this.currentCycleStats.tradesOpened++;
        break;
      case 'CLOSE':
        this.currentCycleStats.tradesClosed++;
        break;
      case 'ERROR':
        this.currentCycleStats.tradesErrored++;
        break;
      case 'STUCK_DETECTED':
        this.currentCycleStats.stuckTradesDetected++;
        break;
    }
    
    console.log(`[AJ18][TRADE_LIFECYCLE] event=${data.eventType} | tradeId=${data.tradeId || 'N/A'} | symbol=${data.symbol} | strategy=${data.strategy || 'N/A'} | pnl=${data.pnl?.toFixed(2) || 'N/A'} | closeReason=${data.closeReason || 'N/A'} | cycleId=${data.cycleId}`);
  }
  
  captureSnapshot(mode: 'live' | 'paper', data: {
    openPositions: number;
    maxPositions: number;
    activePoolSize: number;
    atMaxCapacity: boolean;
    skippedScanning: boolean;
  }): void {
    const snapshot: AJ18CycleSnapshot = {
      cycleId: this.currentCycleId,
      timestamp: new Date(),
      mode,
      cycleNumber: this.cycleCounter,
      
      maxPositionsState: {
        openPositions: data.openPositions,
        maxPositions: data.maxPositions,
        atMaxCapacity: data.atMaxCapacity,
        skippedScanning: data.skippedScanning,
      },
      
      poolState: {
        activePoolSize: data.activePoolSize,
        symbolsEvaluated: this.currentCycleStats.symbolsEvaluated,
        symbolsSkipped: this.currentCycleStats.symbolsSkipped,
        skipReasons: { ...this.currentCycleStats.skipReasons },
      },
      
      signalState: {
        strategiesEvaluated: this.currentCycleStats.symbolsEvaluated * 9,
        signalsGenerated: this.currentCycleStats.signalsGenerated,
        rtbCandidatesProposed: this.currentCycleStats.rtbProposed,
        criteriaFailures: this.currentCycleStats.criteriaFailures,
      },
      
      tradeLifecycle: {
        tradesOpened: this.currentCycleStats.tradesOpened,
        tradesClosed: this.currentCycleStats.tradesClosed,
        tradesErrored: this.currentCycleStats.tradesErrored,
        stuckTradesDetected: this.currentCycleStats.stuckTradesDetected,
      },
      
      criteriaFailureBreakdown: { ...this.currentCycleStats.criteriaFailureBreakdown },
    };
    
    this.cycleSnapshots.push(snapshot);
    if (this.cycleSnapshots.length > 500) {
      this.cycleSnapshots = this.cycleSnapshots.slice(-300);
    }
    
    console.log(`[AJ18][SNAPSHOT] cycle=${this.cycleCounter} | pool=${data.activePoolSize} | evaluated=${this.currentCycleStats.symbolsEvaluated} | signals=${this.currentCycleStats.signalsGenerated} | rtb=${this.currentCycleStats.rtbProposed} | atMax=${data.atMaxCapacity} | skipped=${data.skippedScanning} | cycleId=${this.currentCycleId}`);
  }
  
  generateSessionSummary(): AJ18SessionSummary {
    const now = new Date();
    const durationMinutes = this.sessionStartTime 
      ? Math.round((now.getTime() - this.sessionStartTime.getTime()) / 60000)
      : 0;
    
    const cyclesAtMax = this.cycleSnapshots.filter(s => s.maxPositionsState.atMaxCapacity).length;
    const cyclesWithSignals = this.cycleSnapshots.filter(s => s.signalState.signalsGenerated > 0).length;
    const cyclesWithZeroSignals = this.cycleSnapshots.filter(s => s.signalState.signalsGenerated === 0 && !s.maxPositionsState.skippedScanning).length;
    
    const signalTimeline = this.buildSignalTimeline();
    const poolStability = this.buildPoolStabilityTimeline();
    
    const skipEvents = this.maxPositionsEvents.filter(e => e.eventType === 'SKIP').length;
    const evalEvents = this.maxPositionsEvents.filter(e => e.eventType === 'EVALUATION');
    const avgEvaluated = evalEvents.length > 0
      ? evalEvents.reduce((sum, e) => sum + (e.symbolsEvaluated || 0), 0) / evalEvents.length
      : 0;
    
    const lifecycleSummary = this.buildLifecycleSummary();
    const topFailures = this.getTopCriteriaFailures(20);
    
    const diagnosis = this.generateDiagnosis({
      cyclesAtMax,
      cyclesWithSignals,
      cyclesWithZeroSignals,
      skipEvents,
      avgEvaluated,
      signalTimeline,
      topFailures,
      lifecycleSummary,
    });
    
    return {
      sessionId: `aj18_${this.sessionStartTime?.toISOString().replace(/[:.]/g, '') || 'unknown'}`,
      startTime: this.sessionStartTime || new Date(),
      endTime: now,
      durationMinutes,
      mode: this.mode,
      
      totalCycles: this.cycleSnapshots.length,
      cyclesAtMaxPositions: cyclesAtMax,
      cyclesWithSignals,
      cyclesWithZeroSignals,
      
      signalTimeline,
      poolStabilityOverTime: poolStability,
      
      maxPositionsSuppression: {
        totalSkipEvents: skipEvents,
        cyclesWithFullEvaluation: evalEvents.length,
        avgSymbolsEvaluatedWhenNotAtMax: Math.round(avgEvaluated),
      },
      
      tradeLifecycleSummary: lifecycleSummary,
      topCriteriaFailures: topFailures,
      diagnosis,
    };
  }
  
  private buildSignalTimeline(): { minute: number; signalsGenerated: number; rtbProposed: number; criteriaFailures: number }[] {
    if (!this.sessionStartTime || this.cycleSnapshots.length === 0) return [];
    
    const timeline: Map<number, { signals: number; rtb: number; failures: number }> = new Map();
    
    for (const snapshot of this.cycleSnapshots) {
      const minutesSinceStart = Math.floor(
        (snapshot.timestamp.getTime() - this.sessionStartTime.getTime()) / 60000
      );
      
      const existing = timeline.get(minutesSinceStart) || { signals: 0, rtb: 0, failures: 0 };
      existing.signals += snapshot.signalState.signalsGenerated;
      existing.rtb += snapshot.signalState.rtbCandidatesProposed;
      existing.failures += snapshot.signalState.criteriaFailures;
      timeline.set(minutesSinceStart, existing);
    }
    
    return Array.from(timeline.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minute, data]) => ({
        minute,
        signalsGenerated: data.signals,
        rtbProposed: data.rtb,
        criteriaFailures: data.failures,
      }));
  }
  
  private buildPoolStabilityTimeline(): { minute: number; avgPoolSize: number; avgEvaluated: number; avgSkipped: number }[] {
    if (!this.sessionStartTime || this.cycleSnapshots.length === 0) return [];
    
    const timeline: Map<number, { pools: number[]; evaluated: number[]; skipped: number[] }> = new Map();
    
    for (const snapshot of this.cycleSnapshots) {
      const minutesSinceStart = Math.floor(
        (snapshot.timestamp.getTime() - this.sessionStartTime.getTime()) / 60000
      );
      
      const existing = timeline.get(minutesSinceStart) || { pools: [], evaluated: [], skipped: [] };
      existing.pools.push(snapshot.poolState.activePoolSize);
      existing.evaluated.push(snapshot.poolState.symbolsEvaluated);
      existing.skipped.push(snapshot.poolState.symbolsSkipped);
      timeline.set(minutesSinceStart, existing);
    }
    
    return Array.from(timeline.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minute, data]) => ({
        minute,
        avgPoolSize: Math.round(data.pools.reduce((a, b) => a + b, 0) / data.pools.length),
        avgEvaluated: Math.round(data.evaluated.reduce((a, b) => a + b, 0) / data.evaluated.length),
        avgSkipped: Math.round(data.skipped.reduce((a, b) => a + b, 0) / data.skipped.length),
      }));
  }
  
  private buildLifecycleSummary(): AJ18SessionSummary['tradeLifecycleSummary'] {
    const opened = this.tradeLifecycleEvents.filter(e => e.eventType === 'OPEN').length;
    const closed = this.tradeLifecycleEvents.filter(e => e.eventType === 'CLOSE');
    const errors = this.tradeLifecycleEvents.filter(e => e.eventType === 'ERROR').length;
    const stuck = this.tradeLifecycleEvents.filter(e => e.eventType === 'STUCK_DETECTED').length;
    
    const holdingTimes = closed
      .filter(e => e.holdingDurationMinutes !== undefined)
      .map(e => e.holdingDurationMinutes!);
    
    const avgHolding = holdingTimes.length > 0
      ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
      : 0;
    
    return {
      totalOpened: opened,
      totalClosed: closed.length,
      totalErrors: errors,
      stuckTrades: stuck,
      avgHoldingMinutes: Math.round(avgHolding * 10) / 10,
    };
  }
  
  private getTopCriteriaFailures(limit: number): { reason: string; count: number }[] {
    const failureCounts: Record<string, number> = {};
    
    for (const log of this.criteriaFailLogs) {
      const current = failureCounts[log.failureReason] || 0;
      failureCounts[log.failureReason] = current + 1;
    }
    
    return Object.entries(failureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([reason, count]) => ({ reason, count }));
  }
  
  private generateDiagnosis(data: {
    cyclesAtMax: number;
    cyclesWithSignals: number;
    cyclesWithZeroSignals: number;
    skipEvents: number;
    avgEvaluated: number;
    signalTimeline: { minute: number; signalsGenerated: number }[];
    topFailures: { reason: string; count: number }[];
    lifecycleSummary: AJ18SessionSummary['tradeLifecycleSummary'];
  }): string[] {
    const diagnosis: string[] = [];
    
    if (data.skipEvents > 0) {
      const pct = ((data.skipEvents / this.cycleSnapshots.length) * 100).toFixed(1);
      diagnosis.push(`MAX_POSITIONS_SUPPRESSION: ${data.skipEvents} cycles (${pct}%) skipped scanning due to max positions. This directly reduces RTB flow.`);
    }
    
    if (data.signalTimeline.length > 5) {
      const first5 = data.signalTimeline.slice(0, 5);
      const rest = data.signalTimeline.slice(5);
      
      const earlySignals = first5.reduce((sum, t) => sum + t.signalsGenerated, 0);
      const laterSignals = rest.reduce((sum, t) => sum + t.signalsGenerated, 0);
      
      if (earlySignals > 0 && laterSignals === 0) {
        diagnosis.push(`SIGNAL_STARVATION: All ${earlySignals} signals generated in first 5 minutes. Zero signals in remaining ${rest.length} minutes. Strategies stopped finding opportunities.`);
      } else if (earlySignals > laterSignals * 3) {
        diagnosis.push(`SIGNAL_DECAY: ${earlySignals} signals in first 5 min vs ${laterSignals} in remaining session. Significant decay observed.`);
      }
    }
    
    if (data.topFailures.length > 0) {
      const topFailure = data.topFailures[0];
      const totalFailures = data.topFailures.reduce((sum, f) => sum + f.count, 0);
      const topPct = ((topFailure.count / totalFailures) * 100).toFixed(1);
      
      diagnosis.push(`TOP_CRITERIA_FAILURE: "${topFailure.reason}" accounts for ${topPct}% of all failures (${topFailure.count}/${totalFailures}). Consider relaxing this criterion.`);
      
      if (data.topFailures.length >= 3) {
        const top3 = data.topFailures.slice(0, 3);
        const top3Total = top3.reduce((sum, f) => sum + f.count, 0);
        const top3Pct = ((top3Total / totalFailures) * 100).toFixed(1);
        
        diagnosis.push(`CRITERIA_CONCENTRATION: Top 3 failures account for ${top3Pct}% of all failures: ${top3.map(f => f.reason).join(', ')}.`);
      }
    }
    
    if (data.lifecycleSummary.stuckTrades > 0) {
      diagnosis.push(`STUCK_TRADES_DETECTED: ${data.lifecycleSummary.stuckTrades} trades appear stuck (open longer than expected). This may affect position slots.`);
    }
    
    if (data.lifecycleSummary.totalErrors > 0) {
      diagnosis.push(`TRADE_ERRORS: ${data.lifecycleSummary.totalErrors} trade execution errors occurred. Check error logs for details.`);
    }
    
    const signalRate = this.cycleSnapshots.length > 0
      ? (data.cyclesWithSignals / this.cycleSnapshots.length) * 100
      : 0;
    
    if (signalRate < 10) {
      diagnosis.push(`LOW_SIGNAL_RATE: Only ${signalRate.toFixed(1)}% of cycles produced signals. Strategies are highly restrictive for current market conditions.`);
    }
    
    if (diagnosis.length === 0) {
      diagnosis.push('No obvious starvation cause detected. RTB flow may be normal for current market conditions.');
    }
    
    return diagnosis;
  }
  
  generateReport(): string {
    const summary = this.generateSessionSummary();
    
    let report = `# Phase 8.8.3-AJ18: RTB Starvation Root-Cause Investigation Report\n\n`;
    report += `**Session ID:** ${summary.sessionId}\n`;
    report += `**Mode:** ${summary.mode}\n`;
    report += `**Start Time:** ${summary.startTime.toISOString()}\n`;
    report += `**End Time:** ${summary.endTime?.toISOString() || 'N/A'}\n`;
    report += `**Duration:** ${summary.durationMinutes} minutes\n\n`;
    report += `---\n\n`;
    
    report += `## A. Did Max Positions Suppress Scanning?\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Total Cycles | ${summary.totalCycles} |\n`;
    report += `| Cycles at Max Positions | ${summary.cyclesAtMaxPositions} |\n`;
    report += `| Skip Events (Early Exit) | ${summary.maxPositionsSuppression.totalSkipEvents} |\n`;
    report += `| Cycles with Full Evaluation | ${summary.maxPositionsSuppression.cyclesWithFullEvaluation} |\n`;
    report += `| Avg Symbols Evaluated (When Not at Max) | ${summary.maxPositionsSuppression.avgSymbolsEvaluatedWhenNotAtMax} |\n\n`;
    
    if (summary.maxPositionsSuppression.totalSkipEvents > 0) {
      report += `**FINDING:** ${summary.maxPositionsSuppression.totalSkipEvents} cycles skipped scanning entirely due to max positions reached.\n\n`;
    } else {
      report += `**FINDING:** Max positions did NOT suppress scanning. All cycles evaluated symbols normally.\n\n`;
    }
    
    report += `## B. Did the Active Pool Shrink Incorrectly?\n\n`;
    report += `| Minute | Avg Pool Size | Avg Evaluated | Avg Skipped |\n`;
    report += `|--------|---------------|---------------|-------------|\n`;
    
    for (const entry of summary.poolStabilityOverTime.slice(0, 20)) {
      report += `| ${entry.minute} | ${entry.avgPoolSize} | ${entry.avgEvaluated} | ${entry.avgSkipped} |\n`;
    }
    
    if (summary.poolStabilityOverTime.length > 0) {
      const firstPool = summary.poolStabilityOverTime[0].avgPoolSize;
      const lastPool = summary.poolStabilityOverTime[summary.poolStabilityOverTime.length - 1].avgPoolSize;
      const change = ((lastPool - firstPool) / firstPool * 100).toFixed(1);
      report += `\n**Pool Stability:** Started at ${firstPool}, ended at ${lastPool} (${change}% change).\n\n`;
    }
    
    report += `## C. Strategy Criteria Failure Breakdown\n\n`;
    report += `| Failure Reason | Count |\n`;
    report += `|----------------|-------|\n`;
    
    for (const { reason, count } of summary.topCriteriaFailures) {
      report += `| ${reason} | ${count} |\n`;
    }
    
    report += `\n`;
    
    report += `## D. Trade Lifecycle Anomalies\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Trades Opened | ${summary.tradeLifecycleSummary.totalOpened} |\n`;
    report += `| Trades Closed | ${summary.tradeLifecycleSummary.totalClosed} |\n`;
    report += `| Trade Errors | ${summary.tradeLifecycleSummary.totalErrors} |\n`;
    report += `| Stuck Trades Detected | ${summary.tradeLifecycleSummary.stuckTrades} |\n`;
    report += `| Avg Holding Time (min) | ${summary.tradeLifecycleSummary.avgHoldingMinutes} |\n\n`;
    
    if (summary.tradeLifecycleSummary.stuckTrades > 0) {
      report += `**WARNING:** ${summary.tradeLifecycleSummary.stuckTrades} stuck trades detected. These may be blocking position slots.\n\n`;
    }
    
    report += `## E. Signal Timeline Correlation\n\n`;
    report += `### First 5 Minutes vs Rest of Session\n\n`;
    report += `| Minute | Signals | RTB Proposed | Criteria Failures |\n`;
    report += `|--------|---------|--------------|-------------------|\n`;
    
    for (const entry of summary.signalTimeline) {
      report += `| ${entry.minute} | ${entry.signalsGenerated} | ${entry.rtbProposed} | ${entry.criteriaFailures} |\n`;
    }
    
    report += `\n`;
    
    const first5Signals = summary.signalTimeline.slice(0, 5).reduce((sum, t) => sum + t.signalsGenerated, 0);
    const restSignals = summary.signalTimeline.slice(5).reduce((sum, t) => sum + t.signalsGenerated, 0);
    
    report += `**Summary:** First 5 min: ${first5Signals} signals | Rest of session: ${restSignals} signals\n\n`;
    
    report += `## F. Diagnosis Summary\n\n`;
    
    for (const d of summary.diagnosis) {
      report += `- ${d}\n`;
    }
    
    report += `\n---\n\n`;
    report += `*Report generated by AJ18 RTB Starvation Diagnostic Service*\n`;
    
    return report;
  }
  
  getRecentSnapshots(limit: number = 50): AJ18CycleSnapshot[] {
    return this.cycleSnapshots.slice(-limit);
  }
  
  getPoolStateLogs(): PoolStateLog[] {
    return [...this.poolStateLogs];
  }
  
  getCriteriaFailLogs(): CriteriaFailLog[] {
    return [...this.criteriaFailLogs];
  }
  
  getTradeLifecycleEvents(): TradeLifecycleEvent[] {
    return [...this.tradeLifecycleEvents];
  }
  
  getMaxPositionsEvents(): MaxPositionsEvent[] {
    return [...this.maxPositionsEvents];
  }
  
  private resetLogs(): void {
    this.maxPositionsEvents = [];
    this.poolStateLogs = [];
    this.criteriaFailLogs = [];
    this.tradeLifecycleEvents = [];
    this.cycleSnapshots = [];
    this.cycleCounter = 0;
    this.currentCycleId = '';
  }
  
  private trimLogs(logType: 'maxPositionsEvents' | 'poolStateLogs' | 'criteriaFailLogs' | 'tradeLifecycleEvents'): void {
    const arr = this[logType];
    if (arr.length > this.MAX_LOGS_PER_TYPE) {
      (this[logType] as any[]) = arr.slice(-Math.floor(this.MAX_LOGS_PER_TYPE / 2));
    }
  }
}

export const aj18Diagnostic = AJ18RTBDiagnosticService.getInstance();
export type { 
  MaxPositionsEvent, 
  PoolStateLog, 
  CriteriaFailLog, 
  TradeLifecycleEvent, 
  AJ18CycleSnapshot,
  AJ18SessionSummary 
};
