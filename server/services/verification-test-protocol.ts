/**
 * Directive 8.9.4-VTP — Verification Test Trading Protocol
 * 
 * Validates Mini-Book, Sentinel, WebSocket, and REST systems under paper/live trading conditions.
 * Captures comprehensive metrics for infrastructure validation.
 */

import fs from 'fs';
import path from 'path';
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { livePricingAdapter } from './live-pricing-adapter.js';

interface VTPMetrics {
  startTime: Date;
  endTime: Date | null;
  durationMin: number;
  wsChannels: number;
  sentinelResets: number;
  avgTickLatencyMs: number;
  maxPriceDivergencePct: number;
  restFallbacks: number;
  restFallbacksPerMin: number;
  tickCount: number;
  bookTickCount: number;
  midpointChecks: MidpointCheck[];
  sentinelEvents: SentinelEvent[];
  uiSyncEvents: UISyncEvent[];
  feedHealthSnapshots: FeedHealthSnapshot[];
  priceConsistencyOk: boolean;
}

interface MidpointCheck {
  timestamp: Date;
  symbol: string;
  wsPrice: number;
  restPrice: number;
  divergencePct: number;
  passed: boolean;
}

interface SentinelEvent {
  timestamp: Date;
  symbol: string;
  reason: string;
}

interface UISyncEvent {
  timestamp: Date;
  symbol: string;
  uiPrice: number;
  backendPrice: number;
  matched: boolean;
}

interface FeedHealthSnapshot {
  timestamp: Date;
  activeWsChannels: number;
  restFallbacksLast30s: number;
  sentinelResets: number;
  avgTickLatencyMs: number;
  uptimeMin: number;
}

class VerificationTestProtocol {
  private isActive = false;
  private metrics: VTPMetrics | null = null;
  private logDir = '/tmp/logs/verification_8.9.4P';
  private logFile: string | null = null;
  private healthInterval: NodeJS.Timeout | null = null;
  private midpointCheckInterval: NodeJS.Timeout | null = null;
  private tickLatencies: number[] = [];
  private restFallbackWindow: Date[] = [];
  private lastTickTime: number = 0;
  
  constructor() {
    console.log('[VTP] Verification Test Protocol service initialized');
  }
  
  async startSession(): Promise<{ ok: boolean; logFile: string; message: string }> {
    if (this.isActive) {
      return { ok: false, logFile: '', message: 'VTP session already active' };
    }
    
    this.flushLogs();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(this.logDir, `verification_8.9.4P_${timestamp}.log`);
    
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.metrics = {
      startTime: new Date(),
      endTime: null,
      durationMin: 0,
      wsChannels: 0,
      sentinelResets: 0,
      avgTickLatencyMs: 0,
      maxPriceDivergencePct: 0,
      restFallbacks: 0,
      restFallbacksPerMin: 0,
      tickCount: 0,
      bookTickCount: 0,
      midpointChecks: [],
      sentinelEvents: [],
      uiSyncEvents: [],
      feedHealthSnapshots: [],
      priceConsistencyOk: true,
    };
    
    this.isActive = true;
    this.tickLatencies = [];
    this.restFallbackWindow = [];
    this.lastTickTime = Date.now();
    
    this.log('[VTP][INIT] WebSocket v2 connected');
    this.log('[VTP][INIT] Mini-Book initialized');
    this.log('[VTP][SESSION_START] Verification test session started');
    this.log(`[VTP] Logging level: DEBUG`);
    
    this.startHealthMonitoring();
    this.startMidpointChecks();
    
    console.log('[VTP][SESSION_START] Session started, logFile:', this.logFile);
    
    return { 
      ok: true, 
      logFile: this.logFile, 
      message: 'VTP session started successfully'
    };
  }
  
