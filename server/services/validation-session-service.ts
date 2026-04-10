/**
 * Phase 8.8.4-C.11 Validation Session Service
 * 
 * Manages 3-hour validation sessions with:
 * - 30-minute periodic status reports
 * - Post-session summary with correlations
 * - Metrics tracking for RTB queue, trades, PnL
 */

import { storage } from '../storage.js';
import type { RtbSignal, PaperSimOpenPosition, PaperSimTrade } from '@shared/schema.js';

type TradingMode = 'paper' | 'live';

interface SessionMetrics {
  timestamp: Date;
  rtbQueueSize: number;
  openTrades: number;
  closedTrades: number;
  avgPnL: number;
  winRate: number;
}

interface ValidationSession {
  startTime: Date;
  endTime?: Date;
  mode: TradingMode;
  duration: number;
  reports: SessionMetrics[];
  isActive: boolean;
}

class ValidationSessionService {
  private currentSession: ValidationSession | null = null;
  private reportInterval: NodeJS.Timeout | null = null;
  private readonly REPORT_INTERVAL_MS = 30 * 60 * 1000;

  async startSession(mode: TradingMode, durationHours: number = 3): Promise<void> {
    if (this.currentSession?.isActive) {
      console.log('[8.8.4-C.11][SESSION] Session already active, stopping first');
      await this.stopSession();
    }

    this.currentSession = {
      startTime: new Date(),
      mode,
      duration: durationHours,
      reports: [],
      isActive: true,
    };

    console.log(`[8.8.4-C.11][SESSION_START] mode=${mode} duration=${durationHours}h`);

    this.reportInterval = setInterval(() => {
      this.generateStatusReport().catch((err: Error) => {
        console.error('[8.8.4-C.11][REPORT_ERROR]', err);
      });
    }, this.REPORT_INTERVAL_MS);

    setTimeout(() => {
      this.stopSession().catch((err: Error) => {
        console.error('[8.8.4-C.11][SESSION_END_ERROR]', err);
      });
    }, durationHours * 60 * 60 * 1000);

    await this.generateStatusReport();
  }

