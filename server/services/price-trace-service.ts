/**
 * Phase 8.8.3-I7-WS-C: Price Pipeline Trace Service
 * Traces price ticks through the complete pipeline from WebSocket to engine
 */

export interface TraceStage {
  stage: number;
  tag: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface PriceTrace {
  traceId: string;
  symbol: string;
  createdAt: number;
  stages: TraceStage[];
}

class PriceTraceService {
  private traces: Map<string, PriceTrace> = new Map();
  private readonly MAX_TRACES = 500; // Keep last 500 traces
  private readonly TRACE_TTL_MS = 120000; // 2 minute TTL
  
  /**
   * Generate a unique trace ID for a price tick
   * Format: symbol_timestamp_randomSuffix
   */
  generateTraceId(symbol: string): string {
    const timestamp = Date.now();
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${symbol}_${timestamp}_${suffix}`;
  }
  
  /**
   * Record a stage in the price pipeline trace
   */
  recordStage(traceId: string, stage: number, tag: string, data: Record<string, any>): void {
    const now = Date.now();
    
    // Create trace if it doesn't exist
    if (!this.traces.has(traceId)) {
      const parts = traceId.split('_');
      const symbol = parts.slice(0, -2).join('_'); // Handle symbols with underscores
      
      this.traces.set(traceId, {
        traceId,
        symbol,
        createdAt: now,
        stages: []
      });
    }
    
    const trace = this.traces.get(traceId)!;
    trace.stages.push({
      stage,
      tag,
      timestamp: now,
      data
    });
    
    // Log the stage
    console.log(`[I7-WS-C][${stage}] ${tag} ${JSON.stringify({ trace_id: traceId, ...data })}`);
    
    // Cleanup old traces periodically
    this.cleanup();
  }
  
  /**
   * Get all traces (for diagnostic endpoint)
   */
  getAllTraces(): PriceTrace[] {
    return Array.from(this.traces.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  
  /**
   * Get trace by ID
   */
  getTrace(traceId: string): PriceTrace | undefined {
    return this.traces.get(traceId);
  }
  
  /**
   * Get traces grouped by trace_id with all stages
   */
  getTraceHistory(): {
    totalTraces: number;
    completeTraces: number;
    incompleteTraces: number;
    traces: Array<{
      traceId: string;
      symbol: string;
      stageCount: number;
      stages: TraceStage[];
      isComplete: boolean;
      latencyMs: number | null;
    }>;
  } {
    const traces = this.getAllTraces();
    const result = traces.map(trace => {
      const stageNumbers = trace.stages.map(s => s.stage);
      const hasAllBackendStages = [1, 2, 3, 4].every(s => stageNumbers.includes(s));
      const hasEngineStages = [7, 8].some(s => stageNumbers.includes(s));
      const isComplete = hasAllBackendStages && hasEngineStages;
      
      // Calculate latency from stage 1 to stage 8 (if both exist)
      const stage1 = trace.stages.find(s => s.stage === 1);
      const stage8 = trace.stages.find(s => s.stage === 8);
      const latencyMs = (stage1 && stage8) ? stage8.timestamp - stage1.timestamp : null;
      
      return {
        traceId: trace.traceId,
        symbol: trace.symbol,
        stageCount: trace.stages.length,
        stages: trace.stages,
        isComplete,
        latencyMs
      };
    });
    
    return {
      totalTraces: result.length,
      completeTraces: result.filter(t => t.isComplete).length,
      incompleteTraces: result.filter(t => !t.isComplete).length,
      traces: result.slice(0, 100) // Return last 100 for API response
    };
  }
  
  /**
   * Clear all traces (for reset)
   */
  reset(): void {
    this.traces.clear();
    console.log('[I7-WS-C] Trace history reset');
  }
  
  /**
   * Cleanup expired traces
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [traceId, trace] of this.traces.entries()) {
      if (now - trace.createdAt > this.TRACE_TTL_MS) {
        expired.push(traceId);
      }
    }
    
    for (const traceId of expired) {
      this.traces.delete(traceId);
    }
    
    // Also enforce max traces limit
    if (this.traces.size > this.MAX_TRACES) {
      const sorted = Array.from(this.traces.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      
      const toRemove = sorted.slice(0, this.traces.size - this.MAX_TRACES);
      for (const [traceId] of toRemove) {
        this.traces.delete(traceId);
      }
    }
  }
}

export const priceTraceService = new PriceTraceService();
