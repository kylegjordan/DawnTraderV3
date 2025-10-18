/**
 * Performance Monitor Service
 * 
 * Phase 12.1: Timing instrumentation for core cognitive components
 * Tracks latency, throughput, queue depth, and success rates
 */

interface TimingMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
  metadata?: Record<string, any>;
}

interface AggregatedMetrics {
  operation: string;
  count: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
  avgDuration: number;
  successRate: number;
  lastUpdated: Date;
}

interface QueueMetrics {
  currentDepth: number;
  peakDepth: number;
  totalEnqueued: number;
  totalProcessed: number;
  totalFailed: number;
  avgProcessingTime: number;
  p95ProcessingTime: number;
}

interface SystemPerformance {
  taskQueue: QueueMetrics;
  reasoning: AggregatedMetrics | null;
  bobAgents: Record<string, AggregatedMetrics>;
  cognitiveTuning: AggregatedMetrics | null;
  autonomyCycles: AggregatedMetrics | null;
  overallHealthScore: number;
  timestamp: Date;
}

class PerformanceMonitor {
  private activeTimings: Map<string, TimingMetric> = new Map();
  private completedTimings: TimingMetric[] = [];
  private maxHistorySize = 10000; // Keep last 10k metrics
  
  // Queue metrics
  private queueDepth = 0;
  private peakQueueDepth = 0;
  private totalEnqueued = 0;
  private totalProcessed = 0;
  private totalFailed = 0;
  
  /**
   * Start timing an operation
   */
  startTiming(operation: string, id: string, metadata?: Record<string, any>): string {
    const timingId = `${operation}:${id}`;
    const metric: TimingMetric = {
      operation,
      startTime: Date.now(),
      metadata,
    };
    
    this.activeTimings.set(timingId, metric);
    return timingId;
  }
  
  /**
   * End timing an operation
   */
  endTiming(timingId: string, success: boolean = true, metadata?: Record<string, any>) {
    const metric = this.activeTimings.get(timingId);
    if (!metric) {
      console.warn(`[PerformanceMonitor] Timing ID not found: ${timingId}`);
      return;
    }
    
    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    
    if (metadata) {
      metric.metadata = { ...metric.metadata, ...metadata };
    }
    
    this.completedTimings.push(metric);
    this.activeTimings.delete(timingId);
    
    // Trim history if needed
    if (this.completedTimings.length > this.maxHistorySize) {
      this.completedTimings = this.completedTimings.slice(-this.maxHistorySize);
    }
  }
  
  /**
   * Record queue metrics
   */
  recordQueueEnqueue() {
    this.queueDepth++;
    this.totalEnqueued++;
    
    if (this.queueDepth > this.peakQueueDepth) {
      this.peakQueueDepth = this.queueDepth;
    }
  }
  
  recordQueueDequeue(success: boolean) {
    this.queueDepth = Math.max(0, this.queueDepth - 1);
    
    if (success) {
      this.totalProcessed++;
    } else {
      this.totalFailed++;
    }
  }
  
  /**
   * Get queue metrics
   */
  getQueueMetrics(): QueueMetrics {
    const processingTimes = this.completedTimings
      .filter(m => m.operation.startsWith('task_queue:') && m.duration)
      .map(m => m.duration!);
    
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((sum, d) => sum + d, 0) / processingTimes.length
      : 0;
    
    const p95ProcessingTime = this.calculatePercentile(processingTimes, 95);
    
    return {
      currentDepth: this.queueDepth,
      peakDepth: this.peakQueueDepth,
      totalEnqueued: this.totalEnqueued,
      totalProcessed: this.totalProcessed,
      totalFailed: this.totalFailed,
      avgProcessingTime: Math.round(avgProcessingTime),
      p95ProcessingTime: Math.round(p95ProcessingTime),
    };
  }
  
