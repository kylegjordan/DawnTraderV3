/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-M3B.2 — VTS Mode Verification & Audit Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Verifies VTS mode correctness, data source integrity, and ensures
 * no cross-contamination between simulated and real trade learning buffers.
 */

import fs from 'fs/promises';
import path from 'path';
import { contextBridge } from './context-bridge.js';

const REPORTS_DIR = path.join(process.cwd(), 'reports');
const VTS_LEARNING_BUFFER = path.join(process.cwd(), 'data', 'vts_learning_buffer.json');
const LIVE_LEARNING_BUFFER = path.join(process.cwd(), 'data', 'live_learning_buffer.json');

export type VTSMode = 'simulator' | 'observer';
export type VTSDataSource = 'pricing_service' | 'live_trades';
export type SystemMode = 'IDLE' | 'PAPER' | 'LIVE';

interface LearningBufferEntry {
  id?: string;
  tradeId?: string;
  symbol?: string;
  timestamp?: string;
  source?: string;
}

export interface VTSModeAuditReport {
  timestamp: string;
  systemMode: SystemMode;
  vtsMode: VTSMode;
  dataSource: VTSDataSource;
  simulatedTrades: number;
  averageConfidence: number;
  feedLatencyMs: number;
  crossContaminationDetected: boolean;
  sharedEntryCount: number;
  validationChecks: {
    modeCorrect: boolean;
    dataSourceCorrect: boolean;
    noSyntheticDuringLive: boolean;
    timestampsConsistent: boolean;
    buffersIsolated: boolean;
  };
  bufferStats: {
    vtsBufferSize: number;
    liveBufferSize: number;
    lastVtsWrite: string | null;
    lastLiveWrite: string | null;
  };
  summary: string;
}

export interface VTSModeState {
  mode: VTSMode;
  source: VTSDataSource;
  systemMode: SystemMode;
  lastModeChange: string;
  simulatedTradesThisSession: number;
  isActive: boolean;
  blockedSimulationsInObserverMode: number;
}

class VTSModeAuditService {
  private currentState: VTSModeState = {
    mode: 'simulator',
    source: 'pricing_service',
    systemMode: 'IDLE',
    lastModeChange: new Date().toISOString(),
    simulatedTradesThisSession: 0,
    isActive: false,
    blockedSimulationsInObserverMode: 0
  };

  private feedLatencies: number[] = [];
  private simulatedTradeConfidences: number[] = [];
  private lastPricingUpdate: number = Date.now();
  private initialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      await fs.mkdir(REPORTS_DIR, { recursive: true });
      await fs.mkdir(path.dirname(VTS_LEARNING_BUFFER), { recursive: true });
      
