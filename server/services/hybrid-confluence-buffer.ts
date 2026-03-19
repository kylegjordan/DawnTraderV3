/**
 * Hybrid Confluence Buffer — Phase 14.5 (Batch 19F)
 *
 * Stores recent pattern signals in a time-decaying buffer.
 * When a quant signal fires, the signal orchestrator checks this buffer
 * for compatible pattern signals on the same pair.
 *
 * Design decisions (Kyle, 2026-03-19):
 * - Quant signal triggers the check (not pattern)
 * - 5-minute TTL with linear decay
 * - Composite key: symbol_patternType (prevents overwriting multiple patterns)
 * - 30-second eviction sweep
 * - Solo signals proceed independently — hybrid is additional opportunity
 */

interface BufferedPatternSignal {
  symbol: string;
  patternType: string;
  strategy: string;
  strength: number;
  direction: 'BUY' | 'SELL';
  timestamp: number;
  metadata?: Record<string, any>;
}

const BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes

class HybridConfluenceBuffer {
  private buffer: Map<string, BufferedPatternSignal> = new Map();

  private makeKey(symbol: string, patternType: string): string {
    return `${symbol}_${patternType}`;
  }

  /** Store a pattern signal in the buffer */
  addPatternSignal(signal: BufferedPatternSignal): void {
    const key = this.makeKey(signal.symbol, signal.patternType);
    this.buffer.set(key, { ...signal, timestamp: Date.now() });
  }

  /** Check for compatible pattern signals for a given pair */
  findCompatiblePatterns(symbol: string): BufferedPatternSignal[] {
    const now = Date.now();
    const results: BufferedPatternSignal[] = [];

    for (const [key, signal] of this.buffer) {
      if (signal.symbol === symbol && (now - signal.timestamp) <= BUFFER_TTL_MS) {
        results.push(signal);
      }
    }

    return results;
  }

  /** Get decay factor for a buffered signal (1.0 = fresh, 0.0 = expired) */
  getDecayFactor(signal: BufferedPatternSignal): number {
    const age = Date.now() - signal.timestamp;
    return Math.max(0, 1 - (age / BUFFER_TTL_MS));
  }

  /** Evict expired entries — call every 30 seconds */
  sweep(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, signal] of this.buffer) {
      if (now - signal.timestamp > BUFFER_TTL_MS) {
        this.buffer.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /** Get buffer size (for diagnostics) */
  get size(): number {
    return this.buffer.size;
  }

  /** Clear all entries (for testing/restart) */
  clear(): void {
    this.buffer.clear();
  }
}

// Singleton instance
export const hybridConfluenceBuffer = new HybridConfluenceBuffer();
export type { BufferedPatternSignal };
