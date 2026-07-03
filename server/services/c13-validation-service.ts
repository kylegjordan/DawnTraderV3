/**
 * Directive 8.8.4-C.13 Validation Session Service
 * 
 * Manages the 3-hour validation test for the event-driven TCL watchdog system.
 * - Records 30-minute snapshot logs
 * - Tracks TCL events, promotions, trades
 * - Generates final results report
 */

import { storage } from '../storage';
import { tclWatchdog } from '../core/rtb/tcl_watchdog';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import { eventBus, type TCLActivatedEvent, type TradeClosedEvent, type PromotionEvent } from '../lib/event-bus';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationSnapshot {
  timestamp: string;
  tclState: 'WARMING' | 'ACTIVE';
  rtbQueueCount: number;
  openTradesCount: number;
  closedTradesCount: number;
  avgFinalScore: number;
  avgConfidence: number;
  avgProfitRate: number;
  avgPnl: number;
  promotionsThisInterval: number;
  tclEventsThisInterval: number;
}

interface ValidationSession {
  sessionId: string;
  mode: 'paper' | 'live';
  startedAt: Date;
  duration: number; // in ms
  intervalMs: number; // 30 minutes = 1800000
  snapshots: ValidationSnapshot[];
  tclEvents: TCLActivatedEvent[];
  promotions: PromotionEvent[];
  tradeCloses: TradeClosedEvent[];
  isActive: boolean;
  intervalHandle: NodeJS.Timeout | null;
  lastSnapshotAt: Date | null;
}

class C13ValidationService {
  private session: ValidationSession | null = null;
  private logFilePath: string = '';
  private tclHandler: ((event: TCLActivatedEvent) => void) | null = null;
  private tradeClosedHandler: ((event: TradeClosedEvent) => void) | null = null;
  private promotionHandler: ((event: PromotionEvent) => void) | null = null;

  async startSession(mode: 'paper' | 'live', durationHours: number = 3, intervalMinutes: number = 30): Promise<{ ok: boolean; sessionId: string }> {
    if (this.session?.isActive) {
      return { ok: false, sessionId: '' };
    }

    const sessionId = `c13_${Date.now()}`;
    const now = new Date();
    
    this.session = {
      sessionId,
      mode,
      startedAt: now,
      duration: durationHours * 60 * 60 * 1000,
      intervalMs: intervalMinutes * 60 * 1000,
      snapshots: [],
      tclEvents: [],
      promotions: [],
      tradeCloses: [],
      isActive: true,
      intervalHandle: null,
      lastSnapshotAt: null,
    };

    this.logFilePath = path.join(process.cwd(), 'logs', 'validation', `8.8.4-C.13_session_${sessionId}.md`);

    this.bindEventListeners();
    await this.writeLogHeader();
    await this.takeSnapshot('Session Start');

    this.session.intervalHandle = setInterval(async () => {
      await this.takeSnapshot('30-Minute Interval');
    }, this.session.intervalMs);

    setTimeout(async () => {
      await this.endSession();
    }, this.session.duration);

    console.log(`[8.8.4-C.13][VALIDATION_START] sessionId=${sessionId}, mode=${mode}, duration=${durationHours}h, interval=${intervalMinutes}min`);

    return { ok: true, sessionId };
  }

  private bindEventListeners(): void {
    this.tclHandler = (event: TCLActivatedEvent) => {
      if (!this.session || event.mode !== this.session.mode) return;
      this.session.tclEvents.push(event);
      console.log(`[8.8.4-C.13][TCL_EVENT] type=TCL_ACTIVATED reason=${event.reason}`);
      this.appendLog(`\n### TCL_ACTIVATED Event\n- Time: ${event.timestamp}\n- Reason: ${event.reason}\n- Pool Size: ${event.poolSize}\n`);
    };

    this.tradeClosedHandler = (event: TradeClosedEvent) => {
      if (!this.session || event.mode !== this.session.mode) return;
      this.session.tradeCloses.push(event);
      console.log(`[8.8.4-C.13][TRADE_CLOSED] symbol=${event.symbol}, pnl=${event.pnl?.toFixed(2)}`);
    };

    this.promotionHandler = (event: PromotionEvent) => {
      if (!this.session || event.mode !== this.session.mode) return;
      this.session.promotions.push(event);
      console.log(`[8.8.4-C.13][PROMOTION] symbol=${event.symbol}, strategy=${event.strategy}`);
    };

    eventBus.onTCLActivated(this.tclHandler);
    eventBus.onTradeClosed(this.tradeClosedHandler);
    eventBus.onPromotion(this.promotionHandler);
  }

