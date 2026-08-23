/**
 * Directive 8.9.5 — Mini-Book Integrity Monitor (MBIM)
 * 
 * Continuous background audit process that cross-checks WebSocket Mini-Book 
 * mid-prices against REST midpoint values every 5 minutes to detect silent 
 * drift, stale feeds, or book corruption.
 * 
 * If deviation exceeds 0.2%, automatically logs a divergence warning and
 * triggers a soft resync via the WebSocket adapter.
 */

import { krakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';
import { KrakenService } from '../../exchanges/kraken/kraken.js';
import { normalizeToInternalSymbol, toKrakenRest } from '../../markets/kraken-symbol-resolver.js';
import fs from 'fs';
import path from 'path';

interface IntegrityResult {
  symbol: string;
  wsMid: number;
  restMid: number;
  driftPct: number;
  status: '✅ OK' | '⚠️ DRIFT';
  timestamp: string;
}

interface MBIMMetrics {
  totalChecks: number;
  passCount: number;
  driftCount: number;
  lastAuditTime: string | null;
  symbolsDrifted: string[];
  avgDriftPct: number;
}

class MiniBookIntegrityMonitor {
  private interval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_DRIFT_PCT = 0.2;
  private readonly LOG_DIR = '/tmp/logs';
  private readonly LOG_FILE = 'integrity_monitor.log';
  
  private krakenService: KrakenService;
  private isRunning: boolean = false;
  /** B-MBIM-SWITCH-ON: rotating audit cursor — see runAudit for why the universe is sliced. */
  private rotationCursor: number = 0;
  /** Symbols per pass. 30 × 5-min passes ⇒ full 291-symbol coverage in ~50 minutes. */
  private readonly AUDIT_SLICE = 30;
  private metrics: MBIMMetrics = {
    totalChecks: 0,
    passCount: 0,
    driftCount: 0,
    lastAuditTime: null,
    symbolsDrifted: [],
    avgDriftPct: 0
  };

  constructor() {
    this.krakenService = new KrakenService();
  }

  start(): void {
    if (this.isRunning) {
      console.log('[8.9.5][MBIM] Already running');
      return;
    }

    this.ensureLogDir();
    
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.runAudit(), this.CHECK_INTERVAL_MS);
    this.isRunning = true;
    
    console.log('[8.9.5][MBIM] Integrity monitor started (5-min interval)');
    
    setTimeout(() => this.runAudit(), 30000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('[8.9.5][MBIM] Integrity monitor stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getMetrics(): MBIMMetrics {
    return { ...this.metrics };
  }

  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.LOG_DIR)) {
        fs.mkdirSync(this.LOG_DIR, { recursive: true });
      }
    } catch (err) {
      console.error('[8.9.5][MBIM] Failed to create log dir:', err);
    }
  }

  async runAudit(): Promise<IntegrityResult[]> {
    const allSubscribed = krakenWebSocketAdapter.getSubscribedSymbols();
    
    if (allSubscribed.length === 0) {
      console.log('[8.9.5][MBIM] No active symbols to audit');
      return [];
    }

    // ── B-MBIM-SWITCH-ON (#741/#743, 2026-08-23) — ROTATING SLICE, NOT THE WHOLE UNIVERSE ─────────
    // This monitor was written 2025-12-30 (Directive 8.9.5) and has never run: `start()` is reachable
    // only from a manual API route, never from boot. Wiring it up as-written would have audited EVERY
    // subscribed symbol each pass — MEASURED 291 on staging — one sequential REST call each.
    //
    // ⛔ THAT IS NOT A NEUTRAL COST. `price-cache.ts` is a LOCKED module whose entire purpose is
    // holding Kraken under 10 weighted requests/second, and a REST failure pushes `fetchLivePrice`
    // into its `last_known_good` legs (#743) — so a naive switch-on would have AGGRAVATED THE VERY
    // STALENESS DEFECT THIS MONITOR EXISTS TO DETECT. The fix is a bounded rotating slice: full
    // coverage on a ~1h cycle instead of a 291-call pass every 5 minutes.
    const startIdx = this.rotationCursor % allSubscribed.length;
    const subscribedSymbols = allSubscribed
      .slice(startIdx, startIdx + this.AUDIT_SLICE)
      .concat(startIdx + this.AUDIT_SLICE > allSubscribed.length
        ? allSubscribed.slice(0, (startIdx + this.AUDIT_SLICE) - allSubscribed.length)
        : []);
    this.rotationCursor = (startIdx + this.AUDIT_SLICE) % allSubscribed.length;

    console.log(`[8.9.5][MBIM] Starting integrity audit for ${subscribedSymbols.length} of ${allSubscribed.length} symbols (rotating slice, cursor→${this.rotationCursor})`);
    
    const results: IntegrityResult[] = [];
    const timestamp = new Date().toISOString();
    let driftSum = 0;
    let driftedSymbols: string[] = [];

    for (const symbol of subscribedSymbols) {
      try {
        const wsData = krakenWebSocketAdapter.getLatestPriceData(symbol);
        if (!wsData || wsData.bid === undefined || wsData.ask === undefined) {
          continue;
        }

        const wsMid = (wsData.bid + wsData.ask) / 2;
        if (wsMid <= 0) continue;

        // Use canonical resolver with fallback safety (Directive 8.9.5-Patch)
        let krakenPair = toKrakenRest(symbol);
        if (!krakenPair) {
          // Fallback to simple concatenation (ADA/USD → ADAUSD)
          krakenPair = symbol.replace('/', '');
        }
        console.log(`[8.9.5-P][MBIM] Auditing ${symbol} as ${krakenPair} for REST cross-check`);
        
        const restTickers = await this.krakenService.getTicker(krakenPair);
        
        if (!restTickers || Object.keys(restTickers).length === 0) {
          continue;
        }

        const tickerData = Object.values(restTickers)[0];
        if (!tickerData?.b?.[0] || !tickerData?.a?.[0]) {
          continue;
        }

        const restBid = parseFloat(tickerData.b[0]);
        const restAsk = parseFloat(tickerData.a[0]);
        const restMid = (restBid + restAsk) / 2;

        if (restMid <= 0) continue;

        const driftPct = Math.abs((wsMid - restMid) / restMid) * 100;
        driftSum += driftPct;
        
        const status: IntegrityResult['status'] = driftPct > this.MAX_DRIFT_PCT ? '⚠️ DRIFT' : '✅ OK';
        
        const result: IntegrityResult = {
          symbol,
          wsMid,
          restMid,
          driftPct,
          status,
          timestamp
        };
        
        results.push(result);

        console.log(`[8.9.5][MBIM] ${symbol} WS=${wsMid.toFixed(6)} REST=${restMid.toFixed(6)} Δ=${driftPct.toFixed(3)}% ${status}`);

        if (driftPct > this.MAX_DRIFT_PCT) {
          driftedSymbols.push(symbol);
          await this.triggerSoftResubscribe(symbol, driftPct);
        }

        await this.delay(100);

      } catch (err: any) {
        console.error(`[8.9.5][MBIM][ERROR] ${symbol}:`, err?.message || err);
      }
    }

    this.metrics.totalChecks += results.length;
    this.metrics.passCount += results.filter(r => r.status === '✅ OK').length;
    this.metrics.driftCount += driftedSymbols.length;
    this.metrics.lastAuditTime = timestamp;
    this.metrics.symbolsDrifted = driftedSymbols;
    this.metrics.avgDriftPct = results.length > 0 ? driftSum / results.length : 0;

    await this.logResults(results);
    
    console.log(`[8.9.5][MBIM] Audit complete: ${results.length} symbols checked, ${driftedSymbols.length} drifted`);

    return results;
  }

  private async triggerSoftResubscribe(symbol: string, driftPct: number): Promise<void> {
    console.warn(`[8.9.5][SENTINEL] Soft resubscribe triggered for ${symbol} (drift: ${driftPct.toFixed(3)}%)`);
    
    try {
      await krakenWebSocketAdapter.softResubscribe(symbol);
      console.log(`[8.9.5][SENTINEL] Resubscribe complete for ${symbol}`);
    } catch (err: any) {
      console.error(`[8.9.5][SENTINEL] Resubscribe failed for ${symbol}:`, err?.message || err);
    }
  }

  private async logResults(results: IntegrityResult[]): Promise<void> {
    if (results.length === 0) return;
    
    try {
      const logPath = path.join(this.LOG_DIR, this.LOG_FILE);
      const lines = results.map(r =>
        `[${r.timestamp}] ${r.symbol} WS=${r.wsMid.toFixed(6)} REST=${r.restMid.toFixed(6)} Δ=${r.driftPct.toFixed(3)}% ${r.status}`
      );
      fs.appendFileSync(logPath, lines.join('\n') + '\n');
    } catch (err) {
      console.error('[8.9.5][MBIM] Failed to write log:', err);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const miniBookIntegrityMonitor = new MiniBookIntegrityMonitor();
