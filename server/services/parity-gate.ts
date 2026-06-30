import { executionTiming } from './execution-timing';
// P19-B6.7 (#301): the vestigial 2nd-WS coordinator was removed; the go-live WS-readiness
// check now reads the PRIMARY adapter via the tested assessWsReadiness aggregate.
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { assessWsReadiness } from './market-data/feed-health-aggregate.js';
// P19-B6.9 (#398): WS-readiness uptime now comes from the feed-integrity-monitor's ROLLING 1h
// window (getRollingWindowReadiness), not a cumulative-lifetime-reconnects formula.
import { getFeedIntegrityMonitor } from './feed-integrity-monitor';
import { rateControl } from './rate-control';
import { filePersistence } from './file-persistence';

/**
 * Paper-to-Live Parity Gate
 * Validates readiness before allowing live trading
 */

export interface ParityCheckResult {
  passed: boolean;
  checks: {
    executionLatency: { passed: boolean; actual: number; threshold: number; };
    slippage: { passed: boolean; actual: number; threshold: number; };
    rateLimits: { passed: boolean; errors: number; };
    wsUptime: { passed: boolean; actual: number | null; threshold: number; }; // actual=null ⇒ warming up (P19-B6.9)
    feesModeled: { passed: boolean; };
  };
  blockingReasons: string[];
  timestamp: string;
}

class ParityGateService {
  // Configurable thresholds
  private thresholds = {
    maxSubmitAckMs: 250,
    maxSlippageBps: 15,  // 15 basis points
    minWsUptime: 99,     // 99%
    rateErrorsAllowed: 0,
    // P19-B6.7 (#301): a connected socket is not enough (the dead 2nd WS proved that) —
    // the go-live gate also requires the feed to be BROADLY delivering fresh ticks.
    freshTickMaxMs: 10000,       // a symbol is "fresh" if it ticked within 10s
    minSymbolsFreshPercent: 80,  // require ≥80% of subscribed symbols fresh (conservative)
  };