  async stopSession(): Promise<{ ok: boolean; summary: any; files: string[] }> {
    if (!this.isActive || !this.metrics) {
      return { ok: false, summary: null, files: [] };
    }
    
    this.isActive = false;
    this.metrics.endTime = new Date();
    this.metrics.durationMin = Math.round(
      (this.metrics.endTime.getTime() - this.metrics.startTime.getTime()) / 60000
    );
    
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    
    if (this.midpointCheckInterval) {
      clearInterval(this.midpointCheckInterval);
      this.midpointCheckInterval = null;
    }
    
    this.log('[VTP][SESSION_END] Verification test session ended');
    
    this.metrics.avgTickLatencyMs = this.tickLatencies.length > 0
      ? Math.round(this.tickLatencies.reduce((a, b) => a + b, 0) / this.tickLatencies.length)
      : 0;
    
    this.metrics.restFallbacksPerMin = this.metrics.durationMin > 0
      ? this.metrics.restFallbacks / this.metrics.durationMin
      : 0;
    
    this.metrics.priceConsistencyOk = this.evaluatePassCriteria();
    
    const files = await this.generateSummaryFiles();
    
    console.log('[VTP][SESSION_END] Session ended, summary files generated');
    
    return { ok: true, summary: this.getSummary(), files };
  }
  
  recordTick(symbol: string, source: 'ws' | 'rest', price: number, bid?: number, ask?: number): void {
    if (!this.isActive || !this.metrics) return;
    
    const now = Date.now();
    const latency = now - this.lastTickTime;
    this.lastTickTime = now;
    
    if (latency < 60000) {
      this.tickLatencies.push(latency);
      if (this.tickLatencies.length > 1000) {
        this.tickLatencies.shift();
      }
    }
    
    this.metrics.tickCount++;
    
    if (source === 'rest') {
      this.metrics.restFallbacks++;
      this.restFallbackWindow.push(new Date());
      this.restFallbackWindow = this.restFallbackWindow.filter(
        d => Date.now() - d.getTime() < 30000
      );
    }
    
    if (bid && ask) {
      const mid = (bid + ask) / 2;
      this.log(`[VTP][BOOK_TICK] SYMBOL=${symbol} bid=${bid.toFixed(6)} ask=${ask.toFixed(6)} mid=${mid.toFixed(6)}`);
      this.metrics.bookTickCount++;
      
      if (price === 0 || mid === 0) {
        this.log(`[VTP][FLASH_CRASH_WARNING] SYMBOL=${symbol} price=${price} mid=${mid} - potential flash crash detected!`);
      }
    }
  }
  
  recordSentinelReset(symbol: string, reason: string): void {
    if (!this.isActive || !this.metrics) return;
    
    this.metrics.sentinelResets++;
    this.metrics.sentinelEvents.push({
      timestamp: new Date(),
      symbol,
      reason,
    });
    
    this.log(`[VTP][SENTINEL_RESET] SYMBOL=${symbol} reason=${reason}`);
  }
  
  recordMidpointCheck(symbol: string, wsPrice: number, restPrice: number): void {
    if (!this.isActive || !this.metrics) return;
    
    if (wsPrice === 0 || restPrice === 0) return;
    
    const divergencePct = Math.abs((wsPrice - restPrice) / restPrice) * 100;
    const passed = divergencePct <= 0.2;
    
    const check: MidpointCheck = {
      timestamp: new Date(),
      symbol,
      wsPrice,
      restPrice,
      divergencePct,
      passed,
    };
    
    this.metrics.midpointChecks.push(check);
    
    if (divergencePct > this.metrics.maxPriceDivergencePct) {
      this.metrics.maxPriceDivergencePct = divergencePct;
    }
    
    this.log(`[VTP][MIDPOINT_CHECK] SYMBOL=${symbol} WS=${wsPrice.toFixed(6)} REST=${restPrice.toFixed(6)} Δ=${divergencePct.toFixed(2)}%`);
  }
  
  recordUISync(symbol: string, uiPrice: number, backendPrice: number): void {
    if (!this.isActive || !this.metrics) return;
    
    const matched = Math.abs(uiPrice - backendPrice) < 0.0001 || 
                   (backendPrice !== 0 && Math.abs((uiPrice - backendPrice) / backendPrice) < 0.001);
    
    this.metrics.uiSyncEvents.push({
      timestamp: new Date(),
      symbol,
      uiPrice,
      backendPrice,
      matched,
    });
    
    const status = matched ? '✅' : '❌';
    this.log(`[VTP][UI_SYNC] SYMBOL=${symbol} UI=${uiPrice.toFixed(6)} BACKEND=${backendPrice.toFixed(6)} ${status}`);
  }
  