  /**
   * Get aggregated metrics for an operation
   */
  getAggregatedMetrics(operationPrefix: string): AggregatedMetrics | null {
    const metrics = this.completedTimings.filter(
      m => m.operation.startsWith(operationPrefix) && m.duration !== undefined
    );
    
    if (metrics.length === 0) {
      return null;
    }
    
    const durations = metrics.map(m => m.duration!).sort((a, b) => a - b);
    const successCount = metrics.filter(m => m.success).length;
    const failureCount = metrics.length - successCount;
    
    return {
      operation: operationPrefix,
      count: metrics.length,
      successCount,
      failureCount,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      minDuration: Math.round(durations[0] || 0),
      maxDuration: Math.round(durations[durations.length - 1] || 0),
      p50: Math.round(this.calculatePercentile(durations, 50)),
      p95: Math.round(this.calculatePercentile(durations, 95)),
      p99: Math.round(this.calculatePercentile(durations, 99)),
      avgDuration: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
      successRate: metrics.length > 0 ? successCount / metrics.length : 0,
      lastUpdated: new Date(),
    };
  }
  
  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)] || 0;
  }
  
  /**
   * Get system-wide performance snapshot
   */
  getSystemPerformance(): SystemPerformance {
    // Get metrics for each component
    const taskQueue = this.getQueueMetrics();
    const reasoning = this.getAggregatedMetrics('reasoning:');
    const cognitiveTuning = this.getAggregatedMetrics('cognitive_tuning:');
    const autonomyCycles = this.getAggregatedMetrics('autonomy_cycle:');
    
    // Get Bob agent metrics
    const bobAgents: Record<string, AggregatedMetrics> = {};
    const bobTypes = ['DevOpsBob', 'FullStackBob', 'UXBob', 'TradingBob'];
    
    for (const bobType of bobTypes) {
      const bobMetrics = this.getAggregatedMetrics(`bob:${bobType}`);
      if (bobMetrics) {
        bobAgents[bobType] = bobMetrics;
      }
    }
    
    // Calculate overall health score (0-100)
    const overallHealthScore = this.calculateHealthScore({
      taskQueue,
      reasoning,
      cognitiveTuning,
      autonomyCycles,
      bobAgents,
    });
    
    return {
      taskQueue,
      reasoning,
      bobAgents,
      cognitiveTuning,
      autonomyCycles,
      overallHealthScore,
      timestamp: new Date(),
    };
  }
  
  /**
   * Calculate overall system health score (0-100)
   */
  private calculateHealthScore(perf: Partial<SystemPerformance>): number {
    let score = 100;
    
    // Queue health (20 points)
    if (perf.taskQueue) {
      const { currentDepth, peakDepth, totalFailed, totalProcessed } = perf.taskQueue;
      
      // Penalize high queue depth
      if (currentDepth > 100) score -= 10;
      else if (currentDepth > 50) score -= 5;
      
      // Penalize high failure rate
      const failureRate = totalProcessed > 0 ? totalFailed / totalProcessed : 0;
      if (failureRate > 0.1) score -= 10;
      else if (failureRate > 0.05) score -= 5;
    }
    
    // Reasoning health (20 points)
    if (perf.reasoning) {
      const { successRate, p95 } = perf.reasoning;
      
      // Penalize low success rate
      if (successRate < 0.8) score -= 10;
      else if (successRate < 0.9) score -= 5;
      
      // Penalize high p95 latency (>10s)
      if (p95 > 10000) score -= 10;
      else if (p95 > 5000) score -= 5;
    }
    
    // Cognitive tuning health (20 points)
    if (perf.cognitiveTuning) {
      const { successRate, p95 } = perf.cognitiveTuning;
      
      if (successRate < 0.9) score -= 10;
      if (p95 > 30000) score -= 10;
    }
    
    // Autonomy cycle health (20 points)
    if (perf.autonomyCycles) {
      const { successRate, p95 } = perf.autonomyCycles;
      
      if (successRate < 0.9) score -= 10;
      if (p95 > 60000) score -= 10;
    }
    
    // Bob agents health (20 points)
    if (perf.bobAgents) {
      const bobMetricsArray = Object.values(perf.bobAgents);
      const avgBobSuccessRate = bobMetricsArray.length > 0
        ? bobMetricsArray.reduce((sum, m) => sum + m.successRate, 0) / bobMetricsArray.length
        : 1;
      
      if (avgBobSuccessRate < 0.8) score -= 10;
      else if (avgBobSuccessRate < 0.9) score -= 5;
      
      const maxBobP95 = Math.max(...bobMetricsArray.map(m => m.p95), 0);
      if (maxBobP95 > 5000) score -= 10;
      else if (maxBobP95 > 3000) score -= 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Reset peak metrics (for daily/weekly resets)
   */
  resetPeakMetrics() {
    this.peakQueueDepth = this.queueDepth;
    console.log('[PerformanceMonitor] Peak metrics reset');
  }
  
  /**
   * Clear all metrics
   */
  clearAllMetrics() {
    this.activeTimings.clear();
    this.completedTimings = [];
    this.queueDepth = 0;
    this.peakQueueDepth = 0;
    this.totalEnqueued = 0;
    this.totalProcessed = 0;
    this.totalFailed = 0;
    console.log('[PerformanceMonitor] All metrics cleared');
  }
}

// Export singleton
export const performanceMonitor = new PerformanceMonitor();
export type { SystemPerformance, AggregatedMetrics, QueueMetrics };