  /**
   * Run full parity check
   */
  public async runParityCheck(simulationDurationMs: number): Promise<ParityCheckResult> {
    const blockingReasons: string[] = [];

    // Check 1: Execution latency
    const execMetrics = executionTiming.getMetrics(50);
    const latencyPassed = execMetrics.avgSubmitAckMs <= this.thresholds.maxSubmitAckMs;
    if (!latencyPassed) {
      blockingReasons.push(
        `Execution latency too high: ${execMetrics.avgSubmitAckMs}ms (max: ${this.thresholds.maxSubmitAckMs}ms)`
      );
    }

    // Check 2: Slippage within bounds
    const slippagePassed = execMetrics.avgSlippageBps <= this.thresholds.maxSlippageBps;
    if (!slippagePassed) {
      blockingReasons.push(
        `Slippage too high: ${execMetrics.avgSlippageBps.toFixed(2)}bps (max: ${this.thresholds.maxSlippageBps}bps)`
      );
    }

    // Check 3: No rate limit errors (check backpressure and throttled requests)
    const rateMetrics = rateControl.getMetrics();
    const privateStatus = rateMetrics.privateStatus;
    const publicStatus = rateMetrics.publicStatus;
    
    // Fail if high backpressure OR if we have traffic and >10% is throttled
    const hasTraffic = rateMetrics.totalRequests > 0;
    const throttleRate = hasTraffic ? rateMetrics.throttledRequests / rateMetrics.totalRequests : 0;
    
    const rateErrorsPassed = 
      privateStatus.backpressure !== 'HIGH' && 
      publicStatus.backpressure !== 'HIGH' &&
      throttleRate <= 0.1; // 10% or less throttled (0% if no traffic)
      
    if (!rateErrorsPassed) {
      blockingReasons.push(
        `Rate limiting issues: private=${privateStatus.backpressure}, public=${publicStatus.backpressure}, ` +
        `throttled=${rateMetrics.throttledRequests}/${rateMetrics.totalRequests} (${(throttleRate * 100).toFixed(1)}%)`
      );
    }

    // Check 4: WebSocket feed readiness (PRIMARY adapter). P19-B6.7 (#301): the removed
    // 2nd WS stayed TCP-connected while delivering zero ticks, so "connected" alone
    // false-PASSED this go-live gate. assessWsReadiness requires connected+uptime AND a
    // conservative proportion of subscribed symbols delivering fresh ticks (worst-case
    // aggregate for a go-live gate — tested both directions in the helper unit suite).
    const wsReadiness = assessWsReadiness(
      {
        isConnected: krakenWebSocketAdapter.getStatus().isConnected,
        windowedUptimePercent: getFeedIntegrityMonitor().getRollingWindowReadiness().uptimePercent,
      },
      krakenWebSocketAdapter.getI8EWsHealth().map(h => ({ symbol: h.symbol, ageMs: h.ageMs })),
      {
        minWsUptimePercent: this.thresholds.minWsUptime,
        freshTickMaxMs: this.thresholds.freshTickMaxMs,
        minSymbolsFreshPercent: this.thresholds.minSymbolsFreshPercent,
      },
    );
    const wsUptimePercent = wsReadiness.uptimePercent;
    const wsUptimePassed = wsReadiness.passed;
    if (!wsUptimePassed) {
      const uptimeStr = wsReadiness.warmingUp
        ? 'warming up (insufficient recent feed-health samples — rolling 1h window)'
        : `uptime ${(wsReadiness.uptimePercent ?? 0).toFixed(1)}% (min ${this.thresholds.minWsUptime}%)`;
      blockingReasons.push(
        `WebSocket feed not ready: ${uptimeStr}, ` +
        `fresh symbols ${wsReadiness.freshPercent.toFixed(1)}% (min ${this.thresholds.minSymbolsFreshPercent}%)`
      );
    }

    // Check 5: Fees are modeled and included
    const feesModeled = execMetrics.avgFeesPerTrade > 0;
    if (!feesModeled) {
      blockingReasons.push('Fee modeling not active - fees must be included in net P&L');
    }

    const result: ParityCheckResult = {
      passed: blockingReasons.length === 0,
      checks: {
        executionLatency: {
          passed: latencyPassed,
          actual: execMetrics.avgSubmitAckMs,
          threshold: this.thresholds.maxSubmitAckMs,
        },
        slippage: {
          passed: slippagePassed,
          actual: execMetrics.avgSlippageBps,
          threshold: this.thresholds.maxSlippageBps,
        },
        rateLimits: {
          passed: rateErrorsPassed,
          errors: rateMetrics.throttledRequests,
        },
        wsUptime: {
          passed: wsUptimePassed,
          actual: wsUptimePercent,
          threshold: this.thresholds.minWsUptime,
        },
        feesModeled: {
          passed: feesModeled,
        },
      },
      blockingReasons,
      timestamp: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Generate parity report in Markdown
   */
  public async generateParityReport(simulationDurationMs: number): Promise<string> {
    const result = await this.runParityCheck(simulationDurationMs);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    let report = `# Paper-to-Live Parity Gate Report\n\n`;
    report += `**Generated:** ${result.timestamp}\n`;
    report += `**Simulation Duration:** ${Math.floor(simulationDurationMs / 60000)} minutes\n`;
    report += `**Overall Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;
    
    report += `## Readiness Checks\n\n`;
    
    // Execution Latency
    report += `### 1. Execution Latency\n`;
    report += `- **Status:** ${result.checks.executionLatency.passed ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **Actual:** ${result.checks.executionLatency.actual}ms\n`;
    report += `- **Threshold:** ≤ ${result.checks.executionLatency.threshold}ms\n\n`;
    
    // Slippage
    report += `### 2. Slippage Control\n`;
    report += `- **Status:** ${result.checks.slippage.passed ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **Actual:** ${result.checks.slippage.actual.toFixed(2)} bps\n`;
    report += `- **Threshold:** ≤ ${result.checks.slippage.threshold} bps\n\n`;
    
    // Rate Limits
    report += `### 3. Rate Limit Compliance\n`;
    report += `- **Status:** ${result.checks.rateLimits.passed ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **Rate Errors:** ${result.checks.rateLimits.errors}\n`;
    report += `- **Threshold:** 0 errors\n\n`;
    
    // WebSocket Uptime
    report += `### 4. WebSocket Uptime (rolling 1h window)\n`;
    report += `- **Status:** ${result.checks.wsUptime.passed ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **Actual:** ${result.checks.wsUptime.actual === null ? 'warming up (insufficient recent samples)' : result.checks.wsUptime.actual.toFixed(1) + '%'}\n`;
    report += `- **Threshold:** ≥ ${result.checks.wsUptime.threshold}%\n\n`;
    
    // Fees Modeled
    report += `### 5. Fee Modeling\n`;
    report += `- **Status:** ${result.checks.feesModeled.passed ? '✅ Pass' : '❌ Fail'}\n`;
    report += `- **Fees Included:** ${result.checks.feesModeled.passed ? 'Yes' : 'No'}\n\n`;
    
    if (!result.passed) {
      report += `## Blocking Issues\n\n`;
      result.blockingReasons.forEach((reason, i) => {
        report += `${i + 1}. ${reason}\n`;
      });
      report += `\n`;
    }
    
    report += `## Recommendation\n\n`;
    if (result.passed) {
      report += `✅ **System ready for live trading.** All parity checks passed.\n\n`;
      report += `Proceed with caution and monitor execution closely during initial live trades.\n`;
    } else {
      report += `❌ **System NOT ready for live trading.** Address blocking issues before enabling live mode.\n\n`;
      report += `Resolve the issues listed above and run another simulation to validate improvements.\n`;
    }
    
    // Save report
    const fileName = `parity-gate-${timestamp}.md`;
    await filePersistence.saveFile('report', fileName, report);
    
    console.log(`[ParityGate] Report saved: ${fileName}`);
    
    return fileName;
  }

  /**
   * Update thresholds
   */
  public updateThresholds(updates: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...updates };
    console.log('[ParityGate] Thresholds updated:', this.thresholds);
  }

  /**
   * Get current thresholds
   */
  public getThresholds() {
    return { ...this.thresholds };
  }
}

// Singleton instance
export const parityGate = new ParityGateService();
