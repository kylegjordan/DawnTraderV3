/**
 * Phase 5A: Telemetry Compression & Batching Service (Enhanced)
 * 
 * Goal: Achieve ≥85% compression through:
 * - Request sampling (5% instead of 10% - Phase 5A remediation)
 * - Log batching (flush every 2s adaptive from profiler)
 * - Payload compression (gzip ALL batches - Phase 5A remediation)
 * - Selective verbosity (errors always, success sampled)
 */

import { gzip } from 'zlib';
import { promisify } from 'util';
import { profiler } from './gemini-profiler';

const gzipAsync = promisify(gzip);

interface LogEntry {
  timestamp: number;
  level: 'request' | 'response' | 'error' | 'info';
  message: string;
  data?: any;
}

class TelemetryCompression {
  private logBatch: LogEntry[] = [];
  private sampleRate = 0.05; // Phase 5A: 5% sampling (was 10% in Phase 4A)
  private batchFlushInterval = 30000; // Flush every 30s (default)
  private maxBatchSize = 100; // Flush if batch exceeds 100 entries
  private flushTimer: NodeJS.Timeout | null = null;
  private totalRequests = 0;
  private sampledRequests = 0;
  private compressedBytes = 0;
  private uncompressedBytes = 0;

  constructor() {
    this.startBatchFlusher();
  }
  
  /**
   * Phase 4B: Update batch interval dynamically from adaptive profiler
   */
  updateBatchInterval(newInterval: number): void {
    if (newInterval === this.batchFlushInterval) return;
    
    console.log(`[Telemetry] Updating batch interval: ${this.batchFlushInterval}ms → ${newInterval}ms`);
    this.batchFlushInterval = newInterval;
    
    // Restart the flusher with new interval
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.startBatchFlusher();
  }

  /**
   * Sample and log a request - Phase 5A: 5% sampling (was 10%)
   */
  logRequest(method: string, path: string, data?: any): boolean {
    this.totalRequests++;

    // Always log errors
    if (data?.statusCode && data.statusCode >= 400) {
      this.addLog('error', `${method} ${path}`, data);
      return true;
    }

    // Phase 5A: Sample normal requests at 5% rate (reduced from 10%)
    if (Math.random() > this.sampleRate) {
      return false; // Skipped
    }

    this.sampledRequests++;
    this.addLog('request', `${method} ${path}`, data);
    return true;
  }

  /**
   * Always log errors (no sampling)
   */
  logError(message: string, data?: any): void {
    this.addLog('error', message, data);
    
    // Flush immediately for errors
    this.flush();
  }

  /**
   * Log info messages with sampling
   */
  logInfo(message: string, data?: any): boolean {
    if (Math.random() > this.sampleRate) {
      return false;
    }
    this.addLog('info', message, data);
    return true;
  }

  /**
   * Add log entry to batch
   */
  private addLog(level: LogEntry['level'], message: string, data?: any): void {
    this.logBatch.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });

    // Flush if batch size exceeded
    if (this.logBatch.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Start periodic batch flusher
   * Phase 4B: Now uses dynamic interval from env var (set by adaptive profiler)
   */
  private startBatchFlusher(): void {
    // Phase 4B: Check for adaptive batch interval from env
    const adaptiveBatchMs = Number(process.env.TELEMETRY_BATCH_MS);
    if (adaptiveBatchMs && adaptiveBatchMs > 0) {
      this.batchFlushInterval = adaptiveBatchMs;
    }
    
    this.flushTimer = setInterval(() => {
      // Re-check env var each interval in case it changed
      const currentBatchMs = Number(process.env.TELEMETRY_BATCH_MS);
      if (currentBatchMs && currentBatchMs > 0 && currentBatchMs !== this.batchFlushInterval) {
        this.updateBatchInterval(currentBatchMs);
      }
      this.flush();
    }, this.batchFlushInterval);
  }

  /**
   * Flush batch to console with compression
   * Phase 5A: ALWAYS compress batches (removed >1024 byte threshold)
   */
  private async flush(): Promise<void> {
    if (this.logBatch.length === 0) return;

    const batch = this.logBatch.splice(0, this.logBatch.length);
    const payload = JSON.stringify(batch);
    this.uncompressedBytes += payload.length;

    // Phase 5A: ALWAYS compress (removed size threshold)
    try {
      const compressed = await gzipAsync(payload);
      this.compressedBytes += compressed.length;
      const ratio = ((1 - compressed.length / payload.length) * 100).toFixed(1);
      console.log(`[Gemini-5A] Flushed ${batch.length} logs (${payload.length}b → ${compressed.length}b, ${ratio}% compression)`);
      return;
    } catch (error) {
      // Fallback to uncompressed on error
      console.error('[Gemini-5A] Compression failed, flushing uncompressed:', error);
      console.log(`[Gemini-5A] Flushed ${batch.length} logs (${payload.length}b uncompressed)`);
    }
  }

  /**
   * Get compression statistics
   */
  getStats() {
    const compressionRatio = this.uncompressedBytes > 0 
      ? ((1 - this.compressedBytes / this.uncompressedBytes) * 100).toFixed(1)
      : '0.0';
    
    const samplingRatio = this.totalRequests > 0
      ? ((this.sampledRequests / this.totalRequests) * 100).toFixed(1)
      : '0.0';

    return {
      totalRequests: this.totalRequests,
      sampledRequests: this.sampledRequests,
      samplingRatio: `${samplingRatio}%`,
      uncompressedBytes: this.uncompressedBytes,
      compressedBytes: this.compressedBytes,
      compressionRatio: `${compressionRatio}%`,
      currentBatchSize: this.logBatch.length
    };
  }

  /**
   * Log stats periodically (every 60s)
   */
  logStats(): void {
    const stats = this.getStats();
    console.log('[Gemini-4A][Telemetry] Stats:', stats);
    
    // Phase 4A-5: Report to profiler for metrics dashboard
    profiler.recordTelemetryStats(this.totalRequests, this.sampledRequests);
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

// Singleton instance
export const telemetry = new TelemetryCompression();

// Log stats every 60 seconds
setInterval(() => {
  telemetry.logStats();
}, 60000);

// Cleanup on process exit
process.on('beforeExit', () => {
  telemetry.shutdown();
});
