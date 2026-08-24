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
import { toKrakenRest } from '../../markets/kraken-symbol-resolver.js';
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
    // ⛔ THAT IS NOT A NEUTRAL COST — AND THE FIRST STATEMENT OF *WHY*, WHICH STOOD HERE, WAS WRONG
    // IN THE DANGEROUS DIRECTION. It argued the cost mattered because `price-cache.ts` is a LOCKED
    // module holding Kraken under 10 weighted req/s. FALSE FOR THIS PATH (Langston, verified at
    // source): `getTicker` → `makePublicRequest` (kraken.ts:187) is a bare `fetch` with NO limiter.
    // These calls NEVER ENTER that budget — THEY COMPETE WITH IT FROM OUTSIDE. The old wording made
    // the load look SAFER than it is, which is why it is rewritten here rather than annotated below.
    // What remains true and is the real cost: `makePublicRequest` THROWS on any Kraken `data.error`
    // — a rate-limit response included — and a REST failure pushes `fetchLivePrice` into its
    // `last_known_good` legs (#743), so an unbounded pass would have AGGRAVATED THE VERY STALENESS
    // DEFECT THIS MONITOR EXISTS TO DETECT. The fix is a bounded rotating slice plus the
    // `finally`-guaranteed 100 ms floor below: full coverage on a ~1h cycle for a STABLE universe,
    // instead of a 291-call pass every 5 minutes.
    // ⛔ BLOCKER-2 (Langston): `take` must be clamped to the universe size. Unclamped, at N=10 and
    // startIdx=0 the wrap condition is true and `slice(0,20)` re-appends the same 10 — every symbol
    // audited TWICE, doubled REST calls, `totalChecks` double-counted, and a drifted symbol
    // soft-resubscribed twice in one pass. REACHABLE AT BOOT: the first audit fires 30s after
    // `start()`, before subscriptions have ramped to full size.
    const take = Math.min(this.AUDIT_SLICE, allSubscribed.length);
    const startIdx = this.rotationCursor % allSubscribed.length;
    const subscribedSymbols = allSubscribed
      .slice(startIdx, startIdx + take)
      .concat(startIdx + take > allSubscribed.length
        ? allSubscribed.slice(0, (startIdx + take) - allSubscribed.length)
        : []);
    this.rotationCursor = (startIdx + take) % allSubscribed.length;

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
          // ⛔ B-MBIM-SWITCH-ON BLOCKER-3 (Langston): THIS BATCH IS LOG-ONLY. The remediation call
          // that used to sit here — `triggerSoftResubscribe` → adapter `softResubscribe:3343` —
          // does `this.orderBooks.delete(symbol)` + `bookRaw.delete` + unsubscribe both channels +
          // 500ms + resubscribe. And `getBookForFill:3221-3223` returns NULL on an empty book, read
          // by `depth-source.ts:43` behind the FAIL-CLOSED #295 open-depth gate.
          // ⇒ THE REMEDIATION TEARS DOWN THE EXACT BOOK A FAIL-CLOSED GATE READS, and a promotion
          //   landing in that window is a silent `no_book` skip.
          // Two reasons it is not merely a risk to accept: this limb is 2025-12-30 code written
          // BEFORE the depth gate existed (the gate went live at the B8.5 switch-on), so whether it
          // still fits today's architecture is an open question this batch's scope never asked; and
          // #507 already homes resubscribe-on-mismatch to CC-B at the Phase-20 WS-lifecycle item, so
          // switching it on here would land a SECOND, uncoordinated resubscribe trigger ahead of it.
          // ⇒ detect and record; remediation stays with #506/#507 where it has an owner.
          console.warn(
            `[8.9.5][MBIM][DRIFT] ${symbol} Δ=${driftPct.toFixed(3)}% exceeds ${this.MAX_DRIFT_PCT}% ` +
            `— LOG ONLY, no resubscribe (see #506/#507 Phase-20 WS-lifecycle for remediation)`,
          );
        }

      } catch (err: any) {
        console.error(`[8.9.5][MBIM][ERROR] ${symbol}:`, err?.message || err);
      } finally {
        // ⛔ B-MBIM-SWITCH-ON BLOCKER-1 (Langston): this spacing MUST be in a `finally`.
        // It used to sit at the bottom of the try, below the drift branch — so all four `continue`s
        // above AND the catch skipped it. And `KrakenService.getTicker` → `makePublicRequest`
        // (`kraken.ts:177-195`) is a BARE `fetch` with no limiter that THROWS on any Kraken
        // `data.error` — which is exactly what a rate-limit response is.
        // ⇒ the backoff disarmed itself precisely on the failure it exists to back off from.
        // ⚠️ AND MY RATE PREMISE WAS WRONG IN THE DANGEROUS DIRECTION: these REST calls do NOT pass
        // through `price-cache.ts` and do NOT consume its 10-weighted-req/s budget — they COMPETE
        // with it from outside. So the slice and this delay are the ONLY bound that exists.
        await this.delay(100);
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

  /**
   * ⚠️ INTENTIONALLY RETAINED AND DELIBERATELY UNCALLED — this is NOT a missed call site.
   *
   * B-MBIM-SWITCH-ON made this monitor LOG-ONLY (BLOCKER-3): `softResubscribe` deletes the
   * per-symbol order book, and `getBookForFill` returns null on an empty book behind the
   * FAIL-CLOSED #295 open-depth gate — so remediating drift here can silently block a promotion.
   *
   * It is kept rather than deleted because the remediation is already HOMED: `#507` assigns
   * resubscribe-on-mismatch to CC-B at the Phase-20 WS-lifecycle item, alongside `#506`. That batch
   * wants this method; deleting it now would mean rewriting it there.
   *
   * Rule 18 requires a 'left intentionally' item be stated so a later grep does not read it as an
   * incomplete sweep. This docblock is that statement.
   */
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