      this.subscribeToTradingState();
      this.initialized = true;
      console.log('[M3B.2][VTS_AUDIT] Mode Audit Service initialized');
    } catch (error) {
      console.error('[M3B.2][VTS_AUDIT] Init error:', error);
    }
  }

  private subscribeToTradingState(): void {
    try {
      if (contextBridge && typeof contextBridge.on === 'function') {
        contextBridge.on('trading_state_changed', (data: any) => {
          const isActive = data?.active || data?.isEngineActive || false;
          const mode = data?.mode?.toUpperCase() || 'PAPER';
          
          let systemMode: SystemMode = 'IDLE';
          if (isActive) {
            systemMode = mode === 'LIVE' ? 'LIVE' : 'PAPER';
          }
          
          this.updateMode(systemMode);
          console.log(`[M3B.2][VTS_AUDIT] Trading state received: active=${isActive}, mode=${mode} → VTS: ${this.currentState.mode}`);
        });
        console.log('[M3B.2][VTS_AUDIT] Subscribed to trading_state_changed events');
      }
    } catch (error) {
      console.warn('[M3B.2][VTS_AUDIT] Could not subscribe to context bridge:', error);
    }
  }

  updateMode(systemMode: SystemMode): void {
    const previousMode = this.currentState.mode;
    
    if (systemMode === 'IDLE') {
      this.currentState.mode = 'simulator';
      this.currentState.source = 'pricing_service';
    } else {
      this.currentState.mode = 'observer';
      this.currentState.source = 'live_trades';
    }
    
    this.currentState.systemMode = systemMode;
    
    if (previousMode !== this.currentState.mode) {
      this.currentState.lastModeChange = new Date().toISOString();
      console.log(`[M3B.2][VTS_AUDIT] Mode switched: ${previousMode} → ${this.currentState.mode} (system: ${systemMode})`);
    }
  }

  recordFeedLatency(latencyMs: number): void {
    this.feedLatencies.push(latencyMs);
    if (this.feedLatencies.length > 100) {
      this.feedLatencies = this.feedLatencies.slice(-100);
    }
    this.lastPricingUpdate = Date.now();
  }

  recordSimulatedTrade(confidence: number): boolean {
    if (this.currentState.mode === 'observer') {
      this.currentState.blockedSimulationsInObserverMode++;
      console.warn(`[M3B.2][VTS_AUDIT] Blocked simulated trade in observer mode (total blocked: ${this.currentState.blockedSimulationsInObserverMode})`);
      return false;
    }
    
    this.currentState.simulatedTradesThisSession++;
    this.simulatedTradeConfidences.push(confidence);
    if (this.simulatedTradeConfidences.length > 100) {
      this.simulatedTradeConfidences = this.simulatedTradeConfidences.slice(-100);
    }
    return true;
  }

  canSimulateTrade(): boolean {
    return this.currentState.mode === 'simulator';
  }

  getState(): VTSModeState {
    return { ...this.currentState };
  }

  getAverageFeedLatency(): number {
    if (this.feedLatencies.length === 0) return 0;
    return this.feedLatencies.reduce((a, b) => a + b, 0) / this.feedLatencies.length;
  }

  getAverageConfidence(): number {
    if (this.simulatedTradeConfidences.length === 0) return 0;
    return this.simulatedTradeConfidences.reduce((a, b) => a + b, 0) / this.simulatedTradeConfidences.length;
  }

  private async loadBuffer(filePath: string): Promise<LearningBufferEntry[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private async verifyBufferIsolation(): Promise<{ isolated: boolean; sharedCount: number }> {
    const vtsEntries = await this.loadBuffer(VTS_LEARNING_BUFFER);
    const liveEntries = await this.loadBuffer(LIVE_LEARNING_BUFFER);
    
    if (vtsEntries.length === 0 || liveEntries.length === 0) {
      return { isolated: true, sharedCount: 0 };
    }
    
    const vtsIds = new Set<string>();
    for (const entry of vtsEntries) {
      if (entry.id) vtsIds.add(entry.id);
      if (entry.tradeId) vtsIds.add(entry.tradeId);
    }
    
    let sharedCount = 0;
    for (const entry of liveEntries) {
      if ((entry.id && vtsIds.has(entry.id)) || 
          (entry.tradeId && vtsIds.has(entry.tradeId))) {
        sharedCount++;
      }
    }
    
    return { isolated: sharedCount === 0, sharedCount };
  }

  private async getBufferStats(): Promise<{
    vtsBufferSize: number;
    liveBufferSize: number;
    lastVtsWrite: string | null;
    lastLiveWrite: string | null;
  }> {
    let vtsBufferSize = 0;
    let liveBufferSize = 0;
    let lastVtsWrite: string | null = null;
    let lastLiveWrite: string | null = null;

    try {
      const vtsContent = await fs.readFile(VTS_LEARNING_BUFFER, 'utf-8');
      const vtsData = JSON.parse(vtsContent);
      vtsBufferSize = Array.isArray(vtsData) ? vtsData.length : 0;
      const vtsStat = await fs.stat(VTS_LEARNING_BUFFER);
      lastVtsWrite = vtsStat.mtime.toISOString();
    } catch {}

    try {
      const liveContent = await fs.readFile(LIVE_LEARNING_BUFFER, 'utf-8');
      const liveData = JSON.parse(liveContent);
      liveBufferSize = Array.isArray(liveData) ? liveData.length : 0;
      const liveStat = await fs.stat(LIVE_LEARNING_BUFFER);
      lastLiveWrite = liveStat.mtime.toISOString();
    } catch {}

    return { vtsBufferSize, liveBufferSize, lastVtsWrite, lastLiveWrite };
  }

  async generateReport(): Promise<VTSModeAuditReport> {
    const bufferStats = await this.getBufferStats();
    const { isolated: buffersIsolated, sharedCount } = await this.verifyBufferIsolation();
    
    const modeCorrect = 
      (this.currentState.systemMode === 'IDLE' && this.currentState.mode === 'simulator') ||
      (this.currentState.systemMode !== 'IDLE' && this.currentState.mode === 'observer');
    
    const dataSourceCorrect = 
      (this.currentState.mode === 'simulator' && this.currentState.source === 'pricing_service') ||
      (this.currentState.mode === 'observer' && this.currentState.source === 'live_trades');
    
    const noSyntheticDuringLive = 
      this.currentState.mode !== 'observer' || 
      (this.currentState.simulatedTradesThisSession === 0 && 
       this.currentState.blockedSimulationsInObserverMode >= 0);
    
    const avgLatency = this.getAverageFeedLatency();
    const timestampsConsistent = avgLatency <= 100 || this.feedLatencies.length === 0;
    
    const crossContaminationDetected = !buffersIsolated || 
      (this.currentState.mode === 'observer' && this.currentState.simulatedTradesThisSession > 0);

    const report: VTSModeAuditReport = {
      timestamp: new Date().toISOString(),
      systemMode: this.currentState.systemMode,
      vtsMode: this.currentState.mode,
      dataSource: this.currentState.source,
      simulatedTrades: this.currentState.simulatedTradesThisSession,
      averageConfidence: Math.round(this.getAverageConfidence() * 1000) / 1000,
      feedLatencyMs: Math.round(avgLatency),
      crossContaminationDetected,
      sharedEntryCount: sharedCount,
      validationChecks: {
        modeCorrect,
        dataSourceCorrect,
        noSyntheticDuringLive,
        timestampsConsistent,
        buffersIsolated
      },
      bufferStats,
      summary: this.generateSummary(modeCorrect, dataSourceCorrect, crossContaminationDetected, buffersIsolated, sharedCount)
    };

    const reportPath = path.join(
      REPORTS_DIR, 
      `VTS_PassiveFeedAudit_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`[M3B.2][VTS_AUDIT] Report saved: ${reportPath}`);

    return report;
  }

  private generateSummary(
    modeCorrect: boolean, 
    dataSourceCorrect: boolean, 
    contaminated: boolean,
    buffersIsolated: boolean,
    sharedCount: number
  ): string {
    const issues: string[] = [];
    
    if (!modeCorrect) {
      issues.push('VTS mode does not match system state');
    }
    if (!dataSourceCorrect) {
      issues.push('Data source mismatch for current mode');
    }
    if (!buffersIsolated) {
      issues.push(`Buffer cross-contamination: ${sharedCount} shared entries`);
    }
    if (contaminated && buffersIsolated) {
      issues.push('Synthetic trades detected during live/paper trading');
    }
    
    if (issues.length === 0) {
      return 'PASS: All validation checks passed';
    }
    return `FAIL: ${issues.join('; ')}`;
  }

  async getLatestReport(): Promise<VTSModeAuditReport | null> {
    try {
      const files = await fs.readdir(REPORTS_DIR);
      const auditFiles = files
        .filter(f => f.startsWith('VTS_PassiveFeedAudit_') && f.endsWith('.json'))
        .sort()
        .reverse();
      
      if (auditFiles.length === 0) return null;
      
      const content = await fs.readFile(path.join(REPORTS_DIR, auditFiles[0]), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  resetSessionStats(): void {
    this.currentState.simulatedTradesThisSession = 0;
    this.currentState.blockedSimulationsInObserverMode = 0;
    this.simulatedTradeConfidences = [];
    this.feedLatencies = [];
  }
}

export const vtsModeAuditService = new VTSModeAuditService();