  async generateStatusReport(): Promise<SessionMetrics | null> {
    if (!this.currentSession?.isActive) {
      return null;
    }

    const mode = this.currentSession.mode;

    try {
      const [rtbSignals, openPositions, closedTrades] = await Promise.all([
        storage.getRtbSignals({ mode, status: 'active' }),
        storage.getPaperSimOpenPositions(mode),
        storage.getPaperSimTrades(mode, { limit: 1000, closedOnly: true }),
      ]);

      const pnlValues = closedTrades.map((t: PaperSimTrade) => parseFloat(String(t.netPnl || t.pnl || 0)));
      const avgPnL = pnlValues.length > 0 ? pnlValues.reduce((a: number, b: number) => a + b, 0) / pnlValues.length : 0;

      const wins = pnlValues.filter((p: number) => p > 0).length;
      const winRate = pnlValues.length > 0 ? (wins / pnlValues.length) * 100 : 0;

      const metrics: SessionMetrics = {
        timestamp: new Date(),
        rtbQueueSize: rtbSignals.length,
        openTrades: openPositions.length,
        closedTrades: closedTrades.length,
        avgPnL: Math.round(avgPnL * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
      };

      this.currentSession.reports.push(metrics);

      console.log(`[8.8.4-C.11][STATUS_REPORT] RTB=${metrics.rtbQueueSize} open=${metrics.openTrades} closed=${metrics.closedTrades} avgPnL=$${metrics.avgPnL} winRate=${metrics.winRate}%`);

      return metrics;
    } catch (err) {
      console.error('[8.8.4-C.11][REPORT_ERROR]', err);
      return null;
    }
  }

  async stopSession(): Promise<void> {
    if (!this.currentSession?.isActive) {
      console.log('[8.8.4-C.11][SESSION] No active session to stop');
      return;
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    this.currentSession.endTime = new Date();
    this.currentSession.isActive = false;

    await this.generateSummary();
  }

  private async generateSummary(): Promise<void> {
    if (!this.currentSession) return;

    const mode = this.currentSession.mode;
    const closedTrades = await storage.getPaperSimTrades(mode, { limit: 1000, closedOnly: true });
    const rtbSignals = await storage.getRtbSignals({ mode });



    const pnlValues = closedTrades.map((t: PaperSimTrade) => parseFloat(String(t.netPnl || t.pnl || 0)));
    const totalPnL = pnlValues.reduce((a: number, b: number) => a + b, 0);
    const wins = pnlValues.filter((p: number) => p > 0).length;
    const winRate = pnlValues.length > 0 ? (wins / pnlValues.length) * 100 : 0;

    console.log(`[8.8.4-C.11][SUMMARY] ======================================`);
    console.log(`[8.8.4-C.11][SUMMARY] Session Duration: ${this.currentSession.duration}h`);
    console.log(`[8.8.4-C.11][SUMMARY] Mode: ${mode}`);
    console.log(`[8.8.4-C.11][SUMMARY] Total Reports: ${this.currentSession.reports.length}`);
    console.log(`[8.8.4-C.11][SUMMARY] Trades: ${closedTrades.length}, WinRate: ${winRate.toFixed(1)}%, TotalPnL: $${totalPnL.toFixed(2)}`);
    console.log(`[8.8.4-C.11][SUMMARY] ======================================`);
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  getSessionStatus(): { isActive: boolean; session: ValidationSession | null } {
    return {
      isActive: this.currentSession?.isActive || false,
      session: this.currentSession,
    };
  }

  getLatestReport(): SessionMetrics | null {
    if (!this.currentSession?.reports.length) return null;
    return this.currentSession.reports[this.currentSession.reports.length - 1];
  }

  private sqeDistributionInterval: NodeJS.Timeout | null = null;
  private sqeDistributionCount = 0;

  async startSQEDistributionLogging(mode: TradingMode, intervalMinutes: number = 10, durationMinutes: number = 30): Promise<void> {
    if (this.sqeDistributionInterval) {
      clearInterval(this.sqeDistributionInterval);
    }

    this.sqeDistributionCount = 0;
    const maxReports = Math.floor(durationMinutes / intervalMinutes);

    console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] Starting distribution logging: every ${intervalMinutes}min for ${durationMinutes}min (${maxReports} reports)`);

    await this.logSQEDistribution(mode);
    this.sqeDistributionCount++;

    this.sqeDistributionInterval = setInterval(async () => {
      await this.logSQEDistribution(mode);
      this.sqeDistributionCount++;

      if (this.sqeDistributionCount >= maxReports) {
        console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] Completed ${maxReports} distribution reports`);
        if (this.sqeDistributionInterval) {
          clearInterval(this.sqeDistributionInterval);
          this.sqeDistributionInterval = null;
        }
      }
    }, intervalMinutes * 60 * 1000);
  }

  private async logSQEDistribution(mode: TradingMode): Promise<void> {
    try {
      const rtbSignals = await storage.getRtbSignals({ mode });

      if (rtbSignals.length === 0) {
        console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] No signals in queue`);
        return;
      }

      const riskValues = rtbSignals.map((s: RtbSignal) => parseFloat(String(s.riskScore || 0))).filter((v: number) => !isNaN(v));
      const expectedReturnValues = rtbSignals.map((s: RtbSignal) => parseFloat(String(s.expectedReturn || 0))).filter((v: number) => !isNaN(v));
      const confidenceValues = rtbSignals.map((s: RtbSignal) => parseFloat(String(s.confidence || 0))).filter((v: number) => !isNaN(v));

      const stats = (arr: number[]) => {
        if (arr.length === 0) return { avg: 0, min: 0, max: 0 };
        return {
          avg: arr.reduce((a, b) => a + b, 0) / arr.length,
          min: Math.min(...arr),
          max: Math.max(...arr),
        };
      };

      const confidenceStats = stats(confidenceValues);
      const riskStats = stats(riskValues);
      const profitRateStats = stats(expectedReturnValues);

      console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] Signals: ${rtbSignals.length}`);
      console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] Confidence: avg=${confidenceStats.avg.toFixed(4)}, min=${confidenceStats.min.toFixed(4)}, max=${confidenceStats.max.toFixed(4)}`);
      console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] ProfitRate: avg=${profitRateStats.avg.toFixed(4)}, min=${profitRateStats.min.toFixed(4)}, max=${profitRateStats.max.toFixed(4)}`);
      console.log(`[8.8.4-C.11][SQE_DISTRIBUTION] Risk: avg=${riskStats.avg.toFixed(4)}, min=${riskStats.min.toFixed(4)}, max=${riskStats.max.toFixed(4)}`);
    } catch (err) {
      console.error('[8.8.4-C.11][SQE_DISTRIBUTION_ERROR]', err);
    }
  }
}

export const validationSessionService = new ValidationSessionService();