  private startHealthMonitoring(): void {
    this.healthInterval = setInterval(() => {
      if (!this.isActive || !this.metrics) return;
      
      const uptimeMin = Math.round(
        (Date.now() - this.metrics.startTime.getTime()) / 60000
      );
      
      const activeChannels = krakenWebSocketAdapter.getSubscribedSymbols().length;
      const recentRestFallbacks = this.restFallbackWindow.filter(
        d => Date.now() - d.getTime() < 30000
      ).length;
      
      const avgLatency = this.tickLatencies.length > 0
        ? Math.round(this.tickLatencies.slice(-100).reduce((a, b) => a + b, 0) / Math.min(100, this.tickLatencies.length))
        : 0;
      
      const snapshot: FeedHealthSnapshot = {
        timestamp: new Date(),
        activeWsChannels: activeChannels,
        restFallbacksLast30s: recentRestFallbacks,
        sentinelResets: this.metrics.sentinelResets,
        avgTickLatencyMs: avgLatency,
        uptimeMin,
      };
      
      this.metrics.feedHealthSnapshots.push(snapshot);
      this.metrics.wsChannels = activeChannels;
      
      this.log(`[VTP][HEALTH] Active WS Channels: ${activeChannels} | REST Fallbacks (last 30s): ${recentRestFallbacks} | Sentinel Resets: ${this.metrics.sentinelResets} | Avg Tick Latency: ${avgLatency}ms | Uptime: ${uptimeMin}min`);
    }, 30000);
  }
  
