/**
 * Phase 8.8.4-A3.R9.0.A — Performance Monitor
 * Directive 8.8.4-A3.R9.0.C: Enhanced Observability & Metrics
 * Unified metrics sampler for RTB, SQE, and TCL event timing.
 * Collects interval metrics every 60s.
 * Logs: [A3.R9.0.C][METRICS]
 * 
 * Tracks key performance metrics for system harmonization:
 * - sqe_evaluation_rate: SQE evaluations per minute
 * - sqe_pass_count / sqe_fail_count: R9C-5 explicit counters
 * - rtb_refresh_latency: Average RTB refresh cycle time
 * - tcl_activation_delay: Time from engine start to TCL activation
 * - queue_churn_rate: Signals added/removed per minute
 * - symbol_resolution_latency_ms: R9C-5 Kraken symbol resolution time
 */

interface PerformanceMetrics {
  sqe_evaluation_count: number;
  sqe_pass_count: number;
  sqe_fail_count: number;
  rtb_refresh_count: number;
  rtb_refresh_total_ms: number;
  rtb_signals_reconfirmed: number;
  rtb_signals_expired: number;
  rtb_signals_added: number;
  tcl_activation_delay_ms: number | null;
  queue_adds: number;
  queue_removes: number;
  last_reset: number;
  symbol_resolution_count: number;
  symbol_resolution_total_ms: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = this.createEmptyMetrics();
  private intervalId: NodeJS.Timeout | null = null;
  private started: boolean = false;

  constructor() {
    console.log('[A3.R9.0.A][METRICS] PerformanceMonitor initialized');
    // A3.R9.0.A: Auto-start on construction to ensure metrics are collected from first import
    this.start();
  }

  private createEmptyMetrics(): PerformanceMetrics {
    return {
      sqe_evaluation_count: 0,
      sqe_pass_count: 0,
      sqe_fail_count: 0,
      rtb_refresh_count: 0,
      rtb_refresh_total_ms: 0,
      rtb_signals_reconfirmed: 0,
      rtb_signals_expired: 0,
      rtb_signals_added: 0,
      tcl_activation_delay_ms: null,
      queue_adds: 0,
      queue_removes: 0,
      last_reset: Date.now(),
      symbol_resolution_count: 0,
      symbol_resolution_total_ms: 0,
    };
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.intervalId = setInterval(() => {
      this.emitSummary();
    }, 60000);

    console.log('[A3.R9.0.A][METRICS] Started - emitting summary every 60s');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[A3.R9.0.A][METRICS] Stopped');
  }

  recordSQEEvaluation(passed: boolean): void {
    this.metrics.sqe_evaluation_count++;
    if (passed) {
      this.metrics.sqe_pass_count++;
    } else {
      this.metrics.sqe_fail_count++;
    }
  }

  recordRTBRefresh(durationMs: number, reconfirmed: number, expired: number): void {
    this.metrics.rtb_refresh_count++;
    this.metrics.rtb_refresh_total_ms += durationMs;
    this.metrics.rtb_signals_reconfirmed += reconfirmed;
    this.metrics.rtb_signals_expired += expired;
  }

  recordTCLActivation(delayMs: number): void {
    this.metrics.tcl_activation_delay_ms = delayMs;
  }

  recordQueueAdd(count: number = 1): void {
    this.metrics.queue_adds += count;
    this.metrics.rtb_signals_added += count;
  }

  recordQueueRemove(count: number = 1): void {
    this.metrics.queue_removes += count;
  }

  /**
   * R9C-5: Track symbol resolution latency via Kraken Symbol Resolver
   */
  recordSymbolResolutionLatency(latencyMs: number): void {
    this.metrics.symbol_resolution_count++;
    this.metrics.symbol_resolution_total_ms += latencyMs;
  }

  /**
   * R9C-5: Get explicit SQE passed/rejected counts
   */
  getSQECounts(): { passed: number; rejected: number } {
    return {
      passed: this.metrics.sqe_pass_count,
      rejected: this.metrics.sqe_fail_count,
    };
  }

  private emitSummary(): void {
    const elapsedMs = Date.now() - this.metrics.last_reset;
    const elapsedMinutes = elapsedMs / 60000;

    const sqeRate = elapsedMinutes > 0 
      ? (this.metrics.sqe_evaluation_count / elapsedMinutes).toFixed(1)
      : '0.0';
    
    const sqePassRate = this.metrics.sqe_evaluation_count > 0
      ? ((this.metrics.sqe_pass_count / this.metrics.sqe_evaluation_count) * 100).toFixed(1)
      : '0.0';

    const avgRefreshLatency = this.metrics.rtb_refresh_count > 0
      ? (this.metrics.rtb_refresh_total_ms / this.metrics.rtb_refresh_count).toFixed(1)
      : '0.0';

    const queueChurnRate = elapsedMinutes > 0
      ? ((this.metrics.queue_adds + this.metrics.queue_removes) / elapsedMinutes).toFixed(1)
      : '0.0';

    // R9C-5: Symbol resolution latency
    const avgSymbolLatency = this.metrics.symbol_resolution_count > 0
      ? (this.metrics.symbol_resolution_total_ms / this.metrics.symbol_resolution_count).toFixed(2)
      : '0.00';

    console.log(
      `[A3.R9.0.C][METRICS] SUMMARY | ` +
      `sqe_rate=${sqeRate}/min sqe_pass=${sqePassRate}% sqe_passed=${this.metrics.sqe_pass_count} sqe_rejected=${this.metrics.sqe_fail_count} | ` +
      `rtb_latency=${avgRefreshLatency}ms rtb_reconfirmed=${this.metrics.rtb_signals_reconfirmed} rtb_expired=${this.metrics.rtb_signals_expired} | ` +
      `tcl_delay=${this.metrics.tcl_activation_delay_ms ?? 'N/A'}ms | ` +
      `queue_churn=${queueChurnRate}/min | ` +
      `symbol_resolution_avg=${avgSymbolLatency}ms`
    );

    this.metrics = this.createEmptyMetrics();
  }

  getMetrics(): {
    sqe_evaluation_rate: number;
    sqe_pass_rate: number;
    rtb_refresh_latency: number;
    tcl_activation_delay: number | null;
    queue_churn_rate: number;
  } {
    const elapsedMs = Date.now() - this.metrics.last_reset;
    const elapsedMinutes = Math.max(elapsedMs / 60000, 0.1);

    return {
      sqe_evaluation_rate: this.metrics.sqe_evaluation_count / elapsedMinutes,
      sqe_pass_rate: this.metrics.sqe_evaluation_count > 0
        ? (this.metrics.sqe_pass_count / this.metrics.sqe_evaluation_count) * 100
        : 0,
      rtb_refresh_latency: this.metrics.rtb_refresh_count > 0
        ? this.metrics.rtb_refresh_total_ms / this.metrics.rtb_refresh_count
        : 0,
      tcl_activation_delay: this.metrics.tcl_activation_delay_ms,
      queue_churn_rate: (this.metrics.queue_adds + this.metrics.queue_removes) / elapsedMinutes,
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();