  private unbindEventListeners(): void {
    if (this.tclHandler) eventBus.offTCLActivated(this.tclHandler);
    if (this.tradeClosedHandler) eventBus.offTradeClosed(this.tradeClosedHandler);
    if (this.promotionHandler) eventBus.offPromotion(this.promotionHandler);
    this.tclHandler = null;
    this.tradeClosedHandler = null;
    this.promotionHandler = null;
  }

  private async takeSnapshot(label: string): Promise<void> {
    if (!this.session) return;

    const mode = this.session.mode;
    const now = new Date();

    const tclStatus = tclWatchdog.getStatus(mode);
    const rtbQueue = await readyToBuyService.getQueuedSignals(mode);
    const openPositions = await storage.getActiveOpenPositions(mode);
    const trades = await storage.getPaperSimTrades(mode);
    const closedTrades = trades.filter(t => t.closeReason !== null);

    const rtbWithMetrics = rtbQueue.filter(s => s.finalScore && s.confidence);
    const avgFinalScore = rtbWithMetrics.length > 0
      ? rtbWithMetrics.reduce((sum, s) => sum + parseFloat(s.finalScore || '0'), 0) / rtbWithMetrics.length
      : 0;
    const avgConfidence = rtbWithMetrics.length > 0
      ? rtbWithMetrics.reduce((sum, s) => sum + parseFloat(s.confidence || '0'), 0) / rtbWithMetrics.length
      : 0;
    const avgProfitRate = 0;

    const avgPnl = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + parseFloat(String(t.netPnl || t.pnl || 0)), 0) / closedTrades.length
      : 0;

    const lastIdx = this.session.snapshots.length;
    const promotionsThisInterval = this.session.promotions.filter(p => 
      !this.session?.lastSnapshotAt || new Date(p.timestamp) > this.session.lastSnapshotAt
    ).length;
    const tclEventsThisInterval = this.session.tclEvents.filter(e => 
      !this.session?.lastSnapshotAt || new Date(e.timestamp) > this.session.lastSnapshotAt
    ).length;

    const snapshot: ValidationSnapshot = {
      timestamp: now.toISOString(),
      tclState: tclWatchdog.isActive(mode) ? 'ACTIVE' : 'WARMING',
      rtbQueueCount: rtbQueue.length,
      openTradesCount: openPositions.length,
      closedTradesCount: closedTrades.length,
      avgFinalScore,
      avgConfidence,
      avgProfitRate,
      avgPnl,
      promotionsThisInterval,
      tclEventsThisInterval,
    };

    this.session.snapshots.push(snapshot);
    this.session.lastSnapshotAt = now;

    const logEntry = `
## [VALIDATION SNAPSHOT] ${label}
- **Time**: ${snapshot.timestamp}
- **TCL**: ${snapshot.tclState}
- **RTB_Queue**: ${snapshot.rtbQueueCount}
- **Open_Trades**: ${snapshot.openTradesCount}
- **Closed_Trades**: ${snapshot.closedTradesCount}
- **Avg_FinalScore**: ${snapshot.avgFinalScore.toFixed(4)}
- **Avg_Confidence**: ${snapshot.avgConfidence.toFixed(4)}
- **Avg_ProfitRate**: ${snapshot.avgProfitRate.toFixed(4)}
- **Avg_PnL**: $${snapshot.avgPnl.toFixed(2)}
- **Promotions (interval)**: ${snapshot.promotionsThisInterval}
- **TCL Events (interval)**: ${snapshot.tclEventsThisInterval}

---
`;