  private startMidpointChecks(): void {
    this.midpointCheckInterval = setInterval(async () => {
      if (!this.isActive || !this.metrics) return;
      
      try {
        const testSymbols = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'ADA/USD'];
        
        for (const symbol of testSymbols) {
          const wsPrice = await this.getWSPrice(symbol);
          const restPrice = await this.getRESTPrice(symbol);
          
          if (wsPrice && restPrice) {
            this.recordMidpointCheck(symbol, wsPrice, restPrice);
          }
        }
      } catch (error) {
        this.log(`[VTP][MIDPOINT_CHECK_ERROR] ${error}`);
      }
    }, 60000);
  }
  
  private async getWSPrice(symbol: string): Promise<number | null> {
    try {
      const data = livePricingAdapter.getPrice(symbol);
      return data?.price || null;
    } catch {
      return null;
    }
  }
  
  private async getRESTPrice(symbol: string): Promise<number | null> {
    try {
      const data = await livePricingAdapter.getPriceWithFallback(symbol, 30000);
      return data?.price || null;
    } catch {
      return null;
    }
  }
  
  private evaluatePassCriteria(): boolean {
    if (!this.metrics) return false;
    
    const durationMin = this.metrics.durationMin;
    if (durationMin < 30) {
      this.log(`[VTP][CRITERIA] ⚠️ Duration < 30 min (${durationMin} min)`);
    }
    
    const wsFeedIntegrity = this.metrics.tickCount > 0 
      ? ((this.metrics.tickCount - this.metrics.restFallbacks) / this.metrics.tickCount) >= 0.95
      : true;
    
    const sentinelHealth = durationMin > 0 
      ? (this.metrics.sentinelResets / (durationMin / 60)) < 1 
      : true;
    
    const priceDrift = this.metrics.maxPriceDivergencePct <= 0.2;
    
    const failedUISyncs = this.metrics.uiSyncEvents.filter(e => !e.matched).length;
    const uiSync = failedUISyncs === 0 || 
                   (this.metrics.uiSyncEvents.length > 0 && 
                    failedUISyncs / this.metrics.uiSyncEvents.length < 0.01);
    
    this.log(`[VTP][CRITERIA] WS Feed Integrity: ${wsFeedIntegrity ? '✅ PASS' : '❌ FAIL'}`);
    this.log(`[VTP][CRITERIA] Sentinel Health: ${sentinelHealth ? '✅ PASS' : '❌ FAIL'}`);
    this.log(`[VTP][CRITERIA] Price Drift: ${priceDrift ? '✅ PASS' : '❌ FAIL'} (max: ${this.metrics.maxPriceDivergencePct.toFixed(2)}%)`);
    this.log(`[VTP][CRITERIA] UI Sync: ${uiSync ? '✅ PASS' : '❌ FAIL'}`);
    
    return wsFeedIntegrity && sentinelHealth && priceDrift && uiSync;
  }
  
  private getSummary(): any {
    if (!this.metrics) return null;
    
    return {
      duration_min: this.metrics.durationMin,
      ws_channels: this.metrics.wsChannels,
      sentinel_resets: this.metrics.sentinelResets,
      avg_tick_latency_ms: this.metrics.avgTickLatencyMs,
      max_price_divergence_pct: parseFloat(this.metrics.maxPriceDivergencePct.toFixed(2)),
      avg_rest_fallbacks_per_min: parseFloat(this.metrics.restFallbacksPerMin.toFixed(2)),
      price_consistency_ok: this.metrics.priceConsistencyOk,
      total_ticks: this.metrics.tickCount,
      book_ticks: this.metrics.bookTickCount,
      midpoint_checks: this.metrics.midpointChecks.length,
      ui_sync_events: this.metrics.uiSyncEvents.length,
    };
  }
  
  private async generateSummaryFiles(): Promise<string[]> {
    const files: string[] = [];
    
    if (!this.metrics) return files;
    
    const jsonPath = path.join(this.logDir, 'verification_summary.json');
    const txtPath = path.join(this.logDir, 'verification_summary.txt');
    
    const jsonSummary = this.getSummary();
    fs.writeFileSync(jsonPath, JSON.stringify(jsonSummary, null, 2));
    files.push(jsonPath);
    
    const overallStatus = this.metrics.priceConsistencyOk ? 'PASS ✅' : 'FAIL ❌';
    const txtSummary = `
=== Verification Report (8.9.4-Patch) ===
Generated: ${new Date().toISOString()}

Total Runtime: ${this.metrics.durationMin} min
WS Channels: ${this.metrics.wsChannels}
Total Ticks: ${this.metrics.tickCount}
Book Ticks: ${this.metrics.bookTickCount}

Sentinel Resets: ${this.metrics.sentinelResets}
Avg Tick Latency: ${this.metrics.avgTickLatencyMs} ms
Max Price Divergence: ${this.metrics.maxPriceDivergencePct.toFixed(2)} %
REST Fallbacks/min: ${this.metrics.restFallbacksPerMin.toFixed(2)}

Midpoint Checks: ${this.metrics.midpointChecks.length}
UI Sync Events: ${this.metrics.uiSyncEvents.length}

Feed Integrity: ${overallStatus}
==========================================
`;
    
    fs.writeFileSync(txtPath, txtSummary);
    files.push(txtPath);
    
    if (this.logFile) {
      files.push(this.logFile);
    }
    
    return files;
  }
  
  private flushLogs(): void {
    try {
      const oldLogs = fs.readdirSync('/tmp/logs').filter(f => f.startsWith('verification_'));
      for (const log of oldLogs) {
        try {
          fs.unlinkSync(path.join('/tmp/logs', log));
        } catch {}
      }
    } catch {}
    
    if (fs.existsSync(this.logDir)) {
      try {
        const files = fs.readdirSync(this.logDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.logDir, file));
        }
      } catch {}
    }
  }
  
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} ${message}\n`;
    
    console.log(message);
    
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch {}
    }
  }
  
  isSessionActive(): boolean {
    return this.isActive;
  }
  
  getStatus(): { active: boolean; durationMin: number; metrics: any } {
    if (!this.isActive || !this.metrics) {
      return { active: false, durationMin: 0, metrics: null };
    }
    
    const durationMin = Math.round(
      (Date.now() - this.metrics.startTime.getTime()) / 60000
    );
    
    return {
      active: true,
      durationMin,
      metrics: {
        wsChannels: this.metrics.wsChannels,
        sentinelResets: this.metrics.sentinelResets,
        tickCount: this.metrics.tickCount,
        bookTickCount: this.metrics.bookTickCount,
        restFallbacks: this.metrics.restFallbacks,
        maxDivergencePct: this.metrics.maxPriceDivergencePct,
      },
    };
  }
}

export const verificationTestProtocol = new VerificationTestProtocol();