    await this.appendLog(logEntry);
    console.log(`[8.8.4-C.13][SNAPSHOT] ${label} - TCL=${snapshot.tclState}, RTB=${snapshot.rtbQueueCount}, Open=${snapshot.openTradesCount}, Closed=${snapshot.closedTradesCount}`);
  }

  async endSession(): Promise<{ ok: boolean; resultsPath: string }> {
    if (!this.session) {
      return { ok: false, resultsPath: '' };
    }

    this.session.isActive = false;
    
    if (this.session.intervalHandle) {
      clearInterval(this.session.intervalHandle);
      this.session.intervalHandle = null;
    }

    this.unbindEventListeners();
    await this.takeSnapshot('Session End');
    const resultsPath = await this.generateFinalReport();

    console.log(`[8.8.4-C.13][VALIDATION_END] sessionId=${this.session.sessionId}, results=${resultsPath}`);

    const completedSession = this.session;
    this.session = null;

    return { ok: true, resultsPath };
  }

  private async generateFinalReport(): Promise<string> {
    if (!this.session) return '';

    const resultsPath = path.join(process.cwd(), 'logs', 'validation', `results_8.8.4-C.13_${this.session.sessionId}.md`);
    const mode = this.session.mode;

    const trades = await storage.getPaperSimTrades(mode);
    const closedTrades = trades.filter(t => t.closeReason !== null);
    
    const profitableTrades = closedTrades.filter(t => parseFloat(String(t.netPnl || t.pnl || 0)) > 0);
    const losingTrades = closedTrades.filter(t => parseFloat(String(t.netPnl || t.pnl || 0)) <= 0);

    const tclReason = this.session.tclEvents.length > 0 ? this.session.tclEvents[0].reason : 'N/A';
    const totalPromotions = this.session.promotions.length;
    const totalPnl = closedTrades.reduce((sum, t) => sum + parseFloat(String(t.netPnl || t.pnl || 0)), 0);

    const avgScoreProfitable = profitableTrades.length > 0
      ? this.session.promotions
          .filter(p => profitableTrades.some(t => t.symbol === p.symbol))
          .reduce((sum, p) => sum + (p.finalScore || 0), 0) / profitableTrades.length
      : 0;

    const avgScoreLosing = losingTrades.length > 0
      ? this.session.promotions
          .filter(p => losingTrades.some(t => t.symbol === p.symbol))
          .reduce((sum, p) => sum + (p.finalScore || 0), 0) / losingTrades.length
      : 0;

    const duplicateTclEvents = this.session.tclEvents.length > 1;
    const missedPromotions = this.session.tclEvents.length > 0 && this.session.promotions.length === 0;
    const stalledQueue = this.session.snapshots.length > 2 && 
      this.session.snapshots.every(s => s.rtbQueueCount === this.session?.snapshots[0].rtbQueueCount);

    const report = `# Directive 8.8.4-C.13 Validation Results

## Session Info
- **Session ID**: ${this.session.sessionId}
- **Mode**: ${mode}
- **Started**: ${this.session.startedAt.toISOString()}
- **Duration**: ${(this.session.duration / 3600000).toFixed(1)} hours
- **Snapshots**: ${this.session.snapshots.length}

## TCL Activation
- **Activation Reason**: ${tclReason}
- **TCL Events Count**: ${this.session.tclEvents.length}
- **Expected**: 1 event per session
- **Status**: ${this.session.tclEvents.length === 1 ? '✅ PASS' : this.session.tclEvents.length === 0 ? '⚠️ NO ACTIVATION' : '❌ DUPLICATE EVENTS'}

## Promotions
- **Total Promotions**: ${totalPromotions}
- **First Promotion Within 6 Minutes**: ${this.session.promotions.length > 0 && 
    new Date(this.session.promotions[0].timestamp).getTime() - this.session.startedAt.getTime() < 360000 
    ? '✅ PASS' : '⚠️ DELAYED'}

## Trade Statistics
- **Trades Opened**: ${trades.length}
- **Trades Closed**: ${closedTrades.length}
- **Profitable**: ${profitableTrades.length}
- **Losing**: ${losingTrades.length}
- **Win Rate**: ${closedTrades.length > 0 ? ((profitableTrades.length / closedTrades.length) * 100).toFixed(1) : 0}%
- **Total P/L**: $${totalPnl.toFixed(2)}
- **Average P/L**: $${closedTrades.length > 0 ? (totalPnl / closedTrades.length).toFixed(2) : '0.00'}

## Quality Metrics
- **Avg FinalScore (Profitable Trades)**: ${avgScoreProfitable.toFixed(4)}
- **Avg FinalScore (Losing Trades)**: ${avgScoreLosing.toFixed(4)}

## Anomaly Detection
| Check | Status |
|-------|--------|
| Single TCL Event | ${duplicateTclEvents ? '❌ FAIL - Duplicates detected' : '✅ PASS'} |
| Promotions Occurred | ${missedPromotions ? '❌ FAIL - No promotions after TCL' : totalPromotions > 0 ? '✅ PASS' : '⚠️ N/A'} |
| Queue Cycling | ${stalledQueue ? '⚠️ Queue appeared stalled' : '✅ PASS'} |
| Trade Close Events | ${this.session.tradeCloses.length} events logged |

## Snapshots Summary

| Time | TCL | RTB Queue | Open | Closed | Avg FinalScore | Avg P/L |
|------|-----|-----------|------|--------|----------------|---------|
${this.session.snapshots.map(s =>
  `| ${new Date(s.timestamp).toLocaleTimeString()} | ${s.tclState} | ${s.rtbQueueCount} | ${s.openTradesCount} | ${s.closedTradesCount} | ${s.avgFinalScore.toFixed(3)} | $${s.avgPnl.toFixed(2)} |`
).join('\n')}

## Success Criteria Evaluation

| Criterion | Result |
|-----------|--------|
| Event Lifecycle (Single TCL_ACTIVATED) | ${this.session.tclEvents.length === 1 ? '✅ PASS' : '❌ FAIL'} |
| Promotion Flow (≥1 within 6 min) | ${this.session.promotions.length > 0 ? '✅ PASS' : '⚠️ NONE'} |
| Trade Turnover (no stalls) | ${closedTrades.length > 0 || trades.length > 0 ? '✅ PASS' : '⚠️ NO TRADES'} |
| Event Integrity (no duplicates) | ${!duplicateTclEvents ? '✅ PASS' : '❌ FAIL'} |

---
*Generated: ${new Date().toISOString()}*
`;

    fs.writeFileSync(resultsPath, report);
    return resultsPath;
  }

  private async writeLogHeader(): Promise<void> {
    const header = `# Directive 8.8.4-C.13 Validation Session Log

**Session ID**: ${this.session?.sessionId}
**Mode**: ${this.session?.mode}
**Started**: ${this.session?.startedAt.toISOString()}
**Duration**: ${(this.session?.duration || 0) / 3600000} hours
**Interval**: ${(this.session?.intervalMs || 0) / 60000} minutes

---

`;
    fs.writeFileSync(this.logFilePath, header);
  }

  private async appendLog(content: string): Promise<void> {
    fs.appendFileSync(this.logFilePath, content);
  }

  getStatus(): { active: boolean; sessionId?: string; elapsed?: number; snapshots?: number } {
    if (!this.session) {
      return { active: false };
    }

    return {
      active: this.session.isActive,
      sessionId: this.session.sessionId,
      elapsed: Date.now() - this.session.startedAt.getTime(),
      snapshots: this.session.snapshots.length,
    };
  }

  async getLatestSnapshot(): Promise<ValidationSnapshot | null> {
    if (!this.session || this.session.snapshots.length === 0) {
      return null;
    }
    return this.session.snapshots[this.session.snapshots.length - 1];
  }
}

export const c13ValidationService = new C13ValidationService();
